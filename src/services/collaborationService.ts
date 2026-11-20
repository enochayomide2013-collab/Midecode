import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import { sanitizeForFirestore } from './dataService';
import type {
  Project,
  ProjectActivityAction,
  ProjectActivityEvent,
  ProjectCollaboratorRole,
  ProjectComment,
  ProjectInvitation,
} from '../types/mideocode';

export async function logProjectActivity(
  projectId: string,
  actorId: string,
  actorName: string,
  action: ProjectActivityAction,
  summary: string,
  options?: { targetName?: string; collaboratorIds?: string[] },
): Promise<void> {
  const actId = `pact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(
      doc(db, 'projects', projectId, 'activity', actId),
      sanitizeForFirestore({
        id: actId,
        projectId,
        actorId,
        actorName: actorName.slice(0, 80),
        action,
        summary: summary.slice(0, 300),
        targetName: options?.targetName?.slice(0, 160),
        collaboratorIds:
          options?.collaboratorIds && options.collaboratorIds.length > 0
            ? options.collaboratorIds
            : undefined,
        createdAt: serverTimestamp(),
      }),
    );
  } catch {
    // Non-blocking audit timeline helper
  }
}

export async function listProjectActivity(projectId: string): Promise<ProjectActivityEvent[]> {
  try {
    const q = query(
      collection(db, 'projects', projectId, 'activity'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ProjectActivityEvent);
  } catch {
    const snap = await getDocs(collection(db, 'projects', projectId, 'activity'));
    return snap.docs.map((d) => d.data() as ProjectActivityEvent);
  }
}

export async function sendProjectInvitation(
  project: Project,
  inviterId: string,
  inviterName: string,
  inviteeEmailRaw: string,
  role: 'editor' | 'viewer',
): Promise<ProjectInvitation> {
  const signRes = await fetchWithAuthAndRetry('/api/collab/invitations/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      inviteeEmail: inviteeEmailRaw,
      role,
      ttlDays: 7,
    }),
  });
  const signed = (await signRes.json()) as {
    inviteId: string;
    inviteeEmail: string;
    role: 'editor' | 'viewer';
    expiresAt: string;
    inviteSignature: string;
    error?: string;
  };
  if (!signRes.ok) {
    throw new Error(signed.error || 'Unable to sign invitation.');
  }

  const ref = doc(db, 'projectInvitations', signed.inviteId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        role: signed.role,
        status: 'pending',
        inviteSignature: signed.inviteSignature,
        expiresAt: signed.expiresAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        sanitizeForFirestore({
          id: signed.inviteId,
          projectId: project.id,
          projectTitle: project.title.slice(0, 120),
          inviterId,
          inviterName: inviterName.slice(0, 80),
          inviteeEmail: signed.inviteeEmail,
          role: signed.role,
          status: 'pending',
          inviteSignature: signed.inviteSignature,
          expiresAt: signed.expiresAt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }

    await logProjectActivity(
      project.id,
      inviterId,
      inviterName,
      'invite_sent',
      `Invited ${signed.inviteeEmail} as ${signed.role}`,
      { targetName: signed.inviteeEmail, collaboratorIds: project.collaboratorIds },
    );

    const fresh = await getDoc(ref);
    return fresh.data() as ProjectInvitation;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `projectInvitations/${signed.inviteId}`);
  }
}

export async function listMyInvitations(uid: string, email?: string | null): Promise<{
  incoming: ProjectInvitation[];
  sent: ProjectInvitation[];
}> {
  try {
    const sentQ = query(collection(db, 'projectInvitations'), where('inviterId', '==', uid), limit(40));
    const sentSnap = await getDocs(sentQ);
    const sent = sentSnap.docs.map((d) => d.data() as ProjectInvitation);

    let incoming: ProjectInvitation[] = [];
    if (email && email.trim()) {
      const normalized = email.trim().toLowerCase();
      const incQ = query(
        collection(db, 'projectInvitations'),
        where('inviteeEmail', '==', normalized),
        limit(40),
      );
      const incSnap = await getDocs(incQ);
      incoming = incSnap.docs.map((d) => d.data() as ProjectInvitation);
    }
    return { incoming, sent };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projectInvitations');
  }
}

export async function acceptProjectInvitation(
  invite: ProjectInvitation,
  uid: string,
  displayName: string,
): Promise<void> {
  // Server-verify HMAC & expiration before mutating project
  const verifyRes = await fetchWithAuthAndRetry('/api/collab/invitations/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: invite.projectId,
      inviteeEmail: invite.inviteeEmail,
      role: invite.role,
      expiresAt: invite.expiresAt,
      inviteSignature: invite.inviteSignature,
    }),
  });
  const verifyData = (await verifyRes.json()) as { valid?: boolean; reason?: string; error?: string };
  if (!verifyRes.ok || !verifyData.valid) {
    throw new Error(verifyData.reason || verifyData.error || 'Invitation validation failed.');
  }

  try {
    const projRef = doc(db, 'projects', invite.projectId);
    const projSnap = await getDoc(projRef);
    const proj = projSnap.data() as Project | undefined;
    if (!proj) {
      throw new Error('The shared project no longer exists.');
    }

    const nextIds = Array.from(new Set([...(proj.collaboratorIds || []), uid]));
    const nextRoles: Record<string, ProjectCollaboratorRole> = {
      ...(proj.collaboratorRoles || {}),
      [proj.ownerId]: 'owner',
      [uid]: invite.role,
    };
    const nextNames: Record<string, string> = {
      ...(proj.collaboratorNames || {}),
      [proj.ownerId]: proj.ownerName,
      [uid]: displayName.slice(0, 80),
    };

    // Update project membership BEFORE marking invitation accepted so Firestore rule sees status == 'pending'
    await updateDoc(projRef, {
      collaboratorIds: nextIds,
      collaboratorRoles: nextRoles,
      collaboratorNames: nextNames,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'projectInvitations', invite.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });

    await logProjectActivity(
      invite.projectId,
      uid,
      displayName,
      'invite_accepted',
      `${displayName} joined as ${invite.role}`,
      { collaboratorIds: nextIds },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${invite.projectId}`);
  }
}

