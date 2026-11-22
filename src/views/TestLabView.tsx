import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileCode2,
  FlaskConical,
  History,
  Layers,
  LifeBuoy,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  TESTLAB_LANGUAGES,
  fileMatchesTestLabLanguage,
  getTestLabLanguageSpec,
  normalizeSelectableTestLabLanguage,
  type TestLabLanguageId,
} from '../data/testLabLanguages';
import { addProjectFile, getProjectFiles } from '../services/dataService';
import {
  askTestLabAssistant,
  deleteTestSuite,
  executeAndRecordTestSuite,
  generateTestsViaApi,
  listTestRunsForUser,
  listTestSuitesForUser,
  saveTestSuite,
} from '../services/testLabService';
import {
  downloadTextArtifact,
  formatTestRunMarkdown,
  redactSensitiveText,
  slugifyArtifactName,
} from '../utils/reportExporters';
import type {
  Project,
  ProjectFile,
  TestCaseItem,
  TestCaseResult,
  TestRunSession,
  TestSuite,
  TestType,
} from '../types/mideocode';

type TestLabTab = 'dashboard' | 'generate' | 'suites' | 'results' | 'history';

const TEST_TYPES: { id: TestType; label: string }[] = [
  { id: 'unit', label: 'Unit' },
  { id: 'integration', label: 'Integration' },
  { id: 'functional', label: 'Functional' },
  { id: 'api', label: 'API' },
  { id: 'regression', label: 'Regression' },
  { id: 'component', label: 'Component' },
  { id: 'edge_case', label: 'Edge-Case' },
];

function formatStatusLabel(status: TestCaseResult['status']): string {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'running') return 'Running';
  return 'Error';
}

