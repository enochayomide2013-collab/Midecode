import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from './appDb';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import {
  awardVerifiedXp,
  createProjectWithFiles,
  getCareerProgress,
  sanitizeForFirestore,
  saveCareerProgress,
  unlockCustomAchievement,
} from './dataService';
import { CURATED_MISSIONS } from '../data/missionsData';
import type {
  CourseProgress,
  Mission,
  MissionAttempt,
  MissionCheckpoint,
  MissionCheckpointFeedback,
  MissionEvaluation,
  MissionHintHistory,
  MissionLeaderboardEntry,
  MissionRecommendation,
  MissionReward,
  MissionServerEvalConfig,
  MissionStarterFile,
  MissionSubmission,
  MissionTemplate,
  MissionTestCaseResult,
  PublicProfile,
  UserProfile,
} from '../types/mideocode';

const OFFLINE_CACHE_PREFIX = 'mideocode_mission_draft_v1_';

export function getLocalDraftKey(uid: string, attemptId: string): string {
  return `${OFFLINE_CACHE_PREFIX}${uid}_${attemptId}`;
}

export function saveOfflineMissionDraft(
  uid: string,
  attemptId: string,
  payload: { files: MissionStarterFile[]; version: number; savedAt: number },
): void {
  try {
    localStorage.setItem(getLocalDraftKey(uid, attemptId), JSON.stringify(payload));
  } catch {
    // Ignore storage quota warnings safely
  }
}

export function loadOfflineMissionDraft(
  uid: string,
  attemptId: string,
): { files: MissionStarterFile[]; version: number; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(getLocalDraftKey(uid, attemptId));
    if (!raw) return null;
    return JSON.parse(raw) as { files: MissionStarterFile[]; version: number; savedAt: number };
  } catch {
    return null;
  }
}

export function clearOfflineMissionDraft(uid: string, attemptId: string): void {
  try {
    localStorage.removeItem(getLocalDraftKey(uid, attemptId));
  } catch {
    // Ignore cleanly
  }
}

