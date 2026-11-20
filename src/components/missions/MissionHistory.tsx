import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode2,
  Filter,
  History,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../../context/MideoContext';
import { MISSION_CATEGORIES, MISSION_DIFFICULTIES } from '../../data/missionsData';
import {
  listMissionSubmissionsAndEvaluations,
  startOrResumeMissionAttempt,
} from '../../services/missionService';
import type {
  Mission,
  MissionAttempt,
  MissionEvaluation,
  MissionSubmission,
} from '../../types/mideocode';

function toEpochMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts === 'object') {
    const rec = ts as { toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') return rec.toMillis();
    if (typeof rec.seconds === 'number') return rec.seconds * 1000;
  }
  return 0;
}

function formatTs(ts: unknown): string {
  const ms = toEpochMs(ts);
  if (!ms) return 'Recent';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MissionHistory() {
  const {
    firebaseUser,
    missions,
    missionAttempts,
    openMissionCatalog,
    openMissionDetails,
    openMissionWorkspace,
    refreshMissions,
    notify,
  } = useMideo();

  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [evaluations, setEvaluations] = useState<MissionEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingFreshId, setStartingFreshId] = useState<string | null>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  // Filters
  const [queryText, setQueryText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'needs_improvement'>('all');
  const [dateWindow, setDateWindow] = useState<'all' | '7d' | '30d'>('all');

  useEffect(() => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listMissionSubmissionsAndEvaluations(firebaseUser.uid)
      .then(({ submissions: subs, evaluations: evals }) => {
        setSubmissions(subs);
        setEvaluations(evals);
      })
      .catch((err) => {
        notify('error', err instanceof Error ? err.message : 'Unable to load mission history.');
      })
      .finally(() => setLoading(false));
  }, [firebaseUser, notify]);

  const missionById = useMemo(() => {
    const map = new Map<string, Mission>();
    missions.forEach((m) => map.set(m.id, m));
    return map;
  }, [missions]);

  const evalBySubId = useMemo(() => {
    const map = new Map<string, MissionEvaluation>();
    evaluations.forEach((ev) => map.set(ev.submissionId, ev));
    return map;
  }, [evaluations]);

  const subsByAttempt = useMemo(() => {
    const map = new Map<string, MissionSubmission[]>();
    submissions.forEach((s) => {
      const arr = map.get(s.attemptId) || [];
      arr.push(s);
      map.set(s.attemptId, arr);
    });
    for (const [k, list] of map.entries()) {
      map.set(
        k,
        list.slice().sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt)),
      );
    }
    return map;
  }, [submissions]);

  const enrichedAttempts = useMemo(() => {
    const now = Date.now();
    const cutoff =
      dateWindow === '7d'
        ? now - 7 * 86400 * 1000
        : dateWindow === '30d'
          ? now - 30 * 86400 * 1000
          : 0;

    return missionAttempts
      .map((attempt) => ({
        attempt,
        mission: missionById.get(attempt.missionId) || null,
        attemptSubs: subsByAttempt.get(attempt.id) || [],
        activityMs: Math.max(toEpochMs(attempt.lastActivityAt), toEpochMs(attempt.startedAt)),
      }))
      .filter(({ attempt, mission, activityMs }) => {
        if (cutoff && activityMs > 0 && activityMs < cutoff) return false;
        if (statusFilter !== 'all' && attempt.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && mission?.category !== categoryFilter) return false;
        if (difficultyFilter !== 'all' && mission?.difficulty !== difficultyFilter) return false;
        if (languageFilter !== 'all' && mission?.language !== languageFilter) return false;
        if (queryText.trim()) {
          const q = queryText.trim().toLowerCase();
          const haystack = `${mission?.title || attempt.missionId} ${mission?.category || ''} ${mission?.requiredSkills.join(' ') || ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.activityMs - a.activityMs);
  }, [
    missionAttempts,
    missionById,
    subsByAttempt,
    dateWindow,
    statusFilter,
    categoryFilter,
    difficultyFilter,
    languageFilter,
    queryText,
  ]);

  const completedCount = missionAttempts.filter((a) => a.status === 'completed').length;
  const activeCount = missionAttempts.filter(
    (a) => a.status === 'in_progress' || a.status === 'needs_improvement',
  ).length;
  const totalEarnedXp = missionAttempts.reduce((sum, a) => sum + (a.xpAwarded || 0), 0);

  const handleStartFreshAttempt = async (mission: Mission) => {
    if (!firebaseUser) return;
    setStartingFreshId(mission.id);
    try {
      await startOrResumeMissionAttempt(firebaseUser.uid, mission, true);
      await refreshMissions();
      notify('success', `Started a fresh workspace attempt for "${mission.title}".`);
      openMissionWorkspace(mission.id);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to start a new attempt.');
    } finally {
      setStartingFreshId(null);
    }
  };

  const statusLabel = (status: MissionAttempt['status']) => {
    if (status === 'completed') return 'Completed';
    if (status === 'needs_improvement') return 'Needs Improvement';
    if (status === 'submitted') return 'Submitted';
    return 'In Progress';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            onClick={openMissionCatalog}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Mission Mode
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-blue-500" />
            Mission Attempt & Submission History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inspect past submissions, server evaluation reports, earned rewards, or launch a fresh practice attempt.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
            <div className="text-[11px] text-slate-500">Completed</div>
            <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {completedCount}
            </div>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
            <div className="text-[11px] text-slate-500">Active</div>
            <div className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {activeCount}
            </div>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
            <div className="text-[11px] text-slate-500">Mission XP</div>
            <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
              {totalEarnedXp}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Filter className="w-3.5 h-3.5 text-blue-500" />
          Filter Attempt History
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search mission title or skill..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            {MISSION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Languages</option>
            <option value="web">HTML & CSS (Web)</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="sql">SQL</option>
          </select>

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Difficulties</option>
            {MISSION_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="needs_improvement">Needs Fix</option>
            </select>

            <select
              value={dateWindow}
              onChange={(e) => setDateWindow(e.target.value as typeof dateWindow)}
              className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
            >
              <option value="all">Any Time</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
            </select>
          </div>
        </div>
      </section>

      {/* Attempts List */}
      {loading ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center text-xs text-slate-500">
          Loading submission and evaluation records...
        </div>
      ) : enrichedAttempts.length === 0 ? (
        <div className="p-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-center space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {missionAttempts.length === 0
              ? 'You have not started any programming missions yet.'
              : 'No mission attempts match your active filters.'}
          </p>
          <button
            onClick={openMissionCatalog}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Explore Mission Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {enrichedAttempts.map(({ attempt, mission, attemptSubs }) => {
            const totalCps = mission?.checkpoints?.length || 0;
            const doneCps = attempt.completedCheckpointIds.length;
            const progressPct =
              attempt.status === 'completed'
                ? 100
                : totalCps > 0
                  ? Math.round((doneCps / totalCps) * 100)
                  : 0;
            const expanded = expandedAttemptId === attempt.id;

            return (
              <div
                key={attempt.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden"
              >
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          attempt.status === 'completed'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : attempt.status === 'needs_improvement'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {statusLabel(attempt.status)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {mission?.category || 'Mission'} · {mission?.difficulty || 'Standard'} ·{' '}
                        {mission?.supportedLanguages.join(' / ') || attempt.files[0]?.language || 'Code'}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        v{attempt.version} · {attemptSubs.length} submission{attemptSubs.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <button
                      onClick={() => openMissionDetails(attempt.missionId)}
                      className="text-base font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left cursor-pointer"
                    >
                      {mission?.title || attempt.missionId}
                    </button>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Last active: {formatTs(attempt.lastActivityAt || attempt.startedAt)}
                      </span>
                      {attempt.status === 'completed' && attempt.xpAwarded > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <Award className="w-3.5 h-3.5" />
                          +{attempt.xpAwarded} XP verified
                        </span>
                      )}
                      {attempt.addedToPassport && (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Exported to Skill Passport
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <div className="w-28 mr-1">
                      <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${attempt.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedAttemptId(expanded ? null : attempt.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      Evaluations ({attemptSubs.length})
                    </button>

                    <button
                      onClick={() => openMissionWorkspace(attempt.missionId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {attempt.status === 'completed' ? 'Inspect Workspace' : 'Resume'}
                    </button>

                    {mission && attempt.status === 'completed' && (
                      <button
                        onClick={() => handleStartFreshAttempt(mission)}
                        disabled={startingFreshId === mission.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {startingFreshId === mission.id ? 'Creating...' : 'Start Fresh Attempt'}
                      </button>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] p-5 space-y-3">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
                      Evaluation History for Attempt
                    </div>
                    {attemptSubs.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No formal evaluations submitted for this attempt yet. Open the workspace to validate checkpoints and submit.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {attemptSubs.map((sub) => {
                          const ev = evalBySubId.get(sub.id);
                          return (
                            <div
                              key={sub.id}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2 font-semibold">
                                  {sub.status === 'passed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-amber-500" />
                                  )}
                                  <span className="text-slate-900 dark:text-white">
                                    Submission v{sub.projectVersion} —{' '}
                                    {sub.status === 'passed' ? 'Passed' : 'Needs Improvement'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 font-mono tabular-nums text-slate-500">
                                  {ev && (
                                    <span>
                                      {ev.passedCount}/{ev.totalCount} checks · {ev.executionMs}ms
                                    </span>
                                  )}
                                  <span>{formatTs(sub.createdAt)}</span>
                                </div>
                              </div>

                              {ev && ev.requirementsMissing.length > 0 && (
                                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                  Missing at submission: {ev.requirementsMissing.join(' · ')}
                                </div>
                              )}
                              {ev && ev.suggestions.length > 0 && (
                                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                  Feedback: {ev.suggestions[0]}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
