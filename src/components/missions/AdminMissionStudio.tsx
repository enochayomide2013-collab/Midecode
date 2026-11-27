import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Eye,
  FileCode2,
  Flag,
  History,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { collection, getDocs, limit, orderBy, query } from '../../services/appDb';
import { useMideo } from '../../context/MideoContext';
import { db } from '../../services/firebase';
import { getIdTokenHeader, tryReadJson } from '../../services/authService';
import { MISSION_CATEGORIES, MISSION_DIFFICULTIES } from '../../data/missionsData';
import {
  adminDeleteMissionDraft,
  adminSaveMissionBundle,
  adminUpdateMissionStatus,
  validateMissionReadyForPublish,
} from '../../services/missionService';
import type {
  Mission,
  MissionCategory,
  MissionCheckpoint,
  MissionDifficulty,
  MissionHint,
  MissionLanguage,
  MissionRuntimeTestSpec,
  MissionServerEvalConfig,
  MissionStarterFile,
} from '../../types/mideocode';

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  targetPath: string;
  createdAt?: unknown;
}

function createBlankMissionDraft(adminUid: string): {
  mission: Mission;
  checkpoints: MissionCheckpoint[];
  starterFiles: MissionStarterFile[];
  evalConfig: MissionServerEvalConfig;
} {
  const slug = `mission-custom-${Date.now().toString(36)}`;
  const mission: Mission = {
    id: slug,
    title: 'Custom Practical Engineering Mission',
    description: 'Build and verify a realistic software component against automated server tests.',
    category: 'JavaScript',
    difficulty: 'Intermediate',
    language: 'javascript',
    supportedLanguages: ['JavaScript'],
    requiredSkills: ['Problem Solving', 'Clean Functions', 'Edge Case Handling'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Recommended after JavaScript core lessons.',
    prerequisitesOptional: true,
    relatedLessonIds: [],
    learningObjectives: ['Design modular code that handles normal and edge-case inputs reliably.'],
    estimatedMinutes: 35,
    scenario:
      'Your engineering team needs a reliable utility module implemented to specification and verified with automated tests.',
    requirements: ['Implement the exported function cleanly without mutating caller input.'],
    instructions: [
      'Inspect starter index.js and implement the required logic.',
      'Validate Checkpoint 1, then run final evaluation.',
    ],
    hints: [
      {
        id: `${slug}-hint-1`,
        order: 1,
        level: 'nudge',
        title: 'Start with input validation',
        content: 'Check boundary inputs first before computing your return payload.',
      },
    ],
    completionCriteria: 'All public and hidden server test cases pass with zero runtime errors.',
    xpReward: 120,
    badgeId: `mission_${slug.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 48),
    badgeTitle: 'Custom Mission Specialist',
    isFeatured: false,
    status: 'draft',
    authorId: adminUid,
  };

  const checkpoints: MissionCheckpoint[] = [
    {
      id: `${slug}-cp-1`,
      missionId: slug,
      order: 1,
      title: 'Implement Core Function',
      instructions: 'Implement the solution function cleanly in index.js.',
      requirements: ['Export or define solveMission function cleanly'],
      completionCriteria: 'Returns expected output on baseline test case.',
      validationMethod: 'javascript',
      dependsOn: [],
      hint: 'Verify return types match the specification.',
      isAssessed: true,
      status: 'active',
    },
  ];

  const starterFiles: MissionStarterFile[] = [
    {
      id: 'file_main',
      name: 'index.js',
      folder: '',
      language: 'javascript',
      content: `function solveMission(input) {\n  // TODO: implement mission solution\n  return input;\n}\n`,
    },
  ];

  const evalConfig: MissionServerEvalConfig = {
    missionId: slug,
    language: 'javascript',
    xpReward: 120,
    badgeId: mission.badgeId,
    badgeTitle: mission.badgeTitle,
    checkpointValidators: {
      [`${slug}-cp-1`]: [
        {
          id: `${slug}-cp1-test`,
          label: 'Baseline solveMission check',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'index.js',
          driverOrQuery: 'solveMission("ready")',
          expectedJson: 'ready',
          requirementText: 'Implement solveMission cleanly',
        },
      ],
    },
    submissionTests: [
      {
        id: `${slug}-sub-1`,
        label: 'Public baseline verification',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'index.js',
        driverOrQuery: 'solveMission("ready")',
        expectedJson: 'ready',
        requirementText: 'Returns expected baseline output',
      },
    ],
  };

  return { mission, checkpoints, starterFiles, evalConfig };
}

export function AdminMissionStudio() {
  const { firebaseUser, missions, refreshMissions, openMissionDetails, notify } = useMideo();

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Editor state
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editCheckpoints, setEditCheckpoints] = useState<MissionCheckpoint[]>([]);
  const [editStarterFiles, setEditStarterFiles] = useState<MissionStarterFile[]>([]);
  const [editEvalConfig, setEditEvalConfig] = useState<MissionServerEvalConfig | null>(null);
  const [editorTab, setEditorTab] = useState<'general' | 'checkpoints' | 'files' | 'hints' | 'tests'>('general');
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);

  const loadAuditLogs = async () => {
    try {
      const q = query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q);
      setAuditLogs(snap.docs.map((d) => d.data() as AuditLogEntry));
    } catch {
      // Fallback without orderBy index if needed
      try {
        const snap = await getDocs(query(collection(db, 'adminAuditLogs'), limit(20)));
        setAuditLogs(snap.docs.map((d) => d.data() as AuditLogEntry));
      } catch {
        setAuditLogs([]);
      }
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const filteredMissions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return missions.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (q) {
        const text = `${m.id} ${m.title} ${m.category} ${m.language}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [missions, searchText, statusFilter]);

  const handleCreateNew = () => {
    if (!firebaseUser) return;
    const draft = createBlankMissionDraft(firebaseUser.uid);
    setEditingMission(draft.mission);
    setEditCheckpoints(draft.checkpoints);
    setEditStarterFiles(draft.starterFiles);
    setEditEvalConfig(draft.evalConfig);
    setEditorTab('general');
    setPublishIssues([]);
  };

  const handleEditMission = async (mission: Mission) => {
    setEditingMission({ ...mission });
    setEditCheckpoints((mission.checkpoints || []).map((c) => ({ ...c })));
    setEditStarterFiles((mission.starterFiles || []).map((f) => ({ ...f })));
    setEditorTab('general');
    setPublishIssues([]);

    try {
      const headers = await getIdTokenHeader();
      const res = await fetch(`/api/admin/missions/eval-config/${encodeURIComponent(mission.id)}`, {
        headers,
      });
      const cfg = res.ok ? await tryReadJson<MissionServerEvalConfig>(res) : null;
      if (cfg) {
        setEditEvalConfig(cfg);
      } else {
        setEditEvalConfig({
          missionId: mission.id,
          language: mission.language,
          xpReward: mission.xpReward,
          badgeId: mission.badgeId,
          badgeTitle: mission.badgeTitle,
          checkpointValidators: {},
          submissionTests: [],
        });
      }
    } catch {
      setEditEvalConfig({
        missionId: mission.id,
        language: mission.language,
        xpReward: mission.xpReward,
        badgeId: mission.badgeId,
        badgeTitle: mission.badgeTitle,
        checkpointValidators: {},
        submissionTests: [],
      });
    }
  };

  const handleSaveEditor = async (requestedStatus?: Mission['status']) => {
    if (!firebaseUser || !editingMission) return;
    const nextMission: Mission = {
      ...editingMission,
      status: requestedStatus || editingMission.status,
    };

    if (nextMission.status === 'published') {
      const issues = validateMissionReadyForPublish(
        nextMission,
        editCheckpoints,
        editStarterFiles,
        editEvalConfig,
      );
      if (issues.length > 0) {
        setPublishIssues(issues);
        notify('error', `Publish blocked: ${issues[0]}`);
        return;
      }
    }

    if (nextMission.description.trim().length < 10) {
      notify('error', 'Mission description must be at least 10 characters.');
      return;
    }
    if (nextMission.scenario.trim().length < 10) {
      notify('error', 'Mission scenario must be at least 10 characters.');
      return;
    }
    if (editStarterFiles.length === 0) {
      notify('error', 'At least one starter file is required.');
      return;
    }

    setSaving(true);
    setPublishIssues([]);
    try {
      await adminSaveMissionBundle(
        firebaseUser.uid,
        nextMission,
        editCheckpoints,
        editStarterFiles,
        editEvalConfig,
      );
      await refreshMissions();
      await loadAuditLogs();
      setEditingMission(nextMission);
      notify(
        'success',
        requestedStatus === 'published'
          ? `Mission "${nextMission.title}" saved and published.`
          : `Mission "${nextMission.title}" saved (${nextMission.status}).`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save mission.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (mission: Mission, nextStatus: Mission['status']) => {
    if (!firebaseUser) return;
    setActionBusyId(mission.id);
    try {
      await adminUpdateMissionStatus(firebaseUser.uid, mission, nextStatus);
      await refreshMissions();
      await loadAuditLogs();
      notify('success', `Mission "${mission.title}" marked ${nextStatus}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to change mission status.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteDraft = async (mission: Mission) => {
    if (!firebaseUser) return;
    if (mission.status !== 'draft') {
      notify('error', 'Only draft missions can be permanently deleted. Archive published missions instead.');
      return;
    }
    setActionBusyId(mission.id);
    try {
      await adminDeleteMissionDraft(firebaseUser.uid, mission.id);
      const headers = await getIdTokenHeader();
      await fetch(`/api/admin/missions/eval-config/${encodeURIComponent(mission.id)}`, {
        method: 'DELETE',
        headers,
      }).catch(() => {});
      await refreshMissions();
      await loadAuditLogs();
      if (editingMission?.id === mission.id) {
        setEditingMission(null);
      }
      notify('success', `Deleted draft mission "${mission.title}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete draft mission.');
    } finally {
      setActionBusyId(null);
    }
  };

  const updateLineArray = (text: string): string[] =>
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Flag className="w-5 h-5 text-blue-500" />
            Mission Management & Authoring Studio
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Create, configure checkpoints & server tests, validate readiness, publish, unpublish, and audit missions.
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Mission Draft
        </button>
      </div>

      {/* Mission Authoring Drawer / Form */}
      {editingMission && (
        <section className="rounded-xl border border-blue-500/50 bg-white dark:bg-[#0D1322] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                Editing Mission · {editingMission.id} · Status: {editingMission.status}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingMission.title || 'Untitled Mission'}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openMissionDetails(editingMission.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={() => handleSaveEditor('draft')}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Draft
              </button>
              <button
                onClick={() => handleSaveEditor('published')}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Validate & Publish'}
              </button>
              <button
                onClick={() => setEditingMission(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                title="Close editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {publishIssues.length > 0 && (
            <div className="p-3.5 rounded-lg border border-red-400 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 space-y-1">
              <div className="font-semibold">Publish Validation Blocked:</div>
              {publishIssues.map((iss, i) => (
                <div key={i}>• {iss}</div>
              ))}
            </div>
          )}

          {/* Editor Sub-tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
            {(
              [
                { id: 'general', label: 'Briefing & Curriculum' },
                { id: 'checkpoints', label: `Checkpoints (${editCheckpoints.length})` },
                { id: 'files', label: `Starter Files (${editStarterFiles.length})` },
                { id: 'hints', label: `Hints (${editingMission.hints.length})` },
                {
                  id: 'tests',
                  label: `Eval Tests & Rewards (${editEvalConfig?.submissionTests.length || 0})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setEditorTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  editorTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {editorTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Mission ID (unique slug)
                </label>
                <input
                  value={editingMission.id}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Mission Title
                </label>
                <input
                  value={editingMission.title}
                  onChange={(e) => setEditingMission({ ...editingMission, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Category</label>
                <select
                  value={editingMission.category}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      category: e.target.value as MissionCategory,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                >
                  {MISSION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Difficulty</label>
                  <select
                    value={editingMission.difficulty}
                    onChange={(e) =>
                      setEditingMission({
                        ...editingMission,
                        difficulty: e.target.value as MissionDifficulty,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                  >
                    {MISSION_DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Runtime</label>
                  <select
                    value={editingMission.language}
                    onChange={(e) =>
                      setEditingMission({
                        ...editingMission,
                        language: e.target.value as MissionLanguage,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                  >
                    <option value="web">web (HTML/CSS)</option>
                    <option value="javascript">javascript</option>
                    <option value="python">python</option>
                    <option value="sql">sql</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Est. Min</label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={editingMission.estimatedMinutes}
                    onChange={(e) =>
                      setEditingMission({
                        ...editingMission,
                        estimatedMinutes: Number(e.target.value) || 30,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Short Description (min 10 chars)
                </label>
                <textarea
                  rows={2}
                  value={editingMission.description}
                  onChange={(e) =>
                    setEditingMission({ ...editingMission, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Real-World Engineering Scenario (min 10 chars)
                </label>
                <textarea
                  rows={3}
                  value={editingMission.scenario}
                  onChange={(e) =>
                    setEditingMission({ ...editingMission, scenario: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Technical Requirements (one per line)
                </label>
                <textarea
                  rows={4}
                  value={editingMission.requirements.join('\n')}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      requirements: updateLineArray(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Step-by-Step Instructions (one per line)
                </label>
                <textarea
                  rows={4}
                  value={editingMission.instructions.join('\n')}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      instructions: updateLineArray(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Required Skills (one per line)
                </label>
                <textarea
                  rows={3}
                  value={editingMission.requiredSkills.join('\n')}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      requiredSkills: updateLineArray(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Completion Criteria & Options
                </label>
                <textarea
                  rows={2}
                  value={editingMission.completionCriteria}
                  onChange={(e) =>
                    setEditingMission({ ...editingMission, completionCriteria: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white"
                />
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingMission.isFeatured}
                      onChange={(e) =>
                        setEditingMission({ ...editingMission, isFeatured: e.target.checked })
                      }
                    />
                    Featured Mission
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingMission.prerequisitesOptional}
                      onChange={(e) =>
                        setEditingMission({
                          ...editingMission,
                          prerequisitesOptional: e.target.checked,
                        })
                      }
                    />
                    Prerequisites Recommended (Non-Blocking)
                  </label>
                </div>
              </div>
            </div>
          )}

          {editorTab === 'checkpoints' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-slate-500">
                  Configure ordered checkpoints, optional dependencies, and assessed vs walkthrough steps.
                </p>
                <button
                  onClick={() =>
                    setEditCheckpoints((prev) => [
                      ...prev,
                      {
                        id: `${editingMission.id}-cp-${prev.length + 1}`,
                        missionId: editingMission.id,
                        order: prev.length + 1,
                        title: `Checkpoint ${prev.length + 1}`,
                        instructions: 'Implement the next milestone requirement cleanly.',
                        requirements: ['Pass checkpoint criteria'],
                        completionCriteria: 'Requirement verified cleanly.',
                        validationMethod:
                          editingMission.language === 'web'
                            ? 'html'
                            : editingMission.language,
                        dependsOn: prev.length > 0 ? [prev[prev.length - 1].id] : [],
                        isAssessed: true,
                        status: 'active',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Checkpoint
                </button>
              </div>

              {editCheckpoints.map((cp, idx) => (
                <div
                  key={cp.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                      #{cp.order} · {cp.id}
                    </span>
                    <button
                      onClick={() =>
                        setEditCheckpoints((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={cp.title}
                      onChange={(e) =>
                        setEditCheckpoints((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)),
                        )
                      }
                      placeholder="Checkpoint title"
                      className="sm:col-span-2 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    />
                    <select
                      value={cp.validationMethod}
                      onChange={(e) =>
                        setEditCheckpoints((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  validationMethod: e.target.value as MissionCheckpoint['validationMethod'],
                                }
                              : item,
                          ),
                        )
                      }
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    >
                      <option value="javascript">javascript</option>
                      <option value="python">python</option>
                      <option value="sql">sql</option>
                      <option value="html">html</option>
                      <option value="css">css</option>
                      <option value="hybrid">hybrid</option>
                      <option value="instructional">instructional (no auto-test)</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={cp.instructions}
                    onChange={(e) =>
                      setEditCheckpoints((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, instructions: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Instructions"
                    className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                  />
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cp.isAssessed}
                        onChange={(e) =>
                          setEditCheckpoints((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, isAssessed: e.target.checked } : item,
                            ),
                          )
                        }
                      />
                      Assessed by Server Validator
                    </label>
                    <input
                      value={cp.dependsOn.join(', ')}
                      onChange={(e) =>
                        setEditCheckpoints((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  dependsOn: e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Depends on checkpoint IDs (comma-separated)"
                      className="flex-1 min-w-[200px] px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {editorTab === 'files' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-slate-500">Define initial starter files loaded into learner workspaces.</p>
                <button
                  onClick={() =>
                    setEditStarterFiles((prev) => [
                      ...prev,
                      {
                        id: `file_${Date.now().toString(36)}`,
                        name: `module_${prev.length + 1}.js`,
                        folder: '',
                        language: editingMission.language === 'web' ? 'html' : editingMission.language,
                        content: '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Starter File
                </button>
              </div>
              {editStarterFiles.map((file, idx) => (
                <div
                  key={file.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-blue-500" />
                    <input
                      value={file.name}
                      onChange={(e) =>
                        setEditStarterFiles((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, name: e.target.value } : f)),
                        )
                      }
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                    />
                    <input
                      value={file.language}
                      onChange={(e) =>
                        setEditStarterFiles((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, language: e.target.value } : f)),
                        )
                      }
                      placeholder="language"
                      className="w-28 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                    />
                    <button
                      onClick={() =>
                        setEditStarterFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="ml-auto text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={file.content}
                    onChange={(e) =>
                      setEditStarterFiles((prev) =>
                        prev.map((f, i) => (i === idx ? { ...f, content: e.target.value } : f)),
                      )
                    }
                    className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono text-[11px]"
                  />
                </div>
              ))}
            </div>
          )}

          {editorTab === 'hints' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-slate-500">Progressive hints unlocked step-by-step in workspace.</p>
                <button
                  onClick={() =>
                    setEditingMission((prev) =>
                      prev
                        ? {
                            ...prev,
                            hints: [
                              ...prev.hints,
                              {
                                id: `${prev.id}-hint-${prev.hints.length + 1}`,
                                order: prev.hints.length + 1,
                                level: 'concept',
                                title: `Hint ${prev.hints.length + 1}`,
                                content: '',
                              },
                            ],
                          }
                        : prev,
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Hint
                </button>
              </div>

              {editingMission.hints.map((hint, idx) => (
                <div
                  key={hint.id}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={hint.level}
                      onChange={(e) =>
                        setEditingMission((prev) =>
                          prev
                            ? {
                                ...prev,
                                hints: prev.hints.map((h, i) =>
                                  i === idx ? { ...h, level: e.target.value as MissionHint['level'] } : h,
                                ),
                              }
                            : prev,
                        )
                      }
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    >
                      <option value="nudge">nudge</option>
                      <option value="concept">concept</option>
                      <option value="structure">structure</option>
                      <option value="walkthrough">walkthrough</option>
                    </select>
                    <input
                      value={hint.title}
                      onChange={(e) =>
                        setEditingMission((prev) =>
                          prev
                            ? {
                                ...prev,
                                hints: prev.hints.map((h, i) =>
                                  i === idx ? { ...h, title: e.target.value } : h,
                                ),
                              }
                            : prev,
                        )
                      }
                      className="flex-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    />
                    <button
                      onClick={() =>
                        setEditingMission((prev) =>
                          prev ? { ...prev, hints: prev.hints.filter((_, i) => i !== idx) } : prev,
                        )
                      }
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={hint.content}
                    onChange={(e) =>
                      setEditingMission((prev) =>
                        prev
                          ? {
                              ...prev,
                              hints: prev.hints.map((h, i) =>
                                i === idx ? { ...h, content: e.target.value } : h,
                              ),
                            }
                          : prev,
                      )
                    }
                    className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                  />
                </div>
              ))}
            </div>
          )}

          {editorTab === 'tests' && editEvalConfig && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17]">
                <div className="space-y-1">
                  <label className="font-semibold">XP Reward (25–250)</label>
                  <input
                    type="number"
                    min={25}
                    max={250}
                    value={editingMission.xpReward}
                    onChange={(e) => {
                      const xp = Math.min(250, Math.max(25, Number(e.target.value) || 100));
                      setEditingMission({ ...editingMission, xpReward: xp });
                      setEditEvalConfig({ ...editEvalConfig, xpReward: xp });
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">Reward Badge ID</label>
                  <input
                    value={editingMission.badgeId}
                    onChange={(e) => {
                      setEditingMission({ ...editingMission, badgeId: e.target.value });
                      setEditEvalConfig({ ...editEvalConfig, badgeId: e.target.value });
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">Reward Badge Title</label>
                  <input
                    value={editingMission.badgeTitle}
                    onChange={(e) => {
                      setEditingMission({ ...editingMission, badgeTitle: e.target.value });
                      setEditEvalConfig({ ...editEvalConfig, badgeTitle: e.target.value });
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-slate-500">
                  Server-only submission evaluation tests (stored exclusively in backend Express store).
                </p>
                <button
                  onClick={() =>
                    setEditEvalConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            submissionTests: [
                              ...prev.submissionTests,
                              {
                                id: `${editingMission.id}-test-${prev.submissionTests.length + 1}`,
                                label: `Verification Case ${prev.submissionTests.length + 1}`,
                                isHidden: false,
                                kind:
                                  editingMission.language === 'web'
                                    ? 'html_css'
                                    : editingMission.language,
                                targetFile: editStarterFiles[0]?.name || 'index.js',
                                driverOrQuery: '',
                                expectedJson: '',
                                requirementText: 'Satisfies mission technical requirement',
                              },
                            ],
                          }
                        : prev,
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Evaluation Test
                </button>
              </div>

              {editEvalConfig.submissionTests.map((t, idx) => (
                <div
                  key={t.id}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={t.label}
                      onChange={(e) =>
                        setEditEvalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                submissionTests: prev.submissionTests.map((x, i) =>
                                  i === idx ? { ...x, label: e.target.value } : x,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Test label"
                      className="flex-1 min-w-[180px] px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    />
                    <select
                      value={t.kind}
                      onChange={(e) =>
                        setEditEvalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                submissionTests: prev.submissionTests.map((x, i) =>
                                  i === idx
                                    ? { ...x, kind: e.target.value as MissionRuntimeTestSpec['kind'] }
                                    : x,
                                ),
                              }
                            : prev,
                        )
                      }
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]"
                    >
                      <option value="javascript">javascript</option>
                      <option value="python">python</option>
                      <option value="sql">sql</option>
                      <option value="html_css">html_css</option>
                    </select>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.isHidden}
                        onChange={(e) =>
                          setEditEvalConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  submissionTests: prev.submissionTests.map((x, i) =>
                                    i === idx ? { ...x, isHidden: e.target.checked } : x,
                                  ),
                                }
                              : prev,
                          )
                        }
                      />
                      Hidden
                    </label>
                    <button
                      onClick={() =>
                        setEditEvalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                submissionTests: prev.submissionTests.filter((_, i) => i !== idx),
                              }
                            : prev,
                        )
                      }
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <textarea
                      rows={2}
                      value={t.driverOrQuery}
                      onChange={(e) =>
                        setEditEvalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                submissionTests: prev.submissionTests.map((x, i) =>
                                  i === idx ? { ...x, driverOrQuery: e.target.value } : x,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Driver expression / Python assert expr / SQL test query"
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                    />
                    <input
                      value={
                        typeof t.expectedJson === 'string'
                          ? t.expectedJson
                          : JSON.stringify(t.expectedJson ?? '')
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        let parsed: unknown = raw;
                        try {
                          parsed = JSON.parse(raw);
                        } catch {
                          parsed = raw;
                        }
                        setEditEvalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                submissionTests: prev.submissionTests.map((x, i) =>
                                  i === idx ? { ...x, expectedJson: parsed } : x,
                                ),
                              }
                            : prev,
                        );
                      }}
                      placeholder="Expected JSON or string value"
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filter & Catalog Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filter missions by ID, title, category..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Status ({missions.length})</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredMissions.map((m) => (
            <div
              key={m.id}
              className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`font-semibold uppercase font-mono ${
                      m.status === 'published'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : m.status === 'archived'
                          ? 'text-slate-500'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {m.status}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">
                    {m.category} · {m.difficulty} · {m.language} · +{m.xpReward} XP
                  </span>
                  {m.isFeatured && (
                    <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                      <Sparkles className="w-3 h-3" />
                      Featured
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {m.title}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  ID: {m.id} · {m.checkpoints?.length || 0} checkpoints · {m.starterFiles?.length || 0} files
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => openMissionDetails(m.id)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                >
                  Preview
                </button>
                <button
                  onClick={() => handleEditMission(m)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  Edit Mission
                </button>
                {m.status !== 'published' && (
                  <button
                    onClick={() => handleQuickStatus(m, 'published')}
                    disabled={actionBusyId === m.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Publish
                  </button>
                )}
                {m.status === 'published' && (
                  <button
                    onClick={() => handleQuickStatus(m, 'draft')}
                    disabled={actionBusyId === m.id}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-400 dark:border-amber-700 text-amber-600 dark:text-amber-400 text-xs font-medium cursor-pointer"
                  >
                    Unpublish
                  </button>
                )}
                {m.status !== 'archived' && (
                  <button
                    onClick={() => handleQuickStatus(m, 'archived')}
                    disabled={actionBusyId === m.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive
                  </button>
                )}
                {m.status === 'draft' && (
                  <button
                    onClick={() => handleDeleteDraft(m)}
                    disabled={actionBusyId === m.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Admin Audit Trail */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Admin Mission Audit Logs
          </h3>
        </div>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-slate-500">No admin mutation audit events recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2 flex items-center justify-between gap-4">
                <span className="font-mono text-slate-800 dark:text-slate-200">{log.action}</span>
                <span className="font-mono text-slate-500 truncate">{log.targetPath}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