// ---------------------------------------------------------------------------
// Catalog Loading (Curated + Firestore Admin-Managed Missions)
// ---------------------------------------------------------------------------
export async function listPublishedMissions(includeAllForAdmin = false): Promise<Mission[]> {
  const byId = new Map<string, Mission>();
  for (const m of CURATED_MISSIONS) {
    byId.set(m.id, { ...m, source: 'curated' });
  }

  try {
    const q = includeAllForAdmin
      ? query(collection(db, 'missions'), limit(100))
      : query(collection(db, 'missions'), where('status', '==', 'published'), limit(100));
    const snap = await getDocs(q);
    const firestoreMissions = snap.docs.map((d) => ({
      ...(d.data() as Mission),
      source: 'firestore' as const,
    }));

    if (firestoreMissions.length > 0) {
      const [cpSnap, tplSnap] = await Promise.all([
        getDocs(
          includeAllForAdmin
            ? query(collection(db, 'missionCheckpoints'), limit(250))
            : query(collection(db, 'missionCheckpoints'), where('status', '==', 'active'), limit(250)),
        ),
        getDocs(
          includeAllForAdmin
            ? query(collection(db, 'missionTemplates'), limit(100))
            : query(collection(db, 'missionTemplates'), where('status', '==', 'active'), limit(100)),
        ),
      ]);

      const cpByMission = new Map<string, MissionCheckpoint[]>();
      cpSnap.docs.forEach((d) => {
        const cp = d.data() as MissionCheckpoint;
        const arr = cpByMission.get(cp.missionId) || [];
        arr.push(cp);
        cpByMission.set(cp.missionId, arr);
      });

      const tplByMission = new Map<string, MissionStarterFile[]>();
      tplSnap.docs.forEach((d) => {
        const tpl = d.data() as MissionTemplate;
        tplByMission.set(tpl.missionId, tpl.files);
      });

      for (const fm of firestoreMissions) {
        const cps = (cpByMission.get(fm.id) || []).sort((a, b) => a.order - b.order);
        const existingCurated = byId.get(fm.id);
        const hydrated: Mission = {
          ...(existingCurated || {}),
          ...fm,
          checkpoints: cps.length > 0 ? cps : existingCurated?.checkpoints || [],
          starterFiles: tplByMission.get(fm.id) || existingCurated?.starterFiles || [],
          publicTestPreviews: existingCurated?.publicTestPreviews || [
            fm.completionCriteria,
          ],
          source: 'firestore',
        };
        if (hydrated.status === 'archived' && !includeAllForAdmin) {
          byId.delete(fm.id);
        } else if (hydrated.status !== 'published' && !includeAllForAdmin) {
          byId.delete(fm.id);
        } else {
          byId.set(fm.id, hydrated);
        }
      }
    }
  } catch (err) {
    // Non-admin or offline fallback cleanly serves curated catalog; only log permission issues silently on list fallback
    console.warn('Mission catalog cloud merge skipped:', err instanceof Error ? err.message : err);
  }

  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------
// Adaptive Recommendation Engine (Explained, Real Data Driven)
// ---------------------------------------------------------------------------
export function buildMissionRecommendations(
  missions: Mission[],
  attempts: MissionAttempt[],
  profile: UserProfile | null,
  courseProgress: Record<string, CourseProgress>,
): MissionRecommendation[] {
  const completedMissionIds = new Set(
    attempts.filter((a) => a.status === 'completed').map((a) => a.missionId),
  );
  const attemptsByMission = new Map<string, MissionAttempt>();
  for (const att of attempts) {
    const existing = attemptsByMission.get(att.missionId);
    if (!existing || att.status === 'in_progress' || att.status === 'needs_improvement') {
      attemptsByMission.set(att.missionId, att);
    }
  }

  const userExp = profile?.experienceLevel || 'beginner';
  const expRank: Record<string, number> = {
    Beginner: 1,
    Intermediate: 2,
    Advanced: 3,
    Expert: 4,
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };
  const userRank = expRank[userExp] || 1;
  const userLangs = (profile?.preferredLanguages || []).map((l) => l.toLowerCase());
  const userInterests = (profile?.interests || []).map((i) => i.toLowerCase());
  const completedLessonsCount = Object.values(courseProgress).reduce(
    (s, p) => s + p.completedLessonIds.length,
    0,
  );

  const recs: MissionRecommendation[] = missions
    .filter((m) => m.status === 'published')
    .map((mission) => {
      const attempt = attemptsByMission.get(mission.id);
      const missingPrereqs = (mission.prerequisiteMissionIds || []).filter(
        (pid) => !completedMissionIds.has(pid),
      );
      const prerequisitesMet = missingPrereqs.length === 0;
      const mRank = expRank[mission.difficulty] || 1;
      const reasons: string[] = [];
      let score = 0;

      if (attempt && (attempt.status === 'in_progress' || attempt.status === 'needs_improvement')) {
        score += 45;
        reasons.push('You already have active progress in this workspace');
      }
      if (completedMissionIds.has(mission.id)) {
        score -= 30;
      }
      if (mRank === userRank) {
        score += 25;
        reasons.push(`Matches your ${userExp} engineering level`);
      } else if (mRank === userRank + 1 && completedMissionIds.size > 0) {
        score += 18;
        reasons.push('Natural next step up in difficulty');
      } else if (mRank > userRank + 1) {
        score -= 10;
      }

      if (
        userLangs.some(
          (ul) =>
            mission.language.toLowerCase().includes(ul) ||
            mission.supportedLanguages.some((sl) => sl.toLowerCase().includes(ul)),
        )
      ) {
        score += 20;
        reasons.push(`Aligned with your preferred language (${mission.supportedLanguages.join(' / ')})`);
      }

      if (
        userInterests.some(
          (ui) =>
            mission.category.toLowerCase().includes(ui) ||
            mission.description.toLowerCase().includes(ui),
        )
      ) {
        score += 12;
        reasons.push(`Fits your ${mission.category} interest`);
      }

      // Check Academy lesson completion synergy
      const relatedCourseMatches = (mission.relatedLessonIds || []).some((entry) => {
        const courseId = typeof entry === 'string' ? entry.split('::')[0] : entry.courseId;
        return (courseProgress[courseId]?.completedLessonIds.length || 0) > 0;
      });
      if (relatedCourseMatches) {
        score += 18;
        reasons.push('Reinforces Academy lessons you recently studied');
      } else if (completedLessonsCount === 0 && mission.difficulty === 'Beginner') {
        score += 10;
        reasons.push('Great hands-on starting point');
      }

      if (!prerequisitesMet && !mission.prerequisitesOptional) {
        score -= 25;
      }
      if (mission.isFeatured) {
        score += 6;
      }
      if (reasons.length === 0) {
        reasons.push(`Practical ${mission.category} skill-builder (${mission.difficulty})`);
      }

      return {
        mission,
        score,
        reasons: reasons.slice(0, 3),
        prerequisitesMet,
        missingPrerequisites: missingPrereqs,
        attempt,
      };
    });

  return recs.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// User Mission Attempts, Progress, Submissions, Evaluations, Hint History
// ---------------------------------------------------------------------------
export async function listUserMissionAttempts(uid: string): Promise<MissionAttempt[]> {
  try {
    const q = query(collection(db, 'missionAttempts'), where('userId', '==', uid), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MissionAttempt);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'missionAttempts');
  }
}

export async function startOrResumeMissionAttempt(
  uid: string,
  mission: Mission,
  forceNewAttempt = false,
): Promise<MissionAttempt> {
  try {
    const q = query(
      collection(db, 'missionAttempts'),
      where('userId', '==', uid),
      where('missionId', '==', mission.id),
      limit(10),
    );
    const snap = await getDocs(q);
    const allForMission = snap.docs.map((d) => d.data() as MissionAttempt);

    if (!forceNewAttempt) {
      const active = allForMission.find(
        (a) => a.status === 'in_progress' || a.status === 'needs_improvement' || a.status === 'submitted',
      );
      if (active) return active;
      const completed = allForMission.find((a) => a.status === 'completed');
      if (completed) return completed;
    }

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const firstCheckpoint = (mission.checkpoints || []).slice().sort((a, b) => a.order - b.order)[0];
    const starterFiles: MissionStarterFile[] = (mission.starterFiles && mission.starterFiles.length > 0
      ? mission.starterFiles
      : [
          {
            id: 'file_main',
            name: mission.language === 'python' ? 'main.py' : mission.language === 'sql' ? 'query.sql' : 'index.js',
            folder: '',
            language: mission.language === 'web' ? 'html' : mission.language,
            content: '',
          },
        ]
    ).map((f) => ({ ...f }));

    const newAttempt = {
      id: attemptId,
      userId: uid,
      missionId: mission.id,
      status: 'in_progress' as const,
      currentCheckpointId: firstCheckpoint?.id || '',
      completedCheckpointIds: [],
      acknowledgedStepIds: [],
      files: starterFiles,
      version: 1,
      checkpointFeedback: {},
      rewardsGranted: false,
      xpAwarded: 0,
      unlockedBadgeIds: [],
      addedToPassport: false,
      startedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'missionAttempts', attemptId), newAttempt);
    const created = await getDoc(doc(db, 'missionAttempts', attemptId));
    return created.data() as MissionAttempt;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'missionAttempts');
  }
}

