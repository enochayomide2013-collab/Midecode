import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Download,
  FlaskConical,
  Loader2,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  buildDeveloperInsights,
  clearUserActivityEvents,
} from '../services/insightsService';
import type { ActivityEvent, DeveloperInsightsSnapshot } from '../types/mideocode';

export function DeveloperInsightsView() {
  const {
    firebaseUser,
    profile,
    courseProgress,
    projects,
    setActiveView,
    notify,
  } = useMideo();

  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<DeveloperInsightsSnapshot | null>(null);
  const [rawEvents, setRawEvents] = useState<ActivityEvent[]>([]);
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadInsights = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const res = await buildDeveloperInsights(firebaseUser.uid, range, courseProgress, projects);
      setSnapshot(res.snapshot);
      setRawEvents(res.rawEvents);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load developer insights.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, range, courseProgress, projects, notify]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const maxDailyTotal = useMemo(() => {
    if (!snapshot) return 1;
    const peak = Math.max(
      1,
      ...snapshot.dailySeries.map((d) => d.independent + d.aiAssisted),
    );
    return peak;
  }, [snapshot]);

  const handleExportInsights = () => {
    if (!snapshot || !profile) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      developer: profile.displayName,
      range: snapshot.range,
      summary: snapshot,
      activityEvents: rawEvents,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mideocode-developer-insights-${snapshot.range}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Personal developer insights exported as JSON.');
  };

  const handleClearActivity = async () => {
    if (!firebaseUser) return;
    setClearing(true);
    try {
      const deletedCount = await clearUserActivityEvents(firebaseUser.uid);
      setConfirmClearModal(false);
      await loadInsights();
      notify('info', `Cleared ${deletedCount} personal activity event record(s).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to clear personal activity log.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Developer Insights
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Personal analytics derived strictly from your recorded lessons, challenges, projects, snapshots, tests, and AI sessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['7d', '30d', '90d', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded text-xs font-medium uppercase cursor-pointer ${
                  range === r
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {r === 'all' ? 'All Time' : r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportInsights}
            disabled={!snapshot}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => setConfirmClearModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Activity Log
          </button>
        </div>
      </div>

      {loading || !snapshot ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Computing personal analytics from your workspace records...
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Recorded Actions</span>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {snapshot.totalActions}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {snapshot.independentActions} independent · {snapshot.aiAssistedActions} AI-assisted
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Active Coding Days</span>
                <BarChart3 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {snapshot.activeDays}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {snapshot.lessonsCompleted} lessons · {snapshot.exercisesCompleted} exercises
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Challenge Accuracy</span>
                <Target className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {snapshot.challengeAccuracyPct}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {snapshot.challengesPassed} / {snapshot.challengesAttempted} passed
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>TestLab Pass Rate</span>
                <FlaskConical className="w-4 h-4 text-violet-500" />
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {snapshot.testPassRatePct}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {snapshot.testRunsCount} test runs · {snapshot.versionSnapshotsCount} snapshots
              </p>
            </div>
          </div>

          {/* Daily Independent vs AI-Assisted Trend SVG Chart + Language Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Independent vs AI-Assisted Activity Trend
                  </h2>
                  <p className="text-xs text-slate-500">
                    Daily breakdown across your last {snapshot.dailySeries.length} days
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                    Independent
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-violet-500 inline-block" />
                    AI-Assisted
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <svg viewBox="0 0 700 200" className="w-full h-48">
                  <line x1="24" y1="165" x2="684" y2="165" stroke="#334155" strokeWidth="1" />
                  {snapshot.dailySeries.map((day, idx) => {
                    const colWidth = 650 / Math.max(1, snapshot.dailySeries.length);
                    const x = 30 + idx * colWidth;
                    const barW = Math.min(28, colWidth * 0.58);
                    const indH = Math.round((day.independent / maxDailyTotal) * 135);
                    const aiH = Math.round((day.aiAssisted / maxDailyTotal) * 135);
                    return (
                      <g key={day.dayKey}>
                        <title>
                          {day.label}: {day.independent} independent, {day.aiAssisted} AI-assisted, {day.testsRun} tests run
                        </title>
                        {day.independent > 0 && (
                          <rect
                            x={x}
                            y={165 - indH}
                            width={barW}
                            height={Math.max(3, indH)}
                            rx="2"
                            fill="#2563eb"
                          />
                        )}
                        {day.aiAssisted > 0 && (
                          <rect
                            x={x}
                            y={165 - indH - aiH}
                            width={barW}
                            height={Math.max(3, aiH)}
                            rx="2"
                            fill="#8b5cf6"
                          />
                        )}
                        {day.independent + day.aiAssisted === 0 && (
                          <rect x={x} y={162} width={barW} height={3} rx="1" fill="#334155" opacity="0.4" />
                        )}
                        <text
                          x={x + barW / 2}
                          y={184}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="9"
                          fontFamily="sans-serif"
                        >
                          {idx % 2 === 0 || snapshot.dailySeries.length <= 7 ? day.label : ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Language Distribution */}
            <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Languages Practised
              </h2>
              {snapshot.languageBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Language statistics appear once you create projects, solve challenges, or run tests.
                </p>
              ) : (
                <div className="space-y-3">
                  {snapshot.languageBreakdown.map((item) => (
                    <div key={item.language} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{item.language}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {item.count} ({item.pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${Math.max(4, item.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>Projects Created / Completed</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {snapshot.projectsCreated} / {snapshot.projectsCompleted}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Architecture Blueprints</span>
                  <span className="font-mono text-slate-900 dark:text-white">{snapshot.architectPlansCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>AI Tutor Sessions</span>
                  <span className="font-mono text-slate-900 dark:text-white">{snapshot.aiConversationsCount}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Evidence-Based Skill Progression & Personal Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-500" />
                  Skill Progression (Evidence-Based)
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Shown only for technologies where you have completed lessons, passed challenges, built projects, or passed tests. Tiers reflect observed platform activity, not formal certification.
                </p>
              </div>

              {snapshot.skills.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg space-y-2">
                  <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Complete a lesson, challenge, or test run to establish your initial skill evidence.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {snapshot.skills.map((sk) => (
                    <div key={sk.skill} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">{sk.skill}</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">{sk.tier}</span>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-emerald-600" style={{ width: `${Math.max(8, sk.scorePct)}%` }} />
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {sk.completedLessons} lessons · {sk.passedChallenges} challenges · {sk.projectsCount} projects · {sk.testsPassedCount} tests passed
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Recommended Next Steps
              </h2>
              <div className="space-y-3">
                {snapshot.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{rec.title}</div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {rec.rationale}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView(rec.targetView)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {rec.ctaLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Clear Activity Confirmation */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Clear Personal Activity Log?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This removes your raw activity event timestamps (`activityEvents`). Your actual Academy courses, Projects, TestLab runs, and Architectures remain preserved.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearActivity}
                disabled={clearing}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                {clearing ? 'Clearing...' : 'Confirm Clear Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
