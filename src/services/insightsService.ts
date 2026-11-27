import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from './appDb';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  getTodayKey,
  listAiConversations,
  listChallengeAttempts,
  listProjectVersions,
  listUserXpTransactions,
} from './dataService';
import { listMissionSubmissionsAndEvaluations } from './missionService';
import { listTestRunsForUser } from './testLabService';
import { listUserArchitectures } from './architectService';
import type {
  ActivityEvent,
  ContributionDayBreakdown,
  ContributionDayCell,
  ContributionHeatmapData,
  CourseProgress,
  DeveloperInsightsSnapshot,
  MissionAttempt,
  Project,
  SkillEvidenceTier,
  SkillProgressionItem,
} from '../types/mideocode';

export async function listUserActivityEvents(uid: string, maxItems = 250): Promise<ActivityEvent[]> {
  try {
    const q = query(collection(db, 'activityEvents'), where('userId', '==', uid), limit(maxItems));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ActivityEvent);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'activityEvents');
  }
}

export async function clearUserActivityEvents(uid: string): Promise<number> {
  try {
    const q = query(collection(db, 'activityEvents'), where('userId', '==', uid), limit(250));
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.delete(doc(db, 'activityEvents', d.id));
    }
    await batch.commit();
    return snap.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'activityEvents');
  }
}

function toMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const t = new Date(val).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function computeEvidenceTier(evidenceCount: number): SkillEvidenceTier {
  if (evidenceCount >= 8) return 'Demonstrated Progress';
  if (evidenceCount >= 4) return 'Practising';
  if (evidenceCount >= 2) return 'Developing';
  return 'Getting Started';
}

