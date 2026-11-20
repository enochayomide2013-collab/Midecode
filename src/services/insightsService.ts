import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { listAiConversations, listChallengeAttempts, listProjectVersions } from './dataService';
import { listTestRunsForUser } from './testLabService';
import { listUserArchitectures } from './architectService';
import type {
  ActivityEvent,
  CourseProgress,
  DeveloperInsightsSnapshot,
  Project,
  SkillEvidenceTier,
  SkillProgressionItem,
} from '../types/mideocode';

export async function listUserActivityEvents(uid: string): Promise<ActivityEvent[]> {
  try {
    const q = query(collection(db, 'activityEvents'), where('userId', '==', uid), limit(250));
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
