import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Code2,
  History,
  Mail,
  MessageSquare,
  Send,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { getProjectFiles } from '../services/dataService';
import {
  acceptProjectInvitation,
  addProjectComment,
  declineOrCancelInvitation,
  deleteProjectComment,
  listMyInvitations,
  listProjectActivity,
  listProjectComments,
  removeCollaborator,
  sendProjectInvitation,
  syncProjectFilesToCollaborators,
  toggleProjectCommentResolution,
  updateCollaboratorRole,
} from '../services/collaborationService';
import type {
  Project,
  ProjectActivityEvent,
  ProjectCollaboratorRole,
  ProjectComment,
  ProjectFile,
  ProjectInvitation,
} from '../types/mideocode';

type CollabTab = 'workspace' | 'overview' | 'invitations';

function formatTime(val: unknown): string {
  if (!val) return 'Just now';
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toLocaleString();
  }
  return '';
}

export function CollaborationView() {
  const {
    firebaseUser,
    profile,
    projects,
    sharedProjects,
    accessibleProjects,
    activeIdeProjectId,
    collabProjectId,
    setCollabProjectId,
    setActiveIdeProjectId,
    openVersionsForProject,
    setActiveView,
    refreshUserData,
    notify,
  } = useMideo();

  const [tab, setTab] = useState<CollabTab>('workspace');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    collabProjectId || activeIdeProjectId || accessibleProjects[0]?.id || '',
  );

  const [incomingInvites, setIncomingInvites] = useState<ProjectInvitation[]>([]);
  const [sentInvites, setSentInvites] = useState<ProjectInvitation[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [activity, setActivity] = useState<ProjectActivityEvent[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = useState(false);

  // Comment form
  const [commentFilter, setCommentFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [commentBody, setCommentBody] = useState('');
  const [commentFilePath, setCommentFilePath] = useState('');
  const [commentLine, setCommentLine] = useState('');
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);

  // Confirmations
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ uid: string; name: string } | null>(null);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<ProjectComment | null>(null);

  useEffect(() => {
    if (collabProjectId) {
      setSelectedProjectId(collabProjectId);
    } else if (!selectedProjectId && accessibleProjects.length > 0) {
      setSelectedProjectId(activeIdeProjectId || accessibleProjects[0].id);
    }
  }, [collabProjectId, activeIdeProjectId, accessibleProjects, selectedProjectId]);

  const activeProject: Project | undefined =
    accessibleProjects.find((p) => p.id === selectedProjectId) || accessibleProjects[0];

  const myRole: ProjectCollaboratorRole = useMemo(() => {
    if (!activeProject || !firebaseUser) return 'viewer';
    if (activeProject.ownerId === firebaseUser.uid) return 'owner';
    return activeProject.collaboratorRoles?.[firebaseUser.uid] || 'viewer';
  }, [activeProject, firebaseUser]);

  const canCommentAndResolve = myRole === 'owner' || myRole === 'editor';

  const loadInvites = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const res = await listMyInvitations(firebaseUser.uid, firebaseUser.email);
      setIncomingInvites(res.incoming);
      setSentInvites(res.sent);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load invitations.');
    }
  }, [firebaseUser, notify]);

  const loadProjectCollabData = useCallback(async (projectId: string) => {
    try {
      const [cmts, acts, files] = await Promise.all([
        listProjectComments(projectId),
        listProjectActivity(projectId),
        getProjectFiles(projectId),
      ]);
      setComments(cmts);
      setActivity(acts);
      setProjectFiles(files);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load project discussions.');
    }
  }, [notify]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    if (activeProject?.id) {
      setCollabProjectId(activeProject.id);
      loadProjectCollabData(activeProject.id);
    } else {
      setComments([]);
      setActivity([]);
      setProjectFiles([]);
    }
  }, [activeProject?.id, setCollabProjectId, loadProjectCollabData]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !activeProject || !inviteEmail.trim()) return;
    if (activeProject.ownerId !== firebaseUser.uid) {
      notify('error', 'Only the project owner can invite collaborators.');
      return;
    }
    setInviting(true);
    try {
      const sent = await sendProjectInvitation(
        activeProject,
        firebaseUser.uid,
        profile.displayName,
        inviteEmail.trim(),
        inviteRole,
      );
      setSentInvites((prev) => [sent, ...prev.filter((i) => i.id !== sent.id)]);
      setInviteEmail('');
      await loadProjectCollabData(activeProject.id);
      notify('success', `Invitation sent to ${sent.inviteeEmail} as ${sent.role}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleAcceptInvite = async (inv: ProjectInvitation) => {
    if (!firebaseUser || !profile) return;
    try {
      await acceptProjectInvitation(inv, firebaseUser.uid, profile.displayName);
      await syncProjectFilesToCollaborators({
        ...(accessibleProjects.find((p) => p.id === inv.projectId) || {
          id: inv.projectId,
          collaboratorIds: [firebaseUser.uid],
        }),
        collaboratorIds: Array.from(
          new Set([
            ...(accessibleProjects.find((p) => p.id === inv.projectId)?.collaboratorIds || []),
            firebaseUser.uid,
          ]),
        ),
      } as Project).catch(() => {});
      await Promise.all([refreshUserData(), loadInvites()]);
      setSelectedProjectId(inv.projectId);
      setTab('workspace');
      notify('success', `Joined "${inv.projectTitle}" as ${inv.role}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to accept invitation.');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !activeProject || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const parsedLine = commentLine.trim() ? Number(commentLine) : undefined;
      const created = await addProjectComment(activeProject, firebaseUser.uid, profile.displayName, {
        body: commentBody.trim(),
        filePath: commentFilePath || undefined,
        lineStart: parsedLine && Number.isFinite(parsedLine) ? parsedLine : undefined,
        parentCommentId: replyParentId || undefined,
      });
      setComments((prev) => [...prev, created]);
      setCommentBody('');
      setCommentLine('');
      setReplyParentId(null);
      await loadProjectCollabData(activeProject.id);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to post comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const pendingIncomingCount = incomingInvites.filter((i) => i.status === 'pending').length;

  const filteredTopComments = useMemo(() => {
    return comments.filter((c) => {
      if (c.parentCommentId) return false;
      if (commentFilter !== 'all' && c.status !== commentFilter) return false;
      return true;
    });
  }, [comments, commentFilter]);

  const repliesByParent = useMemo(() => {
    const map = new Map<string, ProjectComment[]>();
    for (const c of comments) {
      if (c.parentCommentId) {
        const list = map.get(c.parentCommentId) || [];
        list.push(c);
        map.set(c.parentCommentId, list);
      }
    }
    return map;
  }, [comments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Collaboration
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Role-based shared workspaces, signed email invitations, threaded code discussions, and project activity logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {accessibleProjects.length > 0 && (
            <select
              value={activeProject?.id || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Select shared project"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium max-w-[240px]"
            >
              {accessibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.ownerId === firebaseUser?.uid ? '(Owner)' : '(Shared)'}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        {(
          [
            { id: 'workspace', label: 'Project Workspace' },
            { id: 'overview', label: `Shared & Owned (${accessibleProjects.length})` },
            { id: 'invitations', label: `Invitations (${pendingIncomingCount} pending)` },
          ] as { id: CollabTab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
              tab === item.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Projects Shared With Me ({sharedProjects.length})
            </h2>
            {sharedProjects.length === 0 ? (
              <p className="text-xs text-slate-500">
                No projects have been shared with your account yet. Check the Invitations tab for incoming invites.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {sharedProjects.map((p) => {
                  const role = p.collaboratorRoles?.[firebaseUser?.uid || ''] || 'viewer';
                  return (
                    <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{p.title}</div>
                        <div className="text-[11px] text-slate-500">
                          Owner: {p.ownerName} · Role: {role} · v{p.version}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setTab('workspace');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Projects I Own ({projects.length})
            </h2>
            {projects.length === 0 ? (
              <p className="text-xs text-slate-500">Create a project in Mideo Projects to invite collaborators.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {projects.map((p) => (
                  <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{p.title}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {p.collaboratorIds?.length || 0} collaborators · v{p.version} · {p.visibility}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setTab('workspace');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INVITATIONS TAB */}
      {tab === 'invitations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              Incoming Invitations ({incomingInvites.length})
            </h2>
            {incomingInvites.length === 0 ? (
              <p className="text-xs text-slate-500">
                No incoming invitations for {firebaseUser?.email || 'your account'}.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {incomingInvites.map((inv) => (
                  <div key={inv.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {inv.projectTitle}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          From {inv.inviterName} · Role: {inv.role} · Status: {inv.status}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    {inv.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptInvite(inv)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await declineOrCancelInvitation(inv, 'declined');
                            await loadInvites();
                            notify('info', 'Invitation declined.');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Sent Invitations ({sentInvites.length})
            </h2>
            {sentInvites.length === 0 ? (
              <p className="text-xs text-slate-500">No invitations sent yet.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {sentInvites.map((inv) => (
                  <div key={inv.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {inv.inviteeEmail} → {inv.projectTitle}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Role: {inv.role} · Status: {inv.status}
                      </div>
                    </div>
                    {inv.status === 'pending' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await declineOrCancelInvitation(inv, 'cancelled');
                          await loadInvites();
                          notify('info', 'Invitation cancelled.');
                        }}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs text-red-500 cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROJECT COLLABORATION WORKSPACE TAB */}
      {tab === 'workspace' && (
        <>
          {!activeProject ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center space-y-3">
              <Users className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500">Select or create a project to collaborate with teammates.</p>
              <button
                type="button"
                onClick={() => setActiveView('projects')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Open Projects
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Project Version Sync Bar */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">
                    Your Role: <strong className="text-slate-900 dark:text-white capitalize">{myRole}</strong> · Cloud Version v{activeProject.version}
                    {activeProject.lastEditedByName ? ` · Last saved by ${activeProject.lastEditedByName}` : ''}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {activeProject.title}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openVersionsForProject(activeProject.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    Version History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIdeProjectId(activeProject.id);
                      setActiveView('ide');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Open in IDE
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Members, Invite & Activity Timeline */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Invite by Email (Owner Only) */}
                  {myRole === 'owner' && (
                    <form
                      onSubmit={handleSendInvite}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3"
                    >
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-blue-500" />
                        Invite Collaborator by Email
                      </h3>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="teammate@example.com"
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                          aria-label="Collaborator role"
                          className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={inviting || !inviteEmail.trim()}
                        className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        {inviting ? 'Sending Signed Invite...' : 'Send 7-Day Invite'}
                      </button>
                    </form>
                  )}

                  {/* Active Collaborators */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      Active Collaborators ({(activeProject.collaboratorIds?.length || 0) + 1})
                    </h3>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      <div className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {activeProject.ownerName}
                          </div>
                          <div className="text-[11px] text-slate-500">Project Owner</div>
                        </div>
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">owner</span>
                      </div>

                      {(activeProject.collaboratorIds || [])
                        .filter((uid) => uid !== activeProject.ownerId)
                        .map((uid) => {
                          const name = activeProject.collaboratorNames?.[uid] || uid.slice(0, 12);
                          const role = activeProject.collaboratorRoles?.[uid] || 'viewer';
                          return (
                            <div key={uid} className="py-2.5 flex items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white">{name}</div>
                                <div className="text-[11px] text-slate-500">{role}</div>
                              </div>
                              {myRole === 'owner' ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={role}
                                    onChange={async (e) => {
                                      if (!firebaseUser || !profile) return;
                                      const nextR = e.target.value as 'editor' | 'viewer';
                                      await updateCollaboratorRole(
                                        activeProject,
                                        firebaseUser.uid,
                                        profile.displayName,
                                        uid,
                                        nextR,
                                      );
                                      await refreshUserData();
                                      await loadProjectCollabData(activeProject.id);
                                      notify('success', `Updated ${name} to ${nextR}.`);
                                    }}
                                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px]"
                                  >
                                    <option value="editor">editor</option>
                                    <option value="viewer">viewer</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveMember({ uid, name })}
                                    className="text-red-500 hover:underline text-[11px] cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <span className="font-mono text-[11px] text-slate-500">{role}</span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Activity Timeline */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      Recent Activity Timeline
                    </h3>
                    {activity.length === 0 ? (
                      <p className="text-xs text-slate-500">No collaboration activity recorded yet.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-64 overflow-y-auto">
                        {activity.map((ev) => (
                          <div key={ev.id} className="text-xs border-b border-slate-200 dark:border-slate-800 pb-2 last:border-b-0">
                            <div className="text-slate-800 dark:text-slate-200">{ev.summary}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {ev.actorName} · {formatTime(ev.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Threaded Code Comments & Discussions */}
                <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-500" />
                      Code Comments &amp; Discussions ({comments.length})
                    </h3>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-[11px]">
                      {(['all', 'open', 'resolved'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setCommentFilter(f)}
                          className={`px-2.5 py-1 rounded capitalize cursor-pointer ${
                            commentFilter === f
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                              : 'text-slate-500'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Post Comment Form */}
                  <form onSubmit={handlePostComment} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2.5">
                    {replyParentId && (
                      <div className="flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400">
                        <span>Replying to comment thread</span>
                        <button type="button" onClick={() => setReplyParentId(null)} className="underline cursor-pointer">
                          Cancel reply
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={commentFilePath}
                        onChange={(e) => setCommentFilePath(e.target.value)}
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
                      >
                        <option value="">General Project Discussion</option>
                        {projectFiles.map((f) => (
                          <option key={f.id} value={f.folder ? `${f.folder}/${f.name}` : f.name}>
                            {f.folder ? `${f.folder}/${f.name}` : f.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={commentLine}
                        onChange={(e) => setCommentLine(e.target.value)}
                        placeholder="Line # (optional)"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Write a review comment, question, or @mention..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
                      />
                      <button
                        type="submit"
                        disabled={postingComment || !commentBody.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Post
                      </button>
                    </div>
                  </form>

                  {/* Threads */}
                  {filteredTopComments.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8 text-center">
                      No discussion threads yet. Attach feedback to any file or line above.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {filteredTopComments.map((cmt) => {
                        const replies = repliesByParent.get(cmt.id) || [];
                        return (
                          <div
                            key={cmt.id}
                            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#080C17] space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {cmt.authorName}
                                </span>
                                <span className="text-slate-500"> · {cmt.status}</span>
                                {cmt.filePath && (
                                  <span className="font-mono text-blue-600 dark:text-blue-400">
                                    {' '}· {cmt.filePath}
                                    {cmt.lineStart ? `:${cmt.lineStart}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px]">
                                {canCommentAndResolve && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!firebaseUser || !profile) return;
                                      await toggleProjectCommentResolution(
                                        activeProject,
                                        cmt,
                                        firebaseUser.uid,
                                        profile.displayName,
                                      );
                                      await loadProjectCollabData(activeProject.id);
                                    }}
                                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    {cmt.status === 'resolved' ? 'Reopen' : 'Resolve'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setReplyParentId(cmt.id)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  Reply
                                </button>
                                {(cmt.authorId === firebaseUser?.uid || myRole === 'owner') && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteComment(cmt)}
                                    className="text-slate-400 hover:text-red-500 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                              {cmt.body}
                            </p>

                            {replies.length > 0 && (
                              <div className="pl-4 border-t border-slate-200 dark:border-slate-800 pt-2 space-y-2">
                                {replies.map((rep) => (
                                  <div key={rep.id} className="text-xs space-y-0.5">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                                      {rep.authorName}{' '}
                                      <span className="font-normal text-[11px] text-slate-500">
                                        · {formatTime(rep.createdAt)}
                                      </span>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-400">{rep.body}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Remove Collaborator Confirmation */}
      {confirmRemoveMember && activeProject && firebaseUser && profile && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Remove {confirmRemoveMember.name}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              They will immediately lose access to "{activeProject.title}" files, versions, and discussions.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveMember(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await removeCollaborator(
                    activeProject,
                    firebaseUser.uid,
                    profile.displayName,
                    confirmRemoveMember.uid,
                  );
                  setConfirmRemoveMember(null);
                  await refreshUserData();
                  await loadProjectCollabData(activeProject.id);
                  notify('info', 'Collaborator removed.');
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Remove Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Comment Confirmation */}
      {confirmDeleteComment && activeProject && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Comment?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Confirm removing this comment from "{activeProject.title}".
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteComment(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteProjectComment(activeProject.id, confirmDeleteComment.id);
                  setComments((prev) => prev.filter((c) => c.id !== confirmDeleteComment.id));
                  setConfirmDeleteComment(null);
                  notify('info', 'Comment deleted.');
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
