import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  FilePlus2,
  Flag,
  FolderOpen,
  FolderUp,
  GitBranch,
  History,
  Home,
  ImagePlus,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Microscope,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { RescueCodeDiff } from '../components/rescue/RescueCodeDiff';
import { RescueImportModal, type RescueImportModalMode } from '../components/rescue/RescueImportModal';
import {
  ALL_RESCUE_CATEGORIES,
  RescueCustomScanModal,
  RescueDocumentationTab,
  RescueFilesTab,
  RescueIntelligenceTab,
  RescueSettingsTab,
  RescueWelcomeScreen,
} from '../components/rescue/RescueWorkspacePanels';
import { ACADEMY_COURSES } from '../data/academyData';
import { DOC_ARTICLES } from '../data/docsData';
import {
  createProjectVersionSnapshot,
  createProjectWithFiles,
  forceOverwriteProjectFile,
  getProjectFiles,
  listProjectVersions,
  mergeImportedFilesIntoProject,
  restoreProjectVersionSnapshot,
  utf8ByteLength,
} from '../services/dataService';
import { listTestSuitesForUser } from '../services/testLabService';
import { logProjectActivity } from '../services/collaborationService';
import {
  RESCUE_IMPORT_ACCEPT,
  analyzeFixImpactViaApi,
  cancelScanJobViaApi,
  computeClientWorkspaceFingerprint,
  computeProjectRefreshDiff,
  deleteRescueInvestigationRecord,
  deleteRescueScanReport,
  detectImportLanguage,
  formatMediaBytes,
  getScanJobStatusViaApi,
  investigateIssueViaApi,
  listRescueFixRecords,
  listRescueInvestigationRecords,
  listUserRescueScans,
  markRescueFixRolledBack,
  prepareImportedProjectFiles,
  proposeFixViaApi,
  recordRescueFixRecord,
  saveRescueInvestigationRecord,
  saveRescueScanReport,
  scanProjectViaApi,
  sendRescueChatViaApi,
  startScanJobViaApi,
  updateRescueInvestigationStatus,
  updateRescueScanReviewState,
  verifyRescueFixViaApi,
  type ImportedFileInput,
  type NormalizedImportedFile,
} from '../services/rescueService';
import type {
  Project,
  ProjectCollaboratorRole,
  ProjectFile,
  RescueAppliedFixRecord,
  RescueChatMessage,
  RescueCustomScanConfig,
  RescueDismissedIssue,
  RescueFixProposal,
  RescueImportSummary,
  RescueInternalTab,
  RescueInvestigationRecord,
  RescueIssue,
  RescueRootCauseAnalysis,
  RescueScanJob,
  RescueScanMode,
  RescueScanReport,
  RescueSeverity,
  RescueVerificationResult,
  RescueVerificationStatus,
  TestSuite,
} from '../types/mideocode';

const RESCUE_TABS: { id: RescueInternalTab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Project Overview', icon: Activity },
  { id: 'files', label: 'Project Files', icon: FolderOpen },
  { id: 'intelligence', label: 'Intelligence', icon: Network },
  { id: 'documentation', label: 'Documentation', icon: BookOpen },
  { id: 'scanner', label: 'Project Scanner', icon: ScanSearch },
  { id: 'investigate', label: 'Error Investigation', icon: Microscope },
  { id: 'root_cause', label: 'Root Cause Analysis', icon: ShieldAlert },
  { id: 'fixes', label: 'Fix Proposals', icon: Wrench },
  { id: 'rescue_mode', label: 'Rescue Mode', icon: LifeBuoy },
  { id: 'history', label: 'Scan History', icon: History },
  { id: 'chat', label: 'Rescue Chat', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

const ACTIVE_RESCUE_JOB_STORAGE_KEY = 'mideocode_active_rescue_job';

const SEVERITY_ORDER: Record<RescueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  suggestion: 4,
};

function severityBadgeClass(severity: RescueSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
    case 'high':
      return 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30';
    case 'medium':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'low':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30';
  }
}

function verificationStatusMeta(status?: RescueVerificationStatus, passed?: boolean): {
  label: string;
  badgeClass: string;
} {
  const effective: RescueVerificationStatus =
    status || (passed ? 'VERIFIED' : 'PARTIALLY_VERIFIED');
  switch (effective) {
    case 'VERIFIED':
      return {
        label: 'VERIFIED',
        badgeClass: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
      };
    case 'PARTIALLY_VERIFIED':
      return {
        label: 'PARTIALLY VERIFIED',
        badgeClass: 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400',
      };
    case 'FAILED':
      return {
        label: 'FAILED',
        badgeClass: 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400',
      };
    default:
      return {
        label: 'NOT VERIFIED',
        badgeClass: 'bg-slate-500/15 border-slate-500/40 text-slate-600 dark:text-slate-300',
      };
  }
}

async function computeSha256HexClient(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }
  return `len_${text.length}`;
}

function getFileDisplayPath(f: { folder?: string; name: string }): string {
  return f.folder ? `${f.folder.replace(/^\/+|\/+$/g, '')}/${f.name}` : f.name;
}

function detectLanguageFromFilename(name: string): string {
  return detectImportLanguage(name);
}

