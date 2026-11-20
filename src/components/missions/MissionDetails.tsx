import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  Flag,
  History,
  Lock,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useMideo } from '../../context/MideoContext';
import { ACADEMY_COURSES } from '../../data/academyData';
import { toggleBookmark } from '../../services/dataService';
import { MissionLeaderboard } from './MissionLeaderboard';
import type { Mission } from '../../types/mideocode';

interface MissionDetailsProps {
  mission: Mission;
}

export function MissionDetails({ mission }: MissionDetailsProps) {
  const {
    firebaseUser,
    missions,
    missionAttempts,
    bookmarks,
    refreshUserData,
    openMissionCatalog,
    openMissionWorkspace,
    openMissionHistory,
    openMissionDetails,
    openCourse,
    notify,
  } = useMideo();

  const [bookmarking, setBookmarking] = useState(false);

  const completedMissionIds = useMemo(
    () => new Set(missionAttempts.filter((a) => a.status === 'completed').map((a) => a.missionId)),
    [missionAttempts],
  );

  const latestAttempt = useMemo(() => {
    const forMission = missionAttempts.filter((a) => a.missionId === mission.id);
    return (
      forMission.find((a) => a.status === 'in_progress' || a.status === 'needs_improvement') ||
      forMission.find((a) => a.status === 'completed') ||
      forMission[0] ||
      null
    );
  }, [missionAttempts, mission.id]);

  const missingPrereqs = useMemo(
    () =>
      (mission.prerequisiteMissionIds || [])
        .filter((pid) => !completedMissionIds.has(pid))
        .map((pid) => missions.find((m) => m.id === pid) || { id: pid, title: pid }),
    [mission.prerequisiteMissionIds, completedMissionIds, missions],
  );

  const prerequisitesBlocked = !mission.prerequisitesOptional && missingPrereqs.length > 0;

  const relatedLessons = useMemo(() => {
    const list: { courseId: string; lessonId: string; courseTitle: string; lessonTitle: string }[] = [];
    for (const raw of mission.relatedLessonIds || []) {
      const [cId, lId] = typeof raw === 'string' ? raw.split('::') : [raw.courseId, raw.lessonId];
      const course = ACADEMY_COURSES.find((c) => c.id === cId);
      const lesson = course?.modules.flatMap((m) => m.lessons).find((l) => l.id === lId);
      if (course) {
        list.push({
          courseId: course.id,
          lessonId: lesson?.id || course.modules[0]?.lessons[0]?.id || '',
          courseTitle: course.title,
          lessonTitle: lesson?.title || course.title,
        });
      }
    }
    return list;
  }, [mission.relatedLessonIds]);

  const isBookmarked = bookmarks.some(
    (b) => b.targetType === 'mission' && b.targetId === mission.id,
  );

  const handleToggleBookmark = async () => {
    if (!firebaseUser) return;
    setBookmarking(true);
    try {
      const saved = await toggleBookmark(firebaseUser.uid, 'mission', mission.id, mission.title);
      await refreshUserData();
      notify('info', saved ? 'Mission saved to your bookmarks.' : 'Mission removed from bookmarks.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update bookmark.');
    } finally {
      setBookmarking(false);
    }
  };

  const handleLaunchWorkspace = () => {
    if (prerequisitesBlocked && !latestAttempt) {
      notify(
        'error',
        `Complete prerequisite mission "${missingPrereqs[0]?.title}" first before starting this mission.`,
      );
      return;
    }
    openMissionWorkspace(mission.id);
  };

  const totalCheckpoints = mission.checkpoints?.length || 0;
  const doneCheckpoints = latestAttempt?.completedCheckpointIds.length || 0;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={openMissionCatalog}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Mission Mode Catalog
        </button>
        <button
          onClick={openMissionHistory}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
        >
          <History className="w-3.5 h-3.5" />
          Mission History
        </button>
      </div>

      {/* Mission Header & Primary CTA */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                <Flag className="w-3.5 h-3.5" />
                {mission.category}
              </span>
              <span>·</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{mission.difficulty}</span>
              <span>·</span>
              <span>{mission.supportedLanguages.join(' / ')}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                {mission.estimatedMinutes} min
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                +{mission.xpReward} XP
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mission.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {mission.description}
            </p>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Skills: {mission.requiredSkills.join(' · ')}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 min-w-[220px]">
            <button
              onClick={handleLaunchWorkspace}
              disabled={prerequisitesBlocked && !latestAttempt}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                prerequisitesBlocked && !latestAttempt
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {prerequisitesBlocked && !latestAttempt ? (
                <>
                  <Lock className="w-4 h-4" />
                  Prerequisite Required
                </>
              ) : latestAttempt?.status === 'completed' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Review Completed Workspace
                </>
              ) : latestAttempt ? (
                <>
                  <Play className="w-4 h-4" />
                  Continue Mission ({doneCheckpoints}/{totalCheckpoints})
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Mission
                </>
              )}
            </button>

            <button
              onClick={handleToggleBookmark}
              disabled={bookmarking}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-blue-500 text-blue-500' : ''}`} />
              {isBookmarked ? 'Saved for Later' : 'Save for Later'}
            </button>

            {relatedLessons.length > 0 && (
              <button
                onClick={() => openCourse(relatedLessons[0].courseId, relatedLessons[0].lessonId)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                View Related Lessons
              </button>
            )}
          </div>
        </div>

        {/* Prerequisite Banner */}
        {missingPrereqs.length > 0 && (
          <div
            className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              prerequisitesBlocked
                ? 'border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  prerequisitesBlocked ? 'text-amber-600 dark:text-amber-400' : 'text-blue-500'
                }`}
              />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {prerequisitesBlocked
                    ? 'Required Prerequisite Mission Not Yet Completed'
                    : 'Recommended Prior Experience (Optional)'}
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  {mission.prerequisiteSummary || 'Complete recommended upstream training for smoother progress.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {missingPrereqs.map((pre) => (
                <button
                  key={pre.id}
                  onClick={() => openMissionDetails(pre.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  Open: {pre.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Main Details Two-Column Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Engineering Scenario
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {mission.scenario}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Requirements & Acceptance Criteria
            </h2>
            <ul className="space-y-2">
              {mission.requirements.map((req, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white">Completion Criteria:</strong>{' '}
              {mission.completionCriteria}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Mission Checkpoints ({totalCheckpoints})
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {(mission.checkpoints || [])
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((cp) => {
                  const done = latestAttempt?.completedCheckpointIds.includes(cp.id);
                  return (
                    <div key={cp.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Step {cp.order} · {cp.isAssessed ? `Server-verified (${cp.validationMethod})` : 'Review step'}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {cp.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{cp.instructions}</p>
                      </div>
                      {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />}
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

        {/* Right Sidebar: Objectives, Rewards, Recommended Lessons */}
        <div className="lg:col-span-4 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Learning Objectives
            </h2>
            <ul className="space-y-2">
              {mission.learningObjectives.map((obj, idx) => (
                <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>{obj}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Verified Rewards
              </h2>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
              <div>
                Experience: <strong className="font-mono text-emerald-600 dark:text-emerald-400">+{mission.xpReward} XP</strong> (awarded once on verified pass)
              </div>
              <div>
                Achievement Badge: <strong className="text-slate-900 dark:text-white">{mission.badgeTitle}</strong>
              </div>
              <div>Skill Passport & Portfolio export eligible upon completion.</div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recommended Academy Lessons
            </h2>
            {relatedLessons.length === 0 ? (
              <p className="text-xs text-slate-500">No linked lessons configured.</p>
            ) : (
              <div className="space-y-2">
                {relatedLessons.map((rl, i) => (
                  <button
                    key={i}
                    onClick={() => openCourse(rl.courseId, rl.lessonId)}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left transition-colors cursor-pointer"
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{rl.courseTitle}</div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                      {rl.lessonTitle}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {mission.publicTestPreviews && mission.publicTestPreviews.length > 0 && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-2.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Public Verification Scope
              </h2>
              <ul className="space-y-1.5">
                {mission.publicTestPreviews.map((tp, idx) => (
                  <li key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{tp}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <MissionLeaderboard missionId={mission.id} />
        </div>
      </div>
    </div>
  );
}