export async function declineOrCancelInvitation(
  invite: ProjectInvitation,
  mode: 'declined' | 'cancelled',
): Promise<void> {
  try {
    await updateDoc(doc(db, 'projectInvitations', invite.id), {
      status: mode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projectInvitations/${invite.id}`);
  }
}

async function syncCollaboratorIdsAcrossSubcollections(
  projectId: string,
  collaboratorIds: string[],
): Promise<void> {
  const [filesSnap, versionsSnap, commentsSnap] = await Promise.all([
    getDocs(collection(db, 'projects', projectId, 'files')),
    getDocs(collection(db, 'projects', projectId, 'versions')),
    getDocs(collection(db, 'projects', projectId, 'comments')),
  ]);

  const batch = writeBatch(db);
  for (const d of filesSnap.docs) {
    batch.update(d.ref, { collaboratorIds });
  }
  for (const d of versionsSnap.docs) {
    batch.update(d.ref, { collaboratorIds });
  }
  for (const d of commentsSnap.docs) {
    batch.update(d.ref, { collaboratorIds });
  }
  await batch.commit();
}

export async function updateCollaboratorRole(
  project: Project,
  actorUid: string,
  actorName: string,
  targetUid: string,
  nextRole: 'editor' | 'viewer',
): Promise<void> {
  if (project.ownerId === targetUid) return;
  try {
    const nextIds = Array.from(new Set([...(project.collaboratorIds || []), targetUid]));
    const nextRoles = { ...(project.collaboratorRoles || {}), [targetUid]: nextRole };
    await updateDoc(doc(db, 'projects', project.id), {
      collaboratorIds: nextIds,
      collaboratorRoles: nextRoles,
      updatedAt: serverTimestamp(),
    });
    await syncCollaboratorIdsAcrossSubcollections(project.id, nextIds);
    await logProjectActivity(
      project.id,
      actorUid,
      actorName,
      'role_changed',
      `Updated ${project.collaboratorNames?.[targetUid] || targetUid} role to ${nextRole}`,
      { collaboratorIds: nextIds },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${project.id}`);
  }
}

export async function removeCollaborator(
  project: Project,
  actorUid: string,
  actorName: string,
  targetUid: string,
): Promise<void> {
  if (project.ownerId === targetUid) return;
  try {
    const nextIds = (project.collaboratorIds || []).filter((id) => id !== targetUid);
    const nextRoles = { ...(project.collaboratorRoles || {}) };
    delete nextRoles[targetUid];
    const nextNames = { ...(project.collaboratorNames || {}) };
    const removedName = nextNames[targetUid] || targetUid;
    delete nextNames[targetUid];

    await updateDoc(doc(db, 'projects', project.id), {
      collaboratorIds: nextIds,
      collaboratorRoles: nextRoles,
      collaboratorNames: nextNames,
      updatedAt: serverTimestamp(),
    });
    await syncCollaboratorIdsAcrossSubcollections(project.id, nextIds);
    await logProjectActivity(
      project.id,
      actorUid,
      actorName,
      'member_removed',
      `Removed ${removedName} from project`,
      { collaboratorIds: nextIds },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${project.id}`);
  }
}

export async function syncProjectFilesToCollaborators(project: Project): Promise<void> {
  if (!project.collaboratorIds || project.collaboratorIds.length === 0) return;
  await syncCollaboratorIdsAcrossSubcollections(project.id, project.collaboratorIds);
}

// ---------------------------------------------------------------------------
// Threaded Comments (@mentions, file & line refs, resolve/reopen)
// ---------------------------------------------------------------------------
export async function listProjectComments(projectId: string): Promise<ProjectComment[]> {
  try {
    const q = query(
      collection(db, 'projects', projectId, 'comments'),
      orderBy('createdAt', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ProjectComment);
  } catch {
    const snap = await getDocs(collection(db, 'projects', projectId, 'comments'));
    return snap.docs.map((d) => d.data() as ProjectComment);
  }
}

export async function addProjectComment(
  project: Project,
  authorId: string,
  authorName: string,
  input: {
    body: string;
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    parentCommentId?: string;
  },
): Promise<ProjectComment> {
  const commentId = `pcmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const mentions = Array.from(
    new Set(
      (input.body.match(/@([a-zA-Z0-9._-]+)/g) || []).map((m) => m.slice(1)),
    ),
  ).slice(0, 10);

  const ref = doc(db, 'projects', project.id, 'comments', commentId);
  try {
    await setDoc(
      ref,
      sanitizeForFirestore({
        id: commentId,
        projectId: project.id,
        authorId,
        authorName: authorName.slice(0, 80),
        filePath: input.filePath?.slice(0, 180) || undefined,
        lineStart:
          typeof input.lineStart === 'number' && input.lineStart >= 1
            ? Math.round(input.lineStart)
            : undefined,
        lineEnd:
          typeof input.lineEnd === 'number' && input.lineEnd >= 1
            ? Math.round(input.lineEnd)
            : undefined,
        parentCommentId: input.parentCommentId || undefined,
        mentions,
        body: input.body.trim().slice(0, 2000),
        status: 'open',
        collaboratorIds:
          project.collaboratorIds && project.collaboratorIds.length > 0
            ? project.collaboratorIds
            : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    await logProjectActivity(
      project.id,
      authorId,
      authorName,
      'comment_added',
      `Commented${input.filePath ? ` on ${input.filePath}` : ''}: "${input.body.trim().slice(0, 60)}"`,
      { targetName: input.filePath, collaboratorIds: project.collaboratorIds },
    );

    const fresh = await getDoc(ref);
    return fresh.data() as ProjectComment;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${project.id}/comments/${commentId}`);
  }
}

export async function toggleProjectCommentResolution(
  project: Project,
  comment: ProjectComment,
  actorId: string,
  actorName: string,
): Promise<void> {
  const nextStatus = comment.status === 'resolved' ? 'open' : 'resolved';
  try {
    await updateDoc(doc(db, 'projects', project.id, 'comments', comment.id), {
      status: nextStatus,
      resolvedBy: nextStatus === 'resolved' ? actorName.slice(0, 80) : '',
      updatedAt: serverTimestamp(),
    });
    await logProjectActivity(
      project.id,
      actorId,
      actorName,
      'comment_resolved',
      `${nextStatus === 'resolved' ? 'Resolved' : 'Reopened'} comment by ${comment.authorName}`,
      { collaboratorIds: project.collaboratorIds },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${project.id}/comments/${comment.id}`);
  }
}

export async function deleteProjectComment(projectId: string, commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'projects', projectId, 'comments', commentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/comments/${commentId}`);
  }
}