function formatDateLabel(val: unknown): string {
  if (!val) return 'Just now';
  try {
    if (
      typeof val === 'object' &&
      val !== null &&
      'toDate' in val &&
      typeof (val as { toDate: () => Date }).toDate === 'function'
    ) {
      return (val as { toDate: () => Date }).toDate().toLocaleString();
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
  } catch {
    // Ignore formatting fallback
  }
  return 'Saved';
}

const STARTER_CHAT_QUESTIONS = [
  'Why is my website not loading?',
  'Why does my login button do nothing?',
  'Why is my database not connecting?',
  'Why does this component keep crashing?',
  'What happens if I change the entry file?',
];

export function ProjectRescueView() {
  const {
    firebaseUser,
    profile,
    accessibleProjects,
    activeIdeProjectId,
    setActiveIdeProjectId,
    rescueLaunch,
    clearRescueLaunch,
    setActiveView,
    openCourse,
    openDoc,
    openTestLabForProject,
    openVersionsForProject,
    openMissionDetails,
    openMissionCatalog,
    missions,
    askAi,
    refreshUserData,
    notify,
  } = useMideo();

  const [tab, setTab] = useState<RescueInternalTab>('overview');
  const [showWelcomeScreen, setShowWelcomeScreen] = useState<boolean>(
    () => !rescueLaunch && !activeIdeProjectId,
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    rescueLaunch?.projectId || activeIdeProjectId || accessibleProjects[0]?.id || '',
  );
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [currentWorkspaceFingerprint, setCurrentWorkspaceFingerprint] = useState<string>('');

  // Scan, 10-Stage Job Progress & Reports state
  const [scanMode, setScanMode] = useState<RescueScanMode>('deep');
  const [scanning, setScanning] = useState(false);
  const [activeScanJob, setActiveScanJob] = useState<RescueScanJob | null>(null);
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const [customScanConfig, setCustomScanConfig] = useState<RescueCustomScanConfig>({
    checks: ALL_RESCUE_CATEGORIES.map((c) => c.id),
    excludedPaths: [],
  });
  const [customScanModalOpen, setCustomScanModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<RescueScanReport | null>(null);
  const [scanHistory, setScanHistory] = useState<RescueScanReport[]>([]);
  const [fixHistory, setFixHistory] = useState<RescueAppliedFixRecord[]>([]);
  const [investigationHistory, setInvestigationHistory] = useState<RescueInvestigationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Issue Filtering, Review/Dismissal & Explanation Mode
  const [severityFilter, setSeverityFilter] = useState<'all' | RescueSeverity>('all');
  const [certaintyFilter, setCertaintyFilter] = useState<'all' | 'confirmed' | 'possible'>('all');
  const [explanationLevel, setExplanationLevel] = useState<'beginner' | 'developer'>('beginner');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [reviewedIssueIds, setReviewedIssueIds] = useState<string[]>([]);
  const [dismissedIssues, setDismissedIssues] = useState<RescueDismissedIssue[]>([]);
  const [hideDismissedIssues, setHideDismissedIssues] = useState(false);

  // Investigation & Root Cause state
  const [customProblemInput, setCustomProblemInput] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [issueScreenshot, setIssueScreenshot] = useState<{
    mimeType: string;
    dataBase64: string;
    name: string;
  } | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [rootCause, setRootCause] = useState<RescueRootCauseAnalysis | null>(null);

  // Fix Proposal, Inline Edit, Authorization & Verification state
  const [fixProposal, setFixProposal] = useState<RescueFixProposal | null>(null);
  const [editedProposedCode, setEditedProposedCode] = useState('');
  const [isEditingProposedCode, setIsEditingProposedCode] = useState(false);
  const [reanalyzingImpact, setReanalyzingImpact] = useState(false);
  const [proposingFix, setProposingFix] = useState(false);
  const [manualFixTargetPath, setManualFixTargetPath] = useState('');
  const [manualFixPrompt, setManualFixPrompt] = useState('');
  const [authorizeModalOpen, setAuthorizeModalOpen] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const [verificationResult, setVerificationResult] = useState<RescueVerificationResult | null>(null);
  const [lastAppliedSnapshot, setLastAppliedSnapshot] = useState<{
    versionId: string;
    versionNumber: number;
    fixRecordId: string;
    filePath: string;
  } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [linkedSuites, setLinkedSuites] = useState<TestSuite[]>([]);

  // Rescue Mode guided wizard state (1..6)
  const [rescueStep, setRescueStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [rescueSymptom, setRescueSymptom] = useState('');

  // Rescue Chat state
  const [chatMessages, setChatMessages] = useState<RescueChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  // 4-Source Import Modal, Refresh Diff & Quick Add File state
  const [importingFiles, setImportingFiles] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importModalMode, setImportModalMode] = useState<RescueImportModalMode>('zip');
  const [importModalRefresh, setImportModalRefresh] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<RescueImportSummary | null>(null);
  const [lastRefreshDiff, setLastRefreshDiff] = useState<{
    added: string[];
    modified: string[];
    removed: string[];
    unchanged: number;
  } | null>(null);
  const [importTargetMode] = useState<'new' | 'current'>('new');
  const [dragOverImport, setDragOverImport] = useState(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileFolder, setNewFileFolder] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [addingNewFile, setAddingNewFile] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextResetForProjectRef = useRef<string | null>(null);
  const pendingHistoryReportRef = useRef<RescueScanReport | null>(null);

  useEffect(() => {
    if (rescueLaunch) {
      setSelectedProjectId(rescueLaunch.projectId);
      setShowWelcomeScreen(false);
      if (rescueLaunch.initialTab) setTab(rescueLaunch.initialTab);
      if (rescueLaunch.initialPrompt) {
        setCustomProblemInput(rescueLaunch.initialPrompt);
        setRescueSymptom(rescueLaunch.initialPrompt);
      }
      clearRescueLaunch();
    }
  }, [rescueLaunch, clearRescueLaunch]);

  useEffect(() => {
    if (!selectedProjectId && accessibleProjects.length > 0) {
      setSelectedProjectId(activeIdeProjectId || accessibleProjects[0].id);
    }
  }, [accessibleProjects, activeIdeProjectId, selectedProjectId]);

  const activeProject: Project | undefined = useMemo(
    () => accessibleProjects.find((p) => p.id === selectedProjectId) || accessibleProjects[0],
    [accessibleProjects, selectedProjectId],
  );

  const myRole: ProjectCollaboratorRole = useMemo(() => {
    if (!activeProject || !firebaseUser) return 'viewer';
    if (activeProject.ownerId === firebaseUser.uid) return 'owner';
    return activeProject.collaboratorRoles?.[firebaseUser.uid] || 'viewer';
  }, [activeProject, firebaseUser]);

  const canModifyProject = myRole === 'owner' || myRole === 'editor';

  // Compute live workspace fingerprint when files load/change to detect staleness vs latest scan
  useEffect(() => {
    let active = true;
    if (files.length === 0) {
      setCurrentWorkspaceFingerprint('');
      return;
    }
    computeClientWorkspaceFingerprint(files)
      .then((fp) => {
        if (active) setCurrentWorkspaceFingerprint(fp);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [files]);

  const fingerprintStale = useMemo(() => {
    if (!activeReport?.projectFingerprint || !currentWorkspaceFingerprint) return false;
    return activeReport.projectFingerprint !== currentWorkspaceFingerprint;
  }, [activeReport?.projectFingerprint, currentWorkspaceFingerprint]);

  // Sync reviewed/dismissed issue states from activeReport
  useEffect(() => {
    setReviewedIssueIds(activeReport?.reviewedIssueIds || []);
    setDismissedIssues(activeReport?.dismissedIssues || []);
  }, [activeReport?.id, activeReport?.reviewedIssueIds, activeReport?.dismissedIssues]);

  // Sync editable proposed code when fixProposal changes
  useEffect(() => {
    setEditedProposedCode(fixProposal?.proposedCode || '');
    setIsEditingProposedCode(false);
  }, [fixProposal?.id, fixProposal?.proposedCode]);

  // Load files & TestLab suites for active project
  const refreshActiveFiles = useCallback(async () => {
    if (!activeProject || !firebaseUser) {
      setFiles([]);
      setLinkedSuites([]);
      setManualFixTargetPath('');
      return;
    }
    setLoadingFiles(true);
    try {
      const [loadedFiles, allSuites] = await Promise.all([
        getProjectFiles(activeProject.id),
        listTestSuitesForUser(firebaseUser.uid).catch(() => [] as TestSuite[]),
      ]);
      setFiles(loadedFiles);
      setLinkedSuites(allSuites.filter((s) => s.projectId === activeProject.id));
      setManualFixTargetPath((prev) => {
        if (loadedFiles.length === 0) return '';
        if (prev && loadedFiles.some((f) => getFileDisplayPath(f) === prev)) return prev;
        return getFileDisplayPath(loadedFiles[0]);
      });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load project files.');
    } finally {
      setLoadingFiles(false);
    }
  }, [activeProject, firebaseUser, notify]);

  const refreshHistory = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingHistory(true);
    try {
      const [scans, fixes, investigations] = await Promise.all([
        listUserRescueScans(firebaseUser.uid),
        listRescueFixRecords(firebaseUser.uid),
        listRescueInvestigationRecords(firebaseUser.uid).catch(() => [] as RescueInvestigationRecord[]),
      ]);
      setScanHistory(scans);
      setFixHistory(fixes);
      setInvestigationHistory(investigations);
      if (activeProject && !activeReport) {
        const latestForProj = scans.find((s) => s.projectId === activeProject.id);
        if (latestForProj) setActiveReport(latestForProj);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to load Rescue history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [firebaseUser, activeProject, activeReport, notify]);

  useEffect(() => {
    if (activeProject?.id && skipNextResetForProjectRef.current === activeProject.id) {
      skipNextResetForProjectRef.current = null;
      return;
    }
    setRootCause(null);
    setFixProposal(null);
    setVerificationResult(null);
    setLastAppliedSnapshot(null);
    setSelectedIssueId(null);
    setManualFixTargetPath('');
    setChatMessages([]);
    if (
      pendingHistoryReportRef.current &&
      pendingHistoryReportRef.current.projectId === activeProject?.id
    ) {
      setActiveReport(pendingHistoryReportRef.current);
      pendingHistoryReportRef.current = null;
    } else {
      setActiveReport(null);
    }
    refreshActiveFiles();
  }, [activeProject?.id]);

  useEffect(() => {
    refreshHistory();
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (activeProject && scanHistory.length > 0 && !activeReport) {
      const match = scanHistory.find((s) => s.projectId === activeProject.id);
      if (match) setActiveReport(match);
    }
  }, [activeProject?.id, scanHistory, activeReport]);

  const projectIssues = useMemo(() => {
    const raw = activeReport?.issues || [];
    return [...raw].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [activeReport]);

  const dismissedMap = useMemo(() => {
    const map = new Map<string, RescueDismissedIssue>();
    for (const d of dismissedIssues) map.set(d.issueId, d);
    return map;
  }, [dismissedIssues]);

  const reviewedSet = useMemo(() => new Set(reviewedIssueIds), [reviewedIssueIds]);

  const filteredIssues = useMemo(() => {
    return projectIssues.filter((issue) => {
      if (hideDismissedIssues && dismissedMap.has(issue.id)) return false;
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (certaintyFilter !== 'all' && issue.certainty !== certaintyFilter) return false;
      return true;
    });
  }, [projectIssues, hideDismissedIssues, dismissedMap, severityFilter, certaintyFilter]);

  const selectedIssue = useMemo(
    () => projectIssues.find((i) => i.id === selectedIssueId) || projectIssues[0] || null,
    [projectIssues, selectedIssueId],
  );

  // -------------------------------------------------------------------------
  // Resumable 10-Stage Scan Jobs & Polling
  // -------------------------------------------------------------------------
  const finalizeScanReport = useCallback(
    async (rawReport: RescueScanReport, uid: string): Promise<RescueScanReport> => {
      const savedReport = await saveRescueScanReport(uid, rawReport);
      setActiveReport(savedReport);
      setScanHistory((prev) => [savedReport, ...prev.filter((r) => r.id !== savedReport.id)]);
      if (savedReport.issues.length > 0) {
        setSelectedIssueId(savedReport.issues[0].id);
      } else {
        setSelectedIssueId(null);
      }
      notify(
        savedReport.issues.length === 0 ? 'success' : 'info',
        `${savedReport.scanMode.toUpperCase()} Scan complete: Health ${savedReport.healthScore}/100 · ${savedReport.confirmedCount} confirmed, ${savedReport.potentialCount} potential issues.`,
      );
      return savedReport;
    },
    [notify],
  );

  const pollJobUntilDone = useCallback(
    async (jobId: string, uid: string): Promise<RescueScanReport | null> => {
      const startedAtMs = Date.now();
      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        setScanElapsedSec(Math.round((Date.now() - startedAtMs) / 1000));
        const latestJob = await getScanJobStatusViaApi(jobId);
        setActiveScanJob(latestJob);
        if (latestJob.status === 'completed' && latestJob.report) {
          localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
          const saved = await finalizeScanReport(latestJob.report, uid);
          setActiveScanJob(null);
          setScanning(false);
          return saved;
        }
        if (latestJob.status === 'cancelled') {
          localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
          setActiveScanJob(null);
          setScanning(false);
          notify('info', 'Project scan was cancelled.');
          return null;
        }
        if (latestJob.status === 'failed') {
          localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
          setActiveScanJob(null);
          setScanning(false);
          throw new Error(latestJob.error || 'Background scan job failed.');
        }
      }
    },
    [finalizeScanReport, notify],
  );

  // Resume active background job across reloads if one is still running
  useEffect(() => {
    if (!firebaseUser) return;
    const raw = localStorage.getItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
    if (!raw) return;
    let parsed: { jobId?: string; projectId?: string } | null = null;
    try {
      parsed = JSON.parse(raw) as { jobId?: string; projectId?: string };
    } catch {
      localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
      return;
    }
    if (!parsed?.jobId) return;

    let cancelled = false;
    (async () => {
      try {
        const job = await getScanJobStatusViaApi(parsed!.jobId!);
        if (cancelled) return;
        if (job.status === 'completed' && job.report) {
          localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
          await finalizeScanReport(job.report, firebaseUser.uid);
        } else if (job.status === 'running') {
          setScanning(true);
          setActiveScanJob(job);
          if (job.projectId) {
            setSelectedProjectId(job.projectId);
            setShowWelcomeScreen(false);
          }
          await pollJobUntilDone(job.jobId, firebaseUser.uid);
        } else {
          localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
        setScanning(false);
        setActiveScanJob(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid, finalizeScanReport, pollJobUntilDone]);

  const handleCancelScanJob = async () => {
    if (!activeScanJob) return;
    try {
      await cancelScanJobViaApi(activeScanJob.jobId);
      localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
      setActiveScanJob(null);
      setScanning(false);
      notify('info', 'Scan job cancelled.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to cancel active scan job.');
    }
  };

  const runScanForWorkspace = async (
    targetProject: Project,
    workspaceFiles: ProjectFile[],
    overrideMode?: RescueScanMode,
    overrideConfig?: RescueCustomScanConfig,
  ): Promise<RescueScanReport | null> => {
    if (!firebaseUser) return null;
    if (workspaceFiles.length === 0) {
      notify('error', 'This project has no files yet. Add files or import a folder first.');
      return null;
    }
    const mode = overrideMode || scanMode;
    setScanMode(mode);
    setScanning(true);
    setScanElapsedSec(0);
    try {
      const effectiveConfig = mode === 'custom' ? overrideConfig || customScanConfig : customScanConfig.excludedPaths.length > 0 ? customScanConfig : undefined;
      const startedJob = await startScanJobViaApi({
        projectId: targetProject.id,
        projectTitle: targetProject.title,
        scanMode: mode,
        files: workspaceFiles,
        customConfig: effectiveConfig,
      });
      setActiveScanJob(startedJob);
      localStorage.setItem(
        ACTIVE_RESCUE_JOB_STORAGE_KEY,
        JSON.stringify({ jobId: startedJob.jobId, projectId: targetProject.id }),
      );
      if (startedJob.status === 'completed' && startedJob.report) {
        localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
        setActiveScanJob(null);
        setScanning(false);
        return await finalizeScanReport(startedJob.report, firebaseUser.uid);
      }
      return await pollJobUntilDone(startedJob.jobId, firebaseUser.uid);
    } catch (err) {
      localStorage.removeItem(ACTIVE_RESCUE_JOB_STORAGE_KEY);
      setActiveScanJob(null);
      setScanning(false);
      notify('error', err instanceof Error ? err.message : 'Project Rescue scan failed.');
      return null;
    }
  };

  const handleRunScan = async (overrideMode?: RescueScanMode, overrideConfig?: RescueCustomScanConfig) => {
    if (!activeProject) return null;
    return runScanForWorkspace(activeProject, files, overrideMode, overrideConfig);
  };

  const handleToggleIssueReviewed = async (issueId: string) => {
    if (!activeReport) return;
    const exists = reviewedIssueIds.includes(issueId);
    const nextReviewed = exists
      ? reviewedIssueIds.filter((id) => id !== issueId)
      : [...reviewedIssueIds, issueId];
    setReviewedIssueIds(nextReviewed);
    setActiveReport((prev) => (prev ? { ...prev, reviewedIssueIds: nextReviewed } : prev));
    setScanHistory((prev) =>
      prev.map((s) => (s.id === activeReport.id ? { ...s, reviewedIssueIds: nextReviewed } : s)),
    );
    await updateRescueScanReviewState(activeReport.id, nextReviewed, dismissedIssues).catch((err) => {
      notify('error', err instanceof Error ? err.message : 'Failed to save review marker.');
    });
  };

  const handleDismissIssue = async (
    issueId: string,
    reason: RescueDismissedIssue['reason'],
  ) => {
    if (!activeReport) return;
    const nextDismissed: RescueDismissedIssue[] = [
      ...dismissedIssues.filter((d) => d.issueId !== issueId),
      { issueId, reason, dismissedAt: new Date().toISOString() },
    ];
    setDismissedIssues(nextDismissed);
    setActiveReport((prev) => (prev ? { ...prev, dismissedIssues: nextDismissed } : prev));
    setScanHistory((prev) =>
      prev.map((s) => (s.id === activeReport.id ? { ...s, dismissedIssues: nextDismissed } : s)),
    );
    await updateRescueScanReviewState(activeReport.id, reviewedIssueIds, nextDismissed).catch(
      (err) => {
        notify('error', err instanceof Error ? err.message : 'Failed to dismiss issue.');
      },
    );
  };

  const handleReopenIssue = async (issueId: string) => {
    if (!activeReport) return;
    const nextDismissed = dismissedIssues.filter((d) => d.issueId !== issueId);
    setDismissedIssues(nextDismissed);
    setActiveReport((prev) => (prev ? { ...prev, dismissedIssues: nextDismissed } : prev));
    setScanHistory((prev) =>
      prev.map((s) => (s.id === activeReport.id ? { ...s, dismissedIssues: nextDismissed } : s)),
    );
    await updateRescueScanReviewState(activeReport.id, reviewedIssueIds, nextDismissed).catch(
      (err) => {
        notify('error', err instanceof Error ? err.message : 'Failed to re-open issue.');
      },
    );
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      notify('error', 'Upload a PNG, JPG, or WebP screenshot image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      notify('error', 'Screenshot must be 4 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setIssueScreenshot({
        mimeType: file.type,
        dataBase64: base64,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleInvestigate = async (
    issue?: RescueIssue | null,
    customProblem?: string,
    targetTab: RescueInternalTab = 'root_cause',
  ) => {
    if (!activeProject || files.length === 0) {
      notify('error', 'Select a project with files first.');
      return null;
    }
    const queryText = (customProblem ?? customProblemInput).trim();
    if (!issue && !queryText) {
      notify('error', 'Select a detected issue or describe the problem you are experiencing.');
      return null;
    }
    setInvestigating(true);
    try {
      if (issue) setSelectedIssueId(issue.id);
      const analysis = await investigateIssueViaApi({
        projectTitle: activeProject.title,
        files,
        issue: issue || null,
        userProblemDescription: queryText || undefined,
        expectedBehavior: expectedBehavior.trim() || undefined,
        actualBehavior: actualBehavior.trim() || undefined,
        screenshot: issueScreenshot
          ? { mimeType: issueScreenshot.mimeType, dataBase64: issueScreenshot.dataBase64 }
          : null,
      });
      setRootCause(analysis);
      setTab(targetTab);
      if (firebaseUser) {
        const savedInv = await saveRescueInvestigationRecord(firebaseUser.uid, {
          projectId: activeProject.id,
          projectTitle: activeProject.title,
          issueId: issue?.id,
          expectedBehavior: expectedBehavior.trim() || undefined,
          actualBehavior: actualBehavior.trim() || undefined,
          analysis,
          status: 'open',
        }).catch(() => null);
        if (savedInv) {
          setInvestigationHistory((prev) => [savedInv, ...prev.filter((i) => i.id !== savedInv.id)]);
        }
      }
      notify('success', `Root cause investigation ready (${analysis.confidence}% confidence).`);
      return analysis;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Investigation failed.');
      return null;
    } finally {
      setInvestigating(false);
    }
  };

  const handleProposeFix = async (opts?: {
    targetFilePath?: string;
    problemDescription?: string;
    rc?: RescueRootCauseAnalysis | null;
    issueId?: string;
    stayInRescueMode?: boolean;
  }) => {
    if (!activeProject || files.length === 0) return null;
    const rc = opts?.rc ?? rootCause;
    const targetPath =
      opts?.targetFilePath ||
      rc?.responsibleFile ||
      selectedIssue?.filePath ||
      manualFixTargetPath ||
      getFileDisplayPath(files[0]);
    const problemDesc =
      opts?.problemDescription ||
      rc?.problemTitle ||
      selectedIssue?.summary ||
      manualFixPrompt.trim() ||
      customProblemInput.trim();

    if (!targetPath || !problemDesc) {
      notify('error', 'Specify a target file and problem description to generate a fix.');
      return null;
    }

    setProposingFix(true);
    setVerificationResult(null);
    try {
      const proposal = await proposeFixViaApi({
        projectTitle: activeProject.title,
        files,
        targetFilePath: targetPath,
        problemDescription: problemDesc,
        rootCause: rc,
        issueId: opts?.issueId || selectedIssue?.id,
      });
      setFixProposal(proposal);
      setEditedProposedCode(proposal.proposedCode);
      setIsEditingProposedCode(false);
      if (!opts?.stayInRescueMode) {
        setTab('fixes');
      }
      notify('success', `Generated fix proposal & impact analysis for ${proposal.filePath}.`);
      return proposal;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to generate fix proposal.');
      return null;
    } finally {
      setProposingFix(false);
    }
  };

  const handleReanalyzeEditedFix = async () => {
    if (!fixProposal) return;
    setReanalyzingImpact(true);
    try {
      const nextImpact = await analyzeFixImpactViaApi({
        files,
        targetFilePath: fixProposal.filePath,
        proposedCode: editedProposedCode,
      });
      setFixProposal((prev) =>
        prev
          ? {
              ...prev,
              proposedCode: editedProposedCode,
              impact: nextImpact,
            }
          : prev,
      );
      setIsEditingProposedCode(false);
      notify(
        'success',
        `Updated impact analysis (${nextImpact.riskLevel || 'Low Risk'}) for edited code.`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not analyze edited fix impact.');
    } finally {
      setReanalyzingImpact(false);
    }
  };

  const handleAuthorizeAndApplyFix = async () => {
    if (!firebaseUser || !profile || !activeProject || !fixProposal) return;
    if (!canModifyProject) {
      notify('error', 'Read-only Viewer permission: only project Owners or Editors can apply code changes.');
      return;
    }
    const targetFile = files.find(
      (f) => getFileDisplayPath(f) === fixProposal.filePath || f.name === fixProposal.filePath,
    );
    if (!targetFile) {
      notify('error', `Could not find target file "${fixProposal.filePath}" in project.`);
      return;
    }

    // Staleness guard: prevent overwriting if the target file changed since proposal creation
    if (fixProposal.targetFileHash) {
      const liveHash = await computeSha256HexClient(targetFile.content);
      if (liveHash !== fixProposal.targetFileHash) {
        setAuthorizeModalOpen(false);
        notify(
          'error',
          `${fixProposal.filePath} changed after this fix was generated. Re-generate the fix proposal against the latest file content first.`,
        );
        return;
      }
    }

    const codeToApply = isEditingProposedCode ? editedProposedCode : fixProposal.proposedCode;
    setAuthorizeModalOpen(false);
    setApplyingFix(true);
    try {
      // 1. Create a reversible safety backup snapshot before touching any file
      const snapshot = await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        activeProject.version,
        `Rescue backup before fixing ${fixProposal.filePath}`.slice(0, 120),
        files,
        {
          ownerId: activeProject.ownerId,
          authorName: profile.displayName,
          changeType: 'ai_fix',
          aiOperation: `Pre-fix backup: ${fixProposal.problemIdentified}`.slice(0, 240),
          changedFiles: [fixProposal.filePath],
          collaboratorIds: activeProject.collaboratorIds,
        },
      );

      // 2. Apply user-approved code modification
      const updatedFiles = files.map((f) =>
        f.id === targetFile.id ? { ...f, content: codeToApply } : f,
      );
      const totalBytes = Math.min(
        5_000_000,
        updatedFiles.reduce((sum, f) => sum + utf8ByteLength(f.content), 0),
      );
      await forceOverwriteProjectFile(
        activeProject.id,
        targetFile.id,
        codeToApply,
        activeProject.version,
        totalBytes,
        { uid: firebaseUser.uid, name: profile.displayName },
      );

      // 3. Log collaboration activity if shared
      await logProjectActivity(
        activeProject.id,
        firebaseUser.uid,
        profile.displayName,
        'ai_applied',
        `Applied Project Rescue AI fix to ${fixProposal.filePath}`,
        {
          targetName: fixProposal.filePath,
          collaboratorIds: activeProject.collaboratorIds,
        },
      ).catch(() => {});

      // 4. Run real post-fix verification checks (+ TestLab suite if linked)
      const primarySuite = linkedSuites.find((s) => s.approved) || linkedSuites[0] || null;
      const verification = await verifyRescueFixViaApi({
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        files: updatedFiles,
        previousIssueIds: activeReport?.issues.map((i) => i.id) || [],
        targetFilePath: fixProposal.filePath,
        testSuite: primarySuite,
      });

      // 5. Record fix audit entry with snapshot reference for 1-click rollback
      const fixRec = await recordRescueFixRecord(firebaseUser.uid, {
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        filePath: fixProposal.filePath,
        problemIdentified: fixProposal.problemIdentified,
        snapshotVersionId: snapshot.id,
        snapshotVersionNumber: snapshot.versionNumber,
        verificationPassed: verification.passed,
        verificationStatus: verification.verificationStatus,
        verificationSummary: verification.summary,
        status: 'applied',
      });

      setFiles(updatedFiles);
      setFixProposal({ ...fixProposal, proposedCode: codeToApply, status: 'applied' });
      setVerificationResult(verification);
      setLastAppliedSnapshot({
        versionId: snapshot.id,
        versionNumber: snapshot.versionNumber,
        fixRecordId: fixRec.id,
        filePath: fixProposal.filePath,
      });
      setFixHistory((prev) => [fixRec, ...prev]);

      // Refresh workspace project version & run updated quick scan
      await refreshUserData();
      const postScanRaw = await scanProjectViaApi({
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        scanMode: 'quick',
        files: updatedFiles,
      }).catch(() => null);
      if (postScanRaw) {
        const savedPost = await saveRescueScanReport(firebaseUser.uid, postScanRaw).catch(
          () => postScanRaw,
        );
        setActiveReport(savedPost);
        setScanHistory((prev) => [savedPost, ...prev.filter((r) => r.id !== savedPost.id)]);
      }

      if (verification.passed) {
        notify('success', `Fix applied and ${verification.verificationStatus || 'VERIFIED'} on ${fixProposal.filePath}.`);
      } else {
        notify(
          'info',
          `Fix applied (${verification.verificationStatus || 'PARTIALLY_VERIFIED'}). Review verification details or rollback anytime.`,
        );
      }
      if (tab === 'rescue_mode') {
        setRescueStep(6);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to apply fix.');
    } finally {
      setApplyingFix(false);
    }
  };

  const handleRollbackFix = async (record: {
    projectId: string;
    snapshotVersionId: string;
    fixRecordId: string;
    filePath: string;
  }) => {
    if (!firebaseUser || !profile) return;
    setRollingBack(true);
    try {
      const versions = await listProjectVersions(record.projectId);
      const targetVersion = versions.find((v) => v.id === record.snapshotVersionId);
      if (!targetVersion) {
        throw new Error('Backup snapshot could not be located in Version History.');
      }
      const currentProjFiles =
        activeProject?.id === record.projectId ? files : await getProjectFiles(record.projectId);
      const restored = await restoreProjectVersionSnapshot(
        firebaseUser.uid,
        record.projectId,
        targetVersion,
        currentProjFiles,
        {
          preserveCurrentState: true,
          authorName: profile.displayName,
        },
      );
      await markRescueFixRolledBack(record.fixRecordId);
      setFixHistory((prev) =>
        prev.map((item) =>
          item.id === record.fixRecordId ? { ...item, status: 'rolled_back' } : item,
        ),
      );
      if (activeProject?.id === record.projectId) {
        setFiles(restored);
        if (fixProposal) setFixProposal({ ...fixProposal, status: 'rolled_back' });
        setVerificationResult(null);
        setLastAppliedSnapshot(null);
        const rescan = await scanProjectViaApi({
          projectId: activeProject.id,
          projectTitle: activeProject.title,
          scanMode: 'quick',
          files: restored,
        }).catch(() => null);
        if (rescan) {
          setActiveReport(rescan);
        }
      }
      await refreshUserData();
      notify('success', `Rolled back ${record.filePath} to pre-fix snapshot v${targetVersion.versionNumber}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

  const handleOpenImportModal = (mode: RescueImportModalMode = 'zip', isRefresh = false) => {
    setImportModalMode(mode);
    setImportModalRefresh(isRefresh);
    setImportModalOpen(true);
  };

  const finalizeNormalizedProjectImport = async (input: {
    files: NormalizedImportedFile[];
    summary: RescueImportSummary;
    targetMode: 'new' | 'current';
    isRefresh: boolean;
  }) => {
    if (!firebaseUser || !profile) {
      notify('error', 'Please sign in before importing project files.');
      return;
    }
    setImportingFiles(true);
    try {
      const mergeIntoExisting =
        input.targetMode === 'current' && activeProject && canModifyProject;

      if (mergeIntoExisting && activeProject) {
        const merged = await mergeImportedFilesIntoProject(
          firebaseUser.uid,
          profile.displayName,
          activeProject.id,
          files,
          input.files,
        );
        if (input.isRefresh) {
          setLastRefreshDiff(computeProjectRefreshDiff(files, merged.files));
        } else {
          setLastRefreshDiff(null);
        }
        setLastImportSummary(input.summary);
        setShowWelcomeScreen(false);
        setTab('overview');
        await refreshUserData();
        setFiles(merged.files);
        setManualFixTargetPath(merged.files[0] ? getFileDisplayPath(merged.files[0]) : '');
        setRootCause(null);
        setFixProposal(null);
        setVerificationResult(null);
        setLastAppliedSnapshot(null);
        notify(
          'success',
          `${input.isRefresh ? 'Refreshed' : 'Merged into'} "${activeProject.title}": ${merged.addedCount} added, ${merged.updatedCount} updated. Starting scan...`,
        );
        await runScanForWorkspace(activeProject, merged.files, scanMode);
        return;
      }

      const hasPy = input.files.some((f) => f.language === 'python');
      const hasTs = input.files.some((f) => f.language === 'typescript' || f.language === 'tsx');
      const hasHtml = input.files.some((f) => f.language === 'html');
      const projLang: Project['language'] = hasPy
        ? 'python'
        : hasTs
          ? 'typescript'
          : hasHtml
            ? 'web'
            : 'javascript';

      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: (input.summary.projectTitle || 'Imported Rescue Project').slice(0, 110),
        description: `Imported via ${input.summary.sourceType.toUpperCase()} (${input.files.length} files${input.summary.skippedCount ? `, ${input.summary.skippedCount} skipped` : ''}).`,
        language: projLang,
        files: input.files,
      });

      skipNextResetForProjectRef.current = created.project.id;
      setLastRefreshDiff(null);
      setLastImportSummary(input.summary);
      setShowWelcomeScreen(false);
      setTab('overview');
      await refreshUserData();
      setSelectedProjectId(created.project.id);
      setActiveIdeProjectId(created.project.id);
      setFiles(created.files);
      setManualFixTargetPath(created.files[0] ? getFileDisplayPath(created.files[0]) : '');
      setRootCause(null);
      setFixProposal(null);
      setVerificationResult(null);
      setLastAppliedSnapshot(null);
      setSelectedIssueId(null);
      setChatMessages([]);
      notify(
        'success',
        `Imported "${created.project.title}" (${created.files.length} files). Starting diagnostic scan...`,
      );
      await runScanForWorkspace(created.project, created.files, scanMode);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Project import failed.');
    } finally {
      setImportingFiles(false);
    }
  };

  const ingestImportedEntries = async (
    rawEntries: ImportedFileInput[],
    opts?: { sourceType?: 'folder' | 'files'; targetMode?: 'new' | 'current'; isRefresh?: boolean },
  ) => {
    if (!firebaseUser || !profile) {
      notify('error', 'Please sign in before importing project files.');
      return;
    }
    if (rawEntries.length === 0) return;

    const prepared = prepareImportedProjectFiles(rawEntries);
    if (prepared.files.length === 0) {
      throw new Error(
        'No supported source files (.js, .ts, .tsx, .py, .html, .css, .sql, .json, .md, etc.) were found outside ignored folders like node_modules or .git.',
      );
    }

    const langs: Record<string, number> = {};
    for (const f of prepared.files) {
      langs[f.language] = (langs[f.language] || 0) + 1;
    }

    await finalizeNormalizedProjectImport({
      files: prepared.files,
      summary: {
        sourceType: opts?.sourceType || 'folder',
        projectTitle: prepared.inferredProjectTitle,
        importedCount: prepared.files.length,
        skippedCount: prepared.skippedCount,
        totalBytes: prepared.totalBytes,
        languages: langs,
        frameworks: [],
      },
      targetMode: opts?.targetMode || importTargetMode,
      isRefresh: Boolean(opts?.isRefresh),
    });
  };

  const handleImportProjectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = '';
    if (!fileList || fileList.length === 0) return;

    const picked = Array.from(fileList);
    setImportingFiles(true);
    try {
      const entries: ImportedFileInput[] = [];
      for (const f of picked) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        // Skip huge files & known ignored directories before calling f.text() to stay instant on huge folders
        const lowerRel = rel.replace(/\\/g, '/').toLowerCase();
        if (
          lowerRel.includes('/node_modules/') ||
          lowerRel.startsWith('node_modules/') ||
          lowerRel.includes('/.git/') ||
          lowerRel.startsWith('.git/') ||
          lowerRel.includes('/dist/') ||
          lowerRel.includes('/build/') ||
          lowerRel.includes('/.next/') ||
          lowerRel.includes('/__pycache__/') ||
          f.size > 250_000
        ) {
          entries.push({ relativePath: rel, sizeBytes: f.size, text: '' });
          continue;
        }
        const text = await f.text();
        entries.push({ relativePath: rel, sizeBytes: f.size, text });
      }
      await ingestImportedEntries(entries);
    } catch (err) {
      setImportingFiles(false);
      notify('error', err instanceof Error ? err.message : 'Could not read selected files.');
    }
  };

  const readDroppedEntryRecursive = async (
    entry: FileSystemEntry,
    parentPath: string,
    collected: ImportedFileInput[],
  ): Promise<void> => {
    if (collected.length >= 160) return;
    const relPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const lowerSeg = entry.name.toLowerCase();
    if (
      entry.isDirectory &&
      ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '__pycache__', '.venv', 'venv', 'coverage'].includes(
        lowerSeg,
      )
    ) {
      return;
    }

    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      if (file.size <= 250_000) {
        const text = await file.text();
        collected.push({ relativePath: relPath, sizeBytes: file.size, text });
      } else {
        collected.push({ relativePath: relPath, sizeBytes: file.size, text: '' });
      }
      return;
    }

    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      // readEntries must be called in a loop until an empty array is returned
      const readAll = async (): Promise<FileSystemEntry[]> => {
        const all: FileSystemEntry[] = [];
        while (true) {
          const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          });
          if (!batch || batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      };
      const children = await readAll();
      for (const child of children) {
        await readDroppedEntryRecursive(child, relPath, collected);
        if (collected.length >= 160) break;
      }
    }
  };

  const handleDropImport = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverImport(false);
    if (importingFiles) return;

    const dt = e.dataTransfer;
    if (!dt) return;
    setImportingFiles(true);
    try {
      const collected: ImportedFileInput[] = [];
      const items = dt.items ? Array.from(dt.items) : [];
      const webkitEntries = items
        .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
        .filter((en): en is FileSystemEntry => en !== null);

      if (webkitEntries.length > 0) {
        for (const entry of webkitEntries) {
          await readDroppedEntryRecursive(entry, '', collected);
        }
      } else if (dt.files && dt.files.length > 0) {
        for (const f of Array.from(dt.files)) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          const text = f.size <= 250_000 ? await f.text() : '';
          collected.push({ relativePath: rel, sizeBytes: f.size, text });
        }
      }

      if (collected.length === 0) {
        notify('error', 'No readable files were detected in that drop.');
        setImportingFiles(false);
        return;
      }
      await ingestImportedEntries(collected);
    } catch (err) {
      setImportingFiles(false);
      notify('error', err instanceof Error ? err.message : 'Folder drop import failed.');
    }
  };

  const handleCreateQuickFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeProject || !canModifyProject) return;
    const cleanName = newFileName.trim().replace(/^\/+/, '');
    if (!cleanName) {
      notify('error', 'Enter a filename such as app.js or utils/helper.ts.');
      return;
    }
    setAddingNewFile(true);
    try {
      const merged = await mergeImportedFilesIntoProject(
        firebaseUser.uid,
        profile?.displayName || 'Developer',
        activeProject.id,
        files,
        [
          {
            name: cleanName.includes('/') ? cleanName.split('/').pop()! : cleanName,
            folder:
              newFileFolder.trim() ||
              (cleanName.includes('/') ? cleanName.split('/').slice(0, -1).join('/') : ''),
            language: detectLanguageFromFilename(cleanName),
            content: newFileContent,
          },
        ],
      );
      await refreshUserData();
      setFiles(merged.files);
      setShowNewFileModal(false);
      setNewFileName('');
      setNewFileFolder('');
      setNewFileContent('');
      notify('success', `Saved ${cleanName} to "${activeProject.title}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not add file to project.');
    } finally {
      setAddingNewFile(false);
    }
  };

  // MideoCode Learn / Mission Matchers for discovered issues
  const matchedLearningResource = useMemo(() => {
    const keywords = [
      ...(rootCause?.learnKeywords || []),
      selectedIssue?.learnTopic || '',
      selectedIssue?.category || '',
      selectedIssue?.filePath || '',
    ]
      .join(' ')
      .toLowerCase();

    const matchedDoc =
      DOC_ARTICLES.find(
        (d) =>
          keywords.includes(d.category.toLowerCase()) ||
          keywords.split(/\s+/).some((kw) => kw.length > 3 && d.title.toLowerCase().includes(kw)),
      ) || DOC_ARTICLES[0];

    const matchedCourse =
      ACADEMY_COURSES.find((c) => {
        const hay = `${c.title} ${c.language} ${c.overview}`.toLowerCase();
        return (
          (keywords.includes('python') && c.language === 'python') ||
          (keywords.includes('sql') && c.language === 'sql') ||
          (keywords.includes('html') && c.language === 'html') ||
          (keywords.includes('css') && c.language === 'html') ||
          ((keywords.includes('async') || keywords.includes('import') || keywords.includes('api')) &&
            c.language === 'javascript') ||
          hay.split(/\s+/).some((w) => w.length > 4 && keywords.includes(w))
        );
      }) || ACADEMY_COURSES[1];

    const matchedMission =
      missions.find(
        (m) =>
          m.status === 'published' &&
          ((keywords.includes('python') && m.language === 'python') ||
            (keywords.includes('sql') && m.language === 'sql') ||
            (keywords.includes('html') && m.language === 'web') ||
            m.requiredSkills.some((sk) => keywords.includes(sk.toLowerCase()))),
      ) || null;

    return { matchedDoc, matchedCourse, matchedMission };
  }, [rootCause, selectedIssue, missions]);

  const handleSendChat = async (questionOverride?: string) => {
    const msg = (questionOverride ?? chatInput).trim();
    if (!msg || !activeProject) return;
    if (files.length === 0) {
      notify('error', 'Load or import a project with files first so Rescue Chat has real codebase context.');
      return;
    }

    const userEntry: RescueChatMessage = {
      id: `rc_${Date.now()}_u`,
      role: 'user',
      content: msg,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...chatMessages, userEntry];
    setChatMessages(nextHistory);
    setChatInput('');
    setChatSending(true);
    try {
      const resp = await sendRescueChatViaApi({
        projectTitle: activeProject.title,
        files,
        message: msg,
        history: nextHistory,
        latestIssues: projectIssues,
      });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `rc_${Date.now()}_a`,
          role: 'assistant',
          content: resp.reply,
          citedFiles: resp.citedFiles,
          suggestedTab: resp.suggestedTab,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Rescue Chat failed.');
    } finally {
      setChatSending(false);
    }
  };

  // Rescue Mode step runner
  const handleStartRescueModeDiagnosis = async () => {
    if (!activeProject || files.length === 0) {
      notify('error', 'Select or import a project with files first.');
      return;
    }
    setRescueStep(2);
    const report = activeReport || (await handleRunScan('deep'));
    if (!report && !activeReport) {
      setRescueStep(1);
      return;
    }
    const topIssue = report?.issues[0] || selectedIssue || null;
    const rc = await handleInvestigate(
      topIssue,
      rescueSymptom.trim() || topIssue?.summary || 'Investigate why this project has errors or unexpected behavior.',
      'rescue_mode',
    );
    if (rc) {
      setRescueStep(3);
    } else {
      setRescueStep(1);
    }
  };

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOverImport) setDragOverImport(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOverImport(false);
      }}
      onDrop={handleDropImport}
    >
      {/* Top Header & Project Bar */}
      <div
        className={`rounded-xl border transition-colors bg-white dark:bg-[#0D1322] p-5 space-y-4 ${
          dragOverImport
            ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  MideoCode Project Rescue AI
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  When your project breaks, MideoCode helps you bring it back to life.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Hidden inputs for folder or multi-file import */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is standard in Chromium/WebKit browsers
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={handleImportProjectFiles}
            />
            <input
              ref={multiFileInputRef}
              type="file"
              multiple
              accept={RESCUE_IMPORT_ACCEPT}
              className="hidden"
              onChange={handleImportProjectFiles}
            />

            <button
              type="button"
              onClick={() => setShowWelcomeScreen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                showWelcomeScreen
                  ? 'border-blue-500 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-blue-500'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              Welcome
            </button>
            <button
              type="button"
              onClick={() => handleOpenImportModal('zip', false)}
              disabled={importingFiles}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600/10 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-600/20 cursor-pointer disabled:opacity-50"
            >
              {importingFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
              Import Project
            </button>
            {activeProject && canModifyProject && (
              <button
                type="button"
                onClick={() => handleOpenImportModal('zip', true)}
                disabled={importingFiles}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Project
              </button>
            )}
            {activeProject && canModifyProject && (
              <button
                type="button"
                onClick={() => setShowNewFileModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Add File
              </button>
            )}
            {activeProject && (
              <button
                type="button"
                onClick={() => setCustomScanModalOpen(true)}
                disabled={scanning || loadingFiles}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer disabled:opacity-50"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Custom Scan
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowWelcomeScreen(false);
                setTab('rescue_mode');
                setRescueStep(1);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 cursor-pointer"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              Rescue Mode
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWelcomeScreen(false);
                handleRunScan();
              }}
              disabled={scanning || loadingFiles || !activeProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
              {scanning ? 'Scanning Project...' : 'Scan Project'}
            </button>
          </div>
        </div>

        {dragOverImport && (
          <div className="p-3 rounded-lg border border-dashed border-blue-500 bg-blue-500/10 flex items-center justify-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <UploadCloud className="w-4 h-4" />
            Drop any project folder or code files here to import &amp; scan automatically
          </div>
        )}

        {/* Active Project Selector & Workspace Links */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setActiveIdeProjectId(e.target.value);
                setShowWelcomeScreen(false);
              }}
              aria-label="Select project to diagnose"
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white max-w-[280px]"
            >
              {accessibleProjects.length === 0 ? (
                <option value="">No workspaces yet — import or create one</option>
              ) : (
                accessibleProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.language} · v{p.version})
                  </option>
                ))
              )}
            </select>

            <select
              value={scanMode}
              onChange={(e) => setScanMode(e.target.value as RescueScanMode)}
              aria-label="Select Rescue Scan depth"
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="quick">Quick Scan (Syntax &amp; Imports)</option>
              <option value="deep">Deep Scan (Architecture &amp; API)</option>
              <option value="full">Full Project Scan (Complete Report)</option>
              <option value="custom">Custom Scan ({customScanConfig.checks.length} Checks)</option>
            </select>

            {activeProject && (
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {loadingFiles ? 'Loading files...' : `${files.length} files · role: ${myRole}`}
              </span>
            )}
          </div>

          {activeProject && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveIdeProjectId(activeProject.id);
                  setActiveView('ide');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                Mideo IDE
              </button>
              <button
                type="button"
                onClick={() => openTestLabForProject(activeProject.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                TestLab ({linkedSuites.length})
              </button>
              <button
                type="button"
                onClick={() => openVersionsForProject(activeProject.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Versions
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 10-Stage Live Progress Banner */}
      {scanning && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{activeScanJob?.currentStage || 'Running diagnostic scan...'}</span>
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
              {activeScanJob && (
                <span>
                  {activeScanJob.filesProcessed}/{activeScanJob.totalFiles} files · {activeScanJob.progressPct}%
                </span>
              )}
              <span>{scanElapsedSec}s</span>
              {activeScanJob && (
                <button
                  type="button"
                  onClick={handleCancelScanJob}
                  className="px-2.5 py-1 rounded border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-sans font-semibold cursor-pointer"
                >
                  Cancel Scan
                </button>
              )}
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${activeScanJob?.progressPct ?? 12}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Summary & Project Refresh Diff Banners */}
      {lastImportSummary && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 flex flex-wrap items-start justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Imported &ldquo;{lastImportSummary.projectTitle}&rdquo; via {lastImportSummary.sourceType.toUpperCase()}
              {lastImportSummary.branch ? ` (${lastImportSummary.branch})` : ''}
            </div>
            <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
              {lastImportSummary.importedCount} files imported · {lastImportSummary.skippedCount} ignored ·{' '}
              {formatMediaBytes(lastImportSummary.totalBytes)} · Languages:{' '}
              {Object.entries(lastImportSummary.languages)
                .map(([lang, count]) => `${lang} (${count})`)
                .join(', ')}
            </p>
            {lastRefreshDiff && (
              <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                Refresh Diff: +{lastRefreshDiff.added.length} added · ~{lastRefreshDiff.modified.length} modified · -
                {lastRefreshDiff.removed.length} missing in import · {lastRefreshDiff.unchanged} unchanged
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setLastImportSummary(null);
              setLastRefreshDiff(null);
            }}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            aria-label="Dismiss import summary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Welcome Dashboard or Main Workspace */}
      {!activeProject || showWelcomeScreen ? (
        <RescueWelcomeScreen
          accessibleProjects={accessibleProjects}
          scanHistory={scanHistory}
          investigationHistory={investigationHistory}
          fixHistory={fixHistory}
          onOpenImportModal={(m) => handleOpenImportModal(m || 'zip', false)}
          onSelectProject={(pid, targetTab) => {
            setSelectedProjectId(pid);
            setActiveIdeProjectId(pid);
            setShowWelcomeScreen(false);
            if (targetTab) setTab(targetTab);
          }}
          onOpenTab={(targetTab) => {
            if (accessibleProjects[0]) {
              setSelectedProjectId(accessibleProjects[0].id);
              setActiveIdeProjectId(accessibleProjects[0].id);
              setShowWelcomeScreen(false);
            }
            setTab(targetTab);
          }}
        />
      ) : (
        /* Main Workspace Grid: Internal Rescue Sidebar + Active Panel */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Internal Rescue Sidebar */}
          <aside className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-3 space-y-4">
            <nav className="space-y-1">
              {RESCUE_TABS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                const countBadge =
                  item.id === 'files'
                    ? files.length
                    : item.id === 'scanner' && activeReport
                      ? activeReport.issues.length
                      : item.id === 'history'
                        ? scanHistory.length + investigationHistory.length
                        : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {countBadge !== null && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                          active ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {countBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Latest Health Score Mini Card */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Project Health</span>
                <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                  {activeReport ? `${activeReport.healthScore}/100` : 'Unscanned'}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    !activeReport
                      ? 'bg-slate-400 w-0'
                      : activeReport.healthScore >= 80
                        ? 'bg-emerald-500'
                        : activeReport.healthScore >= 55
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                  }`}
                  style={{ width: activeReport ? `${activeReport.healthScore}%` : '0%' }}
                />
              </div>
              {activeReport ? (
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {activeReport.confirmedCount} confirmed · {activeReport.potentialCount} potential across{' '}
                  {activeReport.filesInspected} files
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Run a scan to inspect syntax, imports, dependencies, and integrations.
                </p>
              )}
            </div>

            {!canModifyProject && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
                Read-only Viewer mode: you can scan and inspect this project, but only Owners/Editors can apply fixes.
              </div>
            )}
          </aside>

          {/* Main Rescue Content Surface */}
          <div className="lg:col-span-9 space-y-6">
            {tab === 'files' && (
              <RescueFilesTab
                files={files}
                activeReport={activeReport}
                projectIssues={projectIssues}
                fingerprintStale={fingerprintStale}
                onInvestigateIssue={(iss) => handleInvestigate(iss)}
                onProposeFixForFile={(fp, desc) =>
                  handleProposeFix({ targetFilePath: fp, problemDescription: desc })
                }
                onRefreshProject={() => handleOpenImportModal('zip', true)}
                onTriggerScan={() => handleRunScan()}
              />
            )}

            {tab === 'intelligence' && (
              <RescueIntelligenceTab
                projectIndex={activeReport?.projectIndex}
                onTriggerScan={() => handleRunScan('deep')}
              />
            )}

            {tab === 'documentation' && (
              <RescueDocumentationTab
                activeReport={activeReport}
                onTriggerScan={() => handleRunScan('deep')}
              />
            )}

            {tab === 'settings' && (
              <RescueSettingsTab
                customConfig={customScanConfig}
                onChangeCustomConfig={setCustomScanConfig}
                explanationLevel={explanationLevel}
                onChangeExplanationLevel={setExplanationLevel}
                onRunCustomScan={() => {
                  setTab('overview');
                  handleRunScan('custom', customScanConfig);
                }}
              />
            )}
            {/* ------------------------------------------------------------- */}
            {/* TAB 1: PROJECT OVERVIEW                                        */}
            {/* ------------------------------------------------------------- */}
            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
                    <div className="text-xs text-slate-500">Project Health Score</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {activeReport ? `${activeReport.healthScore}%` : '—'}
                      </span>
                      <span className="text-[11px] font-mono uppercase text-blue-500">
                        {activeReport ? activeReport.scanMode : 'Ready'}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
                    <div className="text-xs text-slate-500">Files Inspected</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {activeReport ? activeReport.filesInspected : files.length}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {activeReport?.projectIndex.skippedFiles.length
                        ? `${activeReport.projectIndex.skippedFiles.length} skipped (size/type)`
                        : 'All supported files readable'}
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
                    <div className="text-xs text-slate-500">Confirmed Issues</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                      {activeReport ? activeReport.confirmedCount : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {activeReport
                        ? `${activeReport.severityCounts.critical} critical · ${activeReport.severityCounts.high} high`
                        : 'Syntax, imports, static bugs'}
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
                    <div className="text-xs text-slate-500">Potential &amp; Suggestions</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {activeReport ? activeReport.potentialCount : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Needs confirmation / architectural review
                    </div>
                  </div>
                </div>

                {!activeReport ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-8 space-y-5">
                    <div className="space-y-1.5">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Ready to Analyze &ldquo;{activeProject.title}&rdquo;
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                        Choose a scan level below. Project Rescue AI builds a whole-project dependency, export, and API connection map across your {files.length} workspace files before recommending fixes.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        {
                          mode: 'quick' as const,
                          title: 'Quick Scan',
                          desc: 'Syntax checks (JS/TS/JSON/Python/SQL), broken relative imports, missing targets, obvious config bugs.',
                        },
                        {
                          mode: 'deep' as const,
                          title: 'Deep Scan',
                          desc: 'Whole-project architecture graph, dependency cross-checks, API route mismatches, circular imports, technical debt.',
                        },
                        {
                          mode: 'full' as const,
                          title: 'Full Project Scan',
                          desc: 'Runs every supported parser, linter, type-check, security & performance audit, and generates a prioritized health report.',
                        },
                      ].map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() => {
                            setScanMode(opt.mode);
                            handleRunScan(opt.mode);
                          }}
                          disabled={scanning}
                          className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] hover:border-blue-500 transition-colors space-y-2 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{opt.title}</span>
                            <ArrowRight className="w-4 h-4 text-blue-500" />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Executive Health Summary & Repair Order */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Diagnostic Health Summary
                          </h2>
                          <span className="text-[11px] font-mono text-slate-500">
                            {formatDateLabel(activeReport.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {activeReport.summary}
                        </p>

                        {activeReport.recommendedRepairOrder.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                              Recommended Repair Order
                            </h3>
                            <ol className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                              {activeReport.recommendedRepairOrder.map((step, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Suggested Improvements &amp; Top Issues
                        </h2>
                        {activeReport.suggestedImprovements.length > 0 && (
                          <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            {activeReport.suggestedImprovements.map((imp, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                                <span>{imp}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {projectIssues.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                Highest Priority Detections
                              </span>
                              <button
                                type="button"
                                onClick={() => setTab('scanner')}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                View all ({projectIssues.length})
                              </button>
                            </div>
                            <div className="space-y-2">
                              {projectIssues.slice(0, 3).map((iss) => (
                                <div
                                  key={iss.id}
                                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                      <span className={`px-1.5 py-0.5 rounded border uppercase font-semibold ${severityBadgeClass(iss.severity)}`}>
                                        {iss.severity}
                                      </span>
                                      <span className="font-mono text-slate-500 truncate">{iss.filePath}</span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate mt-1">
                                      {iss.title}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleInvestigate(iss)}
                                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                                  >
                                    Investigate
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Whole-Project Architecture & Relationship Map */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Whole-Project Architecture &amp; Dependency Map
                        </h2>
                        <div className="flex flex-wrap gap-1.5">
                          {activeReport.projectIndex.frameworksDetected.map((fw) => (
                            <span
                              key={fw}
                              className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[11px] font-mono"
                            >
                              {fw}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Files & Dependencies */}
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2">
                          <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                            Inspected Files ({activeReport.projectIndex.files.length})
                          </h3>
                          <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                            {activeReport.projectIndex.files.map((f) => (
                              <div key={f.path} className="py-2 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-medium text-slate-900 dark:text-white truncate">
                                    {f.path}
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                                    {f.language} · {f.linesCount}L
                                  </span>
                                </div>
                                {(f.imports.length > 0 || f.exports.length > 0) && (
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {f.imports.length > 0 ? `Imports: ${f.imports.slice(0, 4).join(', ')}` : ''}
                                    {f.imports.length > 0 && f.exports.length > 0 ? ' · ' : ''}
                                    {f.exports.length > 0 ? `Exports: ${f.exports.slice(0, 4).join(', ')}` : ''}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* API Route Connections & Architectural Signals */}
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-3">
                          <div>
                            <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                              Frontend ↔ Backend API Relationships
                            </h3>
                            {activeReport.projectIndex.apiRouteConnections.length === 0 ? (
                              <p className="text-[11px] text-slate-500">
                                No `/api/*` HTTP calls detected across inspected files.
                              </p>
                            ) : (
                              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {activeReport.projectIndex.apiRouteConnections.map((conn, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between gap-2 text-[11px] font-mono"
                                  >
                                    <span className="truncate text-slate-700 dark:text-slate-300">
                                      {conn.frontendFile} → {conn.endpoint}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded shrink-0 ${
                                        conn.status === 'connected'
                                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {conn.status === 'connected' ? 'Matched' : 'Unmatched'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {activeReport.projectIndex.circularDependencies.length > 0 && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                              <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                                Circular Dependency Cycles Detected
                              </h4>
                              {activeReport.projectIndex.circularDependencies.map((cycle, idx) => (
                                <p key={idx} className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                                  {cycle.join(' → ')}
                                </p>
                              ))}
                            </div>
                          )}

                          {activeReport.projectIndex.skippedFiles.length > 0 && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Uninspected / Skipped Files
                              </h4>
                              {activeReport.projectIndex.skippedFiles.map((sk, idx) => (
                                <p key={idx} className="text-[11px] text-slate-500 font-mono">
                                  {sk.path}: {sk.reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Runtime Verification Audit (Honest Check Coverage) */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Diagnostic Tooling Execution Audit
                        </h2>
                        <span className="text-[11px] text-slate-500">
                          Only checks that genuinely executed are reported below
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeReport.runtimeAudit.map((audit, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                              <span className="text-slate-900 dark:text-white">{audit.tool}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                                  audit.executed
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {audit.executed ? 'Ran' : 'Skipped'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{audit.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 2: PROJECT SCANNER                                         */}
            {/* ------------------------------------------------------------- */}
            {tab === 'scanner' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Project Health Scanner
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select Quick, Deep, or Full scan depth and distinguish Confirmed Issues from Potential Risks.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(['quick', 'deep', 'full'] as RescueScanMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleRunScan(m)}
                          disabled={scanning}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer border ${
                            scanMode === m
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                          }`}
                        >
                          {m} Scan
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCustomScanModalOpen(true)}
                        disabled={scanning}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500"
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  {/* Filters & Explanation Toggle */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['all', 'critical', 'high', 'medium', 'low', 'suggestion'] as const).map((sev) => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setSeverityFilter(sev)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                            severityFilter === sev
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                              : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hideDismissedIssues}
                          onChange={(e) => setHideDismissedIssues(e.target.checked)}
                        />
                        <span>Hide Dismissed ({dismissedIssues.length})</span>
                      </label>

                      <select
                        value={certaintyFilter}
                        onChange={(e) => setCertaintyFilter(e.target.value as 'all' | 'confirmed' | 'possible')}
                        aria-label="Filter by certainty"
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs"
                      >
                        <option value="all">All Certainty Levels</option>
                        <option value="confirmed">Confirmed Evidence Only</option>
                        <option value="possible">Potential Issues Only</option>
                      </select>

                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setExplanationLevel('beginner')}
                          className={`px-2.5 py-1 cursor-pointer ${
                            explanationLevel === 'beginner'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Beginner
                        </button>
                        <button
                          type="button"
                          onClick={() => setExplanationLevel('developer')}
                          className={`px-2.5 py-1 cursor-pointer ${
                            explanationLevel === 'developer'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Developer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {!activeReport ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-10 text-center space-y-3">
                    <ScanSearch className="w-8 h-8 text-blue-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">No Scan Results Yet</p>
                    <p className="text-xs text-slate-500">Run Quick, Deep, or Full Scan above to analyze your workspace.</p>
                  </div>
                ) : filteredIssues.length === 0 ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-white dark:bg-[#0D1322] p-8 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {projectIssues.length === 0
                        ? 'Zero issues detected in scanned files'
                        : 'No issues match the selected filter'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {projectIssues.length === 0
                        ? 'Static syntax, imports, linting, and architectural checks passed cleanly.'
                        : 'Switch severity or certainty filter to inspect other items.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredIssues.map((issue) => {
                      const isReviewed = reviewedSet.has(issue.id);
                      const dismissedInfo = dismissedMap.get(issue.id);
                      return (
                        <div
                          key={issue.id}
                          className={`rounded-xl border bg-white dark:bg-[#0D1322] p-5 space-y-3 ${
                            dismissedInfo
                              ? 'border-slate-200/70 dark:border-slate-800/70 opacity-65'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <span
                                  className={`px-2 py-0.5 rounded border uppercase font-semibold ${severityBadgeClass(issue.severity)}`}
                                >
                                  {issue.severity}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded border font-medium ${
                                    issue.certainty === 'confirmed'
                                      ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                                      : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {issue.certainty === 'confirmed' ? 'Confirmed Issue' : 'Potential Risk'} · {issue.confidence}%
                                </span>
                                {isReviewed && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                                    Reviewed
                                  </span>
                                )}
                                {dismissedInfo && (
                                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                    Dismissed ({dismissedInfo.reason.replace('_', ' ')})
                                  </span>
                                )}
                                <span className="font-mono text-slate-500">
                                  {issue.filePath}
                                  {issue.line ? `:${issue.line}` : ''}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">{issue.evidenceSource}</span>
                              </div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{issue.title}</h3>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleInvestigate(issue)}
                                disabled={investigating}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium cursor-pointer"
                              >
                                <Microscope className="w-3.5 h-3.5 text-blue-500" />
                                Investigate
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleProposeFix({
                                    targetFilePath: issue.filePath,
                                    problemDescription: `${issue.title}: ${issue.summary}`,
                                    issueId: issue.id,
                                  })
                                }
                                disabled={proposingFix}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                Propose Fix
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            {explanationLevel === 'beginner' ? issue.beginnerExplanation : issue.developerExplanation}
                          </p>

                          {issue.symbolOrSnippet && (
                            <pre className="p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto border border-slate-800">
                              <code>{issue.symbolOrSnippet}</code>
                            </pre>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                            <span className="text-slate-500">
                              Recommended: <span className="text-slate-700 dark:text-slate-300">{issue.recommendedAction}</span>
                            </span>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => handleToggleIssueReviewed(issue.id)}
                                className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                              >
                                {isReviewed ? 'Unmark Reviewed' : 'Mark Reviewed'}
                              </button>
                              {dismissedInfo ? (
                                <button
                                  type="button"
                                  onClick={() => handleReopenIssue(issue.id)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  Re-open
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDismissIssue(issue.id, 'false_positive')}
                                    className="text-slate-500 hover:underline cursor-pointer"
                                  >
                                    False Positive
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDismissIssue(issue.id, 'wont_fix')}
                                    className="text-slate-500 hover:underline cursor-pointer"
                                  >
                                    Won&apos;t Fix
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => openCourse(matchedLearningResource.matchedCourse.id)}
                                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                Learn More
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  askAi({
                                    mode: 'debug',
                                    prompt: `Help debug this ${issue.category} issue in ${issue.filePath}: ${issue.title}. ${issue.summary}`,
                                    context: {
                                      filename: issue.filePath,
                                      errorMessage: issue.summary,
                                    },
                                  })
                                }
                                className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Mideo AI Debug
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 3: ERROR INVESTIGATION                                     */}
            {/* ------------------------------------------------------------- */}
            {tab === 'investigate' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Deep Multi-File Error Investigation
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Paste any runtime error, build log, broken behavior, or select a detected issue. Rescue AI traces imports, related components, and API contracts across your project.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Describe the error, symptom, or stack trace
                  </label>
                  <textarea
                    rows={4}
                    value={customProblemInput}
                    onChange={(e) => setCustomProblemInput(e.target.value)}
                    placeholder="e.g., My login button triggers nothing when clicked, or TypeError: Cannot read properties of undefined reading 'map' in App.jsx..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Expected Behavior (Optional)
                      </label>
                      <input
                        value={expectedBehavior}
                        onChange={(e) => setExpectedBehavior(e.target.value)}
                        placeholder="e.g., Submitting saves data and opens the dashboard"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17]"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Actual Behavior (Optional)
                      </label>
                      <input
                        value={actualBehavior}
                        onChange={(e) => setActualBehavior(e.target.value)}
                        placeholder="e.g., Throws 404 or page reloads with empty list"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] cursor-pointer hover:border-blue-500">
                      <ImagePlus className="w-3.5 h-3.5 text-blue-500" />
                      <span>{issueScreenshot ? issueScreenshot.name : 'Attach Error Screenshot (PNG/JPG/WebP)'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleScreenshotUpload}
                      />
                    </label>
                    {issueScreenshot && (
                      <button
                        type="button"
                        onClick={() => setIssueScreenshot(null)}
                        className="inline-flex items-center gap-1 text-red-500 hover:underline cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Remove Screenshot
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Website shows a blank screen or fails to render',
                        'Button click handler does not trigger API request',
                        'Import error or missing module between files',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCustomProblemInput(preset)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInvestigate(null, customProblemInput)}
                      disabled={investigating || !customProblemInput.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {investigating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Microscope className="w-4 h-4" />}
                      {investigating ? 'Investigating Files...' : 'Investigate Root Cause'}
                    </button>
                  </div>
                </div>

                {projectIssues.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                      Or Investigate a Detected Issue From Latest Scan
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {projectIssues.slice(0, 8).map((iss) => (
                        <button
                          key={iss.id}
                          type="button"
                          onClick={() => handleInvestigate(iss)}
                          disabled={investigating}
                          className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] hover:border-blue-500 transition-colors cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded border uppercase font-semibold ${severityBadgeClass(iss.severity)}`}>
                              {iss.severity}
                            </span>
                            <span className="font-mono text-slate-500 truncate">{iss.filePath}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white line-clamp-1">{iss.title}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 4: ROOT CAUSE ANALYSIS                                     */}
            {/* ------------------------------------------------------------- */}
            {tab === 'root_cause' && (
              <div className="space-y-5">
                {!rootCause ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-10 text-center space-y-3">
                    <ShieldAlert className="w-8 h-8 text-blue-500 mx-auto" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      No Active Root Cause Investigation
                    </h2>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Click Investigate on any scanned issue or enter a problem description in Error Investigation to see confirmed causes, confidence scores, and Beginner vs Developer explanations.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('investigate')}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Go to Error Investigation
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded border font-semibold ${
                              rootCause.certainty === 'confirmed'
                                ? 'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400'
                                : 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {rootCause.certainty === 'confirmed' ? 'Confirmed Root Cause' : 'Possible Cause'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                            Confidence: {rootCause.confidence}%
                          </span>
                          <span className="font-mono text-slate-500">
                            Responsible File: {rootCause.responsibleFile}
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                          {rootCause.problemTitle}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleProposeFix({
                            targetFilePath: rootCause.responsibleFile,
                            problemDescription: rootCause.whatIsHappening,
                            rc: rootCause,
                            issueId: rootCause.issueId,
                          })
                        }
                        disabled={proposingFix}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
                      >
                        {proposingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                        {proposingFix ? 'Generating Fix...' : 'Propose Automatic Fix'}
                      </button>
                    </div>

                    {/* Diagnostic Questions Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2">
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-white">What Is Happening</h3>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {rootCause.whatIsHappening}
                        </p>
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white pt-2">Why It Occurred</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {rootCause.whyItOccurred}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-3">
                        <div>
                          <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                            Confirmed Causes
                          </h3>
                          {rootCause.confirmedCauses.length === 0 ? (
                            <p className="text-xs text-slate-500">None proven statically; see possible causes below.</p>
                          ) : (
                            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                              {rootCause.confirmedCauses.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {rootCause.possibleCauses.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                              Possible Contributing Causes
                            </h3>
                            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                              {rootCause.possibleCauses.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dual Explanations: Beginner vs Developer */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
                        <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                          Beginner Explanation (Plain English)
                        </h3>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {rootCause.beginnerExplanation}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-1.5">
                        <h3 className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                          Developer Explanation (Technical)
                        </h3>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {rootCause.developerExplanation}
                        </p>
                      </div>
                    </div>

                    {/* Safest Solution, Affected Files & Scope Transparency */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2.5 text-xs">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">Safest Proposed Solution: </span>
                        <span className="text-slate-700 dark:text-slate-300">{rootCause.safestSolution}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-semibold text-slate-900 dark:text-white">Affected Files:</span>
                        {rootCause.affectedFiles.map((f) => (
                          <span key={f} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[11px]">
                            {f}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-semibold text-slate-900 dark:text-white">Inspected Evidence Files:</span>
                        {rootCause.inspectedFilesList.slice(0, 10).map((f) => (
                          <span key={f} className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-mono text-[11px] text-slate-500">
                            {f}
                          </span>
                        ))}
                      </div>
                      {rootCause.unverifiedScopeNotes.length > 0 && (
                        <p className="text-[11px] text-slate-500">
                          Scope limits: {rootCause.unverifiedScopeNotes.join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Cross-Platform Learning & Practice Integrations */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCourse(matchedLearningResource.matchedCourse.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-blue-500 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                        Learn More: {matchedLearningResource.matchedCourse.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDoc(matchedLearningResource.matchedDoc.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-blue-500 cursor-pointer"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-emerald-500" />
                        Docs: {matchedLearningResource.matchedDoc.title}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          askAi({
                            mode: 'practice',
                            prompt: `Create a short coding exercise to help me master avoiding this bug: ${rootCause.problemTitle}. Explain the key principle and give me a test-yourself prompt.`,
                            context: {
                              filename: rootCause.responsibleFile,
                              errorMessage: rootCause.whatIsHappening,
                            },
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-violet-500 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                        Practice in Mideo AI
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          matchedLearningResource.matchedMission
                            ? openMissionDetails(matchedLearningResource.matchedMission.id)
                            : openMissionCatalog()
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-amber-500 cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5 text-amber-500" />
                        {matchedLearningResource.matchedMission
                          ? `Mission: ${matchedLearningResource.matchedMission.title}`
                          : 'Practice in Mission Mode'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 5: FIX PROPOSALS & IMPACT ANALYSIS                         */}
            {/* ------------------------------------------------------------- */}
            {tab === 'fixes' && (
              <div className="space-y-5">
                {/* Manual Fix Generator Controls */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Generate Automatic Code Fix Proposal
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Target File</label>
                      <select
                        value={manualFixTargetPath}
                        onChange={(e) => setManualFixTargetPath(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
                      >
                        {files.map((f) => {
                          const p = getFileDisplayPath(f);
                          return (
                            <option key={f.id} value={p}>
                              {p}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Problem to Fix
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={manualFixPrompt}
                          onChange={(e) => setManualFixPrompt(e.target.value)}
                          placeholder="Describe the bug or error in this file..."
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleProposeFix({
                              targetFilePath: manualFixTargetPath,
                              problemDescription: manualFixPrompt,
                            })
                          }
                          disabled={proposingFix || !manualFixTargetPath || !manualFixPrompt.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          {proposingFix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                          Generate Fix
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {fixProposal ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-mono">
                            {fixProposal.filePath}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize font-medium">
                            Status: {fixProposal.status.replace('_', ' ')}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {fixProposal.problemIdentified}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                isEditingProposedCode ? editedProposedCode : fixProposal.proposedCode,
                              );
                              notify('success', 'Proposed corrected code copied to clipboard.');
                            } catch {
                              notify('error', 'Clipboard access denied.');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Fix
                        </button>
                        {fixProposal.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsEditingProposedCode((v) => !v)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:border-blue-500"
                            >
                              <Code2 className="w-3.5 h-3.5 text-blue-500" />
                              {isEditingProposedCode ? 'Close Editor' : 'Edit Proposed Fix'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFixProposal({ ...fixProposal, status: 'rejected' });
                                notify('info', 'Fix proposal rejected. Original project files remain untouched.');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 text-xs font-medium cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject Fix
                            </button>
                            <button
                              type="button"
                              onClick={() => setAuthorizeModalOpen(true)}
                              disabled={applyingFix || !canModifyProject}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                            >
                              {applyingFix ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                              Review &amp; Apply Fix
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Explanation, Reason & Potential Side Effects */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-white">Explanation of Change</div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{fixProposal.explanation}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-white">Reason for Change</div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{fixProposal.reason}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-white">Potential Side Effects</div>
                        {fixProposal.potentialSideEffects.length === 0 ? (
                          <p className="text-slate-500">Localized fix; minimal side-effect surface expected.</p>
                        ) : (
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
                            {fixProposal.potentialSideEffects.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Fix Impact Analysis Panel */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            Pre-Apply Fix Impact Analysis
                          </h4>
                          {fixProposal.impact.riskLevel && (
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                fixProposal.impact.riskLevel === 'High Risk'
                                  ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                  : fixProposal.impact.riskLevel === 'Moderate Risk'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {fixProposal.impact.riskLevel}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            fixProposal.impact.preFlightPassed
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-red-500/15 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {fixProposal.impact.preFlightPassed ? 'Pre-Flight Checks Passed' : 'Pre-Flight Warnings Detected'}
                        </span>
                      </div>
                      {fixProposal.impact.riskRationale && (
                        <p className="text-[11px] text-slate-500">{fixProposal.impact.riskRationale}</p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Dependent Files ({fixProposal.impact.dependentFiles.length}):{' '}
                          </span>
                          <span className="font-mono text-slate-500">
                            {fixProposal.impact.dependentFiles.length > 0
                              ? fixProposal.impact.dependentFiles.join(', ')
                              : 'No incoming local imports detected'}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Affected Features:{' '}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {fixProposal.impact.affectedFeatures.join(', ')}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {fixProposal.impact.preFlightChecks.map((chk, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs">
                            {chk.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-medium text-slate-900 dark:text-white">{chk.checkName}: </span>
                              <span className="text-slate-600 dark:text-slate-300">{chk.details}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {fixProposal.impact.potentialConflicts.length > 0 && (
                        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                          {fixProposal.impact.potentialConflicts.map((c, idx) => (
                            <p key={idx}>{c}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Optional Inline Code Editor before Apply */}
                    {isEditingProposedCode && (
                      <div className="p-4 rounded-xl border border-blue-500/40 bg-slate-50 dark:bg-[#080C17] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Edit Proposed Code Before Applying ({fixProposal.filePath})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditedProposedCode(fixProposal.proposedCode);
                                setIsEditingProposedCode(false);
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                            >
                              Cancel Edit
                            </button>
                            <button
                              type="button"
                              onClick={handleReanalyzeEditedFix}
                              disabled={reanalyzingImpact}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {reanalyzingImpact ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              Re-run Impact Analysis
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={12}
                          value={editedProposedCode}
                          onChange={(e) => setEditedProposedCode(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950 text-slate-100 font-mono text-xs"
                        />
                      </div>
                    )}

                    {/* Side-by-Side / Unified Code Diff */}
                    <RescueCodeDiff
                      filePath={fixProposal.filePath}
                      originalCode={fixProposal.originalCode}
                      proposedCode={isEditingProposedCode ? editedProposedCode : fixProposal.proposedCode}
                      onCopied={() => notify('success', 'Fix copied to clipboard.')}
                    />

                    {/* Post-Apply Verification & Rollback Result */}
                    {verificationResult && (() => {
                      const vMeta = verificationStatusMeta(
                        verificationResult.verificationStatus,
                        verificationResult.passed,
                      );
                      return (
                      <div
                        className={`p-4 rounded-xl border space-y-3 ${
                          verificationResult.passed
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-amber-500/40 bg-amber-500/5'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            {verificationResult.passed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                  Post-Fix Verification Result
                                </h4>
                                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${vMeta.badgeClass}`}>
                                  {vMeta.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                {verificationResult.summary}
                              </p>
                            </div>
                          </div>

                          {lastAppliedSnapshot && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRollbackFix({
                                  projectId: activeProject.id,
                                  snapshotVersionId: lastAppliedSnapshot.versionId,
                                  fixRecordId: lastAppliedSnapshot.fixRecordId,
                                  filePath: lastAppliedSnapshot.filePath,
                                })
                              }
                              disabled={rollingBack}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
                            >
                              {rollingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              Undo / Rollback to Snapshot v{lastAppliedSnapshot.versionNumber}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {verificationResult.checksExecuted.map((c, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              {c.passed ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              )}
                              <span className="font-medium text-slate-900 dark:text-white">{c.name}:</span>
                              <span className="text-slate-600 dark:text-slate-300">{c.details}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] p-10 text-center text-xs text-slate-500">
                    Select any issue in Project Scanner or Root Cause Analysis, or choose a file above to generate a reviewed fix proposal.
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 6: GUIDED RESCUE MODE                                      */}
            {/* ------------------------------------------------------------- */}
            {tab === 'rescue_mode' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <LifeBuoy className="w-5 h-5 text-emerald-500" />
                      Guided Project Rescue Mode
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Step-by-step troubleshooting designed so you never get lost when repairing your codebase.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    {[1, 2, 3, 4, 5, 6].map((st) => (
                      <span
                        key={st}
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
                          rescueStep === st
                            ? 'bg-blue-600 text-white'
                            : rescueStep > st
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {st}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Step 1: Describe Problem or Pick Detected Issue */}
                {rescueStep === 1 && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#080C17] border border-slate-200 dark:border-slate-800 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Step 1: Something broken? Let&apos;s rescue your project &ldquo;{activeProject.title}&rdquo;.
                      </h3>
                      <textarea
                        rows={3}
                        value={rescueSymptom}
                        onChange={(e) => setRescueSymptom(e.target.value)}
                        placeholder="Describe what happened in plain English (e.g. 'My page doesn't render anything', 'Form submit reloads without saving', 'I get a syntax or import error')..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <input
                          value={expectedBehavior}
                          onChange={(e) => setExpectedBehavior(e.target.value)}
                          placeholder="Expected behavior (optional)"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322]"
                        />
                        <input
                          value={actualBehavior}
                          onChange={(e) => setActualBehavior(e.target.value)}
                          placeholder="Actual behavior (optional)"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] cursor-pointer">
                          <ImagePlus className="w-3.5 h-3.5 text-blue-500" />
                          <span>{issueScreenshot ? issueScreenshot.name : 'Upload Error Screenshot (optional)'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handleScreenshotUpload}
                          />
                        </label>
                        {issueScreenshot && (
                          <button
                            type="button"
                            onClick={() => setIssueScreenshot(null)}
                            className="text-red-500 hover:underline cursor-pointer"
                          >
                            Remove Screenshot
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'Website is blank / not loading',
                          'Button or login action does nothing',
                          'Build or syntax error stops execution',
                          'API call fails or connects to wrong route',
                        ].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setRescueSymptom(s)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] hover:border-blue-500 cursor-pointer"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {projectIssues.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Or click a detected issue from your latest scan:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {projectIssues.slice(0, 4).map((iss) => (
                            <button
                              key={iss.id}
                              type="button"
                              onClick={() => {
                                setSelectedIssueId(iss.id);
                                setRescueSymptom(`${iss.title} (${iss.filePath}): ${iss.beginnerExplanation}`);
                              }}
                              className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer space-y-1"
                            >
                              <span className="text-[11px] font-mono text-blue-500">{iss.filePath}</span>
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">{iss.title}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleStartRescueModeDiagnosis}
                        disabled={scanning || investigating}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Inspect Project &amp; Diagnose
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Inspecting */}
                {rescueStep === 2 && (
                  <div className="py-12 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Inspecting {files.length} workspace files &amp; investigating root cause...
                    </p>
                    <p className="text-xs text-slate-500">
                      Checking syntax, imports, dependencies, and tracing related components.
                    </p>
                  </div>
                )}

                {/* Step 3: Clear Explanation & Root Cause */}
                {rescueStep === 3 && rootCause && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          Step 3: What We Found ({rootCause.confidence}% confidence)
                        </span>
                        <span className="font-mono text-slate-500">{rootCause.responsibleFile}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{rootCause.problemTitle}</h3>
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                        {rootCause.beginnerExplanation}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setRescueStep(1)}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const prop = await handleProposeFix({
                            targetFilePath: rootCause.responsibleFile,
                            problemDescription: rootCause.whatIsHappening,
                            rc: rootCause,
                            stayInRescueMode: true,
                          });
                          if (prop) setRescueStep(4);
                        }}
                        disabled={proposingFix}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        {proposingFix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                        {proposingFix ? 'Preparing Safe Fix...' : 'Generate Safe Fix Proposal'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4 & 5: Review & Authorize */}
                {(rescueStep === 4 || rescueStep === 5) && fixProposal && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        Step 4: Review Proposed Fix for {fixProposal.filePath}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300">{fixProposal.explanation}</p>
                      <p className="text-slate-500">
                        Impact check: {fixProposal.impact.preFlightPassed ? 'Pre-flight syntax & imports clean.' : 'Review pre-flight notes before applying.'}
                      </p>
                    </div>
                    <RescueCodeDiff
                      filePath={fixProposal.filePath}
                      originalCode={fixProposal.originalCode}
                      proposedCode={fixProposal.proposedCode}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setRescueStep(3)}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        Back to Explanation
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFixProposal({ ...fixProposal, status: 'rejected' });
                            setRescueStep(3);
                            notify('info', 'Fix rejected. Original files were not modified.');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 text-xs font-medium cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject Fix
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthorizeModalOpen(true)}
                          disabled={applyingFix || !canModifyProject}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                        >
                          {applyingFix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          Authorize &amp; Apply Fix (With Backup Snapshot)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 6: Verification Final Result */}
                {rescueStep === 6 && verificationResult && (
                  <div className="space-y-4">
                    <div
                      className={`p-5 rounded-xl border space-y-3 ${
                        verificationResult.passed
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-amber-500/40 bg-amber-500/5'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Step 6: Final Verification Summary
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            verificationStatusMeta(verificationResult.verificationStatus, verificationResult.passed).badgeClass
                          }`}
                        >
                          {verificationStatusMeta(verificationResult.verificationStatus, verificationResult.passed).label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">{verificationResult.summary}</p>
                      {verificationResult.checksExecuted.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          {c.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          )}
                          <span>
                            <strong>{c.name}:</strong> {c.details}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {lastAppliedSnapshot && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRollbackFix({
                              projectId: activeProject.id,
                              snapshotVersionId: lastAppliedSnapshot.versionId,
                              fixRecordId: lastAppliedSnapshot.fixRecordId,
                              filePath: lastAppliedSnapshot.filePath,
                            })
                          }
                          disabled={rollingBack}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Rollback Fix
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRescueStep(1);
                          setRescueSymptom('');
                          setTab('overview');
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Finish &amp; View Project Overview
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 7: SCAN & FIX HISTORY                                      */}
            {/* ------------------------------------------------------------- */}
            {tab === 'history' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Saved Project Health Reports
                      </h2>
                      <p className="text-xs text-slate-500">
                        Revisit any past diagnostic scan stored in your MideoCode cloud workspace.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={refreshHistory}
                      disabled={loadingHistory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {scanHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">No saved scan reports yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {scanHistory.map((item) => (
                        <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-900 dark:text-white">{item.projectTitle}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] uppercase">
                                {item.scanMode}
                              </span>
                              <span className="font-mono text-blue-500 tabular-nums">
                                Health {item.healthScore}/100
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {formatDateLabel(item.createdAt)} · {item.confirmedCount} confirmed · {item.potentialCount} potential
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                pendingHistoryReportRef.current = item;
                                setSelectedProjectId(item.projectId);
                                setActiveReport(item);
                                setTab('overview');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                            >
                              Open Report
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deleteRescueScanReport(item.id);
                                  setScanHistory((prev) => prev.filter((r) => r.id !== item.id));
                                  if (activeReport?.id === item.id) {
                                    setActiveReport(null);
                                  }
                                  notify('info', 'Scan report removed from history.');
                                } catch (err) {
                                  notify(
                                    'error',
                                    err instanceof Error ? err.message : 'Unable to delete scan report.',
                                  );
                                }
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500 cursor-pointer"
                              title="Delete scan report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Saved Root Cause Investigations */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Saved Root Cause Investigations ({investigationHistory.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Reopen past multi-file investigations, track status, or clear resolved entries.
                    </p>
                  </div>

                  {investigationHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">No saved investigations yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {investigationHistory.map((inv) => (
                        <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {inv.analysis.problemTitle}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {inv.projectTitle} · {inv.analysis.responsibleFile}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px]">
                                {inv.analysis.confidence}%
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {formatDateLabel(inv.createdAt)} · {inv.analysis.certainty === 'confirmed' ? 'Confirmed' : 'Possible Cause'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={inv.status}
                              onChange={async (e) => {
                                const nextStatus = e.target.value as 'open' | 'fix_proposed' | 'resolved';
                                await updateRescueInvestigationStatus(inv.id, nextStatus).catch(() => {});
                                setInvestigationHistory((prev) =>
                                  prev.map((item) => (item.id === inv.id ? { ...item, status: nextStatus } : item)),
                                );
                              }}
                              aria-label="Investigation status"
                              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs"
                            >
                              <option value="open">Open</option>
                              <option value="fix_proposed">Fix Proposed</option>
                              <option value="resolved">Resolved</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(inv.projectId);
                                setRootCause(inv.analysis);
                                setTab('root_cause');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                            >
                              Open
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteRescueInvestigationRecord(inv.id).catch(() => {});
                                setInvestigationHistory((prev) => prev.filter((item) => item.id !== inv.id));
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500 cursor-pointer"
                              title="Delete investigation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Applied Fixes & Rollback History */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Applied Fixes &amp; Reversible Change History
                    </h2>
                    <p className="text-xs text-slate-500">
                      Every authorized Rescue fix creates a snapshot beforehand so you can restore safely anytime.
                    </p>
                  </div>

                  {fixHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">No fixes have been applied yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {fixHistory.map((fix) => {
                        const fMeta = verificationStatusMeta(fix.verificationStatus, fix.verificationPassed);
                        return (
                        <div key={fix.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {fix.filePath}
                              </span>
                              <span className="text-slate-400">({fix.projectTitle})</span>
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                                  fix.status === 'rolled_back'
                                    ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
                                    : fMeta.badgeClass
                                }`}
                              >
                                {fix.status === 'rolled_back' ? 'Rolled Back' : fMeta.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                              {fix.problemIdentified}
                            </p>
                            <p className="text-[11px] text-slate-500">{fix.verificationSummary}</p>
                          </div>

                          {fix.status === 'applied' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRollbackFix({
                                  projectId: fix.projectId,
                                  snapshotVersionId: fix.snapshotVersionId,
                                  fixRecordId: fix.id,
                                  filePath: fix.filePath,
                                })
                              }
                              disabled={rollingBack}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer shrink-0"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Undo to v{fix.snapshotVersionNumber}
                            </button>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 8: RESCUE CHAT                                             */}
            {/* ------------------------------------------------------------- */}
            {tab === 'chat' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 flex flex-col gap-4 min-h-[540px]">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Rescue Chat — Evidence-Grounded Project Assistant
                    </h2>
                    <p className="text-xs text-slate-500">
                      Ask about errors, broken buttons, API wiring, or what happens if you modify a specific file.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Context: {files.length} workspace files
                  </span>
                </div>

                {chatMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center text-center py-8 space-y-4">
                    <MessageSquare className="w-8 h-8 text-blue-500" />
                    <div className="space-y-1 max-w-md">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Ask Anything About &ldquo;{activeProject.title}&rdquo;
                      </p>
                      <p className="text-xs text-slate-500">
                        Rescue Chat reads your project&apos;s files and latest diagnostic scan rather than giving generic advice.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                      {STARTER_CHAT_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleSendChat(q)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-700 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[420px]">
                    {chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl text-xs space-y-2 ${
                          m.role === 'user'
                            ? 'bg-blue-600/10 border border-blue-500/30 ml-8'
                            : 'bg-slate-50 dark:bg-[#080C17] border border-slate-200 dark:border-slate-800 mr-8'
                        }`}
                      >
                        <div className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                          {m.role === 'user' ? 'You' : 'Project Rescue AI'}
                        </div>
                        <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {m.content}
                        </div>
                        {m.citedFiles && m.citedFiles.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[10px] text-slate-500">Cited files:</span>
                            {m.citedFiles.map((cf) => (
                              <span
                                key={cf}
                                className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px]"
                              >
                                {cf}
                              </span>
                            ))}
                            {m.suggestedTab && (
                              <button
                                type="button"
                                onClick={() => setTab(m.suggestedTab!)}
                                className="ml-auto text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                Open {m.suggestedTab.replace('_', ' ')} →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChat();
                  }}
                  className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatSending}
                    placeholder="Ask why something is broken, failing to connect, or crashing..."
                    className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={chatSending || !chatInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {chatSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Authorization Confirmation Modal Before Applying Any File Modification */}
      {authorizeModalOpen && fixProposal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Authorize Project File Change
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  MideoCode will first save an automatic Version History backup snapshot before updating{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {fixProposal.filePath}
                  </span>
                  , then run verification checks immediately.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs space-y-1.5">
              <div>
                <span className="font-semibold">Fix:</span> {fixProposal.problemIdentified}
              </div>
              {fixProposal.impact.riskLevel && (
                <div>
                  <span className="font-semibold">Risk Assessment:</span> {fixProposal.impact.riskLevel}
                  {fixProposal.impact.riskRationale ? ` — ${fixProposal.impact.riskRationale}` : ''}
                </div>
              )}
              <div>
                <span className="font-semibold">Dependent files affected:</span>{' '}
                {fixProposal.impact.dependentFiles.length > 0
                  ? fixProposal.impact.dependentFiles.join(', ')
                  : 'None detected'}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAuthorizeModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAuthorizeAndApplyFix}
                disabled={applyingFix}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Approve &amp; Apply Fix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Scan Modal */}
      <RescueCustomScanModal
        open={customScanModalOpen}
        customConfig={customScanConfig}
        onChangeCustomConfig={setCustomScanConfig}
        onClose={() => setCustomScanModalOpen(false)}
        onStartCustomScan={() => {
          setShowWelcomeScreen(false);
          handleRunScan('custom', customScanConfig);
        }}
      />

      {/* 4-Source Importer Modal (ZIP, Folder, Files, GitHub Repo) */}
      <RescueImportModal
        open={importModalOpen}
        initialMode={importModalMode}
        hasActiveProject={Boolean(activeProject)}
        activeProjectTitle={activeProject?.title}
        canModifyProject={canModifyProject}
        defaultTargetMode={activeProject && canModifyProject ? importTargetMode : 'new'}
        isRefreshMode={importModalRefresh}
        onClose={() => setImportModalOpen(false)}
        onCompleteRawEntries={(entries, sourceType, targetMode, isRefresh) =>
          ingestImportedEntries(entries, { sourceType, targetMode, isRefresh })
        }
        onCompleteNormalizedFiles={finalizeNormalizedProjectImport}
      />

      {/* Add / Paste File Modal inside Project Rescue AI */}
      {showNewFileModal && activeProject && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateQuickFile}
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add File to &ldquo;{activeProject.title}&rdquo;
              </h3>
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Filename (with extension)
                </label>
                <input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. App.tsx or helper.py"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Folder (optional)
                </label>
                <input
                  value={newFileFolder}
                  onChange={(e) => setNewFileFolder(e.target.value)}
                  placeholder="e.g. src/components"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                File Contents
              </label>
              <textarea
                rows={8}
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder="Paste code or configuration here..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFileModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingNewFile || !newFileName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {addingNewFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                Save File to Project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
