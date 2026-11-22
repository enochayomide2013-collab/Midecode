import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { extractReadableError } from '../services/firebase';
import {
  auth,
  logoutReal,
  onAppAuthStateChanged,
  refreshAuthUser,
  type AppUser as User,
} from '../services/authService';
import {
  loadOrCreateUserProfile,
  getUserSettings,
  saveUserSettings,
  listCourseProgress,
  listUserProjects,
  listSharedProjects,
  listNotifications,
  listBookmarks,
  listUserAchievements,
  awardVerifiedXp,
  createProjectWithFiles,
} from '../services/dataService';
import { saveArchitecturePlan } from '../services/architectService';
import {
  listPublishedMissions,
  listUserMissionAttempts,
} from '../services/missionService';
import { CURATED_MISSIONS } from '../data/missionsData';
import type {
  ArchitecturePlan,
  UserProfile,
  UserSettings,
  CourseProgress,
  Project,
  NotificationItem,
  BookmarkItem,
  AchievementItem,
  NavSection,
  ThemeMode,
  AiMode,
  IdeLaunchPayload,
  Mission,
  MissionAttempt,
  MissionSubView,
  RescueInternalTab,
  RescueLaunchContext,
} from '../types/mideocode';

export interface AiLaunchContext {
  mode: AiMode;
  prompt: string;
  context?: {
    courseTitle?: string;
    lessonTitle?: string;
    missionTitle?: string;
    missionScenario?: string;
    currentCheckpointTitle?: string;
    currentCheckpointRequirements?: string[];
    language?: string;
    selectedCode?: string;
    errorMessage?: string;
    filename?: string;
  };
}

