import { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Code2,
  Flag,
  Flame,
  FolderGit2,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { ACADEMY_COURSES } from '../data/academyData';
import { CHALLENGES } from '../data/challengesData';
import { listChallengeAttempts, listPublicLeaderboard, listUserXpTransactions } from '../services/dataService';
import { extractReadableError } from '../services/firebase';
import type { ChallengeAttempt, PublicProfile } from '../types/mideocode';

const BADGE_CATALOG = [
  {
    id: 'first_lesson',
    title: 'First Concept Mastered',
    description: 'Complete any Academy lesson and verify your understanding.',
    icon: BookOpen,
  },
  {
    id: 'challenge_solver',
    title: 'Algorithm Problem Solver',
    description: 'Pass all public and hidden tests on a coding challenge.',
    icon: Code2,
  },
  {
    id: 'project_builder',
    title: 'Project Shipper',
    description: 'Build and complete a project milestone in Mideo IDE.',
    icon: FolderGit2,
  },
  {
    id: 'xp_250',
    title: 'Level 2 Engineer (250 XP)',
    description: 'Reach 250 verified XP across courses, challenges, and builds.',
    icon: Zap,
  },
  {
    id: 'xp_500',
    title: '500 XP Milestone',
    description: 'Demonstrate consistent mastery across multiple tracks.',
    icon: Trophy,
  },
  {
    id: 'first_mission_complete',
    title: 'Mission Accomplished',
    description: 'Complete and pass full server verification on any Mission Mode build.',
    icon: Flag,
  },
  {
    id: 'mission_html_architect',
    title: 'Semantic Layout Architect',
    description: 'Complete the Accessible Responsive SaaS Pricing Matrix mission.',
    icon: Award,
  },
  {
    id: 'mission_sql_analyst',
    title: 'SQL Analytics Specialist',
    description: 'Solve the E-Commerce Revenue & Cohort SQL Analytics mission.',
    icon: Sparkles,
  },
  {
    id: 'mission_fullstack_capstone',
    title: 'Full-Stack Capstone Engineer',
    description: 'Deliver the Full-Stack Incident Triage Dashboard Capstone.',
    icon: Trophy,
  },
];

export function QuestView() {
  const {
    firebaseUser,
    profile,
    courseProgress,
    projects,
    achievements,
    missionAttempts,
    grantXp,
    setActiveView,
    openMissionCatalog,
    notify,
  } = useMideo();

  const [attempts, setAttempts] = useState<ChallengeAttempt[]>([]);
  const [leaderboard, setLeaderboard] = useState<PublicProfile[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedTodayMap, setClaimedTodayMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!firebaseUser) return;
    listChallengeAttempts(firebaseUser.uid)
      .then(setAttempts)
      .catch(() => {});
    listPublicLeaderboard()
      .then(setLeaderboard)
      .catch(() => {});
    listUserXpTransactions(firebaseUser.uid)
      .then((txs) => {
        const claimed: Record<string, boolean> = {};
        for (const tx of txs) {
          if (tx.sourceType === 'mission' && tx.sourceId) {
            claimed[tx.sourceId] = true;
          }
        }
        setClaimedTodayMap((prev) => ({ ...prev, ...claimed }));
      })
      .catch(() => {});
  }, [firebaseUser]);

  if (!profile) return null;

  const totalCompletedLessons = Object.values(courseProgress).reduce(
    (sum, p) => sum + p.completedLessonIds.length,
    0,
  );
  const totalExercises = Object.values(courseProgress).reduce(
    (sum, p) => sum + p.completedExerciseIds.length,
    0,
  );
  const solvedChallengeIds = Array.from(
    new Set(attempts.filter((a) => a.passed).map((a) => a.challengeId)),
  );
  const unlockedBadgeIds = new Set(achievements.map((a) => a.badgeId));

  const nextLevelXp = profile.level * 250;
  const currentBandXp = profile.xp % 250;
  const levelProgressPct = Math.min(100, Math.round((currentBandXp / 250) * 100));

  const missions = [
    {
      id: 'mission_lesson_1',
      cadence: 'Daily Mission',
      title: 'Complete 1 Academy Lesson',
      description: 'Read a concept guide and mark at least one lesson completed.',
      xp: 40,
      completed: totalCompletedLessons >= 1,
      actionLabel: 'Open Academy',
      targetView: 'academy' as const,
    },
    {
      id: 'mission_challenge_1',
      cadence: 'Daily Mission',
      title: 'Pass 1 Coding Challenge',
      description: 'Submit a verified passing solution in Mideo Challenges.',
      xp: 40,
      completed: solvedChallengeIds.length >= 1,
      actionLabel: 'Open Challenges',
      targetView: 'challenges' as const,
    },
    {
      id: 'mission_project_1',
      cadence: 'Weekly Mission',
      title: 'Create or Sync a Cloud Project',
      description: 'Maintain an active coding workspace inside Mideo IDE & Cloud.',
      xp: 40,
      completed: projects.length >= 1,
      actionLabel: 'Open Projects',
      targetView: 'projects' as const,
    },
    {
      id: 'mission_track_3',
      cadence: 'Weekly Mission',
      title: 'Complete 3 Interactive Exercises',
      description: 'Practice coding exercises directly inside Mideo Academy lessons.',
      xp: 40,
      completed: totalExercises >= 3,
      actionLabel: 'Practice Now',
      targetView: 'academy' as const,
    },
  ];

  const skillTracks = ACADEMY_COURSES.map((course) => {
    const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const doneLessons = courseProgress[course.id]?.completedLessonIds.length ?? 0;
    const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
    return {
      id: course.id,
      title: course.title,
      category: course.category,
      doneLessons,
      totalLessons,
      pct,
    };
  });

  const handleClaimMission = async (missionId: string, title: string, eligible: boolean) => {
    if (!eligible) {
      notify('info', 'Complete the mission requirement first before claiming XP.');
      return;
    }
    setClaimingId(missionId);
    try {
      const res = await grantXp('mission', missionId, `Mission completed: ${title}`);
      if (res.alreadyClaimed) {
        setClaimedTodayMap((prev) => ({ ...prev, [missionId]: true }));
        notify('info', 'You have already claimed XP for this mission.');
      } else if (res.awarded > 0) {
        setClaimedTodayMap((prev) => ({ ...prev, [missionId]: true }));
      }
    } catch (err) {
      notify('error', extractReadableError(err, 'Unable to claim mission XP.'));
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mideo Quest
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Verified XP progression, skill trees, daily missions, and unlocked developer badges.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="tabular-nums">{profile.streak} day streak</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
            <Award className="w-4 h-4 text-blue-500" />
            <span className="tabular-nums">{achievements.length} / {BADGE_CATALOG.length} badges</span>
          </span>
        </div>
      </div>

      {/* Level & XP Header Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Verified Progression Standing
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <h2 className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                Level {profile.level}
              </h2>
              <span className="text-sm font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {profile.xp} total XP
              </span>
            </div>
          </div>
          <div className="w-full md:w-80">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
              <span>Progress to Level {profile.level + 1}</span>
              <span>
                {profile.xp} / {nextLevelXp} XP ({levelProgressPct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${levelProgressPct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Missions & Skill Tree */}
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Active Missions
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Server-verified XP rewards
              </span>
            </div>

            <div className="space-y-3">
              {missions.map((m) => {
                const isClaimed = claimedTodayMap[m.id];
                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {m.cadence}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          +{m.xp} XP
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        {m.title}
                        {m.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{m.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.completed ? (
                        <button
                          onClick={() => handleClaimMission(m.id, m.title, m.completed)}
                          disabled={claimingId === m.id || isClaimed}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                        >
                          {isClaimed ? 'Claimed' : claimingId === m.id ? 'Verifying...' : 'Claim XP'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveView(m.targetView)}
                          className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          {m.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Mission Mode Verified Builds:
                </span>{' '}
                <span className="font-mono tabular-nums">
                  {missionAttempts.filter((a) => a.status === 'completed').length} completed
                </span>{' '}
                · Earns verified XP, badges, and Skill Passport entries automatically.
              </div>
              <button
                onClick={openMissionCatalog}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                Open Mission Mode
              </button>
            </div>
          </section>

          {/* Skill Tree */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Engineering Skill Tree
                </h2>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">
                {solvedChallengeIds.length} / {CHALLENGES.length} challenges solved
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {skillTracks.map((track) => (
                <div
                  key={track.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {track.category}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {track.doneLessons}/{track.totalLessons} lessons
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {track.title}
                  </h3>
                  <div className="h-1.5 w-full rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-violet-600 transition-all"
                      style={{ width: `${track.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Achievements & Leaderboard */}
        <div className="lg:col-span-4 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Developer Badges
            </h2>
            <div className="space-y-3">
              {BADGE_CATALOG.map((badge) => {
                const Icon = badge.icon;
                const unlocked = unlockedBadgeIds.has(badge.id);
                return (
                  <div
                    key={badge.id}
                    className={`p-3.5 rounded-lg border transition-colors flex items-start gap-3 ${
                      unlocked
                        ? 'border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-slate-800 opacity-70'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        unlocked ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{badge.title}</span>
                        {unlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        {badge.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Community Standings
            </h2>
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standings appear as learners earn verified XP.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {leaderboard.slice(0, 8).map((entry, idx) => (
                  <div
                    key={entry.uid}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono tabular-nums text-slate-400 w-5">
                        #{idx + 1}
                      </span>
                      <span
                        className={`truncate font-medium ${
                          entry.uid === profile.uid
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {entry.displayName}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                      L{entry.level} · {entry.xp} XP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
