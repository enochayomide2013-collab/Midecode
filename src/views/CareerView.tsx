import { useEffect, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Copy,
  FileText,
  Flag,
  FolderGit2,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { CAREER_PATHWAYS } from '../data/challengesData';
import { ACADEMY_COURSES } from '../data/academyData';
import { GUIDED_PROJECTS } from '../data/projectsData';
import { getCareerProgress, saveCareerProgress } from '../services/dataService';
import { exportCompletedMissionToPortfolioAndPassport } from '../services/missionService';

export function CareerView() {
  const {
    firebaseUser,
    profile,
    courseProgress,
    missions,
    missionAttempts,
    openCourse,
    openInIde,
    openMissionCatalog,
    openMissionDetails,
    setActiveIdeProjectId,
    setActiveView,
    refreshMissions,
    refreshUserData,
    askAi,
    notify,
  } = useMideo();

  const [selectedPathId, setSelectedPathId] = useState(
    profile?.activeCareerPathId || CAREER_PATHWAYS[0].id,
  );
  const [completedSkillIds, setCompletedSkillIds] = useState<string[]>([]);
  const [completedProjectIds, setCompletedProjectIds] = useState<string[]>([]);
  const [openQuestionIdx, setOpenQuestionIdx] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [exportingAttemptId, setExportingAttemptId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    getCareerProgress(firebaseUser.uid)
      .then((res) => {
        if (res) {
          setSelectedPathId(res.selectedPathId || profile?.activeCareerPathId || CAREER_PATHWAYS[0].id);
          setCompletedSkillIds(res.completedSkillIds || []);
          setCompletedProjectIds(res.completedProjectIds || []);
        }
      })
      .catch(() => {});
  }, [firebaseUser, profile?.activeCareerPathId]);

  const activePath =
    CAREER_PATHWAYS.find((p) => p.id === selectedPathId) || CAREER_PATHWAYS[0];

  const persistProgress = async (
    nextPathId: string,
    nextSkills: string[],
    nextProjects: string[],
  ) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await saveCareerProgress(firebaseUser.uid, {
        selectedPathId: nextPathId,
        completedSkillIds: nextSkills,
        completedProjectIds: nextProjects,
      });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save career progress.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPath = async (pathId: string) => {
    setSelectedPathId(pathId);
    setOpenQuestionIdx(0);
    await persistProgress(pathId, completedSkillIds, completedProjectIds);
    notify('info', 'Active career pathway updated.');
  };

  const toggleSkill = async (skillId: string) => {
    const next = completedSkillIds.includes(skillId)
      ? completedSkillIds.filter((id) => id !== skillId)
      : [...completedSkillIds, skillId];
    setCompletedSkillIds(next);
    await persistProgress(selectedPathId, next, completedProjectIds);
  };

  const toggleProjectCheck = async (projectId: string) => {
    const next = completedProjectIds.includes(projectId)
      ? completedProjectIds.filter((id) => id !== projectId)
      : [...completedProjectIds, projectId];
    setCompletedProjectIds(next);
    await persistProgress(selectedPathId, completedSkillIds, next);
  };

  const matchedSkillsCount = activePath.requiredSkills.filter((s) =>
    completedSkillIds.includes(s.id),
  ).length;
  const readinessPct = Math.round(
    (matchedSkillsCount / Math.max(1, activePath.requiredSkills.length)) * 100,
  );

  const recCourses = ACADEMY_COURSES.filter((c) =>
    activePath.recommendedCourseIds.includes(c.id),
  );
  const recProjects = GUIDED_PROJECTS.filter((p) =>
    activePath.recommendedProjectIds.includes(p.id),
  );

  const completedMissionEntries = missionAttempts
    .filter((a) => a.status === 'completed')
    .map((attempt) => ({
      attempt,
      mission: missions.find((m) => m.id === attempt.missionId) || null,
    }));

  const verifiedMissionSkills = Array.from(
    new Set(
      completedMissionEntries.flatMap((entry) => entry.mission?.requiredSkills || []),
    ),
  );

  const handleExportToPassport = async (attemptId: string) => {
    if (!firebaseUser || !profile) return;
    const entry = completedMissionEntries.find((e) => e.attempt.id === attemptId);
    if (!entry || !entry.mission) return;
    setExportingAttemptId(attemptId);
    try {
      const res = await exportCompletedMissionToPortfolioAndPassport(
        firebaseUser.uid,
        profile.displayName,
        entry.mission,
        entry.attempt,
      );
      await Promise.all([refreshMissions(), refreshUserData()]);
      notify(
        res.alreadyAdded ? 'info' : 'success',
        res.alreadyAdded
          ? 'Already linked to your Skill Passport and Portfolio.'
          : 'Exported completed mission to your Portfolio & Skill Passport.',
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to export mission.');
    } finally {
      setExportingAttemptId(null);
    }
  };

  const handleCopySkillPassportSummary = async () => {
    const summary = {
      developer: profile?.displayName || 'MideoCode Developer',
      careerTrack: activePath.title,
      verifiedMissions: completedMissionEntries.map((e) => ({
        missionId: e.attempt.missionId,
        title: e.mission?.title || e.attempt.missionId,
        category: e.mission?.category || 'Programming',
        difficulty: e.mission?.difficulty || 'Standard',
        skills: e.mission?.requiredSkills || [],
        xpAwarded: e.attempt.xpAwarded,
      })),
      verifiedSkills: verifiedMissionSkills,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      notify('success', 'Copied verified Skill Passport JSON summary to clipboard.');
    } catch {
      notify('error', 'Clipboard access was blocked by the browser.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mideo Career
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Structured engineering roadmaps, skill-gap tracking, portfolio checklists, and mock interview prep.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {saving ? 'Syncing roadmap...' : `Readiness: ${readinessPct}%`}
        </div>
      </div>

      {/* Career Path Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CAREER_PATHWAYS.map((path) => {
          const active = path.id === activePath.id;
          return (
            <button
              key={path.id}
              onClick={() => handleSelectPath(path.id)}
              className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                active
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                <Compass className="w-3.5 h-3.5" />
                <span>Career Track</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {path.title}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                {path.summary}
              </p>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Skill Gap & Courses */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Skill-Gap Checklist: {activePath.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Prerequisites: {activePath.prerequisites.join(' · ')}
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {matchedSkillsCount}/{activePath.requiredSkills.length}
              </span>
            </div>

            <div className="h-2 w-full rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${readinessPct}%` }}
              />
            </div>

            <div className="space-y-2.5 pt-2">
              {activePath.requiredSkills.map((skill) => {
                const done = completedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    className="w-full p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {skill.name}
                        </div>
                        <div className="text-[11px] text-slate-500">{skill.category}</div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">
                      {done ? 'Verified' : 'Mark Ready'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recommended Courses */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-violet-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Required Academy Courses
              </h2>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {recCourses.map((course) => {
                const pct = courseProgress[course.id]?.progressPercent ?? 0;
                return (
                  <div
                    key={course.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {course.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {course.language} · {course.estimatedHours}h · {pct}% complete
                      </div>
                    </div>
                    <button
                      onClick={() => openCourse(course.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Open Course
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recommended Portfolio Projects */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-emerald-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Portfolio Projects to Ship
              </h2>
            </div>
            <div className="space-y-3">
              {recProjects.map((proj) => {
                const checked = completedProjectIds.includes(proj.id);
                return (
                  <div
                    key={proj.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleProjectCheck(proj.id)}
                        className="mt-0.5 cursor-pointer"
                        title="Toggle completion"
                      >
                        {checked ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {proj.title}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {proj.description}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        openInIde({
                          title: proj.title,
                          language: proj.language,
                          guidedProjectId: proj.id,
                          files: proj.starterFiles,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Launch Starter
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Skill Passport: Verified Mission Evidence & Portfolio */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Skill Passport: Verified Mission Evidence
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Server-verified Mission completions proving hands-on engineering skills.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {completedMissionEntries.length > 0 && (
                  <button
                    onClick={handleCopySkillPassportSummary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Passport JSON
                  </button>
                )}
                <button
                  onClick={openMissionCatalog}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Mission Mode
                </button>
              </div>
            </div>

            {verifiedMissionSkills.length > 0 && (
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Verified Skills ({verifiedMissionSkills.length}):
                </span>{' '}
                {verifiedMissionSkills.join(' · ')}
              </div>
            )}

            {completedMissionEntries.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  Complete any mission in Mission Mode to populate verified Skill Passport evidence and portfolio entries.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {completedMissionEntries.map(({ attempt, mission }) => (
                  <div
                    key={attempt.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified Completion · +{attempt.xpAwarded} XP
                      </div>
                      <button
                        onClick={() => openMissionDetails(attempt.missionId)}
                        className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-500 text-left cursor-pointer"
                      >
                        {mission?.title || attempt.missionId}
                      </button>
                      <div className="text-[11px] text-slate-500">
                        {mission?.category || 'Mission'} · Skills:{' '}
                        {mission?.requiredSkills.join(', ') || 'Engineering'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {attempt.portfolioProjectId ? (
                        <button
                          onClick={() => {
                            setActiveIdeProjectId(attempt.portfolioProjectId || null);
                            setActiveView('ide');
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          Open Portfolio Build
                        </button>
                      ) : (
                        <button
                          onClick={() => handleExportToPassport(attempt.id)}
                          disabled={exportingAttemptId === attempt.id}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                        >
                          {exportingAttemptId === attempt.id
                            ? 'Exporting...'
                            : 'Add to Portfolio & Passport'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Mock Interviews, Portfolio & CV Guidance */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Technical Interview Practice
                </h2>
              </div>
              <button
                onClick={() =>
                  askAi({
                    mode: 'practice',
                    prompt: `Conduct a realistic technical mock interview for a ${activePath.title} role. Ask one question at a time and evaluate my reasoning.`,
                    context: { courseTitle: activePath.title },
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Mock Interview with AI
              </button>
            </div>
            <div className="space-y-3">
              {activePath.interviewQuestions.map((iq, idx) => {
                const open = openQuestionIdx === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenQuestionIdx(open ? null : idx)}
                      className="w-full p-3.5 text-left flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {iq.question}
                      </span>
                      {open ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {open && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                        <div className="text-[11px] font-medium text-slate-500 mb-1.5">
                          Strong Answer Key Points:
                        </div>
                        <ul className="space-y-1">
                          {iq.keyPoints.map((kp, i) => (
                            <li
                              key={i}
                              className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                            >
                              <span className="text-blue-500">•</span>
                              <span>{kp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Portfolio & CV Guidance
              </h2>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Portfolio Quality Checklist
              </h3>
              <ul className="space-y-2">
                {activePath.portfolioChecklist.map((item, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Resume Engineering Tips
              </h3>
              <ul className="space-y-2">
                {activePath.cvTips.map((tip, i) => (
                  <li key={i} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    • {tip}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
