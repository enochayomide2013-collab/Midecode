import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  FolderGit2,
  HelpCircle,
  Lightbulb,
  Loader2,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useMideo } from '../../context/MideoContext';
import { getIdTokenHeader, readJsonSafe } from '../../services/authService';
import {
  clearOfflineMissionDraft,
  exportCompletedMissionToPortfolioAndPassport,
  listHintHistoryForAttempt,
  listMissionSubmissionsAndEvaluations,
  loadOfflineMissionDraft,
  recordHintOpened,
  saveMissionWorkspaceProgress,
  saveOfflineMissionDraft,
  startOrResumeMissionAttempt,
  submitAndEvaluateMission,
  validateCheckpointWithServer,
} from '../../services/missionService';
import {
  MideoCodeEditorSurface,
  type EditorSyncStatus,
} from '../../components/MideoCodeEditorSurface';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import type {
  Mission,
  MissionAttempt,
  MissionCheckpoint,
  MissionEvaluation,
  MissionStarterFile,
} from '../../types/mideocode';

interface MissionWorkspaceProps {
  mission: Mission;
}

const MENTOR_QUICK_ACTIONS = [
  { id: 'req', label: 'Explain this requirement', mode: 'explain' as const },
  { id: 'hint', label: 'Give me a hint', mode: 'practice' as const },
  { id: 'err', label: 'Explain my error', mode: 'debug' as const },
  { id: 'concept', label: 'Help me understand this concept', mode: 'learn' as const },
  { id: 'review', label: 'Review my approach', mode: 'review' as const },
  { id: 'next', label: 'What should I learn next?', mode: 'learn' as const },
];