export interface RuntimeCapabilities {
  browserWeb: boolean;
  isolatedNodeVm: boolean;
  python3: boolean;
  pythonVersion: string | null;
  geminiAi: boolean;
  firebaseProjectId: string | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface MideoContextValue {
  firebaseUser: User | null;
  authLoading: boolean;
  profile: UserProfile | null;
  settings: UserSettings | null;
  theme: ThemeMode;
  toggleTheme: () => Promise<void>;
  updateEditorSettings: (
    patch: Partial<Pick<UserSettings, 'editorTheme' | 'editorFontSize' | 'tabSize' | 'autosave'>>,
  ) => Promise<void>;
  activeView: NavSection;
  setActiveView: (view: NavSection) => void;
  courseProgress: Record<string, CourseProgress>;
  projects: Project[];
  sharedProjects: Project[];
  accessibleProjects: Project[];
  notifications: NotificationItem[];
  bookmarks: BookmarkItem[];
  achievements: AchievementItem[];
  capabilities: RuntimeCapabilities | null;
  missions: Mission[];
  missionAttempts: MissionAttempt[];
  selectedMissionId: string | null;
  missionSubView: MissionSubView;
  openMissionCatalog: () => void;
  openMissionDetails: (missionId: string) => void;
  openMissionWorkspace: (missionId: string) => void;
  openMissionHistory: () => void;
  openMissionAnalytics: () => void;
  openCustomMissions: () => void;
  openTeamMissions: () => void;
  refreshMissions: () => Promise<void>;
  selectedCourseId: string;
  selectedLessonId: string | null;
  selectedDocId: string;
  selectedLabTool: string;
  selectedChallengeId: string;
  activeIdeProjectId: string | null;
  setActiveIdeProjectId: (id: string | null) => void;
  testLabLaunch: { projectId: string; initialTab?: 'dashboard' | 'generate' | 'suites' | 'results' | 'history' } | null;
  clearTestLabLaunch: () => void;
  openTestLabForProject: (
    projectId: string,
    initialTab?: 'dashboard' | 'generate' | 'suites' | 'results' | 'history',
  ) => void;
  architectLaunch: { architectureId?: string; projectId?: string } | null;
  clearArchitectLaunch: () => void;
  openArchitectForProject: (projectId?: string, architectureId?: string) => void;
  versionsProjectId: string | null;
  setVersionsProjectId: (id: string | null) => void;
  openVersionsForProject: (projectId: string) => void;
  collabProjectId: string | null;
  setCollabProjectId: (id: string | null) => void;
  openCollabForProject: (projectId: string) => void;
  ideFollowTargetUid: string | null;
  setIdeFollowTargetUid: (uid: string | null) => void;
  openProjectInIdeAndFollow: (projectId: string, targetUid?: string) => void;
  rescueLaunch: RescueLaunchContext | null;
  clearRescueLaunch: () => void;
  openRescueForProject: (
    projectId: string,
    initialTab?: RescueInternalTab,
    initialPrompt?: string,
  ) => void;
  sendArchitectureToBuild: (plan: ArchitecturePlan) => Promise<void>;
  aiLaunch: AiLaunchContext | null;
  clearAiLaunch: () => void;
  openCourse: (courseId: string, lessonId?: string) => void;
  openDoc: (docId: string) => void;
  openLab: (toolId: string) => void;
  openChallenge: (challengeId: string) => void;
  openInIde: (payload: IdeLaunchPayload) => Promise<void>;
  askAi: (payload: AiLaunchContext) => void;
  refreshUserData: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
  grantXp: (
    sourceType: 'lesson' | 'quiz' | 'challenge' | 'project' | 'mission',
    sourceId: string,
    reason: string,
  ) => Promise<{ awarded: number; alreadyClaimed: boolean }>;
  signOutUser: () => Promise<void>;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
  authModalOpen: boolean;
  authModalTab: 'signin' | 'register';
  openAuthModal: (tab?: 'signin' | 'register') => void;
  closeAuthModal: () => void;
}

const MideoContext = createContext<MideoContextValue | null>(null);

function parseLocationRoute(): {
  view: NavSection;
  missionSubView: MissionSubView;
  missionId: string | null;
} {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/dashboard/missions') {
    return { view: 'missions', missionSubView: 'landing', missionId: null };
  }
  if (path === '/dashboard/missions/history') {
    return { view: 'missions', missionSubView: 'history', missionId: null };
  }
  if (path === '/dashboard/missions/analytics') {
    return { view: 'missions', missionSubView: 'analytics', missionId: null };
  }
  if (path === '/dashboard/missions/custom') {
    return { view: 'missions', missionSubView: 'custom', missionId: null };
  }
  if (path === '/dashboard/missions/team') {
    return { view: 'missions', missionSubView: 'team', missionId: null };
  }
  const wsMatch = path.match(/^\/dashboard\/missions\/([^/]+)\/workspace$/);
  if (wsMatch) {
    return { view: 'missions', missionSubView: 'workspace', missionId: decodeURIComponent(wsMatch[1]) };
  }
  const detMatch = path.match(/^\/dashboard\/missions\/([^/]+)$/);
  if (detMatch) {
    return { view: 'missions', missionSubView: 'details', missionId: decodeURIComponent(detMatch[1]) };
  }
  const validViews: NavSection[] = [
    'dashboard', 'insights', 'academy', 'missions', 'ide', 'ai', 'projects',
    'rescue', 'versions', 'collaboration', 'testlab', 'architect',
    'docs', 'lab', 'challenges', 'quest', 'community', 'career',
    'cloud', 'playground', 'profile', 'admin',
  ];
  const dashMatch = path.match(/^\/dashboard\/([^/]+)$/);
  if (dashMatch && validViews.includes(dashMatch[1] as NavSection)) {
    return { view: dashMatch[1] as NavSection, missionSubView: 'landing', missionId: null };
  }
  return { view: 'dashboard', missionSubView: 'landing', missionId: null };
}

function pushAppUrl(pathname: string): void {
  try {
    if (window.location.pathname !== pathname) {
      window.history.pushState({}, '', pathname);
    }
  } catch {
    // Ignore restricted history API calls cleanly
  }
}