export async function saveMissionWorkspaceProgress(
  uid: string,
  attemptId: string,
  patch: {
    files: MissionStarterFile[];
    expectedVersion: number;
    currentCheckpointId?: string;
    completedCheckpointIds?: string[];
    acknowledgedStepIds?: string[];
    checkpointFeedback?: Record<string, MissionCheckpointFeedback>;
    status?: 'in_progress' | 'submitted' | 'needs_improvement' | 'archived';
  },
  forceOverwrite = false,
): Promise<{ conflict: boolean; serverAttempt?: MissionAttempt; newVersion: number }> {
  const ref = doc(db, 'missionAttempts', attemptId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Mission attempt no longer exists.');
    }
    const serverAttempt = snap.data() as MissionAttempt;
    if (serverAttempt.status === 'completed') {
      return { conflict: false, serverAttempt, newVersion: serverAttempt.version };
    }
    if (!forceOverwrite && serverAttempt.version > patch.expectedVersion) {
      return { conflict: true, serverAttempt, newVersion: serverAttempt.version };
    }

    const nextVersion = Math.max(serverAttempt.version, patch.expectedVersion) + 1;
    const sanitizedFiles = patch.files.slice(0, 25).map((f) => ({
      id: f.id,
      name: f.name.slice(0, 120),
      folder: (f.folder || '').slice(0, 120),
      language: f.language.slice(0, 32),
      content: f.content.slice(0, 150000),
      ...(f.readOnly ? { readOnly: true } : {}),
    }));

    await updateDoc(ref, {
      status: patch.status || serverAttempt.status,
      currentCheckpointId: patch.currentCheckpointId ?? serverAttempt.currentCheckpointId,
      completedCheckpointIds: (patch.completedCheckpointIds ?? serverAttempt.completedCheckpointIds).slice(0, 30),
      acknowledgedStepIds: (patch.acknowledgedStepIds ?? serverAttempt.acknowledgedStepIds).slice(0, 30),
      files: sanitizedFiles,
      version: nextVersion,
      checkpointFeedback: patch.checkpointFeedback ?? serverAttempt.checkpointFeedback,
      lastActivityAt: serverTimestamp(),
    });

    clearOfflineMissionDraft(uid, attemptId);
    return { conflict: false, newVersion: nextVersion };
  } catch (err) {
    // Save local draft so work is never lost offline or on transient failure
    saveOfflineMissionDraft(uid, attemptId, {
      files: patch.files,
      version: patch.expectedVersion,
      savedAt: Date.now(),
    });
    handleFirestoreError(err, OperationType.UPDATE, `missionAttempts/${attemptId}`);
  }
}

export async function validateCheckpointWithServer(
  missionId: string,
  checkpointId: string,
  files: MissionStarterFile[],
): Promise<{
  passed: boolean;
  message: string;
  details: string[];
  testResults: MissionTestCaseResult[];
  executionMs: number;
}> {
  const res = await fetchWithAuthAndRetry('/api/missions/checkpoint/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      missionId,
      checkpointId,
      files: files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Checkpoint validation request failed.');
  }
  return data;
}