export async function buildDeveloperInsights(
  uid: string,
  range: '7d' | '30d' | '90d' | 'all',
  courseProgress: Record<string, CourseProgress>,
  projects: Project[],
): Promise<{ snapshot: DeveloperInsightsSnapshot; rawEvents: ActivityEvent[] }> {
  const [activityEvents, challengeAttempts, aiConversations, testRuns, architectures] =
    await Promise.all([
      listUserActivityEvents(uid).catch(() => [] as ActivityEvent[]),
      listChallengeAttempts(uid).catch(() => []),
      listAiConversations(uid).catch(() => []),
      listTestRunsForUser(uid).catch(() => []),
      listUserArchitectures(uid).catch(() => []),
    ]);

  // Count snapshots across owned projects (first 10 projects for fast load)
  const ownedProjects = projects.filter((p) => p.ownerId === uid);
  const versionLists = await Promise.all(
    ownedProjects.slice(0, 10).map((p) => listProjectVersions(p.id).catch(() => [])),
  );
  const allVersions = versionLists.flat();

  const now = Date.now();
  const rangeMs =
    range === '7d'
      ? 7 * 86_400_000
      : range === '30d'
        ? 30 * 86_400_000
        : range === '90d'
          ? 90 * 86_400_000
          : Infinity;

  const inRange = (ts: unknown) => {
    if (rangeMs === Infinity) return true;
    const ms = toMs(ts);
    return ms === 0 || now - ms <= rangeMs;
  };

  const filteredEvents = activityEvents.filter((e) => inRange(e.createdAt));
  const filteredChallenges = challengeAttempts.filter((c) => inRange(c.createdAt));
  const filteredRuns = testRuns.filter((r) => inRange(r.createdAt));
  const filteredConvs = aiConversations.filter((c) => inRange(c.updatedAt || c.createdAt));
  const filteredArchs = architectures.filter((a) => inRange(a.createdAt));
  const filteredVersions = allVersions.filter((v) => inRange(v.createdAt));
  const filteredProjects = ownedProjects.filter((p) => inRange(p.createdAt));

  const courseEntries = Object.values(courseProgress);
  const lessonsCompleted = courseEntries.reduce(
    (s, c) => s + (c.completedLessonIds?.length || 0),
    0,
  );
  const exercisesCompleted = courseEntries.reduce(
    (s, c) => s + (c.completedExerciseIds?.length || 0),
    0,
  );

  const challengesAttempted = filteredChallenges.length;
  const challengesPassed = filteredChallenges.filter((c) => c.passed).length;
  const challengeAccuracyPct =
    challengesAttempted > 0 ? Math.round((challengesPassed / challengesAttempted) * 100) : 0;

  const testRunsCount = filteredRuns.length;
  const totalExecutedCases = filteredRuns.reduce((s, r) => s + r.totalTests, 0);
  const totalPassedCases = filteredRuns.reduce((s, r) => s + r.passedTests, 0);
  const testPassRatePct =
    totalExecutedCases > 0 ? Math.round((totalPassedCases / totalExecutedCases) * 100) : 0;

  // Distinguish independent vs AI-assisted activity clearly
  const independentFromEvents = filteredEvents.filter((e) => !e.aiAssisted).length;
  const aiFromEvents = filteredEvents.filter((e) => e.aiAssisted).length;
  const aiAssistedActions = aiFromEvents + filteredConvs.length;
  const independentActions =
    independentFromEvents +
    challengesAttempted +
    filteredRuns.filter((r) => !r.aiAssisted).length;

  const totalActions =
    independentActions + aiAssistedActions + lessonsCompleted + exercisesCompleted;

  // Build daily time-series (last 7 or 14 days depending on range)
  const bucketDays = range === '7d' ? 7 : 14;
  const dayBuckets = new Map<string, { label: string; independent: number; aiAssisted: number; testsRun: number }>();
  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, {
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      independent: 0,
      aiAssisted: 0,
      testsRun: 0,
    });
  }

  for (const ev of filteredEvents) {
    const b = dayBuckets.get(ev.dayKey);
    if (b) {
      if (ev.aiAssisted) b.aiAssisted += 1;
      else b.independent += 1;
    }
  }
  for (const ch of filteredChallenges) {
    const key = toMs(ch.createdAt) ? new Date(toMs(ch.createdAt)).toISOString().slice(0, 10) : '';
    const b = dayBuckets.get(key);
    if (b) b.independent += 1;
  }
  for (const r of filteredRuns) {
    const key = toMs(r.createdAt) ? new Date(toMs(r.createdAt)).toISOString().slice(0, 10) : '';
    const b = dayBuckets.get(key);
    if (b) {
      b.testsRun += 1;
      if (r.aiAssisted) b.aiAssisted += 1;
      else b.independent += 1;
    }
  }
  for (const c of filteredConvs) {
    const key = toMs(c.updatedAt) ? new Date(toMs(c.updatedAt)).toISOString().slice(0, 10) : '';
    const b = dayBuckets.get(key);
    if (b) b.aiAssisted += 1;
  }

  const activeDayKeys = new Set<string>();
  for (const ev of filteredEvents) activeDayKeys.add(ev.dayKey);
  for (const ch of filteredChallenges) {
    const ms = toMs(ch.createdAt);
    if (ms) activeDayKeys.add(new Date(ms).toISOString().slice(0, 10));
  }
  for (const r of filteredRuns) {
    const ms = toMs(r.createdAt);
    if (ms) activeDayKeys.add(new Date(ms).toISOString().slice(0, 10));
  }

  // Language distribution from real user data only
  const langCounts = new Map<string, number>();
  const bumpLang = (raw?: string) => {
    if (!raw) return;
    const norm = raw.toLowerCase() === 'web' ? 'HTML/CSS/JS' : raw.toUpperCase();
    langCounts.set(norm, (langCounts.get(norm) || 0) + 1);
  };
  for (const p of filteredProjects) bumpLang(p.language);
  for (const ch of filteredChallenges) bumpLang(ch.language);
  for (const r of filteredRuns) bumpLang(r.language);
  for (const ev of filteredEvents) bumpLang(ev.language);

  const langTotal = Array.from(langCounts.values()).reduce((a, b) => a + b, 0);
  const languageBreakdown = Array.from(langCounts.entries())
    .map(([language, count]) => ({
      language,
      count,
      pct: langTotal > 0 ? Math.round((count / langTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Evidence-based skill progression (ONLY technologies with actual activity!)
  const skillBuckets = new Map<
    string,
    { lessons: number; challenges: number; projects: number; testsPassed: number }
  >();
  const ensureSkill = (name: string) => {
    if (!skillBuckets.has(name)) {
      skillBuckets.set(name, { lessons: 0, challenges: 0, projects: 0, testsPassed: 0 });
    }
    return skillBuckets.get(name)!;
  };

  for (const cp of courseEntries) {
    const count = (cp.completedLessonIds?.length || 0) + (cp.completedExerciseIds?.length || 0);
    if (count > 0) {
      const label = cp.courseId.includes('python')
        ? 'Python'
        : cp.courseId.includes('sql')
          ? 'SQL & Databases'
          : cp.courseId.includes('html') || cp.courseId.includes('css')
            ? 'HTML & CSS'
            : 'JavaScript';
      ensureSkill(label).lessons += count;
    }
  }
  for (const ch of filteredChallenges) {
    if (ch.passed) {
      const label = ch.language === 'python' ? 'Python' : 'JavaScript';
      ensureSkill(label).challenges += 1;
    }
  }
  for (const p of ownedProjects) {
    const label =
      p.language === 'python'
        ? 'Python'
        : p.language === 'sql'
          ? 'SQL & Databases'
          : p.language === 'web' || p.language === 'html' || p.language === 'css'
            ? 'HTML & CSS'
            : 'JavaScript';
    ensureSkill(label).projects += 1;
  }
  for (const r of filteredRuns) {
    if (r.passedTests > 0) {
      const label =
        r.language === 'python'
          ? 'Python'
          : r.language === 'web'
            ? 'HTML & CSS'
            : 'JavaScript';
      ensureSkill(label).testsPassed += r.passedTests;
    }
  }
  if (filteredArchs.length > 0) {
    ensureSkill('Software Architecture').projects += filteredArchs.length;
  }

  const skills: SkillProgressionItem[] = Array.from(skillBuckets.entries()).map(([skill, d]) => {
    const evidenceCount = d.lessons + d.challenges * 2 + d.projects * 2 + d.testsPassed;
    return {
      skill,
      tier: computeEvidenceTier(evidenceCount),
      evidenceCount,
      completedLessons: d.lessons,
      passedChallenges: d.challenges,
      projectsCount: d.projects,
      testsPassedCount: d.testsPassed,
      scorePct: Math.min(100, Math.round((evidenceCount / 10) * 100)),
    };
  });

  // Actionable, data-driven recommendations
  const recommendations: DeveloperInsightsSnapshot['recommendations'] = [];
  if (lessonsCompleted === 0) {
    recommendations.push({
      id: 'rec-academy',
      title: 'Complete your first Academy lesson',
      rationale: 'You have 0 recorded lesson completions so far. Completing an interactive module establishes baseline skill metrics.',
      targetView: 'academy',
      ctaLabel: 'Open Academy',
    });
  }
  if (ownedProjects.length > 0 && testRunsCount === 0) {
    recommendations.push({
      id: 'rec-testlab',
      title: 'Run automated tests on your workspace projects',
      rationale: `You have ${ownedProjects.length} project(s) but 0 TestLab runs in this range. Adding unit tests verifies code correctness.`,
      targetView: 'testlab',
      ctaLabel: 'Open TestLab',
    });
  }
  if (challengesAttempted > 0 && challengeAccuracyPct < 70) {
    recommendations.push({
      id: 'rec-challenges',
      title: 'Reinforce problem solving in Mideo Challenges',
      rationale: `Your challenge pass rate is ${challengeAccuracyPct}% (${challengesPassed}/${challengesAttempted}). Practising edge-case reasoning raises accuracy.`,
      targetView: 'challenges',
      ctaLabel: 'Practice Challenges',
    });
  }
  if (ownedProjects.length > 0 && filteredArchs.length === 0) {
    recommendations.push({
      id: 'rec-architect',
      title: 'Plan a structured system blueprint in Architect',
      rationale: 'Design database schemas, API endpoints, and visual diagrams before building your next project.',
      targetView: 'architect',
      ctaLabel: 'Open Architect',
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'rec-missions',
      title: 'Take on a real-world engineering Mission',
      rationale: 'Keep expanding your independent coding streak through multi-checkpoint scenarios.',
      targetView: 'missions',
      ctaLabel: 'Explore Missions',
    });
  }

  return {
    rawEvents: filteredEvents,
    snapshot: {
      range,
      totalActions,
      independentActions,
      aiAssistedActions,
      activeDays: activeDayKeys.size,
      lessonsCompleted,
      exercisesCompleted,
      challengesAttempted,
      challengesPassed,
      challengeAccuracyPct,
      projectsCreated: filteredProjects.length,
      projectsCompleted: filteredProjects.filter((p) => p.status === 'completed').length,
      versionSnapshotsCount: filteredVersions.length,
      testRunsCount,
      testPassRatePct,
      architectPlansCount: filteredArchs.length,
      aiConversationsCount: filteredConvs.length,
      dailySeries: Array.from(dayBuckets.entries()).map(([dayKey, b]) => ({
        dayKey,
        ...b,
      })),
      languageBreakdown,
      skills,
      recommendations,
    },
  };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toUtcDayKey(ts: unknown): string {
  const ms = toMs(ts);
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function emptyBreakdown(): ContributionDayBreakdown {
  return {
    lessons: 0,
    challenges: 0,
    missions: 0,
    projects: 0,
    tests: 0,
    ai: 0,
  };
}

export async function buildContributionHeatmap(
  uid: string,
  courseProgress: Record<string, CourseProgress>,
  projects: Project[],
  missionAttempts: MissionAttempt[],
): Promise<ContributionHeatmapData> {
  const [activityEvents, xpTransactions, challengeAttempts, missionSubRes, testRuns, aiConversations, architectures] =
    await Promise.all([
      listUserActivityEvents(uid, 500),
      listUserXpTransactions(uid),
      listChallengeAttempts(uid),
      listMissionSubmissionsAndEvaluations(uid).catch(() => ({ submissions: [], evaluations: [] })),
      listTestRunsForUser(uid).catch(() => []),
      listAiConversations(uid).catch(() => []),
      listUserArchitectures(uid).catch(() => []),
    ]);

  const todayKey = getTodayKey();
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td));
  const todayDow = todayUtc.getUTCDay(); // 0 = Sun ... 6 = Sat

  // 53-week GitHub-style calendar ending on the Saturday of the current week
  const endGridUtc = new Date(todayUtc.getTime() + (6 - todayDow) * 86_400_000);
  const totalGridDays = 53 * 7;
  const startGridUtc = new Date(endGridUtc.getTime() - (totalGridDays - 1) * 86_400_000);
  const startDateKey = startGridUtc.toISOString().slice(0, 10);

  const dayMap = new Map<
    string,
    {
      breakdown: ContributionDayBreakdown;
      actions: string[];
      seenKeys: Set<string>;
      seenCategories: Set<keyof ContributionDayBreakdown>;
    }
  >();

  for (let i = 0; i < totalGridDays; i++) {
    const key = new Date(startGridUtc.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    dayMap.set(key, {
      breakdown: emptyBreakdown(),
      actions: [],
      seenKeys: new Set<string>(),
      seenCategories: new Set<keyof ContributionDayBreakdown>(),
    });
  }

  const addContribution = (
    dayKey: string,
    bucket: keyof ContributionDayBreakdown,
    label: string,
    dedupeKey?: string,
  ) => {
    if (!dayKey || dayKey > todayKey) return;
    const entry = dayMap.get(dayKey);
    if (!entry) return;
    const uniqueKey = dedupeKey || `${bucket}:${label.toLowerCase()}`;
    if (entry.seenKeys.has(uniqueKey)) return;
    entry.seenKeys.add(uniqueKey);
    entry.seenCategories.add(bucket);
    entry.breakdown[bucket] += 1;
    if (label && entry.actions.length < 10 && !entry.actions.includes(label)) {
      entry.actions.push(label);
    }
  };

  // 1. Primary domain collections (captures full historical progress even before activityEvents existed)
  for (const ch of challengeAttempts) {
    const key = toUtcDayKey(ch.createdAt);
    if (!key) continue;
    addContribution(
      key,
      'challenges',
      ch.passed ? `Passed ${ch.language} challenge (${ch.challengeId})` : `Attempted ${ch.language} challenge`,
      `challenge:${ch.id || `${ch.challengeId}:${key}`}`,
    );
  }

  for (const sub of missionSubRes.submissions) {
    const key = toUtcDayKey(sub.createdAt);
    if (!key) continue;
    addContribution(
      key,
      'missions',
      `Submitted mission solution (${sub.missionId})`,
      `missionSub:${sub.id}`,
    );
  }

  for (const att of missionAttempts) {
    const actKey = toUtcDayKey(att.completedAt || att.lastActivityAt || att.startedAt);
    if (actKey) {
      const doneCount = att.completedCheckpointIds?.length || 0;
      const label =
        att.status === 'completed'
          ? `Completed mission (${att.missionId})`
          : doneCount > 0
            ? `Mission progress: ${doneCount} checkpoint${doneCount === 1 ? '' : 's'} (${att.missionId})`
            : `Started mission (${att.missionId})`;
      addContribution(actKey, 'missions', label, `missionAtt:${att.id}:${actKey}`);
    }
  }

  const ownedProjects = projects.filter((p) => p.ownerId === uid);
  for (const p of ownedProjects) {
    const createdKey = toUtcDayKey(p.createdAt);
    if (createdKey) {
      addContribution(createdKey, 'projects', `Created workspace: ${p.title}`, `projCreate:${p.id}`);
    }
    const updatedKey = toUtcDayKey(p.updatedAt);
    if (updatedKey && updatedKey !== createdKey) {
      addContribution(updatedKey, 'projects', `Updated workspace: ${p.title}`, `projUpd:${p.id}:${updatedKey}`);
    }
  }

  for (const r of testRuns) {
    const key = toUtcDayKey(r.createdAt);
    if (!key) continue;
    addContribution(
      key,
      'tests',
      `Ran tests: ${r.passedTests}/${r.totalTests} passed`,
      `testRun:${r.id}`,
    );
  }

  for (const arch of architectures) {
    const key = toUtcDayKey(arch.createdAt);
    if (!key) continue;
    addContribution(
      key,
      'projects',
      `Designed architecture: ${arch.title || 'System Blueprint'}`,
      `arch:${arch.id}`,
    );
  }

  for (const conv of aiConversations) {
    const key = toUtcDayKey(conv.updatedAt || conv.createdAt);
    if (!key) continue;
    addContribution(key, 'ai', `Mideo AI session: ${conv.title || 'Coding help'}`, `aiConv:${conv.id}:${key}`);
  }

  // 2. XP transactions (captures historical Academy lessons, quizzes, challenges, missions with timestamps)
  for (const tx of xpTransactions) {
    const key = toUtcDayKey(tx.createdAt);
    if (!key) continue;
    const entry = dayMap.get(key);
    if (!entry) continue;
    if (tx.sourceType === 'challenge' && entry.breakdown.challenges > 0) continue;
    if (tx.sourceType === 'mission' && entry.breakdown.missions > 0) continue;
    if (tx.sourceType === 'project' && entry.breakdown.projects > 0) continue;
    const bucket: keyof ContributionDayBreakdown =
      tx.sourceType === 'lesson' || tx.sourceType === 'quiz'
        ? 'lessons'
        : tx.sourceType === 'challenge'
          ? 'challenges'
          : tx.sourceType === 'mission'
            ? 'missions'
            : 'projects';
    const label = tx.reason || `${tx.sourceType} (+${tx.amount} XP)`;
    addContribution(key, bucket, label, `${bucket}:${label.trim().toLowerCase()}`);
  }

  // Fallback for legacy courseProgress docs that have completions without xpTransactions or activityEvents
  for (const cp of Object.values(courseProgress)) {
    const count = (cp.completedLessonIds?.length || 0) + (cp.completedExerciseIds?.length || 0);
    if (count === 0) continue;
    const key = toUtcDayKey(cp.updatedAt);
    if (!key) continue;
    const entry = dayMap.get(key);
    if (entry && entry.breakdown.lessons === 0) {
      addContribution(
        key,
        'lessons',
        `Course progress updated (${cp.courseId})`,
        `course:${cp.courseId}:${key}`,
      );
    }
  }

  // 3. Explicit ActivityEvents (deduplicate against primary collections & xpTransactions)
  for (const ev of activityEvents) {
    const key = ev.dayKey || toUtcDayKey(ev.createdAt);
    if (!key) continue;
    const bucket: keyof ContributionDayBreakdown =
      ev.category === 'lesson' || ev.category === 'exercise'
        ? 'lessons'
        : ev.category === 'challenge'
          ? 'challenges'
          : ev.category === 'testlab'
            ? 'tests'
            : ev.category === 'ai'
              ? 'ai'
              : 'projects';

    const entry = dayMap.get(key);
    if (!entry) continue;
    if (
      (ev.category === 'testlab' && entry.breakdown.tests > 0) ||
      (ev.category === 'architect' && entry.breakdown.projects > 0) ||
      (ev.category === 'challenge' && entry.breakdown.challenges > 0) ||
      (ev.category === 'ai' && entry.breakdown.ai > 0) ||
      (ev.category === 'project' &&
        entry.breakdown.projects > 0 &&
        ev.action?.toLowerCase().startsWith('created'))
    ) {
      continue;
    }
    const label = ev.action || `${ev.category} activity`;
    const dedupeKey =
      ev.category === 'lesson' || ev.category === 'exercise'
        ? `${bucket}:${label.trim().toLowerCase()}`
        : `ev:${ev.id}`;
    addContribution(key, bucket, label, dedupeKey);
  }

  // Build 53 week columns (Sunday -> Saturday) and month labels
  const weeks: ContributionDayCell[][] = [];
  const monthLabels: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;

  let totalContributions = 0;
  let activeDays = 0;
  let bestDay: { dateKey: string; count: number } | null = null;
  const dayCountsAscending: { dateKey: string; count: number; isFuture: boolean }[] = [];

  for (let w = 0; w < 53; w++) {
    const col: ContributionDayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const cellDate = new Date(startGridUtc.getTime() + idx * 86_400_000);
      const dateKey = cellDate.toISOString().slice(0, 10);
      const isFuture = dateKey > todayKey;
      const entry = dayMap.get(dateKey);
      const bd = entry ? entry.breakdown : emptyBreakdown();
      const count = isFuture
        ? 0
        : bd.lessons + bd.challenges + bd.missions + bd.projects + bd.tests + bd.ai;

      if (!isFuture && count > 0) {
        totalContributions += count;
        activeDays += 1;
        if (!bestDay || count > bestDay.count) {
          bestDay = { dateKey, count };
        }
      }

      dayCountsAscending.push({ dateKey, count, isFuture });

      // Month label when the 1st of a month falls in this week (or on week 0)
      if (d === 0) {
        const m = cellDate.getUTCMonth();
        if (m !== lastMonth) {
          lastMonth = m;
          // Avoid cramped label at week 0 if month changes right away on week 1
          if (w === 0) {
            const nextWeekDate = new Date(startGridUtc.getTime() + 7 * 86_400_000);
            if (nextWeekDate.getUTCMonth() === m) {
              monthLabels.push({ label: MONTH_SHORT[m], weekIndex: w });
            }
          } else {
            monthLabels.push({ label: MONTH_SHORT[m], weekIndex: w });
          }
        }
      }

      col.push({
        dateKey,
        count,
        breakdown: bd,
        actions: entry ? entry.actions : [],
        isFuture,
      });
    }
    weeks.push(col);
  }

  // Compute longest & current streaks up to todayKey
  let longestStreak = 0;
  let runningStreak = 0;
  const nonFutureDays = dayCountsAscending.filter((d) => !d.isFuture);
  for (const day of nonFutureDays) {
    if (day.count > 0) {
      runningStreak += 1;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }

  // Current streak: consecutive active days ending today or yesterday
  let currentStreak = 0;
  for (let i = nonFutureDays.length - 1; i >= 0; i--) {
    if (nonFutureDays[i].count > 0) {
      currentStreak += 1;
    } else if (i === nonFutureDays.length - 1) {
      // Allow today to have 0 contributions so far while keeping yesterday's active streak alive
      continue;
    } else {
      break;
    }
  }

  return {
    startDateKey,
    endDateKey: todayKey,
    weeks,
    monthLabels,
    totalContributions,
    activeDays,
    currentStreak,
    longestStreak,
    bestDay,
  };
}
