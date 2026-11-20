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
  Compass,
  Copy,
  FileCode2,
  FileWarning,
  Flag,
  FolderGit2,
  FolderUp,
  GitBranch,
  History,
  Info,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Microscope,
  Play,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { RescueCodeDiff } from '../components/rescue/RescueCodeDiff';
import { ACADEMY_COURSES } from '../data/academyData';
import { DOC_ARTICLES } from '../data/docsData';
import {
  createProjectVersionSnapshot,
  createProjectWithFiles,
  forceOverwriteProjectFile,
  getProjectFiles,
  listProjectVersions,
  restoreProjectVersionSnapshot,
} from '../services/dataService';
import { listTestSuitesForUser } from '../services/testLabService';
import { logProjectActivity } from '../services/collaborationService';
import {
  deleteRescueScanReport,
  investigateIssueViaApi,
  listRescueFixRecords,
  listUserRescueScans,
  markRescueFixRolledBack,
  proposeFixViaApi,
  recordRescueFixRecord,
  saveRescueScanReport,
  scanProjectViaApi,
  sendRescueChatViaApi,
  verifyRescueFixViaApi,
} from '../services/rescueService';
import type {
  Project,
  ProjectCollaboratorRole,
  ProjectFile,
  RescueAppliedFixRecord,
  RescueChatMessage,
  RescueFixProposal,
  RescueInternalTab,
  RescueIssue,
  RescueRootCauseAnalysis,
  RescueScanMode,
  RescueScanReport,
  RescueSeverity,
  RescueVerificationResult,
  TestSuite,
} from '../types/mideocode';

const RESCUE_TABS: { id: RescueInternalTab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Project Overview', icon: Activity },
  { id: 'scanner', label: 'Project Scanner', icon: ScanSearch },
  { id: 'investigate', label: 'Error Investigation', icon: Microscope },
  { id: 'root_cause', label: 'Root Cause Analysis', icon: ShieldAlert },
  { id: 'fixes', label: 'Fix Proposals', icon: Wrench },
  { id: 'rescue_mode', label: 'Rescue Mode', icon: LifeBuoy },
  { id: 'history', label: 'Scan History', icon: History },
  { id: 'chat', label: 'Rescue Chat', icon: MessageSquare },
];

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

function getFileDisplayPath(f: { folder?: string; name: string }): string {
  return f.folder ? `${f.folder.replace(/^\/+|\/+$/g, '')}/${f.name}` : f.name;
}

function detectLanguageFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.json')) return 'json';
  return 'javascript';
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    rescueLaunch?.projectId || activeIdeProjectId || accessibleProjects[0]?.id || '',
  );
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Scan & Reports state
  const [scanMode, setScanMode] = useState<RescueScanMode>('deep');
  const [scanning, setScanning] = useState(false);
  const [activeReport, setActiveReport] = useState<RescueScanReport | null>(null);
  const [scanHistory, setScanHistory] = useState<RescueScanReport[]>([]);
  const [fixHistory, setFixHistory] = useState<RescueAppliedFixRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Issue Filtering & Explanation Mode
  const [severityFilter, setSeverityFilter] = useState<'all' | RescueSeverity>('all');
  const [certaintyFilter, setCertaintyFilter] = useState<'all' | 'confirmed' | 'possible'>('all');
  const [explanationLevel, setExplanationLevel] = useState<'beginner' | 'developer'>('beginner');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Investigation & Root Cause state
  const [customProblemInput, setCustomProblemInput] = useState('');
  const [investigating, setInvestigating] = useState(false);
  const [rootCause, setRootCause] = useState<RescueRootCauseAnalysis | null>(null);

  // Fix Proposal, Authorization & Verification state
  const [fixProposal, setFixProposal] = useState<RescueFixProposal | null>(null);
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

  // Local folder / multi-file import state
  const [importingFiles, setImportingFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (rescueLaunch) {
      setSelectedProjectId(rescueLaunch.projectId);
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

  // Load files & TestLab suites for active project
  const refreshActiveFiles = useCallback(async () => {
    if (!activeProject || !firebaseUser) {
      setFiles([]);
      setLinkedSuites([]);
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
      if (loadedFiles.length > 0 && !manualFixTargetPath) {
        setManualFixTargetPath(getFileDisplayPath(loadedFiles[0]));
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load project files.');
    } finally {
      setLoadingFiles(false);
    }
  }, [activeProject, firebaseUser, manualFixTargetPath, notify]);

  const refreshHistory = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingHistory(true);
    try {
      const [scans, fixes] = await Promise.all([
        listUserRescueScans(firebaseUser.uid),
        listRescueFixRecords(firebaseUser.uid),
      ]);
      setScanHistory(scans);
      setFixHistory(fixes);
      // Hydrate latest scan for selected project if none loaded yet
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
    setRootCause(null);
    setFixProposal(null);
    setVerificationResult(null);
    setLastAppliedSnapshot(null);
    setSelectedIssueId(null);
    setActiveReport(null);
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

  const filteredIssues = useMemo(() => {
    return projectIssues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (certaintyFilter !== 'all' && issue.certainty !== certaintyFilter) return false;
      return true;
    });
  }, [projectIssues, severityFilter, certaintyFilter]);

  const selectedIssue = useMemo(
    () => projectIssues.find((i) => i.id === selectedIssueId) || projectIssues[0] || null,
    [projectIssues, selectedIssueId],
  );

  // -------------------------------------------------------------------------
  // Actions: Scan, Investigate, Propose Fix, Authorize/Apply, Rollback, Chat
  // -------------------------------------------------------------------------
  const handleRunScan = async (overrideMode?: RescueScanMode) => {
    if (!firebaseUser || !activeProject) return;
    if (files.length === 0) {
      notify('error', 'This project has no files yet. Add files in Mideo IDE or import a folder first.');
      return;
    }
    const mode = overrideMode || scanMode;
    setScanning(true);
    try {
      const rawReport = await scanProjectViaApi({
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        scanMode: mode,
        files,
      });
      const savedReport = await saveRescueScanReport(firebaseUser.uid, rawReport);
      setActiveReport(savedReport);
      setScanHistory((prev) => [savedReport, ...prev.filter((r) => r.id !== savedReport.id)]);
      if (savedReport.issues.length > 0) {
        setSelectedIssueId(savedReport.issues[0].id);
      }
      notify(
        savedReport.issues.length === 0 ? 'success' : 'info',
        `${mode.toUpperCase()} Scan complete: Health ${savedReport.healthScore}/100 · ${savedReport.confirmedCount} confirmed, ${savedReport.potentialCount} potential issues.`,
      );
      return savedReport;
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Project Rescue scan failed.');
      return null;
    } finally {
      setScanning(false);
    }
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
      });
      setRootCause(analysis);
      setTab(targetTab);
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
        f.id === targetFile.id ? { ...f, content: fixProposal.proposedCode } : f,
      );
      const totalBytes = updatedFiles.reduce((sum, f) => sum + new Blob([f.content]).size, 0);
      await forceOverwriteProjectFile(
        activeProject.id,
        targetFile.id,
        fixProposal.proposedCode,
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
        verificationSummary: verification.summary,
        status: 'applied',
      });

      setFiles(updatedFiles);
      setFixProposal({ ...fixProposal, status: 'applied' });
      setVerificationResult(verification);
      setLastAppliedSnapshot({
        versionId: snapshot.id,
        versionNumber: snapshot.versionNumber,
        fixRecordId: fixRec.id,
        filePath: fixProposal.filePath,
      });
      setFixHistory((prev) => [fixRec, ...prev]);

      // Refresh workspace project version & run updated scan silently
      await refreshUserData();
      const postScan = await scanProjectViaApi({
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        scanMode: 'quick',
        files: updatedFiles,
      }).catch(() => null);
      if (postScan) {
        setActiveReport(postScan);
      }

      if (verification.passed) {
        notify('success', `Fix applied and verified on ${fixProposal.filePath}.`);
      } else {
        notify('info', 'Fix applied, but post-fix verification detected remaining issues. Rollback is ready.');
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
        setLastAppliedSnapshot(null);
      }
      await refreshUserData();
      notify('success', `Rolled back ${record.filePath} to pre-fix snapshot v${targetVersion.versionNumber}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

  const handleImportProjectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = '';
    if (!fileList || fileList.length === 0 || !firebaseUser || !profile) return;

    const picked = Array.from(fileList);
    setImportingFiles(true);
    try {
      const supportedExt = new Set([
        'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'html', 'htm', 'css', 'scss', 'sql', 'json', 'md', 'yml', 'yaml', 'txt',
      ]);
      const parsedFiles: { name: string; folder: string; language: string; content: string }[] = [];
      let skippedCount = 0;

      for (const f of picked) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const lower = rel.toLowerCase();
        if (
          lower.includes('node_modules/') ||
          lower.includes('.git/') ||
          lower.includes('/dist/') ||
          lower.endsWith('.env') ||
          lower.includes('.env.local') ||
          f.size > 150_000
        ) {
          skippedCount++;
          continue;
        }
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (!supportedExt.has(ext)) {
          skippedCount++;
          continue;
        }
        const text = await f.text();
        const parts = rel.split('/');
        const rootFolder = parts.length > 1 ? parts.slice(1, -1).join('/') : '';
        parsedFiles.push({
          name: f.name,
          folder: rootFolder,
          language: detectLanguageFromFilename(f.name),
          content: text.slice(0, 150_000),
        });
        if (parsedFiles.length >= 40) break;
      }

      if (parsedFiles.length === 0) {
        throw new Error('No supported source code files (.js, .ts, .tsx, .py, .html, .css, .sql, .json) were found.');
      }

      const firstRel = (picked[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const inferredName = firstRel.includes('/') ? firstRel.split('/')[0] : `Imported Rescue Project`;
      const hasPy = parsedFiles.some((f) => f.language === 'python');
      const hasTs = parsedFiles.some((f) => f.language === 'typescript');
      const hasHtml = parsedFiles.some((f) => f.language === 'html');
      const projLang: Project['language'] = hasPy
        ? 'python'
        : hasTs
          ? 'typescript'
          : hasHtml
            ? 'web'
            : 'javascript';

      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: `${inferredName}`.slice(0, 110),
        description: `Imported for Project Rescue AI analysis (${parsedFiles.length} files${skippedCount ? `, ${skippedCount} skipped` : ''}).`,
        language: projLang,
        files: parsedFiles,
      });

      await refreshUserData();
      setSelectedProjectId(created.project.id);
      setActiveIdeProjectId(created.project.id);
      setFiles(created.files);
      notify(
        'success',
        `Imported "${created.project.title}" (${created.files.length} files${skippedCount ? `, ${skippedCount} binary/ignored skipped` : ''}).`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Project import failed.');
    } finally {
      setImportingFiles(false);
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
    const topIssue = report?.issues[0] || selectedIssue || null;
    const rc = await handleInvestigate(
      topIssue,
      rescueSymptom.trim() || topIssue?.summary || 'Investigate why this project has errors or unexpected behavior.',
      'rescue_mode',
    );
    if (rc) {
      setRescueStep(3);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Project Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
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
              accept=".js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.html,.htm,.css,.scss,.sql,.json,.md,.yml,.yaml,.txt"
              className="hidden"
              onChange={handleImportProjectFiles}
            />

            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={importingFiles}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer disabled:opacity-50"
            >
              {importingFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
              Import Folder
            </button>
            <button
              type="button"
              onClick={() => multiFileInputRef.current?.click()}
              disabled={importingFiles}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer disabled:opacity-50"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              Import Files
            </button>
            <button
              type="button"
              onClick={() => {
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
              onClick={() => handleRunScan()}
              disabled={scanning || loadingFiles || !activeProject}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
              {scanning ? 'Scanning Project...' : 'Scan Project'}
            </button>
          </div>
        </div>

        {/* Active Project Selector & Workspace Links */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeProject?.id || ''}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setActiveIdeProjectId(e.target.value);
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

      {/* No Project Empty State */}
      {!activeProject ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] p-12 text-center space-y-4">
          <FolderGit2 className="w-10 h-10 text-blue-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Select or Import a Coding Project to Rescue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Import a local project folder or multi-file codebase above, or open any existing project in Mideo Projects / Mideo IDE.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <FolderUp className="w-4 h-4" />
              Import Project Folder
            </button>
            <button
              type="button"
              onClick={() => setActiveView('projects')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Browse Mideo Projects
            </button>
          </div>
        </div>
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
                  item.id === 'scanner' && activeReport
                    ? activeReport.issues.length
                    : item.id === 'history'
                      ? scanHistory.length
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
                    {filteredIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3"
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
                          <div className="flex flex-wrap items-center gap-2">
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
                              Open in Mideo AI Debug
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                              await navigator.clipboard.writeText(fixProposal.proposedCode);
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
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          Pre-Apply Fix Impact Analysis
                        </h4>
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

                    {/* Side-by-Side / Unified Code Diff */}
                    <RescueCodeDiff
                      filePath={fixProposal.filePath}
                      originalCode={fixProposal.originalCode}
                      proposedCode={fixProposal.proposedCode}
                      onCopied={() => notify('success', 'Fix copied to clipboard.')}
                    />

                    {/* Post-Apply Verification & Rollback Result */}
                    {verificationResult && (
                      <div
                        className={`p-4 rounded-xl border space-y-3 ${
                          verificationResult.passed
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-red-500/40 bg-red-500/5'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            {verificationResult.passed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                Post-Fix Verification Result
                              </h4>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
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
                    )}
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
                        Step 1: What went wrong in &ldquo;{activeProject.title}&rdquo;?
                      </h3>
                      <textarea
                        rows={3}
                        value={rescueSymptom}
                        onChange={(e) => setRescueSymptom(e.target.value)}
                        placeholder="Describe what happened in plain English (e.g. 'My page doesn't render anything', 'Form submit reloads without saving', 'I get a syntax or import error')..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
                      />
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
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Step 6: Final Verification Summary
                      </h3>
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
                                await deleteRescueScanReport(item.id);
                                setScanHistory((prev) => prev.filter((r) => r.id !== item.id));
                                notify('info', 'Scan report removed from history.');
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
                      {fixHistory.map((fix) => (
                        <div key={fix.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {fix.filePath}
                              </span>
                              <span className="text-slate-400">({fix.projectTitle})</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  fix.status === 'rolled_back'
                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                    : fix.verificationPassed
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {fix.status === 'rolled_back'
                                  ? 'Rolled Back'
                                  : fix.verificationPassed
                                    ? 'Verified'
                                    : 'Needs Review'}
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
                      ))}
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

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs space-y-1">
              <div>
                <span className="font-semibold">Fix:</span> {fixProposal.problemIdentified}
              </div>
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
    </div>
  );
}