export async function submitAndEvaluateMission(
  uid: string,
  mission: Mission,
  attempt: MissionAttempt,
  files: MissionStarterFile[],
  completedCheckpointIds: string[],
  acknowledgedStepIds: string[],
): Promise<{
  submission: MissionSubmission;
  evaluation: MissionEvaluation;
  updatedAttempt: MissionAttempt;
  xpAwardedNow: number;
  badgeUnlockedNow: string | null;
}> {
  const evalRes = await fetchWithAuthAndRetry('/api/missions/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      missionId: mission.id,
      files: files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
    }),
  });
  const evalData = (await evalRes.json()) as {
    error?: string;
    passed: boolean;
    passedCount: number;
    totalCount: number;
    requirementsSatisfied: string[];
    requirementsMissing: string[];
    testResults: MissionTestCaseResult[];
    runtimeErrors: string[];
    suggestions: string[];
    executionMs: number;
    xpAwarded: number;
    badgeId: string | null;
    badgeTitle: string | null;
    attestation: string;
  };
  if (!evalRes.ok) {
    throw new Error(evalData.error || 'Mission evaluation failed.');
  }

  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nextVersion = attempt.version + 1;

  const submissionDoc = {
    id: submissionId,
    userId: uid,
    missionId: mission.id,
    attemptId: attempt.id,
    projectVersion: nextVersion,
    language: mission.language,
    filesSnapshot: files.slice(0, 25).map((f) => ({
      name: f.name.slice(0, 120),
      folder: (f.folder || '').slice(0, 120),
      language: f.language.slice(0, 32),
      content: f.content.slice(0, 100000),
    })),
    status: evalData.passed ? ('passed' as const) : ('failed' as const),
    createdAt: serverTimestamp(),
  };

  const sanitizedTestResults = (evalData.testResults || []).slice(0, 40).map((tr) => ({
    id: tr.id,
    label: tr.label,
    isHidden: Boolean(tr.isHidden),
    passed: Boolean(tr.passed),
    expectedSummary: tr.expectedSummary || '',
    actualSummary: tr.actualSummary || '',
    ...(tr.error ? { error: String(tr.error).slice(0, 1000) } : {}),
  }));

  const evaluationDoc = sanitizeForFirestore({
    id: evaluationId,
    userId: uid,
    missionId: mission.id,
    attemptId: attempt.id,
    submissionId,
    passed: evalData.passed,
    passedCount: evalData.passedCount,
    totalCount: evalData.totalCount,
    requirementsSatisfied: evalData.requirementsSatisfied.slice(0, 30),
    requirementsMissing: evalData.requirementsMissing.slice(0, 30),
    testResults: sanitizedTestResults,
    runtimeErrors: evalData.runtimeErrors.slice(0, 20),
    suggestions: evalData.suggestions.slice(0, 20),
    executionMs: evalData.executionMs,
    attestation: evalData.attestation.slice(0, 128),
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'missionSubmissions', submissionId), submissionDoc);
    await setDoc(doc(db, 'missionEvaluations', evaluationId), evaluationDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `missionSubmissions/${submissionId}`);
  }

  let xpAwardedNow = 0;
  let badgeUnlockedNow: string | null = null;
  const allCheckpointIds = (mission.checkpoints || []).map((c) => c.id);
  const resolvedCheckpoints = evalData.passed
    ? Array.from(new Set([...completedCheckpointIds, ...allCheckpointIds]))
    : completedCheckpointIds;

  if (evalData.passed) {
    // Award verified XP idempotently once per mission per user
    const xpRes = await awardVerifiedXp(uid, 'mission', mission.id, `Completed Mission: ${mission.title}`);
    xpAwardedNow = xpRes.awarded;

    // Unlock mission-specific badge + milestone badge cleanly
    if (mission.badgeId && mission.badgeTitle) {
      const unlocked = await unlockCustomAchievement(uid, mission.badgeId, mission.badgeTitle);
      if (unlocked) badgeUnlockedNow = mission.badgeTitle;
    }
    await unlockCustomAchievement(uid, 'first_mission_complete', 'Mission Accomplished');

    // Sync Mission skills into Career Skill Passport progress
    try {
      const career = await getCareerProgress(uid);
      const currentSkills = career?.completedSkillIds || [];
      const missionSkillKeys = mission.requiredSkills.map((s) => `mission_skill:${s}`);
      const mergedSkills = Array.from(new Set([...currentSkills, ...missionSkillKeys])).slice(0, 100);
      await saveCareerProgress(uid, {
        selectedPathId: career?.selectedPathId || 'frontend-developer',
        completedSkillIds: mergedSkills,
        completedProjectIds: career?.completedProjectIds || [],
      });
    } catch {
      // Non-blocking enrichment
    }

    // Create completion notification cleanly
    const notifId = `mission_done_${mission.id.slice(0, 32)}_${uid.slice(0, 12)}`;
    try {
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: uid,
        title: `Mission Completed: ${mission.title}`,
        body: `All ${evalData.totalCount} server checks passed.${xpAwardedNow > 0 ? ` Earned +${xpAwardedNow} XP.` : ''}`,
        linkView: 'missions',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Non-blocking notification
    }
  }

  const attemptRef = doc(db, 'missionAttempts', attempt.id);
  try {
    if (attempt.status !== 'completed') {
      if (evalData.passed) {
        await updateDoc(attemptRef, {
          status: 'completed',
          completedCheckpointIds: resolvedCheckpoints.slice(0, 30),
          acknowledgedStepIds: acknowledgedStepIds.slice(0, 30),
          files: files.slice(0, 25).map((f) => ({
            id: f.id,
            name: f.name,
            folder: f.folder || '',
            language: f.language,
            content: f.content.slice(0, 150000),
          })),
          version: nextVersion,
          rewardsGranted: true,
          xpAwarded: Math.min(250, evalData.xpAwarded || mission.xpReward),
          unlockedBadgeIds: mission.badgeId ? [mission.badgeId] : [],
          lastActivityAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(attemptRef, {
          status: 'needs_improvement',
          completedCheckpointIds: resolvedCheckpoints.slice(0, 30),
          acknowledgedStepIds: acknowledgedStepIds.slice(0, 30),
          files: files.slice(0, 25).map((f) => ({
            id: f.id,
            name: f.name,
            folder: f.folder || '',
            language: f.language,
            content: f.content.slice(0, 150000),
          })),
          version: nextVersion,
          lastActivityAt: serverTimestamp(),
        });
      }
    }
    clearOfflineMissionDraft(uid, attempt.id);
    const [subSnap, evalSnap, attSnap] = await Promise.all([
      getDoc(doc(db, 'missionSubmissions', submissionId)),
      getDoc(doc(db, 'missionEvaluations', evaluationId)),
      getDoc(attemptRef),
    ]);
    const updatedAttempt = attSnap.data() as MissionAttempt;
    if (evalData.passed) {
      await upsertMissionLeaderboardEntry(uid, mission, updatedAttempt);
    }
    return {
      submission: subSnap.data() as MissionSubmission,
      evaluation: evalSnap.data() as MissionEvaluation,
      updatedAttempt,
      xpAwardedNow,
      badgeUnlockedNow,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `missionAttempts/${attempt.id}`);
  }
}

export async function recordHintOpened(
  uid: string,
  missionId: string,
  attemptId: string,
  hintIndex: number,
  hintId: string,
): Promise<MissionHintHistory> {
  const id = `${attemptId.slice(0, 48)}_hint_${hintIndex}`.slice(0, 120);
  const ref = doc(db, 'missionHintHistory', id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return existing.data() as MissionHintHistory;
    }
    await setDoc(ref, {
      id,
      userId: uid,
      missionId,
      attemptId,
      hintIndex,
      hintId,
      openedAt: serverTimestamp(),
    });
    const fresh = await getDoc(ref);
    return fresh.data() as MissionHintHistory;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `missionHintHistory/${id}`);
  }
}