export function MissionWorkspace({ mission }: MissionWorkspaceProps) {
  const {
    firebaseUser,
    profile,
    settings,
    setActiveView,
    setActiveIdeProjectId,
    openMissionDetails,
    openMissionCatalog,
    refreshUserData,
    refreshMissions,
    notify,
  } = useMideo();

  const [attempt, setAttempt] = useState<MissionAttempt | null>(null);
  const [files, setFiles] = useState<MissionStarterFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [syncStatus, setSyncStatus] = useState<EditorSyncStatus>('synced');
  const [offlineDraftPrompt, setOfflineDraftPrompt] = useState<{
    files: MissionStarterFile[];
    version: number;
    savedAt: number;
  } | null>(null);
  const [conflictAttempt, setConflictAttempt] = useState<MissionAttempt | null>(null);

  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'brief' | 'checkpoints' | 'hints' | 'feedback'>('checkpoints');
  const [revealedHintCount, setRevealedHintCount] = useState(0);

  const [latestEvaluation, setLatestEvaluation] = useState<MissionEvaluation | null>(null);
  const [validatingCpId, setValidatingCpId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [completionModalData, setCompletionModalData] = useState<{
    xpAwardedNow: number;
    badgeTitle: string | null;
    attestation: string;
  } | null>(null);
  const [exportingPassport, setExportingPassport] = useState(false);

  // Contextual Mideo AI Mentor drawer state
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mentorIncludeCode, setMentorIncludeCode] = useState(true);
  const [mentorPrompt, setMentorPrompt] = useState('');
  const [mentorLoading, setMentorLoading] = useState(false);
  const [mentorMessages, setMentorMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
  const [latestConsoleError, setLatestConsoleError] = useState('');

  const sortedCheckpoints = useMemo(
    () => (mission.checkpoints || []).slice().sort((a, b) => a.order - b.order),
    [mission.checkpoints],
  );

  // Initialize or resume attempt + load past hint history + latest evaluation
  const initAttempt = useCallback(
    async (forceNew = false) => {
      if (!firebaseUser) return;
      setLoadingWorkspace(true);
      try {
        const att = await startOrResumeMissionAttempt(firebaseUser.uid, mission, forceNew);
        setAttempt(att);
        setFiles(att.files);
        setActiveFileId(att.files[0]?.id || null);
        setVersion(att.version);
        setSyncStatus('synced');

        // Check offline unsynced draft
        const cached = loadOfflineMissionDraft(firebaseUser.uid, att.id);
        if (cached && att.status !== 'completed') {
          setOfflineDraftPrompt(cached);
        } else {
          setOfflineDraftPrompt(null);
        }

        const [hintRows, hist] = await Promise.all([
          listHintHistoryForAttempt(firebaseUser.uid, att.id),
          listMissionSubmissionsAndEvaluations(firebaseUser.uid, mission.id),
        ]);
        const maxHintIdx = hintRows.reduce((max, h) => Math.max(max, h.hintIndex + 1), 0);
        setRevealedHintCount(maxHintIdx);

        const attEvals = hist.evaluations.filter((e) => e.attemptId === att.id);
        if (attEvals.length > 0) {
          setLatestEvaluation(attEvals[attEvals.length - 1]);
        } else {
          setLatestEvaluation(null);
        }
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Unable to open mission workspace.');
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [firebaseUser, mission, notify],
  );

  useEffect(() => {
    initAttempt(false);
  }, [initAttempt]);

  const isCompletedReadOnly = attempt?.status === 'completed';

  const currentCheckpoint: MissionCheckpoint | undefined = useMemo(() => {
    if (!attempt) return sortedCheckpoints[0];
    return (
      sortedCheckpoints.find((cp) => cp.id === attempt.currentCheckpointId) ||
      sortedCheckpoints.find((cp) => !attempt.completedCheckpointIds.includes(cp.id)) ||
      sortedCheckpoints[sortedCheckpoints.length - 1]
    );
  }, [attempt, sortedCheckpoints]);

  const progressPct = useMemo(() => {
    if (!attempt || sortedCheckpoints.length === 0) return 0;
    return Math.min(100, Math.round((attempt.completedCheckpointIds.length / sortedCheckpoints.length) * 100));
  }, [attempt, sortedCheckpoints.length]);

  const saveWorkspace = useCallback(
    async (forceOverwrite = false) => {
      if (!firebaseUser || !attempt || isCompletedReadOnly) return;
      setSyncStatus('saving');
      if (!navigator.onLine) {
        saveOfflineMissionDraft(firebaseUser.uid, attempt.id, {
          files,
          version,
          savedAt: Date.now(),
        });
        setSyncStatus('offline');
        notify('info', 'Offline mode: edits backed up locally and will sync when reconnected.');
        return;
      }

      try {
        const res = await saveMissionWorkspaceProgress(
          firebaseUser.uid,
          attempt.id,
          {
            files,
            expectedVersion: version,
            currentCheckpointId: attempt.currentCheckpointId,
            completedCheckpointIds: attempt.completedCheckpointIds,
            acknowledgedStepIds: attempt.acknowledgedStepIds,
            checkpointFeedback: attempt.checkpointFeedback,
            status: attempt.status === 'needs_improvement' ? 'in_progress' : undefined,
          },
          forceOverwrite,
        );
        if (res.conflict && res.serverAttempt) {
          setSyncStatus('conflict');
          setConflictAttempt(res.serverAttempt);
          return;
        }
        setVersion(res.newVersion);
        setAttempt((prev) => (prev ? { ...prev, files, version: res.newVersion } : prev));
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus(navigator.onLine ? 'failed' : 'offline');
        notify('error', err instanceof Error ? err.message : 'Save failed — local backup preserved.');
      }
    },
    [firebaseUser, attempt, isCompletedReadOnly, files, version, notify],
  );

  // Autosave debounce
  useEffect(() => {
    if (settings?.autosave === false) return;
    if (syncStatus !== 'dirty' || !attempt || isCompletedReadOnly) return;
    const t = setTimeout(() => {
      saveWorkspace(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [syncStatus, files, settings?.autosave, attempt, isCompletedReadOnly, saveWorkspace]);

  // Retry offline sync when browser returns online
  useEffect(() => {
    const onOnline = () => {
      if (syncStatus === 'offline' && attempt && !isCompletedReadOnly) {
        saveWorkspace(false);
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncStatus, attempt, isCompletedReadOnly, saveWorkspace]);

  const isCheckpointUnlocked = (cp: MissionCheckpoint): boolean => {
    if (!attempt) return false;
    if (!cp.dependsOn || cp.dependsOn.length === 0) return true;
    return cp.dependsOn.every((depId) => attempt.completedCheckpointIds.includes(depId));
  };

  const handleValidateCheckpoint = async (cp: MissionCheckpoint) => {
    if (!firebaseUser || !attempt) return;
    if (!isCheckpointUnlocked(cp)) {
      notify('info', 'Complete the prerequisite checkpoint(s) first before verifying this step.');
      return;
    }

    // Non-assessed instructional step acknowledgement
    if (!cp.isAssessed || cp.validationMethod === 'instructional') {
      const nextAck = Array.from(new Set([...attempt.acknowledgedStepIds, cp.id]));
      const nextDone = Array.from(new Set([...attempt.completedCheckpointIds, cp.id]));
      const nextCp =
        sortedCheckpoints.find((c) => !nextDone.includes(c.id))?.id || cp.id;
      const feedback = {
        ...attempt.checkpointFeedback,
        [cp.id]: {
          passed: true,
          message: 'Review step acknowledged.',
          checkedAt: new Date().toISOString(),
        },
      };
      try {
        const res = await saveMissionWorkspaceProgress(firebaseUser.uid, attempt.id, {
          files,
          expectedVersion: version,
          currentCheckpointId: nextCp,
          completedCheckpointIds: nextDone,
          acknowledgedStepIds: nextAck,
          checkpointFeedback: feedback,
        });
        if (res.conflict) {
          notify('error', 'Workspace version conflict detected. Reloading latest saved version.');
          return;
        }
        setVersion(res.newVersion);
        setAttempt((prev) =>
          prev
            ? {
                ...prev,
                completedCheckpointIds: nextDone,
                acknowledgedStepIds: nextAck,
                currentCheckpointId: nextCp,
                checkpointFeedback: feedback,
              }
            : prev,
        );
        notify('success', `Step "${cp.title}" acknowledged.`);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Unable to save step acknowledgment.');
      }
      return;
    }

    setValidatingCpId(cp.id);
    try {
      const result = await validateCheckpointWithServer(mission.id, cp.id, files);
      const nextDone = result.passed
        ? Array.from(new Set([...attempt.completedCheckpointIds, cp.id]))
        : attempt.completedCheckpointIds;
      const nextCp = result.passed
        ? sortedCheckpoints.find((c) => !nextDone.includes(c.id))?.id || cp.id
        : cp.id;
      const nextFeedback = {
        ...attempt.checkpointFeedback,
        [cp.id]: {
          passed: result.passed,
          message: result.message,
          details: result.details,
          checkedAt: new Date().toISOString(),
        },
      };

      if (!isCompletedReadOnly) {
        const saved = await saveMissionWorkspaceProgress(firebaseUser.uid, attempt.id, {
          files,
          expectedVersion: version,
          currentCheckpointId: nextCp,
          completedCheckpointIds: nextDone,
          checkpointFeedback: nextFeedback,
        });
        setVersion(saved.newVersion);
      }

      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              completedCheckpointIds: nextDone,
              currentCheckpointId: nextCp,
              checkpointFeedback: nextFeedback,
            }
          : prev,
      );

      if (result.passed) {
        notify('success', `Checkpoint verified: ${cp.title}`);
      } else {
        notify('info', result.message);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Checkpoint check failed.');
    } finally {
      setValidatingCpId(null);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!firebaseUser || !attempt) return;
    setSubmitting(true);
    try {
      const outcome = await submitAndEvaluateMission(
        firebaseUser.uid,
        mission,
        attempt,
        files,
        attempt.completedCheckpointIds,
        attempt.acknowledgedStepIds,
      );
      setLatestEvaluation(outcome.evaluation);
      setAttempt(outcome.updatedAttempt);
      setVersion(outcome.updatedAttempt.version);
      setSyncStatus('synced');
      setActiveTab('feedback');

      if (outcome.evaluation.passed) {
        await refreshUserData();
        await refreshMissions();
        setCompletionModalData({
          xpAwardedNow: outcome.xpAwardedNow,
          badgeTitle: outcome.badgeUnlockedNow || mission.badgeTitle,
          attestation: outcome.evaluation.attestation,
        });
      } else {
        notify(
          'info',
          `Passed ${outcome.evaluation.passedCount}/${outcome.evaluation.totalCount} checks. Inspect feedback to fix remaining items.`,
        );
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Submission evaluation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevealNextHint = async () => {
    if (!firebaseUser || !attempt) return;
    const nextIdx = revealedHintCount;
    const hint = mission.hints[nextIdx];
    if (!hint) return;
    setRevealedHintCount(nextIdx + 1);
    try {
      await recordHintOpened(firebaseUser.uid, mission.id, attempt.id, nextIdx, hint.id);
    } catch {
      // Hint stays visible even if telemetry write stalls
    }
  };

  const handleExportPassport = async () => {
    if (!firebaseUser || !profile || !attempt) return;
    setExportingPassport(true);
    try {
      const res = await exportCompletedMissionToPortfolioAndPassport(
        firebaseUser.uid,
        profile.displayName,
        mission,
        attempt,
      );
      setAttempt((prev) =>
        prev ? { ...prev, addedToPassport: true, portfolioProjectId: res.projectId } : prev,
      );
      await refreshUserData();
      notify(
        'success',
        res.alreadyAdded
          ? 'Already added to your Skill Passport and Portfolio.'
          : 'Added verified mission project to your Skill Passport and Portfolio!',
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to add mission to Skill Passport.');
    } finally {
      setExportingPassport(false);
    }
  };

  const handleAskMentor = async (customPrompt?: string, mode: 'learn' | 'debug' | 'explain' | 'practice' | 'review' = 'learn') => {
    const promptText = (customPrompt ?? mentorPrompt).trim();
    if (!promptText) return;
    const userMsgId = `u_${Date.now()}`;
    const nextHistory = [...mentorMessages, { id: userMsgId, role: 'user' as const, content: promptText }];
    setMentorMessages(nextHistory);
    if (!customPrompt) setMentorPrompt('');
    setMentorLoading(true);

    const activeFile = files.find((f) => f.id === activeFileId) || files[0];
    try {
      const headers = await getIdTokenHeader();
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          mode,
          prompt: promptText,
          includeContext: mentorIncludeCode,
          history: nextHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          context: {
            missionTitle: mission.title,
            missionScenario: mission.scenario,
            currentCheckpointTitle: currentCheckpoint?.title,
            currentCheckpointRequirements: currentCheckpoint?.requirements,
            filename: mentorIncludeCode ? activeFile?.name : undefined,
            language: mentorIncludeCode ? activeFile?.language : undefined,
            selectedCode: mentorIncludeCode ? activeFile?.content : undefined,
            errorMessage: mentorIncludeCode
              ? [latestConsoleError, ...(latestEvaluation?.runtimeErrors || [])].filter(Boolean).join('\n')
              : undefined,
          },
        }),
      });
      const data = await readJsonSafe<{ reply?: string }>(res, 'Mideo AI Mentor request failed.');
      setMentorMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', content: String(data.reply || '') },
      ]);
    } catch (err) {
      setMentorMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Unable to reach Mideo AI Mentor right now.',
        },
      ]);
    } finally {
      setMentorLoading(false);
    }
  };

  if (loadingWorkspace || !attempt) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <p className="text-xs text-slate-500">Preparing Mission Mode workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Workspace Header & Progress Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => openMissionDetails(mission.id)}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Back to Mission Details"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {mission.category} · {mission.difficulty} · {attempt.status.replace('_', ' ')}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                {mission.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setInstructionsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {instructionsOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
              {instructionsOpen ? 'Hide Brief' : 'Show Brief'}
            </button>

            <button
              onClick={() => setMentorOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                mentorOpen
                  ? 'border-violet-500 bg-violet-600/15 text-violet-600 dark:text-violet-300'
                  : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              Mideo AI Mentor
            </button>

            {isCompletedReadOnly ? (
              <button
                onClick={() => initAttempt(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start New Attempt
              </button>
            ) : (
              <button
                onClick={handleSubmitEvaluation}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {submitting ? 'Evaluating...' : 'Submit for Evaluation'}
              </button>
            )}
          </div>
        </div>

        {/* Mission Progress Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
              {progressPct}% ({attempt.completedCheckpointIds.length}/{sortedCheckpoints.length} checkpoints)
            </span>
            <div className="h-2 flex-1 max-w-sm rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            {currentCheckpoint && (
              <span className="hidden md:inline text-slate-500 dark:text-slate-400 truncate">
                Current: {currentCheckpoint.title}
              </span>
            )}
          </div>

          {!isCompletedReadOnly && (
            <button
              onClick={() => {
                if (mission.starterFiles) {
                  setFiles(mission.starterFiles.map((f) => ({ ...f })));
                  setSyncStatus('dirty');
                  notify('info', 'Editor reset to starter template (save to keep changes).');
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Starter
            </button>
          )}
        </div>
      </div>

      {/* Offline Draft Recovery Prompt */}
      {offlineDraftPrompt && (
        <div className="p-3.5 rounded-xl border border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <strong className="text-slate-900 dark:text-white">Local Offline Draft Found:</strong>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              Unsynced edits saved at {new Date(offlineDraftPrompt.savedAt).toLocaleTimeString()} are ready to restore.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFiles(offlineDraftPrompt.files);
                setSyncStatus('dirty');
                setOfflineDraftPrompt(null);
                notify('info', 'Restored local draft edits into the editor.');
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              Restore Draft
            </button>
            <button
              onClick={() => {
                if (firebaseUser) clearOfflineMissionDraft(firebaseUser.uid, attempt.id);
                setOfflineDraftPrompt(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Main Split Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Area 1 & 5: Collapsible Instructions + Checkpoints + Hints + Feedback */}
        {instructionsOpen && (
          <aside className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden flex flex-col max-h-[760px]">
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
              {(
                [
                  { id: 'checkpoints', label: 'Checkpoints' },
                  { id: 'brief', label: 'Brief' },
                  { id: 'hints', label: `Hints (${revealedHintCount}/${mission.hints.length})` },
                  { id: 'feedback', label: 'Evaluation' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2.5 px-2 font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#0D1322]'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {activeTab === 'checkpoints' && (
                <div className="space-y-3">
                  <p className="text-slate-500 dark:text-slate-400">
                    Complete checkpoints sequentially and verify each requirement against the server evaluator.
                  </p>
                  {sortedCheckpoints.map((cp) => {
                    const done = attempt.completedCheckpointIds.includes(cp.id);
                    const unlocked = isCheckpointUnlocked(cp);
                    const fb = attempt.checkpointFeedback?.[cp.id];
                    const validating = validatingCpId === cp.id;

                    return (
                      <div
                        key={cp.id}
                        className={`p-3.5 rounded-lg border space-y-2.5 ${
                          done
                            ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/15'
                            : unlocked
                              ? 'border-slate-200 dark:border-slate-800'
                              : 'border-slate-200 dark:border-slate-800 opacity-65'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : unlocked ? (
                              <Circle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            ) : (
                              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="text-[11px] text-slate-500">
                                Step {cp.order} · {cp.isAssessed ? cp.validationMethod.toUpperCase() : 'Review'}
                              </div>
                              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                                {cp.title}
                              </h3>
                            </div>
                          </div>
                        </div>

                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {cp.instructions}
                        </p>

                        <ul className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {cp.requirements.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>

                        {fb && (
                          <div
                            className={`p-2 rounded text-[11px] ${
                              fb.passed
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                            }`}
                          >
                            {fb.message}
                          </div>
                        )}

                        {!isCompletedReadOnly && (
                          <button
                            onClick={() => handleValidateCheckpoint(cp)}
                            disabled={!unlocked || validating}
                            className="w-full py-1.5 px-3 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                          >
                            {validating
                              ? 'Checking...'
                              : !cp.isAssessed
                                ? done
                                  ? 'Step Acknowledged'
                                  : 'Mark Step Reviewed'
                                : done
                                  ? 'Re-verify Checkpoint'
                                  : 'Check Checkpoint'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'brief' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Scenario</h3>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{mission.scenario}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Requirements</h3>
                    <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                      {mission.requirements.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Step-by-Step Guide</h3>
                    <ol className="space-y-1.5 list-decimal list-inside text-slate-600 dark:text-slate-300">
                      {mission.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                    <strong className="text-slate-900 dark:text-white">Completion Criteria:</strong>{' '}
                    <span className="text-slate-600 dark:text-slate-300">{mission.completionCriteria}</span>
                  </div>
                </div>
              )}

              {activeTab === 'hints' && (
                <div className="space-y-3">
                  <p className="text-slate-500 dark:text-slate-400">
                    Hints reveal incrementally so you can build engineering intuition before checking detailed steps.
                  </p>
                  {mission.hints.slice(0, revealedHintCount).map((hint) => (
                    <div
                      key={hint.id}
                      className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 space-y-1"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>
                          Hint {hint.order}: {hint.title}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{hint.content}</p>
                    </div>
                  ))}
                  {revealedHintCount < mission.hints.length ? (
                    <button
                      onClick={handleRevealNextHint}
                      className="w-full py-2 px-3 rounded-lg border border-amber-500/50 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold cursor-pointer"
                    >
                      Reveal Next Hint ({revealedHintCount + 1} of {mission.hints.length})
                    </button>
                  ) : (
                    <p className="text-slate-500">All progressive hints revealed.</p>
                  )}
                </div>
              )}

              {activeTab === 'feedback' && (
                <div className="space-y-4">
                  {!latestEvaluation ? (
                    <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg space-y-2">
                      <p className="text-slate-500">No full mission evaluation submitted yet.</p>
                      <p className="text-[11px] text-slate-400">
                        Use "Submit for Evaluation" in the top bar once your checkpoints pass.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`p-4 rounded-lg border ${
                          latestEvaluation.passed
                            ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/25'
                            : 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/25'
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {latestEvaluation.passed
                            ? `Mission Passed (${latestEvaluation.passedCount}/${latestEvaluation.totalCount} tests)`
                            : `Needs Improvement (${latestEvaluation.passedCount}/${latestEvaluation.totalCount} tests passed)`}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono tabular-nums">
                          Execution: {latestEvaluation.executionMs}ms · Attestation: {latestEvaluation.attestation}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="font-semibold text-slate-900 dark:text-white">Test Case Results</h3>
                        {latestEvaluation.testResults.map((tr) => (
                          <div
                            key={tr.id}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {tr.isHidden ? `[Hidden] ${tr.label}` : tr.label}
                              </span>
                              <span
                                className={`font-mono font-semibold ${
                                  tr.passed ? 'text-emerald-500' : 'text-red-500'
                                }`}
                              >
                                {tr.passed ? 'PASS' : 'FAIL'}
                              </span>
                            </div>
                            {tr.error && <p className="text-[11px] text-red-500">{tr.error}</p>}
                          </div>
                        ))}
                      </div>

                      {latestEvaluation.suggestions.length > 0 && (
                        <div className="space-y-1.5">
                          <h3 className="font-semibold text-slate-900 dark:text-white">
                            Recommended Next Fixes
                          </h3>
                          <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                            {latestEvaluation.suggestions.map((s, idx) => (
                              <li key={idx}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Area 2 & 3: Integrated Mideo IDE Code Editor + Live Preview */}
        <div className={instructionsOpen ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <MideoCodeEditorSurface
            files={files}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
            onChangeFileContent={(fileId, content) => {
              setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
              setSyncStatus('dirty');
            }}
            onAddFile={
              isCompletedReadOnly
                ? undefined
                : (name, language) => {
                    const newFile: MissionStarterFile = {
                      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                      name,
                      folder: '',
                      language,
                      content: '',
                    };
                    setFiles((prev) => [...prev, newFile]);
                    setActiveFileId(newFile.id);
                    setSyncStatus('dirty');
                  }
            }
            onRenameFile={
              isCompletedReadOnly
                ? undefined
                : (fileId, nextName) => {
                    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: nextName } : f)));
                    setSyncStatus('dirty');
                  }
            }
            onDeleteFile={
              isCompletedReadOnly
                ? undefined
                : (fileId) => {
                    const remaining = files.filter((f) => f.id !== fileId);
                    setFiles(remaining);
                    if (activeFileId === fileId) setActiveFileId(remaining[0]?.id || null);
                    setSyncStatus('dirty');
                  }
            }
            onSave={isCompletedReadOnly ? undefined : () => saveWorkspace(false)}
            syncStatus={syncStatus}
            syncLabel={isCompletedReadOnly ? 'Completed Snapshot (Read-Only)' : undefined}
            settings={settings}
            readOnly={isCompletedReadOnly}
            compactLayout={instructionsOpen}
            onConsoleErrorChange={setLatestConsoleError}
          />

          {/* Quick Completed Actions Strip when already completed */}
          {isCompletedReadOnly && (
            <div className="mt-3 p-4 rounded-xl border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <Award className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    Mission Completed · +{attempt.xpAwarded} XP Verified
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {attempt.addedToPassport
                      ? 'Published to your Skill Passport & Mideo Portfolio.'
                      : 'Ready to export this solution to your Skill Passport.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportPassport}
                  disabled={exportingPassport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  {attempt.addedToPassport ? 'Synced to Skill Passport' : exportingPassport ? 'Exporting...' : 'Add to Skill Passport'}
                </button>
                {attempt.portfolioProjectId && (
                  <button
                    onClick={() => {
                      setActiveIdeProjectId(attempt.portfolioProjectId!);
                      setActiveView('ide');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <FolderGit2 className="w-3.5 h-3.5" />
                    View Project
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Area 4: Contextual Mideo AI Mentor Panel */}
      {mentorOpen && (
        <section className="rounded-xl border border-violet-500/40 bg-white dark:bg-[#0D1322] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Mideo AI Mentor — {mission.title}
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={mentorIncludeCode}
                  onChange={(e) => setMentorIncludeCode(e.target.checked)}
                />
                <span>Share active file & error logs</span>
              </label>
              <button onClick={() => setMentorOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {MENTOR_QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.id}
                onClick={() => handleAskMentor(qa.label, qa.mode)}
                disabled={mentorLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-violet-500 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-violet-500" />
                {qa.label}
              </button>
            ))}
          </div>

          {mentorMessages.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-2.5 p-3 rounded-lg bg-slate-50 dark:bg-[#080C17] border border-slate-200 dark:border-slate-800">
              {mentorMessages.map((msg) => (
                <div key={msg.id} className="text-xs leading-relaxed">
                  <div
                    className={`font-semibold mb-1 ${
                      msg.role === 'user' ? 'text-blue-500' : 'text-violet-500'
                    }`}
                  >
                    {msg.role === 'user' ? 'You' : 'Mideo AI Mentor'}
                  </div>
                  {msg.role === 'assistant' ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskMentor(undefined, 'learn');
            }}
            className="flex gap-2"
          >
            <input
              value={mentorPrompt}
              onChange={(e) => setMentorPrompt(e.target.value)}
              placeholder={`Ask about "${currentCheckpoint?.title || mission.title}"...`}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={mentorLoading || !mentorPrompt.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {mentorLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Ask Mentor
            </button>
          </form>
        </section>
      )}

      {/* Version Conflict Modal */}
      {conflictAttempt && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-400 dark:border-amber-700 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Mission Workspace Version Conflict</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              A newer cloud revision (v{conflictAttempt.version}) exists for this mission attempt. Choose how to proceed safely.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setAttempt(conflictAttempt);
                  setFiles(conflictAttempt.files);
                  setVersion(conflictAttempt.version);
                  setConflictAttempt(null);
                  setSyncStatus('synced');
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Load Cloud Version
              </button>
              <button
                onClick={async () => {
                  setConflictAttempt(null);
                  await saveWorkspace(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Keep My Local Edits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISSION COMPLETED Celebration Modal */}
      {completionModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-500/50 bg-white dark:bg-[#0D1322] p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                MISSION COMPLETED
              </span>
              <button
                onClick={() => setCompletionModalData(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {mission.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                All automated server tests passed and your implementation is verified.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
              <div>
                <div className="text-slate-500">Verified XP</div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {completionModalData.xpAwardedNow > 0
                    ? `+${completionModalData.xpAwardedNow} XP`
                    : 'Already Claimed'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Badge Unlocked</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {completionModalData.badgeTitle}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={async () => {
                  await handleExportPassport();
                  setCompletionModalData(null);
                }}
                disabled={exportingPassport}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                Add to Skill Passport
              </button>
              <button
                onClick={async () => {
                  await handleExportPassport();
                  setCompletionModalData(null);
                  setActiveView('career');
                }}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                <FolderGit2 className="w-4 h-4" />
                View Project
              </button>
              <button
                onClick={() => {
                  setCompletionModalData(null);
                  openMissionCatalog();
                }}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                Start Another Mission
              </button>
              <button
                onClick={() => {
                  setCompletionModalData(null);
                  setActiveView('dashboard');
                }}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
