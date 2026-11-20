/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CheckSquare,
  Cloud,
  Code2,
  Compass,
  FileCode2,
  Flag,
  FlaskConical,
  FolderGit2,
  GitBranch,
  Home,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Shield,
  Sparkles,
  Sun,
  Target,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { MideoProvider, useMideo } from './context/MideoContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MideoLogo } from './components/MideoLogo';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { OnboardingFlow } from './components/OnboardingFlow';
import { AdminAccessModal } from './components/AdminAccessModal';
import { DashboardView } from './views/DashboardView';
import { AcademyView } from './views/AcademyView';
import { MissionsView } from './views/MissionsView';
import { IdeView } from './views/IdeView';
import { AiView } from './views/AiView';
import { ProjectsView } from './views/ProjectsView';
import { DocsView } from './views/DocsView';
import { LabView } from './views/LabView';
import { ChallengesView } from './views/ChallengesView';
import { QuestView } from './views/QuestView';
import { CommunityView } from './views/CommunityView';
import { CareerView } from './views/CareerView';
import { CloudView } from './views/CloudView';
import { PlaygroundView } from './views/PlaygroundView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';
import { TestLabView } from './views/TestLabView';
import { ArchitectView } from './views/ArchitectView';
import { VersionHistoryView } from './views/VersionHistoryView';
import { CollaborationView } from './views/CollaborationView';
import { DeveloperInsightsView } from './views/DeveloperInsightsView';
import { ProjectRescueView } from './views/ProjectRescueView';
import { ACADEMY_COURSES } from './data/academyData';
import { DOC_ARTICLES } from './data/docsData';
import { GUIDED_PROJECTS } from './data/projectsData';
import { CHALLENGES } from './data/challengesData';
import { markNotificationRead } from './services/dataService';
import type { NavSection } from './types/mideocode';

interface NavItem {
  id: NavSection;
  label: string;
  icon: typeof Home;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'insights', label: 'Developer Insights', icon: BarChart3 },
  { id: 'academy', label: 'Mideo Academy', icon: BookOpen },
  { id: 'missions', label: 'Mission Mode', icon: Flag },
  { id: 'ide', label: 'Mideo IDE', icon: Code2 },
  { id: 'ai', label: 'Mideo AI', icon: Sparkles },
  { id: 'projects', label: 'Mideo Projects', icon: FolderGit2 },
  { id: 'rescue', label: 'Project Rescue AI', icon: LifeBuoy },
  { id: 'architect', label: 'Architect', icon: Compass },
  { id: 'testlab', label: 'TestLab', icon: CheckSquare },
  { id: 'versions', label: 'Version History', icon: GitBranch },
  { id: 'collaboration', label: 'Collaboration', icon: Users },
  { id: 'docs', label: 'Mideo Docs', icon: FileCode2 },
  { id: 'lab', label: 'Mideo Lab', icon: FlaskConical },
  { id: 'challenges', label: 'Mideo Challenges', icon: Target },
  { id: 'quest', label: 'Mideo Quest', icon: Trophy },
  { id: 'community', label: 'Mideo Community', icon: MessageSquare },
  { id: 'career', label: 'Mideo Career', icon: Briefcase },
  { id: 'cloud', label: 'Mideo Cloud', icon: Cloud },
  { id: 'playground', label: 'Playground', icon: LayoutGrid },
];