export async function listHintHistoryForAttempt(uid: string, attemptId: string): Promise<MissionHintHistory[]> {
  try {
    const q = query(
      collection(db, 'missionHintHistory'),
      where('userId', '==', uid),
      where('attemptId', '==', attemptId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MissionHintHistory);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'missionHintHistory');
  }
}

export async function listMissionSubmissionsAndEvaluations(
  uid: string,
  missionId?: string,
): Promise<{ submissions: MissionSubmission[]; evaluations: MissionEvaluation[] }> {
  try {
    const subQuery = missionId
      ? query(
          collection(db, 'missionSubmissions'),
          where('userId', '==', uid),
          where('missionId', '==', missionId),
          limit(50),
        )
      : query(collection(db, 'missionSubmissions'), where('userId', '==', uid), limit(100));

    const evalQuery = missionId
      ? query(
          collection(db, 'missionEvaluations'),
          where('userId', '==', uid),
          where('missionId', '==', missionId),
          limit(50),
        )
      : query(collection(db, 'missionEvaluations'), where('userId', '==', uid), limit(100));

    const [subSnap, evalSnap] = await Promise.all([getDocs(subQuery), getDocs(evalQuery)]);
    return {
      submissions: subSnap.docs.map((d) => d.data() as MissionSubmission),
      evaluations: evalSnap.docs.map((d) => d.data() as MissionEvaluation),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'missionSubmissions');
  }
}

