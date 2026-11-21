import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  EyeOff,
  Flag,
  Globe,
  ImagePlus,
  Loader2,
  Mail,
  Megaphone,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  AlertTriangle,
  LifeBuoy,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { ACADEMY_COURSES } from '../data/academyData';
import { CHALLENGES } from '../data/challengesData';
import { AdminMissionStudio } from '../components/missions/AdminMissionStudio';
import { getCountryInfoFromPhone } from '../services/authService';
import {
  adminListReports,
  adminListUsers,
  adminResolveReport,
  adminSendCommunityAnnouncement,
} from '../services/dataService';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_VIDEO_MAX_BYTES,
  COMMUNITY_VIDEO_MIN_BYTES,
  deleteAdminCommunityMedia,
  fetchRescueAdminTelemetry,
  formatMediaBytes,
  uploadAdminCommunityMediaChunked,
  type UploadedCommunityMediaResult,
} from '../services/rescueService';
import type {
  CommunityPost,
  ModerationReport,
  RescueAdminTelemetry,
  UserProfile,
} from '../types/mideocode';

export function AdminView() {
  const { firebaseUser, profile, capabilities, missions, notify } = useMideo();

  const [adminTab, setAdminTab] = useState<'moderation' | 'missions' | 'rescue_ops'>('moderation');
  const [rescueTelemetry, setRescueTelemetry] = useState<RescueAdminTelemetry | null>(null);
  const [loadingRescueTelemetry, setLoadingRescueTelemetry] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [passwordUnlocked, setPasswordUnlocked] = useState(
    () => sessionStorage.getItem('mideocode_admin_password_unlocked') === 'true',
  );

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [directorySearch, setDirectorySearch] = useState('');
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    ok?: boolean;
    firebaseConfigured?: boolean;
    aiConfigured?: boolean;
    pythonVersion?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementCategory, setAnnouncementCategory] =
    useState<CommunityPost['category']>('announcement');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementTags, setAnnouncementTags] = useState('announcement, update');
  const [announcementCode, setAnnouncementCode] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedCommunityMediaResult[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<UploadedCommunityMediaResult | null>(null);
  const [videoUploadPct, setVideoUploadPct] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  const isAuthorizedAdmin = Boolean(
    firebaseUser &&
      ((firebaseUser.email === 'enochayomide2013@gmail.com' && firebaseUser.emailVerified) ||
        profile?.role === 'admin'),
  );

  const loadAdminData = async () => {
    if (!isAuthorizedAdmin || !passwordUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [userRows, reportRows, healthRes] = await Promise.all([
        adminListUsers(),
        adminListReports(),
        fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      ]);
      setUsers(userRows);
      setReports(reportRows);
      setHealthStatus(healthRes);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load admin console data.');
    } finally {
      setLoading(false);
    }
  };

  const loadRescueTelemetry = async () => {
    if (!isAuthorizedAdmin || !passwordUnlocked) return;
    setLoadingRescueTelemetry(true);
    try {
      const data = await fetchRescueAdminTelemetry();
      setRescueTelemetry(data);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load Project Rescue telemetry.');
    } finally {
      setLoadingRescueTelemetry(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [isAuthorizedAdmin, passwordUnlocked]);

  useEffect(() => {
    if (adminTab === 'rescue_ops' && isAuthorizedAdmin && passwordUnlocked) {
      loadRescueTelemetry();
    }
  }, [adminTab, isAuthorizedAdmin, passwordUnlocked]);

  useEffect(() => {
    if (!selectedUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUser(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedUser]);

  const usersWithPhoneCount = useMemo(
    () => users.filter((u) => Boolean(u.phoneNumber && u.phoneNumber.trim())).length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    return users.filter((u) => {
      if (onlyWithPhone && !(u.phoneNumber && u.phoneNumber.trim())) return false;
      if (!q) return true;
      const phoneInfo = getCountryInfoFromPhone(u.phoneNumber);
      const countryText = (u.country || phoneInfo?.name || '').toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phoneNumber || '').toLowerCase().includes(q) ||
        countryText.includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, directorySearch, onlyWithPhone]);

  const formatTimestamp = (val: unknown): string => {
    if (!val) return '—';
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
    return '—';
  };

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-12 p-8 rounded-xl border border-red-300 dark:border-red-900/60 bg-white dark:bg-[#0D1322] text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          Administrator Access Restricted
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          This moderation console is restricted to verified MideoCode administrators and enforced by Firestore security rules.
        </p>
      </div>
    );
  }

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput.trim() === '2013') {
      sessionStorage.setItem('mideocode_admin_password_unlocked', 'true');
      setPasswordUnlocked(true);
      notify('success', 'Admin console unlocked successfully.');
    } else {
      notify('error', 'Incorrect password. Required password is 2013.');
    }
  };

  if (!passwordUnlocked) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center space-y-4 shadow-xl">
        <ShieldCheck className="w-10 h-10 text-blue-500 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          Admin Console Password Required
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Please enter the secure administrator password (2013) to access the management console.
        </p>
        <form onSubmit={handleVerifyPassword} className="space-y-3 pt-2">
          <input
            type="password"
            required
            autoFocus
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
            placeholder="Enter admin password (2013)..."
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-center tracking-widest font-mono text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Unlock Console
          </button>
        </form>
      </div>
    );
  }

  const handleReportDecision = async (
    report: ModerationReport,
    status: ModerationReport['status'],
    hidePost = false,
  ) => {
    if (!firebaseUser) return;
    setResolvingId(report.id);
    try {
      await adminResolveReport(
        firebaseUser.uid,
        report.id,
        status,
        hidePost && report.targetType === 'post' ? report.targetId : undefined,
      );
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status } : r)),
      );
      notify(
        'success',
        hidePost ? 'Report resolved and target post hidden.' : `Report marked ${status}.`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update report.');
    } finally {
      setResolvingId(null);
    }
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            MideoCode Admin Console
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Platform health, community moderation queue, and verified learner directory.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          <ShieldCheck className="w-4 h-4" />
          Verified Admin Session
        </div>
      </div>

      {/* System Health & Catalog Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Backend Runtime</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {healthStatus?.ok ? 'Healthy' : 'Checking'}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            Node VM: {capabilities?.isolatedNodeVm ? 'On' : 'Off'} · Python:{' '}
            {capabilities?.python3 ? 'On' : 'Off'}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Gemini AI Tutor</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {capabilities?.geminiAi ? 'Configured' : 'Key Missing'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Server-side proxy /api/ai/assist</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Open Moderation Reports</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {openReportsCount}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">{reports.length} total reports</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Registered Learners</span>
            <Users className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {users.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {ACADEMY_COURSES.length} courses · {missions.length} missions · {CHALLENGES.length} challenges
          </p>
        </div>
      </div>

      {/* Admin View Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setAdminTab('moderation')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
            adminTab === 'moderation'
              ? 'bg-blue-600 text-white'
              : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-slate-600 dark:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Moderation & Directory
        </button>
        <button
          onClick={() => setAdminTab('missions')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
            adminTab === 'missions'
              ? 'bg-blue-600 text-white'
              : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-slate-600 dark:text-slate-300'
          }`}
        >
          <Flag className="w-4 h-4" />
          Mission Management ({missions.length})
        </button>
        <button
          onClick={() => setAdminTab('rescue_ops')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
            adminTab === 'rescue_ops'
              ? 'bg-blue-600 text-white'
              : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-slate-600 dark:text-slate-300'
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          Rescue Operations
        </button>
      </div>

      {adminTab === 'missions' ? (
        <AdminMissionStudio />
      ) : adminTab === 'rescue_ops' ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-blue-500" />
                  Project Rescue Operations &amp; Security Telemetry
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Live monitor of active background Rescue scan jobs, failed ZIP/Git imports, AI investigation errors, and ZIP-Slip/decompression-bomb blocks.
                </p>
              </div>
              <button
                type="button"
                onClick={loadRescueTelemetry}
                disabled={loadingRescueTelemetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRescueTelemetry ? 'animate-spin' : ''}`} />
                Refresh Telemetry
              </button>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                <div className="text-[11px] text-slate-500">Active Scan Jobs</div>
                <div className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
                  {rescueTelemetry?.activeJobs.length ?? 0}
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                <div className="text-[11px] text-slate-500">Recent Jobs</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {rescueTelemetry?.recentJobs.length ?? 0}
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                <div className="text-[11px] text-slate-500">Failed Imports</div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                  {rescueTelemetry?.failedImports.length ?? 0}
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                <div className="text-[11px] text-slate-500">Failed Scans / AI Errors</div>
                <div className="text-xl font-bold font-mono tabular-nums text-orange-600 dark:text-orange-400 mt-1">
                  {(rescueTelemetry?.failedScans.length ?? 0) + (rescueTelemetry?.aiErrors.length ?? 0)}
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                <div className="text-[11px] text-slate-500">Security Blocks</div>
                <div className="text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 mt-1">
                  {rescueTelemetry?.securityEvents.length ?? 0}
                </div>
              </div>
            </div>

            {/* Active Jobs */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Active Scan Jobs ({rescueTelemetry?.activeJobs.length ?? 0})
              </h3>
              {!rescueTelemetry || rescueTelemetry.activeJobs.length === 0 ? (
                <p className="text-xs text-slate-500">No scan jobs are currently running.</p>
              ) : (
                <div className="space-y-2">
                  {rescueTelemetry.activeJobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{job.projectTitle}</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-600/15 text-blue-600 dark:text-blue-400 font-mono text-[10px] uppercase">
                            {job.scanMode}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">{job.jobId}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Stage: {job.currentStage} · {job.filesProcessed}/{job.totalFiles} files
                        </p>
                      </div>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                        {job.progressPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Jobs */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Recent Scan Jobs ({rescueTelemetry?.recentJobs.length ?? 0})
              </h3>
              {!rescueTelemetry || rescueTelemetry.recentJobs.length === 0 ? (
                <p className="text-xs text-slate-500">No recent background scan jobs recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Project</th>
                        <th className="py-2 pr-3 font-medium">Mode</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Stage</th>
                        <th className="py-2 pr-3 font-medium">Progress</th>
                        <th className="py-2 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {rescueTelemetry.recentJobs.slice(0, 20).map((job) => (
                        <tr key={job.jobId}>
                          <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{job.projectTitle}</td>
                          <td className="py-2 pr-3 font-mono uppercase text-[11px]">{job.scanMode}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                job.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : job.status === 'failed'
                                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                    : job.status === 'cancelled'
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{job.currentStage}</td>
                          <td className="py-2 pr-3 font-mono tabular-nums">{job.progressPct}%</td>
                          <td className="py-2 text-red-500 truncate max-w-[240px]">{job.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Diagnostic Event Logs Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              {
                title: 'Security Blocks (ZIP-Slip, Bombs, Blocked URLs)',
                items: rescueTelemetry?.securityEvents || [],
                badgeClass: 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400',
              },
              {
                title: 'Failed Imports (ZIP & GitHub)',
                items: rescueTelemetry?.failedImports || [],
                badgeClass: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400',
              },
              {
                title: 'Failed Scans',
                items: rescueTelemetry?.failedScans || [],
                badgeClass: 'border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400',
              },
              {
                title: 'AI Investigation / Fix Errors',
                items: rescueTelemetry?.aiErrors || [],
                badgeClass: 'border-violet-500/30 bg-violet-500/5 text-violet-600 dark:text-violet-400',
              },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    {group.title}
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {group.items.length}
                  </span>
                </div>
                {group.items.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">No events recorded in this category.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {group.items.slice(0, 20).map((ev) => (
                      <div key={ev.id} className={`p-3 rounded-lg border text-xs space-y-1 ${group.badgeClass}`}>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold truncate">{ev.projectTitle || 'Workspace'}</span>
                          <span className="font-mono text-slate-500 shrink-0">
                            {formatTimestamp(ev.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-900 dark:text-white font-medium">{ev.message}</p>
                        {ev.details && <p className="text-[11px] text-slate-500 font-mono break-all">{ev.details}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Direct Community Broadcast & Media Publisher */}
          <section className="rounded-xl border border-amber-500/30 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-500" />
                  Post to Mideo Community (Images &amp; 1 MB–80 MB Video)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Publish an official update, showcase, or tutorial directly into Mideo Community with attached images and video (1 MB min – 80 MB max). Posts carry an{' '}
                  <span className="font-semibold text-amber-500">Admin</span> badge.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                Admin Publisher
              </span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!firebaseUser) return;
                if (announcementTitle.trim().length < 3 || announcementBody.trim().length < 5) {
                  notify('error', 'Enter a post title (min 3 chars) and message (min 5 chars).');
                  return;
                }
                if (videoUploadPct !== null || uploadingImage) {
                  notify('info', 'Please wait for attached media upload to finish before publishing.');
                  return;
                }
                setSendingAnnouncement(true);
                try {
                  const tags = announcementTags
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean)
                    .slice(0, 6);
                  await adminSendCommunityAnnouncement(
                    firebaseUser.uid,
                    profile?.displayName || 'MideoCode Admin',
                    {
                      title: announcementTitle,
                      body: announcementBody,
                      category: announcementCategory,
                      tags,
                      codeSnippet: announcementCode.trim() || undefined,
                      imageUrls: uploadedImages.map((img) => img.url),
                      videoUrl: uploadedVideo?.url,
                      videoName: uploadedVideo?.name,
                      videoMimeType: uploadedVideo?.mimeType,
                      videoSizeBytes: uploadedVideo?.sizeBytes,
                    },
                  );
                  setAnnouncementTitle('');
                  setAnnouncementBody('');
                  setAnnouncementCode('');
                  setUploadedImages([]);
                  setUploadedVideo(null);
                  setMediaError(null);
                  notify('success', 'Post published to Mideo Community with your Admin badge.');
                } catch (err) {
                  notify('error', err instanceof Error ? err.message : 'Unable to publish community post.');
                } finally {
                  setSendingAnnouncement(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Post Title
                  </label>
                  <input
                    required
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    placeholder="e.g., Platform Walkthrough & New Project Rescue AI Launch!"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Community Category
                  </label>
                  <select
                    value={announcementCategory}
                    onChange={(e) => setAnnouncementCategory(e.target.value as CommunityPost['category'])}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="announcement">Official Announcement</option>
                    <option value="showcase">Project Showcase</option>
                    <option value="tip">Tips &amp; Snippets</option>
                    <option value="discussion">Discussion</option>
                    <option value="question">Question</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    value={announcementTags}
                    onChange={(e) => setAnnouncementTags(e.target.value)}
                    placeholder="announcement, release"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Message Details
                </label>
                <textarea
                  required
                  rows={3}
                  value={announcementBody}
                  onChange={(e) => setAnnouncementBody(e.target.value)}
                  placeholder="Write your official community message..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Optional Code Snippet
                </label>
                <textarea
                  rows={2}
                  value={announcementCode}
                  onChange={(e) => setAnnouncementCode(e.target.value)}
                  placeholder="Optional code block to include in the post..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Media Attachment Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Image Uploader */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <ImagePlus className="w-4 h-4 text-blue-500" />
                        Attach Images ({uploadedImages.length}/6)
                      </p>
                      <p className="text-[11px] text-slate-500">PNG, JPG, WebP, GIF · up to 10 MB each</p>
                    </div>
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium cursor-pointer hover:border-blue-500 ${
                        uploadedImages.length >= 6 || uploadingImage ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {uploadingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      ) : (
                        <ImagePlus className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      {uploadingImage ? 'Uploading...' : 'Add Images'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        disabled={uploadedImages.length >= 6 || uploadingImage}
                        onChange={async (e) => {
                          const selected = Array.from(e.target.files || []);
                          e.target.value = '';
                          if (selected.length === 0) return;
                          setMediaError(null);
                          const remaining = Math.max(0, 6 - uploadedImages.length);
                          const batch = selected.slice(0, remaining);
                          setUploadingImage(true);
                          try {
                            for (const file of batch) {
                              if (file.size > COMMUNITY_IMAGE_MAX_BYTES) {
                                throw new Error(`"${file.name}" exceeds the 10 MB image limit.`);
                              }
                              const uploaded = await uploadAdminCommunityMediaChunked(file, 'image');
                              setUploadedImages((prev) => [...prev, uploaded].slice(0, 6));
                            }
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Image upload failed.';
                            setMediaError(msg);
                            notify('error', msg);
                          } finally {
                            setUploadingImage(false);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {uploadedImages.map((img) => (
                        <div
                          key={img.filename}
                          className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 aspect-video"
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              setUploadedImages((prev) => prev.filter((item) => item.filename !== img.filename));
                              await deleteAdminCommunityMedia(img.filename).catch(() => {});
                            }}
                            title="Remove image"
                            className="absolute top-1 right-1 p-1 rounded bg-slate-950/80 text-white hover:bg-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Video Uploader (1 MB - 80 MB) */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Video className="w-4 h-4 text-amber-500" />
                        Attach Video (1 MB – 80 MB Max)
                      </p>
                      <p className="text-[11px] text-slate-500">MP4, WebM, or OGG · chunked upload</p>
                    </div>
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium cursor-pointer hover:border-amber-500 ${
                        videoUploadPct !== null ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {videoUploadPct !== null ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      ) : (
                        <Video className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      {videoUploadPct !== null
                        ? `Uploading ${videoUploadPct}%`
                        : uploadedVideo
                          ? 'Replace Video'
                          : 'Select Video'}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/ogg"
                        className="hidden"
                        disabled={videoUploadPct !== null}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setMediaError(null);
                          if (file.size < COMMUNITY_VIDEO_MIN_BYTES) {
                            const msg = `Video "${file.name}" is ${formatMediaBytes(file.size)}. Videos must be at least 1 MB.`;
                            setMediaError(msg);
                            notify('error', msg);
                            return;
                          }
                          if (file.size > COMMUNITY_VIDEO_MAX_BYTES) {
                            const msg = `Video "${file.name}" is ${formatMediaBytes(file.size)}. Maximum allowed size is 80 MB.`;
                            setMediaError(msg);
                            notify('error', msg);
                            return;
                          }
                          setVideoUploadPct(1);
                          try {
                            const prevFilename = uploadedVideo?.filename;
                            const result = await uploadAdminCommunityMediaChunked(
                              file,
                              'video',
                              (pct) => setVideoUploadPct(pct),
                            );
                            setUploadedVideo(result);
                            if (prevFilename) {
                              await deleteAdminCommunityMedia(prevFilename).catch(() => {});
                            }
                            notify('success', `Uploaded video "${result.name}" (${formatMediaBytes(result.sizeBytes)}).`);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Video upload failed.';
                            setMediaError(msg);
                            notify('error', msg);
                          } finally {
                            setVideoUploadPct(null);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {videoUploadPct !== null && (
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-150"
                          style={{ width: `${videoUploadPct}%` }}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        Uploading video chunks... {videoUploadPct}%
                      </p>
                    </div>
                  )}

                  {uploadedVideo && (
                    <div className="space-y-2">
                      <video
                        src={uploadedVideo.url}
                        controls
                        preload="metadata"
                        playsInline
                        className="w-full max-h-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-black"
                      />
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="truncate font-mono">
                          {uploadedVideo.name} · {formatMediaBytes(uploadedVideo.sizeBytes)}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const fn = uploadedVideo.filename;
                            setUploadedVideo(null);
                            await deleteAdminCommunityMedia(fn).catch(() => {});
                          }}
                          className="inline-flex items-center gap-1 text-red-500 hover:underline shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {mediaError && (
                <p className="text-xs text-red-500 font-medium">{mediaError}</p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sendingAnnouncement || videoUploadPct !== null || uploadingImage}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingAnnouncement ? 'Publishing...' : 'Publish to Mideo Community'}
                </button>
              </div>
            </form>
          </section>

          {/* Moderation Queue */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Moderation Reports Queue
            </h2>
        {loading ? (
          <p className="text-xs text-slate-500">Loading moderation reports...</p>
        ) : reports.length === 0 ? (
          <p className="text-xs text-slate-500">No moderation reports submitted.</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {reports.map((rep) => (
              <div
                key={rep.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {rep.targetType}
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {rep.reason}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500">Status: {rep.status}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Target ID: <span className="font-mono">{rep.targetId}</span>
                  </p>
                  {rep.details && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{rep.details}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {rep.targetType === 'post' && (
                    <button
                      onClick={() => handleReportDecision(rep, 'resolved', true)}
                      disabled={resolvingId === rep.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Hide Post & Resolve
                    </button>
                  )}
                  <button
                    onClick={() => handleReportDecision(rep, 'resolved', false)}
                    disabled={resolvingId === rep.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Resolve
                  </button>
                  <button
                    onClick={() => handleReportDecision(rep, 'dismissed', false)}
                    disabled={resolvingId === rep.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* User Directory */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Learner Directory ({filteredUsers.length} of {users.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click any learner&apos;s display name to inspect full profile details including email, phone number, and country.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Search name, email, phone, country..."
                className="pl-8 pr-3 py-1.5 w-60 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyWithPhone((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                onlyWithPhone
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              With Phone ({usersWithPhoneCount})
            </button>
            <button
              type="button"
              onClick={loadAdminData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-blue-500 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2 pr-4 font-medium">Display Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Phone Number</th>
                <th className="py-2 pr-4 font-medium">Country</th>
                <th className="py-2 pr-4 font-medium">Level / XP</th>
                <th className="py-2 pr-4 font-medium">Experience</th>
                <th className="py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    {loading ? 'Loading learner directory...' : 'No learners match the current filter.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const phoneInfo = getCountryInfoFromPhone(u.phoneNumber);
                  const resolvedCountry = u.country || phoneInfo?.name || '—';
                  return (
                    <tr
                      key={u.uid}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(u);
                            setCopiedUid(false);
                          }}
                          className="group inline-flex items-center gap-2.5 text-left font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                        >
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt={u.displayName}
                              className="w-6 h-6 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-md bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                              {u.displayName.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="underline decoration-slate-300 dark:decoration-slate-700 group-hover:decoration-blue-500 underline-offset-2">
                            {u.displayName}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-slate-600 dark:text-slate-300">
                        {u.email || '—'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono tabular-nums">
                        {u.phoneNumber ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                            <Phone className="w-3 h-3 shrink-0" />
                            {phoneInfo?.international || u.phoneNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">
                        {resolvedCountry !== '—' ? (
                          <span className="inline-flex items-center gap-1">
                            <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                            {resolvedCountry}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        L{u.level} · {u.xp} XP
                      </td>
                      <td className="py-2.5 pr-4 capitalize text-slate-600 dark:text-slate-400">
                        {u.experienceLevel}
                      </td>
                      <td className="py-2.5 font-mono text-slate-600 dark:text-slate-300">{u.role}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {/* Learner Profile Detail Modal */}
      {selectedUser && (() => {
        const phoneInfo = getCountryInfoFromPhone(selectedUser.phoneNumber);
        const resolvedCountry = selectedUser.country || phoneInfo?.name || 'Not specified';
        return (
          <div
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedUser(null)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {selectedUser.photoURL ? (
                    <img
                      src={selectedUser.photoURL}
                      alt={selectedUser.displayName}
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
                      {selectedUser.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                        {selectedUser.displayName}
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-blue-600/15 text-blue-600 dark:text-blue-400 font-mono text-[11px] uppercase">
                        {selectedUser.role}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] capitalize">
                        {selectedUser.experienceLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-slate-500 truncate">
                        UID: {selectedUser.uid}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(selectedUser.uid);
                            setCopiedUid(true);
                            setTimeout(() => setCopiedUid(false), 1500);
                          } catch {
                            notify('error', 'Clipboard copy blocked by browser permissions.');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedUid ? 'Copied' : 'Copy UID'}
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  aria-label="Close learner details"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Primary Contact & Location */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                      Email Address
                    </div>
                    <p className="text-xs font-mono text-slate-900 dark:text-white break-all">
                      {selectedUser.email || 'Not provided'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" />
                      Phone Number
                    </div>
                    <p className="text-xs font-mono text-slate-900 dark:text-white">
                      {selectedUser.phoneNumber
                        ? phoneInfo?.international || selectedUser.phoneNumber
                        : 'Not entered yet'}
                    </p>
                    {selectedUser.phoneNumber && phoneInfo?.international !== selectedUser.phoneNumber && (
                      <p className="text-[11px] font-mono text-slate-500">
                        E.164: {selectedUser.phoneNumber}
                      </p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <Globe className="w-3.5 h-3.5 text-violet-500" />
                      Country / Region
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {resolvedCountry}
                    </p>
                    {phoneInfo?.dial && (
                      <p className="text-[11px] font-mono text-slate-500">
                        Dial code: {phoneInfo.dial}
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress & Account Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      Level &amp; XP
                    </div>
                    <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-1">
                      L{selectedUser.level} · {selectedUser.xp} XP
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                      Streak
                    </div>
                    <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {selectedUser.streak} days
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Onboarding</div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">
                      {selectedUser.onboardingComplete ? 'Completed' : 'Pending'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Career Track</div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white mt-1 truncate">
                      {selectedUser.activeCareerPathId || '—'}
                    </p>
                  </div>
                </div>

                {/* Learning Preferences */}
                <div className="space-y-3 pt-1">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Preferred Languages
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedUser.preferredLanguages || []).length > 0 ? (
                        selectedUser.preferredLanguages.map((lang) => (
                          <span
                            key={lang}
                            className="px-2.5 py-1 rounded-md bg-blue-600/10 text-blue-700 dark:text-blue-300 text-xs font-medium"
                          >
                            {lang}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">None selected</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Learning Goals
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedUser.learningGoals || []).length > 0 ? (
                        selectedUser.learningGoals.map((goal) => (
                          <span
                            key={goal}
                            className="px-2.5 py-1 rounded-md bg-violet-600/10 text-violet-700 dark:text-violet-300 text-xs font-medium"
                          >
                            {goal}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">None selected</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Interests
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedUser.interests || []).length > 0 ? (
                        selectedUser.interests.map((item) => (
                          <span
                            key={item}
                            className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">None selected</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Joined: {formatTimestamp(selectedUser.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Updated: {formatTimestamp(selectedUser.updatedAt)}</span>
                  </div>
                  <div>Last Active Date: {selectedUser.lastActivityDate || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