function ToastStack() {
  const { toasts, dismissToast } = useMideo();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl border shadow-lg flex items-start justify-between gap-3 text-xs font-medium ${
            t.type === 'error'
              ? 'bg-red-950/95 border-red-800 text-red-100'
              : t.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-800 text-emerald-100'
                : 'bg-slate-900/95 border-slate-700 text-slate-100'
          }`}
        >
          <span>{t.text}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function WorkspaceShell() {
  const {
    firebaseUser,
    authLoading,
    profile,
    theme,
    toggleTheme,
    activeView,
    setActiveView,
    notifications,
    missions,
    openMissionDetails,
    openCourse,
    openDoc,
    openChallenge,
    openInIde,
    refreshUserData,
    signOutUser,
  } = useMideo();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [adminAccessModalOpen, setAdminAccessModalOpen] = useState(false);

  const isAdminUser = Boolean(
    firebaseUser &&
      ((firebaseUser.email === 'enochayomide2013@gmail.com' && firebaseUser.emailVerified) ||
        profile?.role === 'admin'),
  );

  const searchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { type: string; title: string; onSelect: () => void }[] = [];

    for (const c of ACADEMY_COURSES) {
      if (c.title.toLowerCase().includes(q) || c.language.toLowerCase().includes(q)) {
        results.push({
          type: 'Course',
          title: c.title,
          onSelect: () => {
            openCourse(c.id);
            setGlobalQuery('');
          },
        });
      }
    }
    for (const d of DOC_ARTICLES) {
      if (d.title.toLowerCase().includes(q) || d.overview.toLowerCase().includes(q)) {
        results.push({
          type: 'Doc',
          title: d.title,
          onSelect: () => {
            openDoc(d.id);
            setGlobalQuery('');
          },
        });
      }
    }
    for (const ch of CHALLENGES) {
      if (ch.title.toLowerCase().includes(q) || ch.category.toLowerCase().includes(q)) {
        results.push({
          type: 'Challenge',
          title: ch.title,
          onSelect: () => {
            openChallenge(ch.id);
            setGlobalQuery('');
          },
        });
      }
    }
    for (const m of missions) {
      if (
        m.status === 'published' &&
        (m.title.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.requiredSkills.some((s) => s.toLowerCase().includes(q)))
      ) {
        results.push({
          type: 'Mission',
          title: m.title,
          onSelect: () => {
            openMissionDetails(m.id);
            setGlobalQuery('');
          },
        });
      }
    }
    for (const gp of GUIDED_PROJECTS) {
      if (gp.title.toLowerCase().includes(q) || gp.category.toLowerCase().includes(q)) {
        results.push({
          type: 'Project',
          title: gp.title,
          onSelect: () => {
            openInIde({
              title: gp.title,
              language: gp.language,
              guidedProjectId: gp.id,
              files: gp.starterFiles,
            });
            setGlobalQuery('');
          },
        });
      }
    }
    for (const item of PRIMARY_NAV) {
      if (item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) {
        results.push({
          type: 'Tool',
          title: item.label,
          onSelect: () => {
            setActiveView(item.id);
            setGlobalQuery('');
          },
        });
      }
    }
    return results.slice(0, 8);
  }, [globalQuery, missions, openMissionDetails, openCourse, openDoc, openChallenge, openInIde, setActiveView]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium text-slate-500">Connecting MideoCode workspace...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        <LandingPage />
        <AuthModal />
        <ToastStack />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 text-center space-y-4">
          <MideoLogo variant="mark" heightClass="h-9 mx-auto" />
          <div className="space-y-1">
            <h1 className="text-base font-bold">Loading Your MideoCode Profile</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Syncing your workspace from Cloud Firestore. If your connection interrupted, retry below.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => refreshUserData()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Retry Workspace Sync
            </button>
            <button
              onClick={signOutUser}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
        <ToastStack />
      </div>
    );
  }

  if (!profile.onboardingComplete) {
    return (
      <>
        <OnboardingFlow />
        <ToastStack />
      </>
    );
  }

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const handleOpenNotification = async (id: string, linkView?: string) => {
    await markNotificationRead(id).catch(() => {});
    await refreshUserData();
    if (linkView) {
      setActiveView(linkView as NavSection);
    }
    setNotifOpen(false);
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'insights':
        return <DeveloperInsightsView />;
      case 'academy':
        return <AcademyView />;
      case 'missions':
        return <MissionsView />;
      case 'ide':
        return <IdeView />;
      case 'ai':
        return <AiView />;
      case 'projects':
        return <ProjectsView />;
      case 'rescue':
        return <ProjectRescueView />;
      case 'architect':
        return <ArchitectView />;
      case 'testlab':
        return <TestLabView />;
      case 'versions':
        return <VersionHistoryView />;
      case 'collaboration':
        return <CollaborationView />;
      case 'docs':
        return <DocsView />;
      case 'lab':
        return <LabView />;
      case 'challenges':
        return <ChallengesView />;
      case 'quest':
        return <QuestView />;
      case 'community':
        return <CommunityView />;
      case 'career':
        return <CareerView />;
      case 'cloud':
        return <CloudView />;
      case 'playground':
        return <PlaygroundView />;
      case 'profile':
        return <ProfileView />;
      case 'admin':
        return <AdminView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0B101D] shrink-0 transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="h-16 px-3 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <button
            onClick={() => setActiveView('dashboard')}
            aria-label="MideoCode Dashboard"
            className="inline-flex items-center justify-center cursor-pointer overflow-hidden"
          >
            {sidebarCollapsed ? (
              <MideoLogo variant="mark" heightClass="h-7" />
            ) : (
              <MideoLogo variant="full" heightClass="h-10" />
            )}
          </button>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-slate-200 dark:border-slate-800/80 space-y-0.5">
          {isAdminUser && (
            <button
              onClick={() => setAdminAccessModalOpen(true)}
              title="Admin Console"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeView === 'admin'
                  ? 'bg-blue-600 text-white'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">Admin Console</span>}
            </button>
          )}
          <button
            onClick={() => setActiveView('profile')}
            title="Profile & Settings"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeView === 'profile'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">Profile & Linking</span>}
          </button>
          <button
            onClick={signOutUser}
            title="Sign Out"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800/70 cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <div className="relative w-64 max-w-[80vw] bg-white dark:bg-[#0B101D] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-10">
            <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  setActiveView('dashboard');
                  setMobileNavOpen(false);
                }}
                aria-label="MideoCode Dashboard"
                className="inline-flex items-center gap-2 cursor-pointer"
              >
                <MideoLogo variant="mark" heightClass="h-7" />
              </button>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {isAdminUser && (
                <button
                  onClick={() => {
                    setMobileNavOpen(false);
                    setAdminAccessModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-amber-500 cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Console</span>
                </button>
              )}
              <button
                onClick={() => {
                  setActiveView('profile');
                  setMobileNavOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Profile & Linking</span>
              </button>
            </nav>
            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={signOutUser}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-500 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B101D]/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-1 max-w-md">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveView('dashboard')}
              aria-label="MideoCode Dashboard"
              className="lg:hidden inline-flex items-center shrink-0 cursor-pointer"
            >
              <MideoLogo variant="mark" heightClass="h-7" />
            </button>
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Search missions, courses, docs, challenges..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] shadow-xl overflow-hidden z-40">
                  {searchResults.map((res, idx) => (
                    <button
                      key={idx}
                      onClick={res.onSelect}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {res.title}
                      </span>
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 shrink-0">
                        {res.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {profile && (
              <button
                onClick={() => setActiveView('quest')}
                className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5 text-blue-500" />
                L{profile.level} · {profile.xp} XP
              </button>
            )}

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Toggle light/dark theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 relative cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] shadow-xl p-3 space-y-2 z-40">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Notifications
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 px-1 py-3">No notifications yet.</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleOpenNotification(n.id, n.linkView)}
                          className={`w-full text-left py-2.5 px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded cursor-pointer ${
                            n.read ? 'opacity-65' : ''
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            {n.title}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{n.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveView('profile')}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer"
            >
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || 'User avatar'}
                  className="w-5 h-5 rounded object-cover"
                />
              ) : (
                <span className="w-5 h-5 rounded bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {profile?.displayName?.charAt(0).toUpperCase() || 'M'}
                </span>
              )}
              <span className="hidden md:inline text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[110px] truncate">
                {profile?.displayName || 'Developer'}
              </span>
            </button>
          </div>
        </header>

        {/* Active View Surface */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderActiveView()}
        </main>
      </div>

      <AuthModal />
      <AdminAccessModal
        isOpen={adminAccessModalOpen}
        onClose={() => setAdminAccessModalOpen(false)}
        onAccessGranted={() => {
          setAdminAccessModalOpen(false);
          setActiveView('admin');
        }}
      />
      <ToastStack />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MideoProvider>
        <WorkspaceShell />
      </MideoProvider>
    </ErrorBoundary>
  );
}
