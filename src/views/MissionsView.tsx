import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bookmark,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  Flag,
  History,
  Lock,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { MISSION_CATEGORIES, MISSION_DIFFICULTIES } from '../data/missionsData';
import { buildMissionRecommendations } from '../services/missionService';
import { MissionDetails } from '../components/missions/MissionDetails';
import { MissionWorkspace } from '../components/missions/MissionWorkspace';
import { MissionHistory } from '../components/missions/MissionHistory';
import type { Mission } from '../types/mideocode';

export function MissionsView() {
  const {
    profile,
    courseProgress,
    bookmarks,
    missions,
    missionAttempts,
    selectedMissionId,
    missionSubView,
    openMissionDetails,
    openMissionWorkspace,
    openMissionHistory,
  } = useMideo();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'completed' | 'bookmarked'>('all');

  const publishedMissions = useMemo(
    () => missions.filter((m) => m.status === 'published'),
    [missions],
  );

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) || null,
    [missions, selectedMissionId],
  );

  const recommendations = useMemo(
    () => buildMissionRecommendations(publishedMissions, missionAttempts, profile, courseProgress),
    [publishedMissions, missionAttempts, profile, courseProgress],
  );

  const completedMissionIds = useMemo(
    () => new Set(missionAttempts.filter((a) => a.status === 'completed').map((a) => a.missionId)),
    [missionAttempts],
  );

  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.filter((b) => b.targetType === 'mission').map((b) => b.targetId)),
    [bookmarks],
  );

  const latestAttemptByMission = useMemo(() => {
    const map = new Map<string, (typeof missionAttempts)[number]>();
    for (const att of missionAttempts) {
      const existing = map.get(att.missionId);
      if (!existing || att.status === 'in_progress' || att.status === 'needs_improvement') {
        map.set(att.missionId, att);
      }
    }
    return map;
  }, [missionAttempts]);

  const activeAttemptEntry = useMemo(() => {
    const active = missionAttempts.find(
      (a) => a.status === 'in_progress' || a.status === 'needs_improvement',
    );
    if (!active) return null;
    const m = publishedMissions.find((item) => item.id === active.missionId);
    if (!m) return null;
    return { mission: m, attempt: active };
  }, [missionAttempts, publishedMissions]);

  const featuredMission = useMemo(
    () =>
      publishedMissions.find((m) => m.isFeatured) ||
      recommendations[0]?.mission ||
      publishedMissions[0] ||
      null,
    [publishedMissions, recommendations],
  );

  const filteredMissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publishedMissions.filter((m) => {
      if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;
      if (selectedDifficulty !== 'all' && m.difficulty !== selectedDifficulty) return false;
      if (selectedLanguage !== 'all' && m.language !== selectedLanguage) return false;

      const att = latestAttemptByMission.get(m.id);
      if (statusTab === 'active' && !(att && (att.status === 'in_progress' || att.status === 'needs_improvement'))) {
        return false;
      }
      if (statusTab === 'completed' && !completedMissionIds.has(m.id)) return false;
      if (statusTab === 'bookmarked' && !bookmarkedIds.has(m.id)) return false;

      if (q) {
        const haystack = `${m.title} ${m.description} ${m.category} ${m.requiredSkills.join(' ')} ${m.supportedLanguages.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    publishedMissions,
    searchQuery,
    selectedCategory,
    selectedDifficulty,
    selectedLanguage,
    statusTab,
    latestAttemptByMission,
    completedMissionIds,
    bookmarkedIds,
  ]);

  if (missionSubView === 'history') {
    return <MissionHistory />;
  }

  if (missionSubView === 'workspace' && selectedMission) {
    return <MissionWorkspace mission={selectedMission} />;
  }

  if (missionSubView === 'details' && selectedMission) {
    return <MissionDetails mission={selectedMission} />;
  }

  const getMissionProgressPct = (mission: Mission) => {
    const att = latestAttemptByMission.get(mission.id);
    if (!att) return 0;
    if (att.status === 'completed') return 100;
    const total = mission.checkpoints?.length || 1;
    return Math.min(95, Math.round((att.completedCheckpointIds.length / total) * 100));
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <Flag className="w-4 h-4" />
              MideoCode Mission Mode
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Turn Your Coding Skills Into Real Projects.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Take on practical programming missions, solve real development problems, and prove what you can build.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={openMissionHistory}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <History className="w-4 h-4" />
              Mission History ({missionAttempts.length})
            </button>
            {activeAttemptEntry ? (
              <button
                onClick={() => openMissionWorkspace(activeAttemptEntry.mission.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Continue Active Mission
              </button>
            ) : (
              featuredMission && (
                <button
                  onClick={() => openMissionDetails(featuredMission.id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Start Featured Mission
                </button>
              )
            )}
          </div>
        </div>

        {/* Real Mission Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-[11px] text-slate-500">Available Missions</div>
            <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {publishedMissions.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Active Workspaces</div>
            <div className="text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {
                missionAttempts.filter(
                  (a) => a.status === 'in_progress' || a.status === 'needs_improvement',
                ).length
              }
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Completed Missions</div>
            <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {completedMissionIds.size}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Categories Covered</div>
            <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {new Set(publishedMissions.map((m) => m.category)).size} / {MISSION_CATEGORIES.length}
            </div>
          </div>
        </div>
      </section>

      {/* Continue Active Mission + Featured Mission Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {activeAttemptEntry && (
          <section className="lg:col-span-5 rounded-xl border border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/15 p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>Continue Where You Left Off</span>
                <span className="font-mono tabular-nums">
                  {getMissionProgressPct(activeAttemptEntry.mission)}%
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {activeAttemptEntry.mission.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {activeAttemptEntry.mission.category} · {activeAttemptEntry.mission.difficulty} ·{' '}
                {activeAttemptEntry.attempt.completedCheckpointIds.length}/
                {activeAttemptEntry.mission.checkpoints?.length || 0} checkpoints verified
              </p>
              <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                <div
                  className="h-full bg-blue-600"
                  style={{ width: `${getMissionProgressPct(activeAttemptEntry.mission)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => openMissionWorkspace(activeAttemptEntry.mission.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Resume Workspace
              </button>
              <button
                onClick={() => openMissionDetails(activeAttemptEntry.mission.id)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Briefing
              </button>
            </div>
          </section>
        )}

        {featuredMission && (
          <section
            className={`${
              activeAttemptEntry ? 'lg:col-span-7' : 'lg:col-span-12'
            } rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 flex flex-col justify-between gap-4`}
          >
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  Featured Engineering Mission
                </span>
                <span className="text-slate-500 font-mono tabular-nums">
                  {featuredMission.estimatedMinutes} min · +{featuredMission.xpReward} XP
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {featuredMission.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {featuredMission.scenario}
              </p>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {featuredMission.category} · {featuredMission.difficulty} ·{' '}
                {featuredMission.supportedLanguages.join(' / ')} · Skills:{' '}
                {featuredMission.requiredSkills.slice(0, 4).join(', ')}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => openMissionDetails(featuredMission.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Inspect Mission Briefing
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openMissionWorkspace(featuredMission.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Open Workspace
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Recommended Missions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-blue-500" />
              Recommended For Your Track
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ranked dynamically from your experience level, preferred stack, Academy progress, and active attempts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendations.slice(0, 3).map((rec) => {
            const pct = getMissionProgressPct(rec.mission);
            const isDone = completedMissionIds.has(rec.mission.id);
            return (
              <div
                key={rec.mission.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {rec.mission.difficulty} · {rec.mission.supportedLanguages.join(' / ')}
                    </span>
                    <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                      +{rec.mission.xpReward} XP
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {rec.mission.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {rec.mission.description}
                  </p>

                  <div className="pt-1 space-y-1">
                    {rec.reasons.map((reason, idx) => (
                      <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                        <span className="text-blue-500">•</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rec.mission.estimatedMinutes} min
                    </span>
                    <span>
                      {isDone ? 'Completed' : pct > 0 ? `${pct}% complete` : 'Not started'}
                    </span>
                  </div>
                  <button
                    onClick={() => openMissionDetails(rec.mission.id)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {pct > 0 && !isDone ? 'Continue Mission' : isDone ? 'Review Mission' : 'View Briefing'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Browse All Missions */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Browse Mission Library
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${publishedMissions.length})` },
                {
                  id: 'active',
                  label: `Active (${missionAttempts.filter((a) => a.status === 'in_progress' || a.status === 'needs_improvement').length})`,
                },
                { id: 'completed', label: `Completed (${completedMissionIds.size})` },
                { id: 'bookmarked', label: `Saved (${bookmarkedIds.size})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  statusTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-slate-600 dark:text-slate-300 hover:border-blue-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search missions by title, skill, or topic..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
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
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Difficulties</option>
            {MISSION_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Languages</option>
            <option value="web">HTML & CSS (Web)</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="sql">SQL</option>
          </select>
        </div>

        {/* Category Quick Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Tracks
          </button>
          {MISSION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredMissions.length === 0 ? (
          <div className="p-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No missions match the selected filters.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedDifficulty('all');
                setSelectedLanguage('all');
                setStatusTab('all');
              }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMissions.map((mission) => {
              const att = latestAttemptByMission.get(mission.id);
              const isDone = completedMissionIds.has(mission.id);
              const pct = getMissionProgressPct(mission);
              const isSaved = bookmarkedIds.has(mission.id);
              const missingPrereqs = (mission.prerequisiteMissionIds || []).filter(
                (pid) => !completedMissionIds.has(pid),
              );
              const locked = !mission.prerequisitesOptional && missingPrereqs.length > 0;

              return (
                <div
                  key={mission.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-blue-500/60 transition-colors flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {mission.category} · {mission.difficulty} · {mission.supportedLanguages.join(' / ')}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSaved && <Bookmark className="w-3.5 h-3.5 text-blue-500 fill-current" />}
                        {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {locked && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {mission.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {mission.description}
                    </p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Skills: {mission.requiredSkills.join(' · ')}
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    {pct > 0 && (
                      <div>
                        <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 mb-1">
                          <span>{isDone ? 'Mission Completed' : 'Workspace Progress'}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${isDone ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {mission.estimatedMinutes}m
                        </span>
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Award className="w-3.5 h-3.5" />
                          +{mission.xpReward} XP
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openMissionDetails(mission.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => openMissionWorkspace(mission.id)}
                          disabled={locked}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          {isDone ? 'Review' : att ? 'Continue' : 'Start'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