export async function exportCompletedMissionToPortfolioAndPassport(
  uid: string,
  displayName: string,
  mission: Mission,
  attempt: MissionAttempt,
): Promise<{ projectId: string; alreadyAdded: boolean }> {
  if (attempt.portfolioProjectId && attempt.addedToPassport) {
    return { projectId: attempt.portfolioProjectId, alreadyAdded: true };
  }
  const ideLang =
    mission.language === 'python'
      ? 'python'
      : mission.language === 'javascript'
        ? 'javascript'
        : mission.language === 'sql'
          ? 'sql'
          : 'web';

  const created = await createProjectWithFiles(uid, displayName, {
    title: `${mission.title} (Mission Solution)`,
    description: `Verified MideoCode Mission completion (${mission.category} · ${mission.difficulty}).`,
    language: ideLang,
    files: attempt.files.map((f) => ({
      name: f.name,
      folder: f.folder || '',
      language: f.language,
      content: f.content,
    })),
  });

  await updateDoc(doc(db, 'projects', created.project.id), {
    isPortfolio: true,
    visibility: 'public',
    status: 'completed',
    updatedAt: serverTimestamp(),
  });

  // Sync visibility for exported files so portfolio showcase works cleanly
  for (const f of created.files) {
    await updateDoc(doc(db, 'projects', created.project.id, 'files', f.id), {
      visibility: 'public',
      updatedAt: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, 'missionAttempts', attempt.id), {
    addedToPassport: true,
    portfolioProjectId: created.project.id,
    lastActivityAt: serverTimestamp(),
  });

  // Add project to user career progress
  const career = await getCareerProgress(uid);
  const nextProjects = Array.from(new Set([...(career?.completedProjectIds || []), mission.id])).slice(0, 100);
  await saveCareerProgress(uid, {
    selectedPathId: career?.selectedPathId || 'frontend-developer',
    completedSkillIds: career?.completedSkillIds || [],
    completedProjectIds: nextProjects,
  });

  return { projectId: created.project.id, alreadyAdded: false };
}

// ---------------------------------------------------------------------------
// Admin Mission Authoring, Validation Gate, Publishing & Audit Trail
// ---------------------------------------------------------------------------
export function validateMissionReadyForPublish(
  mission: Partial<Mission>,
  checkpoints: MissionCheckpoint[],
  starterFiles: MissionStarterFile[],
  evalConfig: MissionServerEvalConfig | null,
): string[] {
  const issues: string[] = [];
  if (!mission.title || mission.title.trim().length < 3) issues.push('Mission title is required (min 3 characters).');
  if (!mission.description || mission.description.trim().length < 10) issues.push('Mission description is required.');
  if (!mission.scenario || mission.scenario.trim().length < 10) issues.push('Mission scenario is required.');
  if (!mission.completionCriteria || mission.completionCriteria.trim().length < 5) {
    issues.push('Completion criteria must be defined.');
  }
  if (!Array.isArray(mission.instructions) || mission.instructions.length === 0) {
    issues.push('At least one step-by-step instruction is required.');
  }
  if (!Array.isArray(mission.requirements) || mission.requirements.length === 0) {
    issues.push('At least one technical requirement is required.');
  }
  if (!checkpoints || checkpoints.length === 0) {
    issues.push('Configure at least one mission checkpoint before publishing.');
  }
  if (!starterFiles || starterFiles.length === 0) {
    issues.push('Provide at least one starter file before publishing.');
  }
  if (!evalConfig || !evalConfig.submissionTests || evalConfig.submissionTests.length === 0) {
    issues.push('Server evaluation tests must be configured before publishing.');
  }
  return issues;
}

export async function adminSaveMissionBundle(
  adminUid: string,
  missionInput: Mission,
  checkpoints: MissionCheckpoint[],
  starterFiles: MissionStarterFile[],
  evalConfig: MissionServerEvalConfig | null,
): Promise<void> {
  if (missionInput.status === 'published') {
    const issues = validateMissionReadyForPublish(missionInput, checkpoints, starterFiles, evalConfig);
    if (issues.length > 0) {
      throw new Error(`Cannot publish incomplete mission: ${issues[0]}`);
    }
  }

  const missionId = missionInput.id.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  const missionRef = doc(db, 'missions', missionId);
  const existing = await getDoc(missionRef);

  const normalizedLessonIds = (missionInput.relatedLessonIds || []).map((entry) =>
    typeof entry === 'string' ? entry : `${entry.courseId}::${entry.lessonId}`,
  );

  const missionDoc = sanitizeForFirestore({
    id: missionId,
    title: missionInput.title.trim().slice(0, 140),
    description: missionInput.description.trim().slice(0, 800),
    category: missionInput.category,
    difficulty: missionInput.difficulty,
    language: missionInput.language,
    supportedLanguages: (missionInput.supportedLanguages || [missionInput.language]).slice(0, 6),
    requiredSkills: (missionInput.requiredSkills || []).slice(0, 12),
    prerequisiteMissionIds: (missionInput.prerequisiteMissionIds || []).slice(0, 10),
    prerequisiteSummary: (missionInput.prerequisiteSummary || '').slice(0, 300),
    prerequisitesOptional: Boolean(missionInput.prerequisitesOptional),
    relatedLessonIds: normalizedLessonIds.slice(0, 12),
    learningObjectives: (missionInput.learningObjectives || []).slice(0, 10),
    estimatedMinutes: Math.min(600, Math.max(5, Number(missionInput.estimatedMinutes) || 30)),
    scenario: missionInput.scenario.trim().slice(0, 3000),
    requirements: (missionInput.requirements || []).slice(0, 20),
    instructions: (missionInput.instructions || []).slice(0, 25),
    hints: (missionInput.hints || []).slice(0, 10),
    completionCriteria: missionInput.completionCriteria.trim().slice(0, 1000),
    xpReward: Math.min(250, Math.max(25, Number(missionInput.xpReward) || 100)),
    badgeId: (missionInput.badgeId || `badge_${missionId}`).slice(0, 64),
    badgeTitle: (missionInput.badgeTitle || `${missionInput.title} Finisher`).slice(0, 120),
    isFeatured: Boolean(missionInput.isFeatured),
    status: missionInput.status,
    qualityStatus: missionInput.status === 'published' ? 'approved' : (missionInput.qualityStatus || 'draft'),
    authorId: adminUid,
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    if (existing.exists()) {
      await updateDoc(missionRef, missionDoc);
    } else {
      await setDoc(missionRef, missionDoc);
    }

    // Save checkpoints
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      const cpId = (cp.id || `${missionId}_cp_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
      await setDoc(doc(db, 'missionCheckpoints', cpId), sanitizeForFirestore({
        id: cpId,
        missionId,
        order: cp.order || i + 1,
        title: cp.title.slice(0, 140),
        instructions: cp.instructions.slice(0, 2000),
        requirements: (cp.requirements || []).slice(0, 15),
        completionCriteria: cp.completionCriteria.slice(0, 600),
        validationMethod: cp.validationMethod,
        dependsOn: (cp.dependsOn || []).slice(0, 10),
        hint: (cp.hint || '').slice(0, 1000),
        isAssessed: Boolean(cp.isAssessed),
        status: cp.status || 'active',
        updatedAt: serverTimestamp(),
      }));
    }

    // Save starter template
    const tplId = `tpl_${missionId}`.slice(0, 120);
    await setDoc(doc(db, 'missionTemplates', tplId), sanitizeForFirestore({
      id: tplId,
      missionId,
      language: missionInput.language,
      files: starterFiles.slice(0, 20),
      status: 'active',
      updatedAt: serverTimestamp(),
    }));

    // Save rewards record
    const rewId = `rew_${missionId}`.slice(0, 120);
    const rewardPayload: Omit<MissionReward, 'updatedAt'> & { updatedAt: unknown } = {
      id: rewId,
      missionId,
      xpAmount: missionDoc.xpReward,
      badgeId: missionDoc.badgeId,
      badgeTitle: missionDoc.badgeTitle,
      skillsAwarded: missionDoc.requiredSkills,
      portfolioEligible: true,
      status: 'active',
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'missionRewards', rewId), rewardPayload);

    // Audit trail
    const logId = `audit_mission_${Date.now()}`;
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      id: logId,
      adminId: adminUid,
      action: `mission_${missionInput.status}_save`,
      targetPath: `missions/${missionId}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `missions/${missionId}`);
  }

  // Save server-side evaluation spec outside Firestore error handler
  if (evalConfig) {
    const res = await fetchWithAuthAndRetry('/api/admin/missions/eval-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...evalConfig,
        missionId,
        language: missionInput.language,
        xpReward: missionDoc.xpReward,
        badgeId: missionDoc.badgeId,
        badgeTitle: missionDoc.badgeTitle,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to save server evaluation configuration.');
    }
  }
}

export async function adminUpdateMissionStatus(
  adminUid: string,
  mission: Mission,
  nextStatus: Mission['status'],
): Promise<void> {
  const ref = doc(db, 'missions', mission.id);
  let snapExists = false;
  try {
    const snap = await getDoc(ref);
    snapExists = snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `missions/${mission.id}`);
  }

  if (!snapExists) {
    // Materialize curated mission into Firestore before changing status
    const evalMetaRes = await fetchWithAuthAndRetry(`/api/admin/missions/eval-config/${mission.id}`);
    const evalConfig = evalMetaRes.ok ? ((await evalMetaRes.json()) as MissionServerEvalConfig) : null;
    await adminSaveMissionBundle(
      adminUid,
      { ...mission, status: nextStatus },
      mission.checkpoints || [],
      mission.starterFiles || [],
      evalConfig,
    );
    return;
  }

  if (nextStatus === 'published') {
    const evalRes = await fetchWithAuthAndRetry(`/api/missions/eval-meta/${mission.id}`);
    const evalMeta = evalRes.ok ? await evalRes.json() : null;
    if (!evalMeta || !evalMeta.publicTests?.length) {
      throw new Error('Evaluation tests must be configured before publishing.');
    }
  }

  try {
    await updateDoc(ref, {
      status: nextStatus,
      ...(nextStatus === 'published' ? { qualityStatus: 'approved' } : {}),
      updatedAt: serverTimestamp(),
    });

    const logId = `audit_mission_${Date.now()}`;
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      id: logId,
      adminId: adminUid,
      action: `mission_status_${nextStatus}`,
      targetPath: `missions/${mission.id}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `missions/${mission.id}`);
  }
}

export async function adminDeleteMissionDraft(adminUid: string, missionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'missions', missionId));
    const logId = `audit_mission_${Date.now()}`;
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      id: logId,
      adminId: adminUid,
      action: 'mission_deleted',
      targetPath: `missions/${missionId}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `missions/${missionId}`);
  }
}