export function MideoProvider({ children }: { children: React.ReactNode }) {
  const initialRoute = parseLocationRoute();

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [, setAuthRevision] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeView, setActiveViewState] = useState<NavSection>(initialRoute.view);

  const [courseProgress, setCourseProgress] = useState<Record<string, CourseProgress>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);

  const [missions, setMissions] = useState<Mission[]>(CURATED_MISSIONS);
  const [missionAttempts, setMissionAttempts] = useState<MissionAttempt[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(initialRoute.missionId);
  const [missionSubView, setMissionSubView] = useState<MissionSubView>(initialRoute.missionSubView);

  const [selectedCourseId, setSelectedCourseId] = useState('html-css-architecture');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState('doc-html-semantics');
  const [selectedLabTool, setSelectedLabTool] = useState('flexbox');
  const [selectedChallengeId, setSelectedChallengeId] = useState('two-sum-indices');
  const [activeIdeProjectId, setActiveIdeProjectId] = useState<string | null>(null);
  const activeIdeProjectIdRef = useRef<string | null>(null);
  activeIdeProjectIdRef.current = activeIdeProjectId;
  const [testLabLaunch, setTestLabLaunch] = useState<{
    projectId: string;
    initialTab?: 'dashboard' | 'generate' | 'suites' | 'results' | 'history';
  } | null>(null);
  const [architectLaunch, setArchitectLaunch] = useState<{
    architectureId?: string;
    projectId?: string;
  } | null>(null);
  const [versionsProjectId, setVersionsProjectId] = useState<string | null>(null);
  const [collabProjectId, setCollabProjectId] = useState<string | null>(null);
  const [ideFollowTargetUid, setIdeFollowTargetUid] = useState<string | null>(null);
  const [rescueLaunch, setRescueLaunch] = useState<RescueLaunchContext | null>(null);
  const [aiLaunch, setAiLaunch] = useState<AiLaunchContext | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'register'>('signin');

  const accessibleProjects = React.useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    for (const sp of sharedProjects) map.set(sp.id, sp);
    return Array.from(map.values());
  }, [projects, sharedProjects]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocationRoute();
      setActiveViewState(parsed.view);
      setMissionSubView(parsed.missionSubView);
      setSelectedMissionId(parsed.missionId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    fetch('/api/runtime/capabilities')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCapabilities(data as RuntimeCapabilities);
      })
      .catch(() => {});
  }, []);

  const setActiveView = useCallback((view: NavSection) => {
    setActiveViewState(view);
    if (view === 'missions') {
      setMissionSubView('landing');
      setSelectedMissionId(null);
      pushAppUrl('/dashboard/missions');
    } else if (view === 'dashboard') {
      pushAppUrl('/dashboard');
    } else {
      pushAppUrl(`/dashboard/${view}`);
    }
  }, []);

  const openMissionCatalog = useCallback(() => {
    setActiveViewState('missions');
    setMissionSubView('landing');
    setSelectedMissionId(null);
    pushAppUrl('/dashboard/missions');
  }, []);

  const openMissionDetails = useCallback((missionId: string) => {
    setActiveViewState('missions');
    setSelectedMissionId(missionId);
    setMissionSubView('details');
    pushAppUrl(`/dashboard/missions/${encodeURIComponent(missionId)}`);
  }, []);

  const openMissionWorkspace = useCallback((missionId: string) => {
    setActiveViewState('missions');
    setSelectedMissionId(missionId);
    setMissionSubView('workspace');
    pushAppUrl(`/dashboard/missions/${encodeURIComponent(missionId)}/workspace`);
  }, []);

  const openMissionHistory = useCallback(() => {
    setActiveViewState('missions');
    setMissionSubView('history');
    setSelectedMissionId(null);
    pushAppUrl('/dashboard/missions/history');
  }, []);

  const openMissionAnalytics = useCallback(() => {
    setActiveViewState('missions');
    setMissionSubView('analytics');
    setSelectedMissionId(null);
    pushAppUrl('/dashboard/missions/analytics');
  }, []);

  const openCustomMissions = useCallback(() => {
    setActiveViewState('missions');
    setMissionSubView('custom');
    setSelectedMissionId(null);
    pushAppUrl('/dashboard/missions/custom');
  }, []);

  const openTeamMissions = useCallback(() => {
    setActiveViewState('missions');
    setMissionSubView('team');
    setSelectedMissionId(null);
    pushAppUrl('/dashboard/missions/team');
  }, []);

  const inFlightWorkspaceLoadsRef = useRef<Map<string, Promise<void>>>(new Map());

  const loadWorkspaceData = useCallback(async (user: User) => {
    const existing = inFlightWorkspaceLoadsRef.current.get(user.uid);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      const isAdmin = Boolean(
        user.email?.toLowerCase() === 'enochayomide2013@gmail.com' ||
          user.role === 'admin' ||
          sessionStorage.getItem('mideocode_admin_password_unlocked') === 'true',
      );
      const prof = await loadOrCreateUserProfile(user);
      setProfile(prof);

      const results = await Promise.allSettled([
        getUserSettings(user.uid),
        listCourseProgress(user.uid),
        listUserProjects(user.uid),
        listSharedProjects(user.uid),
        listNotifications(user.uid),
        listBookmarks(user.uid),
        listUserAchievements(user.uid),
        listPublishedMissions(isAdmin),
        listUserMissionAttempts(user.uid),
      ]);

      const userSet = results[0].status === 'fulfilled' ? results[0].value : null;
      const progress = results[1].status === 'fulfilled' ? results[1].value : {};
      const projs = results[2].status === 'fulfilled' ? results[2].value : [];
      const shared = results[3].status === 'fulfilled' ? results[3].value : [];
      const notifs = results[4].status === 'fulfilled' ? results[4].value : [];
      const bms = results[5].status === 'fulfilled' ? results[5].value : [];
      const achs = results[6].status === 'fulfilled' ? results[6].value : [];
      const loadedMissions = results[7].status === 'fulfilled' ? results[7].value : CURATED_MISSIONS;
      const loadedAttempts = results[8].status === 'fulfilled' ? results[8].value : [];

      if (userSet) {
        setSettings(userSet);
        setTheme(userSet.theme);
      }
      setCourseProgress(progress);
      setProjects(projs);
      setSharedProjects(shared);
      const firstProjId = projs[0]?.id || shared[0]?.id || null;
      if (firstProjId && !activeIdeProjectIdRef.current) {
        setActiveIdeProjectId(firstProjId);
      }
      setNotifications(notifs);
      setBookmarks(bms);
      setAchievements(achs);
      setMissions(loadedMissions);
      setMissionAttempts(loadedAttempts);
    })().finally(() => {
      inFlightWorkspaceLoadsRef.current.delete(user.uid);
    });

    inFlightWorkspaceLoadsRef.current.set(user.uid, task);
    return task;
  }, []);

  const refreshMissions = useCallback(async () => {
    if (!firebaseUser) return;
    const isAdmin = Boolean(
      firebaseUser.email?.toLowerCase() === 'enochayomide2013@gmail.com' ||
        profile?.role === 'admin' ||
        sessionStorage.getItem('mideocode_admin_password_unlocked') === 'true',
    );
    const [loadedMissions, loadedAttempts] = await Promise.all([
      listPublishedMissions(isAdmin),
      listUserMissionAttempts(firebaseUser.uid),
    ]);
    setMissions(loadedMissions);
    setMissionAttempts(loadedAttempts);
  }, [firebaseUser, profile?.role]);

  useEffect(() => {
    let settled = false;
    const failSafeTimer = setTimeout(() => {
      if (!settled) {
        setAuthLoading(false);
      }
    }, 3000);

    const unsub = onAppAuthStateChanged(async (user) => {
      settled = true;
      clearTimeout(failSafeTimer);
      setFirebaseUser(user);
      if (user) {
        try {
          await loadWorkspaceData(user);
          setAuthModalOpen(false);
        } catch (err) {
          notify('error', extractReadableError(err, 'Failed to load user workspace.'));
        }
      } else {
        setProfile(null);
        setSettings(null);
        setCourseProgress({});
        setProjects([]);
        setSharedProjects([]);
        setNotifications([]);
        setBookmarks([]);
        setAchievements([]);
        setMissions(CURATED_MISSIONS);
        setMissionAttempts([]);
      }
      setAuthLoading(false);
    });
    return () => {
      clearTimeout(failSafeTimer);
      unsub();
    };
  }, [loadWorkspaceData, notify]);

  const refreshUserData = useCallback(async () => {
    const target = firebaseUser || auth.currentUser;
    if (!target) return;
    setFirebaseUser(target);
    await loadWorkspaceData(target);
  }, [firebaseUser, loadWorkspaceData]);

  const refreshAuthState = useCallback(async () => {
    const target = firebaseUser || auth.currentUser;
    if (!target) return;
    const updated = await refreshAuthUser(target);
    setFirebaseUser(updated);
    setAuthRevision((r) => r + 1);
  }, [firebaseUser]);

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (firebaseUser) {
      await saveUserSettings(firebaseUser.uid, {
        theme: next,
        editorTheme: next === 'dark' ? 'oneDark' : 'githubLight',
      });
      setSettings((prev) =>
        prev ? { ...prev, theme: next, editorTheme: next === 'dark' ? 'oneDark' : 'githubLight' } : prev,
      );
    }
  }, [theme, firebaseUser]);

  const updateEditorSettings = useCallback(
    async (patch: Partial<Pick<UserSettings, 'editorTheme' | 'editorFontSize' | 'tabSize' | 'autosave'>>) => {
      if (!firebaseUser) return;
      await saveUserSettings(firebaseUser.uid, patch);
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      notify('success', 'Editor preferences saved.');
    },
    [firebaseUser, notify],
  );

  const openCourse = useCallback((courseId: string, lessonId?: string) => {
    setSelectedCourseId(courseId);
    setSelectedLessonId(lessonId || null);
    setActiveView('academy');
  }, [setActiveView]);

  const openDoc = useCallback((docId: string) => {
    setSelectedDocId(docId);
    setActiveView('docs');
  }, [setActiveView]);

  const openLab = useCallback((toolId: string) => {
    setSelectedLabTool(toolId);
    setActiveView('lab');
  }, [setActiveView]);

  const openChallenge = useCallback((challengeId: string) => {
    setSelectedChallengeId(challengeId);
    setActiveView('challenges');
  }, [setActiveView]);

  const openInIde = useCallback(
    async (payload: IdeLaunchPayload) => {
      if (!firebaseUser || !profile) {
        notify('info', 'Please sign in to launch and save workspaces in Mideo IDE.');
        setAuthModalOpen(true);
        return;
      }
      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: payload.title,
        description: `Created from MideoCode workspace (${payload.language})`,
        language: payload.language,
        guidedProjectId: payload.guidedProjectId,
        files: payload.files,
      });
      setProjects((prev) => [created.project, ...prev]);
      setActiveIdeProjectId(created.project.id);
      setActiveView('ide');
      notify('success', `Opened "${created.project.title}" in Mideo IDE.`);
    },
    [firebaseUser, profile, notify, setActiveView],
  );

  const askAi = useCallback((payload: AiLaunchContext) => {
    setAiLaunch(payload);
    setActiveView('ai');
  }, [setActiveView]);

  const clearAiLaunch = useCallback(() => setAiLaunch(null), []);

  const openTestLabForProject = useCallback(
    (projectId: string, initialTab?: 'dashboard' | 'generate' | 'suites' | 'results' | 'history') => {
      setActiveIdeProjectId(projectId);
      setTestLabLaunch({ projectId, initialTab });
      setActiveView('testlab');
    },
    [setActiveView],
  );
  const clearTestLabLaunch = useCallback(() => setTestLabLaunch(null), []);

  const openArchitectForProject = useCallback(
    (projectId?: string, architectureId?: string) => {
      setArchitectLaunch({ projectId, architectureId });
      setActiveView('architect');
    },
    [setActiveView],
  );
  const clearArchitectLaunch = useCallback(() => setArchitectLaunch(null), []);

  const openVersionsForProject = useCallback(
    (projectId: string) => {
      setActiveIdeProjectId(projectId);
      setVersionsProjectId(projectId);
      setActiveView('versions');
    },
    [setActiveView],
  );

  const openCollabForProject = useCallback(
    (projectId: string) => {
      setActiveIdeProjectId(projectId);
      setCollabProjectId(projectId);
      setActiveView('collaboration');
    },
    [setActiveView],
  );

  const openProjectInIdeAndFollow = useCallback(
    (projectId: string, targetUid?: string) => {
      setActiveIdeProjectId(projectId);
      setIdeFollowTargetUid(targetUid || null);
      setActiveView('ide');
    },
    [setActiveView],
  );

  const openRescueForProject = useCallback(
    (projectId: string, initialTab?: RescueInternalTab, initialPrompt?: string) => {
      setActiveIdeProjectId(projectId);
      setRescueLaunch({ projectId, initialTab, initialPrompt });
      setActiveView('rescue');
    },
    [setActiveView],
  );
  const clearRescueLaunch = useCallback(() => setRescueLaunch(null), []);

  const sendArchitectureToBuild = useCallback(
    async (plan: ArchitecturePlan) => {
      if (!firebaseUser || !profile) {
        notify('info', 'Sign in to create a build workspace from your architecture.');
        setAuthModalOpen(true);
        return;
      }

      const techSummary = (plan.techStack || [])
        .map((t) => `${t.layer}: ${t.choice}`)
        .join(', ');
      const isPython = techSummary.toLowerCase().includes('python') || techSummary.toLowerCase().includes('fastapi') || techSummary.toLowerCase().includes('django') || techSummary.toLowerCase().includes('flask');
      const isWeb = techSummary.toLowerCase().includes('html') || techSummary.toLowerCase().includes('react') || techSummary.toLowerCase().includes('frontend');
      const projectLang: Project['language'] = isPython ? 'python' : isWeb ? 'web' : 'javascript';

      const readmeContent = [
        `# ${plan.title}`,
        '',
        plan.overview,
        '',
        '## Tech Stack',
        ...(plan.techStack || []).map((t) => `- **${t.layer}**: ${t.choice} — ${t.rationale}`),
        '',
        '## Modules',
        ...(plan.modules || []).map((m) => `- **${m.name}** (\`${m.folderPath}\`): ${m.purpose}`),
        '',
        '## Database Tables',
        ...(plan.databaseTables || []).map(
          (tbl) =>
            `- **${tbl.name}**: ${tbl.fields.map((f) => `${f.name}:${f.type}${f.isPrimaryKey ? ' PK' : ''}`).join(', ')}`,
        ),
        '',
        '## API Endpoints',
        ...(plan.apiEndpoints || []).map((ep) => `- \`${ep.method} ${ep.path}\`: ${ep.summary}`),
      ].join('\n');

      const starterFiles: { name: string; folder: string; language: string; content: string }[] = [
        {
          name: 'ARCHITECTURE.md',
          folder: '',
          language: 'javascript',
          content: readmeContent,
        },
      ];

      const seenNames = new Set<string>(['ARCHITECTURE.md']);
      for (const mod of (plan.modules || []).slice(0, 6)) {
        const keyFile = mod.keyFiles?.[0] || `${mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${isPython ? 'py' : 'js'}`;
        const fileName = keyFile.split('/').pop() || keyFile;
        if (seenNames.has(fileName)) continue;
        seenNames.add(fileName);
        const lang = fileName.endsWith('.py')
          ? 'python'
          : fileName.endsWith('.html')
            ? 'html'
            : fileName.endsWith('.css')
              ? 'css'
              : fileName.endsWith('.sql')
                ? 'sql'
                : 'javascript';
        starterFiles.push({
          name: fileName,
          folder: '',
          language: lang,
          content:
            lang === 'python'
              ? `# Module: ${mod.name}\n# Purpose: ${mod.purpose}\n\ndef init_module():\n    return {"module": "${mod.name}", "status": "ready"}\n`
              : `// Module: ${mod.name}\n// Purpose: ${mod.purpose}\nexport function initModule() {\n  return { module: '${mod.name}', status: 'ready' };\n}\n`,
        });
      }

      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: `${plan.title} Workspace`.slice(0, 120),
        description: plan.overview.slice(0, 800),
        language: projectLang === 'python' ? 'python' : projectLang === 'web' ? 'web' : 'javascript',
        architectureId: plan.id,
        files: starterFiles,
      });

      await saveArchitecturePlan(
        firebaseUser.uid,
        {
          ...plan,
          projectId: created.project.id,
          status: 'sent_to_build',
        },
        `Linked workspace "${created.project.title}" and sent to Mideo AI Build`,
      );

      setProjects((prev) => [created.project, ...prev]);
      setActiveIdeProjectId(created.project.id);

      askAi({
        mode: 'build',
        prompt: `Implement the approved software architecture "${plan.title}" in workspace "${created.project.title}". Start with core modules (${plan.modules.map((m) => m.name).join(', ')}), database schema (${plan.databaseTables.map((t) => t.name).join(', ')}), and key API endpoints (${plan.apiEndpoints.map((e) => `${e.method} ${e.path}`).join(', ')}).`,
        context: {
          language: projectLang,
          filename: starterFiles[1]?.name || 'ARCHITECTURE.md',
          selectedCode: readmeContent.slice(0, 4000),
        },
      });
      notify('success', `Created workspace "${created.project.title}" and opened Mideo AI Build.`);
    },
    [firebaseUser, profile, notify, askAi],
  );

  const grantXp = useCallback(
    async (
      sourceType: 'lesson' | 'quiz' | 'challenge' | 'project' | 'mission',
      sourceId: string,
      reason: string,
    ) => {
      if (!firebaseUser) return { awarded: 0, alreadyClaimed: false };
      const res = await awardVerifiedXp(firebaseUser.uid, sourceType, sourceId, reason);
      if (res.awarded > 0) {
        notify('success', `+${res.awarded} XP earned: ${reason}`);
        await loadWorkspaceData(firebaseUser);
      }
      return { awarded: res.awarded, alreadyClaimed: res.alreadyClaimed };
    },
    [firebaseUser, loadWorkspaceData, notify],
  );

  const signOutUser = useCallback(async () => {
    await logoutReal();
    setActiveView('dashboard');
    notify('info', 'Signed out securely.');
  }, [notify, setActiveView]);

  const openAuthModal = useCallback((tab: 'signin' | 'register' = 'signin') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  return (
    <MideoContext.Provider
      value={{
        firebaseUser,
        authLoading,
        profile,
        settings,
        theme,
        toggleTheme,
        updateEditorSettings,
        activeView,
        setActiveView,
        courseProgress,
        projects,
        sharedProjects,
        accessibleProjects,
        notifications,
        bookmarks,
        achievements,
        capabilities,
        missions,
        missionAttempts,
        selectedMissionId,
        missionSubView,
        openMissionCatalog,
        openMissionDetails,
        openMissionWorkspace,
        openMissionHistory,
        openMissionAnalytics,
        openCustomMissions,
        openTeamMissions,
        refreshMissions,
        selectedCourseId,
        selectedLessonId,
        selectedDocId,
        selectedLabTool,
        selectedChallengeId,
        activeIdeProjectId,
        setActiveIdeProjectId,
        testLabLaunch,
        clearTestLabLaunch,
        openTestLabForProject,
        architectLaunch,
        clearArchitectLaunch,
        openArchitectForProject,
        versionsProjectId,
        setVersionsProjectId,
        openVersionsForProject,
        collabProjectId,
        setCollabProjectId,
        openCollabForProject,
        ideFollowTargetUid,
        setIdeFollowTargetUid,
        openProjectInIdeAndFollow,
        rescueLaunch,
        clearRescueLaunch,
        openRescueForProject,
        sendArchitectureToBuild,
        aiLaunch,
        clearAiLaunch,
        openCourse,
        openDoc,
        openLab,
        openChallenge,
        openInIde,
        askAi,
        refreshUserData,
        refreshAuthState,
        grantXp,
        signOutUser,
        toasts,
        notify,
        dismissToast,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </MideoContext.Provider>
  );
}

export function useMideo() {
  const ctx = useContext(MideoContext);
  if (!ctx) throw new Error('useMideo must be used inside MideoProvider');
  return ctx;
}