export function TestLabView() {
  const {
    firebaseUser,
    accessibleProjects,
    activeIdeProjectId,
    testLabLaunch,
    clearTestLabLaunch,
    askAi,
    openRescueForProject,
    setActiveView,
    notify,
  } = useMideo();

  const [tab, setTab] = useState<TestLabTab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    testLabLaunch?.projectId || activeIdeProjectId || accessibleProjects[0]?.id || '',
  );
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [runs, setRuns] = useState<TestRunSession[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Target language (9 supported languages)
  const [selectedLanguage, setSelectedLanguage] = useState<TestLabLanguageId>('javascript');
  const [addingStarterFile, setAddingStarterFile] = useState(false);

  // Inline editing in Suites tab
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
  const [editingCases, setEditingCases] = useState<TestCaseItem[]>([]);
  const [savingSuiteEdit, setSavingSuiteEdit] = useState(false);

  // Generation & Review Draft state
  const [genTypes, setGenTypes] = useState<TestType[]>(['unit', 'edge_case']);
  const [genFocusPrompt, setGenFocusPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftFramework, setDraftFramework] = useState('');
  const [draftCases, setDraftCases] = useState<TestCaseItem[]>([]);

  // Execution & Results state
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');
  const [executingSuiteId, setExecutingSuiteId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string>('');
  const [selectedResultCaseId, setSelectedResultCaseId] = useState<string | null>(null);

  // AI Assistant state
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);

  // Compare runs state
  const [compareBaseRunId, setCompareBaseRunId] = useState<string>('');
  const [compareTargetRunId, setCompareTargetRunId] = useState<string>('');

  // Confirm delete suite modal
  const [confirmDeleteSuite, setConfirmDeleteSuite] = useState<TestSuite | null>(null);

  useEffect(() => {
    if (testLabLaunch) {
      setSelectedProjectId(testLabLaunch.projectId);
      if (testLabLaunch.initialTab) setTab(testLabLaunch.initialTab);
      clearTestLabLaunch();
    }
  }, [testLabLaunch, clearTestLabLaunch]);

  useEffect(() => {
    if (!selectedProjectId && accessibleProjects.length > 0) {
      setSelectedProjectId(activeIdeProjectId || accessibleProjects[0].id);
    }
  }, [accessibleProjects, activeIdeProjectId, selectedProjectId]);

  const activeProject: Project | undefined =
    accessibleProjects.find((p) => p.id === selectedProjectId) || accessibleProjects[0];

  const loadLabRecords = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingData(true);
    setLoadError(null);
    try {
      const [loadedSuites, loadedRuns] = await Promise.all([
        listTestSuitesForUser(firebaseUser.uid),
        listTestRunsForUser(firebaseUser.uid),
      ]);
      const sortedRuns = [...loadedRuns].sort((a, b) => {
        const ams = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
        const bms = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
        return bms - ams;
      });
      setSuites(loadedSuites);
      setRuns(sortedRuns);
      if (sortedRuns[0] && !activeRunId) {
        setActiveRunId(sortedRuns[0].id);
      }
      if (sortedRuns.length >= 2) {
        setCompareTargetRunId(sortedRuns[0].id);
        setCompareBaseRunId(sortedRuns[1].id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load TestLab records.');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, activeRunId]);

  useEffect(() => {
    loadLabRecords();
  }, [loadLabRecords]);

  useEffect(() => {
    if (!activeProject) {
      setProjectFiles([]);
      return;
    }
    getProjectFiles(activeProject.id)
      .then((files) => {
        setProjectFiles(files);
        setSelectedLanguage(normalizeSelectableTestLabLanguage(activeProject.language, files));
      })
      .catch(() => setProjectFiles([]));
  }, [activeProject?.id, activeProject?.language]);

  const activeLangSpec = useMemo(
    () => getTestLabLanguageSpec(selectedLanguage),
    [selectedLanguage],
  );

  const matchingLangFiles = useMemo(
    () => projectFiles.filter((f) => fileMatchesTestLabLanguage(f, selectedLanguage)),
    [projectFiles, selectedLanguage],
  );

  const projectSuites = useMemo(
    () => (activeProject ? suites.filter((s) => s.projectId === activeProject.id) : suites),
    [suites, activeProject],
  );

  useEffect(() => {
    if (projectSuites.length > 0 && !projectSuites.some((s) => s.id === activeSuiteId)) {
      setActiveSuiteId(projectSuites[0].id);
    }
  }, [projectSuites, activeSuiteId]);

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) || runs[0] || null,
    [runs, activeRunId],
  );

  // Real aggregated dashboard stats from persisted TestRunSession records
  const dashboardStats = useMemo(() => {
    const totalExecuted = runs.reduce((s, r) => s + (r.totalTests || 0), 0);
    const passed = runs.reduce((s, r) => s + (r.passedTests || 0), 0);
    const failed = runs.reduce((s, r) => s + (r.failedTests || 0) + (r.errorTests || 0), 0);
    const skipped = runs.reduce((s, r) => s + (r.skippedTests || 0), 0);
    const evaluated = passed + failed;
    const successPct = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;
    return { totalExecuted, passed, failed, skipped, successPct };
  }, [runs]);

  const handleAddStarterFileToProject = async () => {
    if (!firebaseUser || !activeProject) return;
    setAddingStarterFile(true);
    try {
      const created = await addProjectFile(firebaseUser.uid, activeProject.id, {
        name: activeLangSpec.starterTargetFile,
        folder: '',
        language: activeLangSpec.id,
        content: activeLangSpec.starterProjectContent,
        visibility: activeProject.visibility || 'private',
      });
      setProjectFiles((prev) => [...prev, created]);
      notify('success', `Added starter file "${created.name}" (${activeLangSpec.label}) to ${activeProject.title}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to add starter file to project.');
    } finally {
      setAddingStarterFile(false);
    }
  };

  const handleGenerateTests = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) {
      notify('error', 'Select a project before generating tests.');
      return;
    }
    if (genTypes.length === 0) {
      notify('error', 'Choose at least one test category.');
      return;
    }
    const candidateFiles: ProjectFile[] =
      matchingLangFiles.length > 0
        ? matchingLangFiles
        : projectFiles.length > 0
          ? projectFiles
          : [
              {
                id: 'virtual_starter',
                projectId: activeProject.id,
                ownerId: firebaseUser?.uid || activeProject.ownerId,
                name: activeLangSpec.starterTargetFile,
                folder: '',
                language: activeLangSpec.id,
                visibility: activeProject.visibility || 'private',
                content: activeLangSpec.starterProjectContent,
                updatedAt: new Date().toISOString(),
              },
            ];

    setGenerating(true);
    try {
      const res = await generateTestsViaApi({
        projectTitle: activeProject.title,
        language: selectedLanguage,
        files: candidateFiles,
        testTypes: genTypes,
        focusPrompt: genFocusPrompt.trim() || undefined,
      });
      setDraftTitle(res.suiteTitle);
      setDraftFramework(res.framework || activeLangSpec.framework);
      setDraftCases(res.cases);
      notify('success', `Generated ${res.cases.length} ${activeLangSpec.label} test(s). Review and approve before saving.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Test generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveAndSaveDraft = async () => {
    if (!firebaseUser || !activeProject || draftCases.length === 0) return;
    try {
      const saved = await saveTestSuite(firebaseUser.uid, activeProject, {
        title: draftTitle || `${activeProject.title} (${activeLangSpec.label}) Suite`,
        language: selectedLanguage,
        framework: draftFramework || activeLangSpec.framework,
        testType: genTypes[0] || 'unit',
        cases: draftCases,
        approved: true,
      });
      setSuites((prev) => [saved, ...prev]);
      setActiveSuiteId(saved.id);
      setDraftCases([]);
      setTab('suites');
      notify('success', `Approved and saved "${saved.title}" (${activeLangSpec.label}) to project.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save test suite.');
    }
  };

  const handleCreateBlankSuite = async (langOverride?: TestLabLanguageId) => {
    if (!firebaseUser || !activeProject) return;
    const spec = getTestLabLanguageSpec(langOverride || selectedLanguage);
    const matchingFile = projectFiles.find((f) => fileMatchesTestLabLanguage(f, spec.id));
    const starterCase: TestCaseItem = {
      id: `tc_${Date.now()}`,
      name: spec.starterTestName,
      description: `Verify ${spec.label} behavior using ${spec.runtimeLabel}.`,
      testType: 'unit',
      targetFile: matchingFile?.name || spec.starterTargetFile,
      code: spec.starterTestCode,
      expectedResult: spec.starterExpected,
      enabled: true,
      aiGenerated: false,
    };
    try {
      const saved = await saveTestSuite(firebaseUser.uid, activeProject, {
        title: `${activeProject.title} · ${spec.label} Suite`,
        language: spec.id,
        framework: spec.framework,
        testType: 'unit',
        cases: [starterCase],
        approved: true,
      });
      setSuites((prev) => [saved, ...prev]);
      setActiveSuiteId(saved.id);
      setEditingSuiteId(saved.id);
      setEditingCases(saved.cases);
      setTab('suites');
      notify('success', `Created ${spec.label} test suite.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create test suite.');
    }
  };

  const handleSaveSuiteCases = async (suite: TestSuite) => {
    if (!firebaseUser || !activeProject) return;
    setSavingSuiteEdit(true);
    try {
      const updated = await saveTestSuite(firebaseUser.uid, activeProject, {
        id: suite.id,
        title: suite.title,
        language: suite.language,
        framework: suite.framework,
        testType: suite.testType,
        cases: editingCases,
        approved: suite.approved,
      });
      setSuites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSuiteId(null);
      setEditingCases([]);
      notify('success', `Updated test cases in "${updated.title}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update suite test cases.');
    } finally {
      setSavingSuiteEdit(false);
    }
  };

  const handleRunSuite = async (suite: TestSuite) => {
    if (!firebaseUser) return;
    const proj = accessibleProjects.find((p) => p.id === suite.projectId) || activeProject;
    if (!proj) {
      notify('error', 'Linked project not found.');
      return;
    }
    setExecutingSuiteId(suite.id);
    try {
      const files = proj.id === activeProject?.id ? projectFiles : await getProjectFiles(proj.id);
      const run = await executeAndRecordTestSuite(firebaseUser.uid, proj, suite, files);
      setRuns((prev) => [run, ...prev]);
      setActiveRunId(run.id);
      setSelectedResultCaseId(run.results.find((r) => r.status !== 'passed')?.caseId || run.results[0]?.caseId || null);
      setTab('results');
      notify(
        run.status === 'passed' ? 'success' : 'info',
        `Test run finished: ${run.passedTests}/${run.totalTests} passed (${run.durationMs}ms).`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Isolated test execution failed.');
    } finally {
      setExecutingSuiteId(null);
    }
  };

  const handleAskAssistant = async (questionOverride?: string) => {
    const q = (questionOverride ?? assistantQuestion).trim();
    if (!q || !activeProject) return;
    setAssistantLoading(true);
    try {
      const failed = activeRun?.results.filter((r) => r.status === 'failed' || r.status === 'error') || [];
      const reply = await askTestLabAssistant({
        question: q,
        projectTitle: activeProject.title,
        language: activeProject.language,
        files: projectFiles,
        failedResults: failed,
        coverage: activeRun?.coverage,
      });
      setAssistantReply(reply);
      if (!questionOverride) setAssistantQuestion('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'TestLab Assistant error.');
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleDeleteSuiteConfirmed = async () => {
    if (!confirmDeleteSuite) return;
    try {
      await deleteTestSuite(confirmDeleteSuite.id);
      setSuites((prev) => prev.filter((s) => s.id !== confirmDeleteSuite.id));
      setConfirmDeleteSuite(null);
      notify('info', 'Test suite deleted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to delete suite.');
    }
  };

  const comparisonDiff = useMemo(() => {
    const base = runs.find((r) => r.id === compareBaseRunId);
    const target = runs.find((r) => r.id === compareTargetRunId);
    if (!base || !target) return null;
    const baseMap = new Map(base.results.map((r) => [r.name, r]));
    const rows = target.results.map((tr) => {
      const br = baseMap.get(tr.name);
      const change = !br
        ? 'new'
        : br.status !== 'passed' && tr.status === 'passed'
          ? 'fixed'
          : br.status === 'passed' && tr.status !== 'passed'
            ? 'regressed'
            : 'unchanged';
      return { name: tr.name, baseStatus: br?.status || null, targetStatus: tr.status, change };
    });
    return { base, target, rows };
  }, [runs, compareBaseRunId, compareTargetRunId]);

  const inspectedResult =
    activeRun?.results.find((r) => r.caseId === selectedResultCaseId) ||
    activeRun?.results[0] ||
    null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            TestLab
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Isolated software test execution, AI test synthesis with review gates, real coverage telemetry, and failure diagnostics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {accessibleProjects.length > 0 && (
            <select
              value={activeProject?.id || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Select project for TestLab"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium max-w-[240px]"
            >
              {accessibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.language})
                </option>
              ))}
            </select>
          )}
          {activeProject && (
            <button
              type="button"
              onClick={() =>
                openRescueForProject(
                  activeProject.id,
                  activeRun && activeRun.failedTests > 0 ? 'investigate' : 'overview',
                  activeRun && activeRun.failedTests > 0
                    ? `TestLab run "${activeRun.suiteTitle}" had ${activeRun.failedTests} failing test(s). Investigate the root cause in ${activeProject.title}.`
                    : undefined,
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LifeBuoy className="w-3.5 h-3.5 text-emerald-500" />
              Rescue AI
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('generate')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Tests
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        {(
          [
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'generate', label: 'Generate & Review' },
            { id: 'suites', label: `Suites (${projectSuites.length})` },
            { id: 'results', label: 'Results & Coverage' },
            { id: 'history', label: `History & Compare (${runs.length})` },
          ] as { id: TestLabTab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              tab === item.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="p-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadLabRecords}
            className="px-3 py-1.5 rounded-lg border border-red-400 dark:border-red-700 font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* DASHBOARD TAB */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-2xl">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Isolated Verification Across 9 Programming Languages
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Test projects across JavaScript, Python, SQL, C++, C#, Java, Go, Rust, and PHP (with full HTML/CSS/TypeScript web support). Execution uses isolated Node VM, esbuild, Python 3, in-memory SQLite, g++ C++17 native compilation, and structural analyzers—never risking the host application.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTab('generate')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Quick-Start AI Tests
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateBlankSuite()}
                  disabled={!activeProject}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New {activeLangSpec.label} Suite
                </button>
              </div>
            </div>

            {/* Quick 9-Language Matrix */}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              {TESTLAB_LANGUAGES.map((lang) => {
                const isSelected = selectedLanguage === lang.id;
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.id)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600/10 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-bold whitespace-nowrap">{lang.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{lang.extension}</div>
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="text-slate-900 dark:text-white">{activeLangSpec.label} Runner:</strong>{' '}
                {activeLangSpec.runtimeLabel} — {activeLangSpec.runnerNote}
              </span>
              {activeProject && matchingLangFiles.length === 0 && (
                <button
                  type="button"
                  onClick={handleAddStarterFileToProject}
                  disabled={addingStarterFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-500/10 whitespace-nowrap cursor-pointer"
                >
                  {addingStarterFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add {activeLangSpec.starterTargetFile} to Project
                </button>
              )}
            </div>
          </div>

          {/* 5 Real Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Tests Executed</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {dashboardStats.totalExecuted}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">{runs.length} sessions</div>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Passed</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {dashboardStats.passed}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Verified passes</div>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Failed / Error</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                {dashboardStats.failed}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Actionable failures</div>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Skipped</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {dashboardStats.skipped}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Disabled cases</div>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Success Rate</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                {dashboardStats.successPct}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Across executed tests</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Test Sessions */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Recent Test Sessions
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('history')}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View All History
                </button>
              </div>
              {loadingData ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading test sessions...
                </div>
              ) : runs.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg space-y-3">
                  <p className="text-xs text-slate-500">
                    No test sessions executed yet. Generate or write a test suite to run your first check.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('generate')}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Generate First Suite
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {runs.slice(0, 6).map((run) => (
                    <div
                      key={run.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                          {run.status === 'passed' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <span className="truncate">{run.suiteTitle}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {run.projectTitle} · {run.language} · {run.passedTests}/{run.totalTests} passed · {run.durationMs}ms
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRunId(run.id);
                          setTab('results');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-blue-500 shrink-0 cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Testing Activity */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Project Testing Status
              </h2>
              {accessibleProjects.length === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-xs text-slate-500">
                    Create a workspace in Mideo Projects or Mideo IDE to start testing your code.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveView('projects')}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Open Projects
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {accessibleProjects.slice(0, 6).map((proj) => {
                    const pRuns = runs.filter((r) => r.projectId === proj.id);
                    const pSuites = suites.filter((s) => s.projectId === proj.id);
                    const latest = pRuns[0];
                    return (
                      <div key={proj.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {proj.title}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            {pSuites.length} suites · {pRuns.length} runs
                            {latest ? ` · Last: ${latest.passedTests}/${latest.totalTests} passed` : ' · Not tested yet'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setTab(pSuites.length > 0 ? 'suites' : 'generate');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-blue-500 shrink-0 cursor-pointer"
                        >
                          {pSuites.length > 0 ? 'Run' : 'Setup'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GENERATE & REVIEW TAB */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateTests}
            className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5 h-fit"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                AI Test Generator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Inspects {activeProject?.title || 'your project'} and synthesizes executable {activeLangSpec.label} assertions for review before saving.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Programming Language (9 Supported)
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as TestLabLanguageId)}
                aria-label="Target programming language"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
              >
                {TESTLAB_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label} ({lang.extension}) — {lang.runtimeLabel}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">{activeLangSpec.runnerNote}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Test Categories
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TEST_TYPES.map((tt) => {
                  const selected = genTypes.includes(tt.id);
                  return (
                    <button
                      key={tt.id}
                      type="button"
                      onClick={() =>
                        setGenTypes((prev) =>
                          prev.includes(tt.id) ? prev.filter((x) => x !== tt.id) : [...prev, tt.id],
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Matching {activeLangSpec.label} Files ({matchingLangFiles.length})
                </label>
                {activeProject && matchingLangFiles.length === 0 && (
                  <button
                    type="button"
                    onClick={handleAddStarterFileToProject}
                    disabled={addingStarterFile}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Add {activeLangSpec.starterTargetFile}
                  </button>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] divide-y divide-slate-200 dark:divide-slate-800">
                {matchingLangFiles.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    No {activeLangSpec.extension} files in project yet. You can still generate self-contained {activeLangSpec.label} tests or add {activeLangSpec.starterTargetFile}.
                  </p>
                ) : (
                  matchingLangFiles.map((f) => (
                    <div key={f.id} className="px-3 py-1.5 flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                      <span className="text-[11px] text-slate-500">{f.language}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Optional Focus Area
              </label>
              <textarea
                rows={3}
                value={genFocusPrompt}
                onChange={(e) => setGenFocusPrompt(e.target.value)}
                placeholder="e.g., Validate null inputs, boundary arrays, SQL constraints, C++ edge cases, or DOM semantics..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={generating || !activeProject}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? `Generating ${activeLangSpec.label} Tests...` : `Generate ${activeLangSpec.label} Candidate Tests`}
            </button>
          </form>

          {/* Review & Approve Draft */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Review &amp; Approve Generated Tests
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generated cases are staged here first. Edit code or toggle cases before saving to your project.
                </p>
              </div>
              {draftCases.length > 0 && (
                <button
                  type="button"
                  onClick={handleApproveAndSaveDraft}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve &amp; Save Suite
                </button>
              )}
            </div>

            {draftCases.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg space-y-2">
                <FlaskConical className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select test categories on the left and click Generate Candidate Tests to review AI-proposed assertions.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Suite Title</label>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Target Framework</label>
                    <input
                      value={draftFramework}
                      onChange={(e) => setDraftFramework(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {draftCases.map((tc, idx) => (
                    <div
                      key={tc.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080C17] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tc.enabled}
                            onChange={(e) =>
                              setDraftCases((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)),
                              )
                            }
                          />
                          <span>{tc.name}</span>
                        </label>
                        <span className="text-[11px] text-slate-500">
                          {tc.testType} · {tc.targetFile}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">{tc.description}</p>
                      <textarea
                        rows={4}
                        value={tc.code}
                        onChange={(e) =>
                          setDraftCases((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)),
                          )
                        }
                        className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] font-mono text-[11px] text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUITES & EXECUTION TAB */}
      {tab === 'suites' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Saved Suites for {activeProject?.title || 'Project'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as TestLabLanguageId)}
                aria-label="Choose language for new suite"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium"
              >
                {TESTLAB_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label} ({lang.extension})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleCreateBlankSuite()}
                disabled={!activeProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add {activeLangSpec.label} Suite
              </button>
            </div>
          </div>

          {projectSuites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] p-12 text-center space-y-3">
              <p className="text-sm text-slate-500">
                No saved test suites for this project yet. Pick any of the 9 languages above to create a custom suite or generate tests with AI.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCreateBlankSuite()}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Create {activeLangSpec.label} Starter Suite
                </button>
                <button
                  type="button"
                  onClick={() => setTab('generate')}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Generate Tests with AI
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projectSuites.map((suite) => {
                const isRunning = executingSuiteId === suite.id;
                const isEditing = editingSuiteId === suite.id;
                const suiteCases = isEditing ? editingCases : suite.cases;
                const enabledCount = suiteCases.filter((c) => c.enabled !== false).length;
                const suiteSpec = getTestLabLanguageSpec(suite.language);
                return (
                  <div
                    key={suite.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] text-slate-500">
                          {suiteSpec.label} · {suite.framework} · {suite.testType}
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {suite.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingSuiteId(null);
                              setEditingCases([]);
                            } else {
                              setEditingSuiteId(suite.id);
                              setEditingCases(suite.cases.map((c) => ({ ...c })));
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-medium hover:border-blue-500 cursor-pointer"
                        >
                          {isEditing ? 'Cancel Edit' : 'Edit Cases'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSuite(suite)}
                          aria-label={`Delete ${suite.title}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 max-h-80 overflow-y-auto border-t border-b border-slate-200 dark:border-slate-800 py-3 pr-1">
                        {editingCases.map((tc, idx) => (
                          <div
                            key={tc.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={tc.enabled !== false}
                                onChange={(e) =>
                                  setEditingCases((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)),
                                  )
                                }
                              />
                              <input
                                value={tc.name}
                                onChange={(e) =>
                                  setEditingCases((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                                  )
                                }
                                placeholder="Test case name"
                                className="flex-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium"
                              />
                              <input
                                value={tc.targetFile}
                                onChange={(e) =>
                                  setEditingCases((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, targetFile: e.target.value } : x)),
                                  )
                                }
                                placeholder={suiteSpec.starterTargetFile}
                                className="w-28 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] font-mono text-[11px]"
                              />
                            </div>
                            <textarea
                              rows={3}
                              value={tc.code}
                              onChange={(e) =>
                                setEditingCases((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)),
                                )
                              }
                              className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] font-mono text-[11px]"
                            />
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingCases((prev) => [
                                ...prev,
                                {
                                  id: `tc_${Date.now()}_${prev.length}`,
                                  name: `${suiteSpec.label} Case ${prev.length + 1}`,
                                  description: `Verify ${suiteSpec.label} behavior`,
                                  testType: suite.testType,
                                  targetFile: suiteSpec.starterTargetFile,
                                  code: suiteSpec.starterTestCode,
                                  expectedResult: suiteSpec.starterExpected,
                                  enabled: true,
                                  aiGenerated: false,
                                },
                              ])
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Add Case
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveSuiteCases(suite)}
                            disabled={savingSuiteEdit}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {savingSuiteEdit ? 'Saving...' : 'Save Cases'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto border-t border-b border-slate-200 dark:border-slate-800 py-2.5">
                        {suite.cases.map((tc) => (
                          <div key={tc.id} className="flex items-center justify-between text-xs">
                            <span className="truncate text-slate-700 dark:text-slate-300">
                              {tc.enabled === false ? '[Skipped] ' : ''}
                              {tc.name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 shrink-0 ml-2">
                              {tc.targetFile}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {enabledCount} active / {suiteCases.length} total cases
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRunSuite(suite)}
                        disabled={Boolean(executingSuiteId) || isEditing}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        {isRunning ? 'Executing in Sandbox...' : 'Run Suite'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RESULTS, COVERAGE & AI TESTING ASSISTANT TAB */}
      {tab === 'results' && (
        <div className="space-y-6">
          {!activeRun ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center space-y-3">
              <p className="text-sm text-slate-500">Run a test suite first to inspect detailed execution results and coverage.</p>
              <button
                type="button"
                onClick={() => setTab('suites')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Go to Test Suites
              </button>
            </div>
          ) : (
            <>
              {/* Run Summary Header */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">
                    {activeRun.projectTitle} · {activeRun.language} · {activeRun.testType}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {activeRun.suiteTitle}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {activeRun.passedTests} Passed
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {activeRun.failedTests + activeRun.errorTests} Failed/Error
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeRun.skippedTests} Skipped</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {activeRun.durationMs}ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeRun.id}
                    onChange={(e) => setActiveRunId(e.target.value)}
                    aria-label="Select run session"
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.suiteTitle} ({r.passedTests}/{r.totalTests})
                      </option>
                    ))}
                  </select>
                  {suites.find((s) => s.id === activeRun.suiteId) && (
                    <button
                      type="button"
                      onClick={() => {
                        const s = suites.find((x) => x.id === activeRun.suiteId);
                        if (s) handleRunSuite(s);
                      }}
                      disabled={Boolean(executingSuiteId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Rerun
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const md = formatTestRunMarkdown(activeRun);
                      const slug = slugifyArtifactName(activeRun.suiteTitle, 'test-run');
                      downloadTextArtifact(`${slug}-report.md`, md, 'text/markdown');
                      notify('success', 'Downloaded TestLab report (.md).');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .md
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const safeRun = {
                        ...activeRun,
                        results: activeRun.results.map((r) => ({
                          ...r,
                          actualResult: redactSensitiveText(r.actualResult),
                          failureMessage: r.failureMessage ? redactSensitiveText(r.failureMessage) : undefined,
                        })),
                      };
                      const slug = slugifyArtifactName(activeRun.suiteTitle, 'test-run');
                      downloadTextArtifact(`${slug}-report.json`, JSON.stringify(safeRun, null, 2), 'application/json');
                      notify('success', 'Downloaded TestLab report (.json).');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .json
                  </button>
                </div>
              </div>

              {/* Coverage Section */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" />
                    Code Coverage
                  </h3>
                  {!activeRun.coverage.available && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Coverage unavailable
                    </span>
                  )}
                </div>

                {!activeRun.coverage.available ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {activeRun.coverage.reason ||
                      'Coverage instrumentation is unavailable for this language or test mode.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C17]">
                        <div className="text-[11px] text-slate-500">Line Coverage</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {activeRun.coverage.linePct ?? 0}%
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C17]">
                        <div className="text-[11px] text-slate-500">Statement Coverage</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {activeRun.coverage.statementPct ?? 0}%
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C17]">
                        <div className="text-[11px] text-slate-500">Function Coverage</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {activeRun.coverage.functionPct ?? 0}%
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C17]">
                        <div className="text-[11px] text-slate-500">Branch Coverage</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {activeRun.coverage.branchPct ?? 0}%
                        </div>
                      </div>
                    </div>

                    {activeRun.coverage.fileBreakdown && activeRun.coverage.fileBreakdown.length > 0 && (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                        {activeRun.coverage.fileBreakdown.map((fb) => (
                          <div key={fb.file} className="px-3.5 py-2 flex items-center justify-between text-xs">
                            <span className="font-mono text-slate-700 dark:text-slate-300">{fb.file}</span>
                            <span className="font-mono tabular-nums text-slate-500">
                              {fb.coveredLines}/{fb.totalLines} lines ({fb.linePct}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Split: Test Cases List & Case Failure Inspector + AI Assistant */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Test Case Results ({activeRun.results.length})
                  </h3>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
                    {activeRun.results.map((r) => (
                      <button
                        key={r.caseId}
                        type="button"
                        onClick={() => setSelectedResultCaseId(r.caseId)}
                        className={`w-full py-3 px-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer ${
                          inspectedResult?.caseId === r.caseId ? 'bg-blue-500/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.status === 'passed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : r.status === 'skipped' ? (
                              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {r.name}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] font-mono tabular-nums shrink-0 ${
                              r.status === 'passed'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : r.status === 'skipped'
                                  ? 'text-slate-500'
                                  : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {formatStatusLabel(r.status)} · {r.durationMs}ms
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 truncate">
                          {r.testType} · {r.fileRef || 'project'}
                          {r.lineRef ? `:${r.lineRef}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Failure Inspector & Cross-System Handoffs */}
                <div className="lg:col-span-6 space-y-5">
                  {inspectedResult && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500">
                            {formatStatusLabel(inspectedResult.status)} · {inspectedResult.testType} · {inspectedResult.durationMs}ms
                          </div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                            {inspectedResult.name}
                          </h3>
                        </div>
                        {inspectedResult.fileRef && (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500">
                            <FileCode2 className="w-3.5 h-3.5" />
                            {inspectedResult.fileRef}
                            {inspectedResult.lineRef ? `:${inspectedResult.lineRef}` : ''}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {inspectedResult.description}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                          <div className="text-[11px] font-semibold text-slate-500 mb-1">Expected</div>
                          <div className="font-mono text-slate-800 dark:text-slate-200 break-words">
                            {inspectedResult.expectedResult}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                          <div className="text-[11px] font-semibold text-slate-500 mb-1">Actual</div>
                          <div className="font-mono text-slate-800 dark:text-slate-200 break-words">
                            {inspectedResult.actualResult}
                          </div>
                        </div>
                      </div>

                      {inspectedResult.failureMessage && (
                        <div className="p-3 rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap">
                          {inspectedResult.failureMessage}
                        </div>
                      )}

                      {/* Cross-system integrations: Debug, Review, Build */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            askAi({
                              mode: 'debug',
                              prompt: `Diagnose why the test "${inspectedResult.name}" failed: ${inspectedResult.failureMessage || inspectedResult.actualResult}`,
                              context: {
                                filename: inspectedResult.fileRef || projectFiles[0]?.name,
                                language: activeRun.language,
                                selectedCode: projectFiles.find((f) => f.name === inspectedResult.fileRef)?.content || projectFiles[0]?.content,
                                errorMessage: inspectedResult.failureMessage || inspectedResult.actualResult,
                              },
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Debug Failure
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            askAi({
                              mode: 'review',
                              prompt: `Review the implementation tested by "${inspectedResult.name}" for reliability and edge cases.`,
                              context: {
                                filename: inspectedResult.fileRef || projectFiles[0]?.name,
                                language: activeRun.language,
                                selectedCode: projectFiles.find((f) => f.name === inspectedResult.fileRef)?.content || projectFiles[0]?.content,
                              },
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Send to Review
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            askAi({
                              mode: 'build',
                              prompt: `Fix the issue surfaced by test "${inspectedResult.name}": ${inspectedResult.failureMessage || inspectedResult.actualResult}`,
                              context: {
                                filename: inspectedResult.fileRef || projectFiles[0]?.name,
                                language: activeRun.language,
                                selectedCode: projectFiles.find((f) => f.name === inspectedResult.fileRef)?.content || projectFiles[0]?.content,
                                errorMessage: inspectedResult.failureMessage,
                              },
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Fix in Build
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AI Testing Assistant */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-500" />
                        AI Testing Assistant
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAskAssistant('Why did the failed test cases fail, and what exact fix is needed?')}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] hover:border-blue-500 cursor-pointer"
                        >
                          Explain Failures
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAskAssistant('Which functions or edge cases remain uncovered?')}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] hover:border-blue-500 cursor-pointer"
                        >
                          Uncovered Gaps
                        </button>
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAskAssistant();
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={assistantQuestion}
                        onChange={(e) => setAssistantQuestion(e.target.value)}
                        placeholder="Ask about test results, coverage gaps, or edge cases..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={assistantLoading || !assistantQuestion.trim()}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {assistantLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Ask
                      </button>
                    </form>

                    {assistantReply && (
                      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {assistantReply}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* HISTORY & RUN COMPARISON TAB */}
      {tab === 'history' && (
        <div className="space-y-6">
          {runs.length >= 2 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-500" />
                  Compare Historical Runs
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={compareBaseRunId}
                    onChange={(e) => setCompareBaseRunId(e.target.value)}
                    aria-label="Baseline test run"
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        Base: {r.suiteTitle} ({r.passedTests}/{r.totalTests})
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400">vs</span>
                  <select
                    value={compareTargetRunId}
                    onChange={(e) => setCompareTargetRunId(e.target.value)}
                    aria-label="Target test run"
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        Target: {r.suiteTitle} ({r.passedTests}/{r.totalTests})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {comparisonDiff && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {comparisonDiff.rows.map((row) => (
                    <div key={row.name} className="px-3.5 py-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{row.name}</span>
                      <span
                        className={`font-mono text-[11px] ${
                          row.change === 'fixed'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : row.change === 'regressed'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {row.baseStatus || 'n/a'} → {row.targetStatus} ({row.change})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
              Recorded Test Sessions ({runs.length})
            </div>
            {runs.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">No historical runs recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {runs.map((run) => (
                  <div key={run.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {run.suiteTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {run.projectTitle} · {run.passedTests}/{run.totalTests} passed · {run.durationMs}ms
                        {run.coverage?.available ? ` · ${run.coverage.linePct}% line coverage` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRunId(run.id);
                          setTab('results');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        View Results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Suite Confirmation */}
      {confirmDeleteSuite && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Delete "{confirmDeleteSuite.title}"?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Past test run history remains stored, but this saved suite definition will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSuite(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSuiteConfirmed}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Suite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
