import { useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Flag,
  Flame,
  FolderGit2,
  Layers,
  MailCheck,
  Play,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { ACADEMY_COURSES } from '../data/academyData';
import { GUIDED_PROJECTS } from '../data/projectsData';
import { CHALLENGES, CAREER_PATHWAYS } from '../data/challengesData';
import { resendVerificationEmailReal } from '../services/authService';
import { buildMissionRecommendations } from '../services/missionService';
import { INTRO_VIDEO_URL, INTRO_WEBM_URL, IntroVideoModal } from '../components/IntroVideoModal';

export function DashboardView() {
  const {
    firebaseUser,
    profile,
    courseProgress,
    projects,
    achievements,
    missions,
    missionAttempts,
    setActiveView,
    openCourse,
    openMissionCatalog,
    openMissionDetails,
    openMissionWorkspace,
    openInIde,
    openChallenge,
    setActiveIdeProjectId,
    refreshAuthState,
    notify,
  } = useMideo();

  const [verifying, setVerifying] = useState(false);
  const [introModalOpen, setIntroModalOpen] = useState(false);
  const [dismissedIntro, setDismissedIntro] = useState(
    () => localStorage.getItem('mideocode_intro_dismissed') === 'true',
  );

  if (!profile) return null;

  const totalCompletedLessons = Object.values(courseProgress).reduce(
    (sum, p) => sum + p.completedLessonIds.length,
    0,
  );
  const totalAvailableLessons = ACADEMY_COURSES.reduce(
    (sum, c) => sum + c.modules.reduce((ms, m) => ms + m.lessons.length, 0),
    0,
  );

  const activeCareer =
    CAREER_PATHWAYS.find((c) => c.id === profile.activeCareerPathId) || CAREER_PATHWAYS[0];

  const recommendedCourses = ACADEMY_COURSES.filter(
    (c) => activeCareer.recommendedCourseIds.includes(c.id),
  ).slice(0, 3);

  const nextLevelXp = profile.level * 250;
  const levelProgressPct = Math.min(100, Math.round(((profile.xp % 250) / 250) * 100));

  const needsEmailVerification =
    Boolean(firebaseUser?.email) && firebaseUser?.emailVerified === false;

  const publishedMissions = missions.filter((m) => m.status === 'published');
  const missionRecs = buildMissionRecommendations(
    publishedMissions,
    missionAttempts,
    profile,
    courseProgress,
  );
  const nextMissionRec = missionRecs[0] || null;
  const nextMissionTotalCps = nextMissionRec?.mission.checkpoints?.length || 1;
  const nextMissionProgressPct = nextMissionRec?.attempt
    ? nextMissionRec.attempt.status === 'completed'
      ? 100
      : Math.min(
          95,
          Math.round(
            (nextMissionRec.attempt.completedCheckpointIds.length / nextMissionTotalCps) * 100,
          ),
        )
    : 0;

  const activeMissionAttempts = missionAttempts.filter(
    (a) => a.status === 'in_progress' || a.status === 'needs_improvement',
  );
  const completedMissionAttempts = missionAttempts.filter((a) => a.status === 'completed');
  const completedMissionIdSet = new Set(completedMissionAttempts.map((a) => a.missionId));
  const availableMissionsList = publishedMissions.filter(
    (m) => !completedMissionIdSet.has(m.id),
  );
  const missionAchievements = achievements.filter(
    (a) => a.badgeId === 'first_mission_complete' || a.badgeId.startsWith('mission_'),
  );

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    setVerifying(true);
    try {
      await resendVerificationEmailReal(firebaseUser);
      notify('success', 'Verification email sent. Check your inbox and click Refresh Status.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Welcome */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {profile.displayName}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {activeCareer.title} Roadmap · {profile.experienceLevel} level
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setActiveView('academy')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            Continue Learning
          </button>
          <button
            onClick={() => setActiveView('ide')}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            Open Mideo IDE
          </button>
        </div>
      </div>

      {/* Email verification prompt if unverified */}
      {needsEmailVerification && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MailCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Verify your email address ({firebaseUser?.email})
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Email verification is required before publishing posts in Mideo Community.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResendVerification}
              disabled={verifying}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium cursor-pointer"
            >
              Resend Email
            </button>
            <button
              onClick={() => refreshAuthState().then(() => notify('info', 'Account verification status refreshed.'))}
              className="px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-700 text-xs font-medium cursor-pointer"
            >
              Refresh Status
            </button>
          </div>
        </div>
      )}

      {/* Real User Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Experience</span>
            <Trophy className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            Level {profile.level}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-1">
            {profile.xp} / {nextLevelXp} XP
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${levelProgressPct}%` }} />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Learning Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {profile.streak} {profile.streak === 1 ? 'Day' : 'Days'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Consistent progress without penalty
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Academy Progress</span>
            <BookOpen className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalCompletedLessons} / {totalAvailableLessons}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Verified lessons completed
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Cloud Workspaces</span>
            <FolderGit2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {projects.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {achievements.length} badges unlocked
          </p>
        </div>
      </div>

      {/* Intro Video Welcome Card */}
      {Boolean(INTRO_VIDEO_URL) && !dismissedIntro && (
        <section className="rounded-xl border border-blue-500/50 bg-gradient-to-r from-blue-950/40 via-[#0D1322] to-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-lg">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => setIntroModalOpen(true)}
              aria-label="Play Introduction to MideoCode"
              className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden border border-blue-500/40 bg-black shrink-0 group cursor-pointer"
            >
              <video
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-cover"
              >
                <source src={`${INTRO_VIDEO_URL}#t=3.5`} type="video/mp4" />
                {INTRO_WEBM_URL && <source src={`${INTRO_WEBM_URL}#t=3.5`} type="video/webm" />}
              </video>
              <span className="absolute inset-0 bg-black/30 group-hover:bg-black/15 flex items-center justify-center transition-colors">
                <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </span>
              </span>
              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white tabular-nums">
                0:40
              </span>
            </button>
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                New to MideoCode?
              </span>
              <h2 className="text-base font-bold text-white">
                Introduction to MideoCode (40 seconds)
              </h2>
              <p className="text-xs text-slate-300">
                Watch this quick introduction to discover everything you can learn, code, build, and become.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIntroModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow"
            >
              <Play className="w-4 h-4 fill-current" />
              Watch Introduction
            </button>
            <button
              onClick={() => {
                setDismissedIntro(true);
                localStorage.setItem('mideocode_intro_dismissed', 'true');
              }}
              className="px-3 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Your Next Mission Flagship Section */}
      {nextMissionRec && (
        <section className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D1322] p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <Flag className="w-4 h-4" />
                <span>Your Next Mission</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {nextMissionRec.mission.category} · {nextMissionRec.mission.difficulty}
                </span>
                <span className="text-slate-400">·</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {nextMissionRec.mission.estimatedMinutes}m
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {nextMissionRec.mission.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {nextMissionRec.mission.description}
              </p>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Required skills: {nextMissionRec.mission.requiredSkills.join(' · ')}
              </div>
              {nextMissionRec.reasons[0] && (
                <div className="text-[11px] text-blue-600 dark:text-blue-400">
                  Why recommended: {nextMissionRec.reasons[0]}
                </div>
              )}
            </div>

            <div className="w-full lg:w-72 space-y-3 shrink-0">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                  <span>Mission Progress</span>
                  <span className="font-mono font-semibold">{nextMissionProgressPct}%</span>
                </div>
                <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${nextMissionProgressPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => openMissionWorkspace(nextMissionRec.mission.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  {nextMissionRec.attempt ? 'Continue Mission' : 'Start Mission'}
                </button>
                <button
                  onClick={() => openMissionDetails(nextMissionRec.mission.id)}
                  className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                >
                  Briefing
                </button>
              </div>
            </div>
          </div>

          {/* Compact Real-Data Mission Status Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Active Missions
                </span>
                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {activeMissionAttempts.length}
                </span>
              </div>
              {activeMissionAttempts.length === 0 ? (
                <p className="text-[11px] text-slate-500">No active mission workspaces.</p>
              ) : (
                activeMissionAttempts.slice(0, 2).map((att) => {
                  const m = publishedMissions.find((x) => x.id === att.missionId);
                  return (
                    <button
                      key={att.id}
                      onClick={() => openMissionWorkspace(att.missionId)}
                      className="block w-full text-left text-[11px] text-slate-700 dark:text-slate-300 hover:text-blue-500 truncate cursor-pointer"
                    >
                      • {m?.title || att.missionId}
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Recently Completed
                </span>
                <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {completedMissionAttempts.length}
                </span>
              </div>
              {completedMissionAttempts.length === 0 ? (
                <p className="text-[11px] text-slate-500">Complete a mission to earn verified proof.</p>
              ) : (
                completedMissionAttempts.slice(0, 2).map((att) => {
                  const m = publishedMissions.find((x) => x.id === att.missionId);
                  return (
                    <button
                      key={att.id}
                      onClick={() => openMissionDetails(att.missionId)}
                      className="flex items-center gap-1.5 w-full text-left text-[11px] text-slate-700 dark:text-slate-300 hover:text-blue-500 truncate cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="truncate">{m?.title || att.missionId}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Available Missions
                </span>
                <button
                  onClick={openMissionCatalog}
                  className="text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {availableMissionsList.length} open
                </button>
              </div>
              {availableMissionsList.slice(0, 2).map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMissionDetails(m.id)}
                  className="block w-full text-left text-[11px] text-slate-700 dark:text-slate-300 hover:text-blue-500 truncate cursor-pointer"
                >
                  • {m.title} ({m.difficulty})
                </button>
              ))}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Mission Achievements
                </span>
                <span className="font-mono tabular-nums text-amber-500">
                  {missionAchievements.length}
                </span>
              </div>
              {missionAchievements.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Finish any mission to unlock your first Mission badge.
                </p>
              ) : (
                missionAchievements.slice(0, 2).map((ach) => (
                  <div
                    key={ach.id}
                    className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 truncate"
                  >
                    <Award className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate">{ach.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Courses & Projects */}
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Recommended for {activeCareer.title}
              </h2>
              <button
                onClick={() => setActiveView('academy')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View All Courses
              </button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {recommendedCourses.map((course) => {
                const prog = courseProgress[course.id];
                const pct = prog?.progressPercent ?? 0;
                return (
                  <div key={course.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        {course.category} · {course.language} · {course.difficulty}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{course.title}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">{course.overview}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {pct}%
                      </span>
                      <button
                        onClick={() => openCourse(course.id, prog?.lastLessonId)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        {pct > 0 ? 'Resume' : 'Start'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Recent Cloud Workspaces
              </h2>
              <button
                onClick={() => setActiveView('projects')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Browse Guided Projects
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  You have no saved cloud workspaces yet.
                </p>
                <button
                  onClick={() =>
                    openInIde({
                      title: GUIDED_PROJECTS[0].title,
                      language: GUIDED_PROJECTS[0].language,
                      guidedProjectId: GUIDED_PROJECTS[0].id,
                      files: GUIDED_PROJECTS[0].starterFiles,
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Launch Portfolio Starter in Mideo IDE
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {projects.slice(0, 4).map((proj) => (
                  <div key={proj.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{proj.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {proj.language} · {proj.visibility} · v{proj.version}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveIdeProjectId(proj.id);
                        setActiveView('ide');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium shrink-0 cursor-pointer"
                    >
                      Open IDE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Daily Challenge, Quick Actions, Career */}
        <div className="lg:col-span-4 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
              <Target className="w-4 h-4" />
              <span>Daily Challenge</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{CHALLENGES[0].title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {CHALLENGES[0].category} · {CHALLENGES[0].difficulty} · +{CHALLENGES[0].xpReward} XP
            </p>
            <button
              onClick={() => openChallenge(CHALLENGES[0].id)}
              className="mt-4 w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Solve in Isolated Sandbox
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Quick Actions</h2>
            <button
              onClick={() => setActiveView('ai')}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-3 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Ask Mideo AI</div>
                <div className="text-[11px] text-slate-500">Debug, explain, or review code</div>
              </div>
            </button>
            <button
              onClick={() => setActiveView('lab')}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-3 transition-colors cursor-pointer"
            >
              <Code2 className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Experiment in Mideo Lab</div>
                <div className="text-[11px] text-slate-500">Flexbox, Grid, Regex, Algorithms</div>
              </div>
            </button>
            <button
              onClick={() => setActiveView('career')}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-3 transition-colors cursor-pointer"
            >
              <Compass className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Career Roadmap</div>
                <div className="text-[11px] text-slate-500">Skill-gap check &amp; interview prep</div>
              </div>
            </button>
            <button
              onClick={() => setActiveView('architect')}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-3 transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Architect Designer</div>
                <div className="text-[11px] text-slate-500">System diagrams, schemas &amp; APIs</div>
              </div>
            </button>
            <button
              onClick={() => setActiveView('insights')}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left flex items-center gap-3 transition-colors cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Developer Insights</div>
                <div className="text-[11px] text-slate-500">Personal coding activity, skills &amp; test trends</div>
              </div>
            </button>
          </section>
        </div>
      </div>
      {Boolean(INTRO_VIDEO_URL) && (
        <IntroVideoModal
          isOpen={introModalOpen}
          onClose={() => setIntroModalOpen(false)}
          onComplete={() => {
            setDismissedIntro(true);
            localStorage.setItem('mideocode_intro_dismissed', 'true');
          }}
        />
      )}
    </div>
  );
}