function resolveTimestampMs(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function upsertMissionLeaderboardEntry(
  uid: string,
  mission: Pick<Mission, 'id' | 'xpReward'>,
  attempt: MissionAttempt,
  displayNameOverride?: string,
  photoURLOverride?: string,
): Promise<void> {
  const safeMissionId = mission.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
  const entryId = `${safeMissionId}_${safeUid}`.slice(0, 150);
  const ref = doc(db, 'missionLeaderboard', entryId);

  try {
    const startMs = resolveTimestampMs(attempt.startedAt);
    const endMs = resolveTimestampMs(attempt.completedAt) ?? Date.now();
    const rawDuration = startMs && endMs >= startMs ? Math.round((endMs - startMs) / 1000) : 60;
    const durationSeconds = Math.min(864000, Math.max(1, rawDuration));
    const version = Math.min(10000, Math.max(1, Number(attempt.version) || 1));
    const xpAwarded = Math.min(250, Math.max(0, Number(attempt.xpAwarded) || Number(mission.xpReward) || 100));
    const efficiencyScore = Math.min(
      10000,
      Math.max(1, Math.round(10000 - Math.min(3600, durationSeconds) - Math.max(0, version - 1) * 150)),
    );

    let displayName = displayNameOverride?.trim().slice(0, 80) || '';
    let photoURL = photoURLOverride?.trim().slice(0, 500) || '';

    if (!displayName) {
      try {
        const pubSnap = await getDoc(doc(db, 'publicProfiles', uid));
        if (pubSnap.exists()) {
          const pub = pubSnap.data() as PublicProfile;
          displayName = (pub.displayName || '').trim().slice(0, 80);
          if (!photoURL && pub.photoURL) photoURL = pub.photoURL.slice(0, 500);
        }
      } catch {
        // Fallback safely below
      }
    }
    if (!displayName) displayName = 'Developer';

    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const prev = existingSnap.data() as MissionLeaderboardEntry;
      const isFaster = durationSeconds < prev.durationSeconds;
      const isTieMoreEfficient = durationSeconds === prev.durationSeconds && version < prev.version;
      const metadataChanged = prev.displayName !== displayName || (photoURL && prev.photoURL !== photoURL);
      if (!isFaster && !isTieMoreEfficient && !metadataChanged) {
        return;
      }
      const nextDuration = isFaster || isTieMoreEfficient ? durationSeconds : prev.durationSeconds;
      const nextVersion = isFaster || isTieMoreEfficient ? version : prev.version;
      const nextEfficiency = isFaster || isTieMoreEfficient ? efficiencyScore : prev.efficiencyScore;

      const patch: Record<string, unknown> = {
        displayName,
        xpAwarded: Math.max(prev.xpAwarded || 0, xpAwarded),
        durationSeconds: nextDuration,
        version: nextVersion,
        efficiencyScore: nextEfficiency,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) patch.photoURL = photoURL;
      await updateDoc(ref, patch);
      return;
    }

    const payload: Record<string, unknown> = {
      id: entryId,
      missionId: mission.id,
      userId: uid,
      displayName,
      xpAwarded,
      durationSeconds,
      version,
      efficiencyScore,
      completedAt: attempt.completedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) payload.photoURL = photoURL;
    await setDoc(ref, sanitizeForFirestore(payload));
  } catch {
    // Non-blocking leaderboard enrichment
  }
}

export async function syncCompletedAttemptToLeaderboard(
  uid: string,
  missionId: string,
  displayNameOverride?: string,
  photoURLOverride?: string,
): Promise<void> {
  try {
    const attemptId = `${uid.slice(0, 40)}_${missionId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60)}`;
    const attSnap = await getDoc(doc(db, 'missionAttempts', attemptId));
    if (!attSnap.exists()) return;
    const attempt = attSnap.data() as MissionAttempt;
    if (attempt.status !== 'completed') return;
    const curated = CURATED_MISSIONS.find((m) => m.id === missionId);
    await upsertMissionLeaderboardEntry(
      uid,
      { id: missionId, xpReward: curated?.xpReward ?? attempt.xpAwarded ?? 100 },
      attempt,
      displayNameOverride,
      photoURLOverride,
    );
  } catch {
    // Non-blocking leaderboard sync
  }
}
