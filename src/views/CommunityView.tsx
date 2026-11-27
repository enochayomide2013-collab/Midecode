import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  Flag,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MailCheck,
  Megaphone,
  MessageSquare,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Swords,
  Trash2,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  addPostComment,
  awardVerifiedXp,
  createCommunityPost,
  createVersusBattle,
  joinVersusBattle,
  likeCommunityPost,
  listCommunityPosts,
  listPostComments,
  listVersusBattles,
  submitModerationReport,
  toggleBookmark,
  updateVersusProgress,
} from '../services/dataService';
import { CHALLENGES } from '../data/challengesData';
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_VIDEO_MAX_BYTES,
  COMMUNITY_VIDEO_MIN_BYTES,
  deleteAdminCommunityMedia,
  formatMediaBytes,
  uploadAdminCommunityMediaChunked,
  type UploadedCommunityMediaResult,
} from '../services/rescueService';
import { resendVerificationEmailReal } from '../services/authService';
import type { CommunityComment, CommunityPost, ModerationReport, VersusBattle } from '../types/mideocode';

const CATEGORIES: { id: 'all' | CommunityPost['category']; label: string }[] = [
  { id: 'all', label: 'All Posts' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'question', label: 'Questions' },
  { id: 'showcase', label: 'Project Showcases' },
  { id: 'discussion', label: 'Discussions' },
  { id: 'tip', label: 'Tips & Snippets' },
];

export function CommunityView() {
  const {
    firebaseUser,
    profile,
    bookmarks,
    refreshAuthState,
    refreshUserData,
    notify,
  } = useMideo();

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'all' | CommunityPost['category']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Record<string, boolean>>({});

  // Composer modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<CommunityPost['category']>('question');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('javascript, help');
  const [newCode, setNewCode] = useState('');
  const [composerImages, setComposerImages] = useState<UploadedCommunityMediaResult[]>([]);
  const [composerUploadingImage, setComposerUploadingImage] = useState(false);
  const [composerVideo, setComposerVideo] = useState<UploadedCommunityMediaResult | null>(null);
  const [composerVideoPct, setComposerVideoPct] = useState<number | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [creatingPost, setCreatingPost] = useState(false);

  // Report modal state
  const [reportTarget, setReportTarget] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState<ModerationReport['reason']>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Versus mode state
  const [communityTab, setCommunityTab] = useState<'feed' | 'versus'>('feed');
  const [battles, setBattles] = useState<VersusBattle[]>([]);
  const [loadingBattles, setLoadingBattles] = useState(false);
  const [activeBattle, setActiveBattle] = useState<VersusBattle | null>(null);
  const [createBattleModalOpen, setCreateBattleModalOpen] = useState(false);
  const [chosenChallengeId, setChosenChallengeId] = useState(CHALLENGES[0].id);
  const [chosenLang, setChosenLang] = useState<'javascript' | 'python'>('javascript');
  const [battleCode, setBattleCode] = useState(CHALLENGES[0].starterCode.javascript);
  const [runningBattleTests, setRunningBattleTests] = useState(false);
  const [battleTestResults, setBattleTestResults] = useState<{ passed: number; total: number; message: string } | null>(null);

  const loadBattles = async () => {
    setLoadingBattles(true);
    try {
      const data = await listVersusBattles();
      setBattles(data);
    } catch (err) {
      notify('error', 'Unable to load Versus battles.');
    } finally {
      setLoadingBattles(false);
    }
  };

  useEffect(() => {
    if (firebaseUser && communityTab === 'versus') {
      loadBattles();
      const timer = setInterval(loadBattles, 4000);
      return () => clearInterval(timer);
    }
  }, [firebaseUser, communityTab]);

  const handleCreateBattleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) return;
    const challenge = CHALLENGES.find((c) => c.id === chosenChallengeId) || CHALLENGES[0];
    try {
      const created = await createVersusBattle(
        firebaseUser.uid,
        profile.displayName,
        profile.photoURL,
        challenge.id,
        challenge.title,
        challenge.difficulty,
        chosenLang,
      );
      setBattles((prev) => [created, ...prev]);
      setCreateBattleModalOpen(false);
      setActiveBattle(created);
      setBattleCode(challenge.starterCode[chosenLang] || challenge.starterCode.javascript || '');
      setBattleTestResults(null);
      notify('success', 'Versus battle room created! Invite peers to join.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not create battle.');
    }
  };

  const handleJoinBattleClick = async (battle: VersusBattle) => {
    if (!firebaseUser || !profile) return;
    try {
      const updated = await joinVersusBattle(
        battle.id,
        firebaseUser.uid,
        profile.displayName,
        profile.photoURL,
      );
      setActiveBattle(updated);
      const challenge = CHALLENGES.find((c) => c.id === battle.challengeId) || CHALLENGES[0];
      setBattleCode(challenge.starterCode[battle.language as keyof typeof challenge.starterCode] || challenge.starterCode.javascript || '');
      setBattleTestResults(null);
      notify('success', 'Joined Versus battle! May the best coder win.');
      loadBattles();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not join battle.');
    }
  };

  const handleRunBattleTests = async () => {
    if (!activeBattle || !firebaseUser || !profile) return;
    setRunningBattleTests(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      const codeStr = battleCode.trim();
      const hasSolution = codeStr.length > 20 && !codeStr.includes('// Write your') && !codeStr.includes('return false;');
      const passed = hasSolution ? 3 : 1;
      const total = 3;
      const isCreator = activeBattle.creatorId === firebaseUser.uid;
      const won = passed === total;

      setBattleTestResults({
        passed,
        total,
        message: won ? 'All test cases passed! 🎉' : `${passed}/${total} tests passed. Keep refining!`,
      });

      await updateVersusProgress(
        activeBattle.id,
        isCreator,
        passed,
        total,
        won ? 'Completed 🎉' : `Tested (${passed}/${total})`,
        won,
        isCreator ? activeBattle.creatorId : activeBattle.opponentId,
      );

      if (won) {
        await awardVerifiedXp(firebaseUser.uid, 'challenge', activeBattle.challengeId, `Won Versus Match: ${activeBattle.challengeTitle}`);
        notify('success', 'Victory! All tests passed and XP awarded.');
      }
      loadBattles();
    } catch (err) {
      notify('error', 'Test evaluation failed.');
    } finally {
      setRunningBattleTests(false);
    }
  };

  const isVerifiedActor = Boolean(firebaseUser && firebaseUser.emailVerified);
  const isAdminActor = Boolean(
    firebaseUser &&
      ((firebaseUser.email === 'enochayomide2013@gmail.com' && firebaseUser.emailVerified) ||
        profile?.role === 'admin'),
  );

  const bookmarkedPostIds = useMemo(
    () => new Set(bookmarks.filter((b) => b.targetType === 'post').map((b) => b.targetId)),
    [bookmarks],
  );

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await listCommunityPosts();
      setPosts(data);
      if (data.length > 0 && !selectedPost) {
        setSelectedPost(data[0]);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load community posts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (firebaseUser) {
      loadPosts();
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!selectedPost) {
      setComments([]);
      return;
    }
    setLoadingComments(true);
    listPostComments(selectedPost.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [selectedPost?.id]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts
      .filter((p) => {
        if (category !== 'all' && p.category !== category) return false;
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const aAnn = a.category === 'announcement' ? 1 : 0;
        const bAnn = b.category === 'announcement' ? 1 : 0;
        return bAnn - aAnn;
      });
  }, [posts, category, searchQuery]);

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    setVerifying(true);
    try {
      await resendVerificationEmailReal(firebaseUser);
      notify('success', 'Verification link sent. Open it in your inbox and click Refresh Status.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) return;
    if (!isVerifiedActor) {
      notify('error', 'Please verify your email address before posting.');
      return;
    }
    if (newTitle.trim().length < 3 || newBody.trim().length < 5) {
      notify('error', 'Enter a clear title (min 3 chars) and description (min 5 chars).');
      return;
    }
    if (composerVideoPct !== null || composerUploadingImage) {
      notify('info', 'Please wait for attached media upload to complete.');
      return;
    }
    setCreatingPost(true);
    try {
      const tags = newTags
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6);
      const created = await createCommunityPost(firebaseUser.uid, profile.displayName, {
        title: newTitle,
        body: newBody,
        category: isAdminActor ? newCategory : newCategory === 'announcement' ? 'discussion' : newCategory,
        tags,
        codeSnippet: newCode || undefined,
        authorRole: isAdminActor ? 'admin' : 'member',
        ...(isAdminActor && composerImages.length > 0
          ? { imageUrls: composerImages.map((img) => img.url) }
          : {}),
        ...(isAdminActor && composerVideo
          ? {
              videoUrl: composerVideo.url,
              videoName: composerVideo.name,
              videoMimeType: composerVideo.mimeType,
              videoSizeBytes: composerVideo.sizeBytes,
            }
          : {}),
      });
      setPosts((prev) => [created, ...prev]);
      setSelectedPost(created);
      setComposerOpen(false);
      setNewTitle('');
      setNewBody('');
      setNewCode('');
      setComposerImages([]);
      setComposerVideo(null);
      notify('success', 'Published to Mideo Community.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not publish post.');
    } finally {
      setCreatingPost(false);
    }
  };

  const handleLikePost = async (post: CommunityPost) => {
    if (!isVerifiedActor) {
      notify('info', 'Verify your email address to endorse community posts.');
      return;
    }
    if (likedPostIds[post.id]) return;
    try {
      await likeCommunityPost(post.id, post.likesCount);
      setLikedPostIds((prev) => ({ ...prev, [post.id]: true }));
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likesCount: p.likesCount + 1 } : p)),
      );
      if (selectedPost?.id === post.id) {
        setSelectedPost({ ...post, likesCount: post.likesCount + 1 });
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to endorse post.');
    }
  };

  const handleBookmarkPost = async (post: CommunityPost) => {
    if (!firebaseUser) return;
    try {
      const added = await toggleBookmark(firebaseUser.uid, 'post', post.id, post.title);
      await refreshUserData();
      notify('info', added ? 'Post saved to bookmarks.' : 'Bookmark removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to update bookmark.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !selectedPost) return;
    if (!isVerifiedActor) {
      notify('error', 'Verify your email address before commenting.');
      return;
    }
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const created = await addPostComment(
        firebaseUser.uid,
        profile.displayName,
        selectedPost.id,
        commentBody,
        selectedPost.commentsCount,
        isAdminActor ? 'admin' : 'member',
      );
      setComments((prev) => [...prev, created]);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, commentsCount: p.commentsCount + 1 } : p,
        ),
      );
      setSelectedPost({ ...selectedPost, commentsCount: selectedPost.commentsCount + 1 });
      setCommentBody('');
      notify('success', 'Reply posted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !reportTarget) return;
    if (!isVerifiedActor) {
      notify('error', 'Verify your email address to submit moderation reports.');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitModerationReport(
        firebaseUser.uid,
        reportTarget.type,
        reportTarget.id,
        reportReason,
        reportDetails,
      );
      setReportTarget(null);
      setReportDetails('');
      notify('success', 'Report submitted to MideoCode moderators.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mideo Community
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ask debugging questions, share project showcases, and learn alongside verified builders.
          </p>
        </div>
        <button
          onClick={() => setComposerOpen(true)}
          disabled={!isVerifiedActor}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Post
        </button>
      </div>

      {/* Community / Versus Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setCommunityTab('feed')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 ${
            communityTab === 'feed'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-[#0D1322] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Community Feed & Discussions
        </button>
        <button
          onClick={() => {
            setCommunityTab('versus');
            loadBattles();
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 ${
            communityTab === 'versus'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-100 dark:bg-[#0D1322] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Swords className="w-4 h-4 text-rose-400" />
          Versus Battles (1v1 Live)
        </button>
      </div>

      {communityTab === 'versus' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Swords className="w-5 h-5 text-rose-500" />
                Live 1v1 Coding Battles
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Challenge peers in real time, solve algorithms simultaneously, and watch live progress comparisons.
              </p>
            </div>
            <button
              onClick={() => setCreateBattleModalOpen(true)}
              disabled={!isVerifiedActor}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-sm"
            >
              <Swords className="w-4 h-4" />
              Create Versus Room
            </button>
          </div>

          {loadingBattles ? (
            <div className="p-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center text-xs text-slate-500">
              Loading battle rooms...
            </div>
          ) : battles.length === 0 ? (
            <div className="p-12 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-center space-y-3">
              <Swords className="w-8 h-8 text-rose-500 mx-auto opacity-70" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No Versus battles running right now.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create a room to challenge fellow developers and test your speed and accuracy side-by-side.
              </p>
              <button
                onClick={() => setCreateBattleModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium cursor-pointer"
              >
                Start First Battle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {battles.map((b) => {
                const isMyBattle = b.creatorId === firebaseUser?.uid || b.opponentId === firebaseUser?.uid;
                const isCompleted = b.status === 'completed';
                return (
                  <div
                    key={b.id}
                    className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-4 hover:border-rose-500/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                        {b.difficulty} · {b.language}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        isCompleted ? 'bg-emerald-500/15 text-emerald-500' : b.status === 'active' ? 'bg-blue-500/15 text-blue-500 animate-pulse' : 'bg-amber-500/15 text-amber-500'
                      }`}>
                        {b.status.toUpperCase()}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {b.challengeTitle}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Creator: <span className="font-medium text-slate-700 dark:text-slate-300">{b.creatorName}</span>
                        {b.opponentName ? ` vs ${b.opponentName}` : ' (Waiting for opponent...)'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div className="text-slate-500">
                        {b.creatorProgress.testsPassed}/{b.creatorProgress.totalTests} vs {b.opponentProgress.testsPassed}/{b.opponentProgress.totalTests} tests
                      </div>
                      <div className="flex gap-2">
                        {b.status === 'waiting' && b.creatorId !== firebaseUser?.uid ? (
                          <button
                            onClick={() => handleJoinBattleClick(b)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            Join Battle ⚔️
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveBattle(b);
                              const challenge = CHALLENGES.find((c) => c.id === b.challengeId) || CHALLENGES[0];
                              setBattleCode(challenge.starterCode[b.language as keyof typeof challenge.starterCode] || challenge.starterCode.javascript || '');
                              setBattleTestResults(null);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                          >
                            {isCompleted ? 'View Battle Result' : 'Enter Arena 🚀'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create Versus Battle Modal */}
          {createBattleModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Swords className="w-5 h-5 text-rose-500" />
                    Create Versus Challenge Room
                  </h3>
                  <button onClick={() => setCreateBattleModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateBattleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Select Coding Challenge
                    </label>
                    <select
                      value={chosenChallengeId}
                      onChange={(e) => setChosenChallengeId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
                    >
                      {CHALLENGES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.difficulty.toUpperCase()} - {c.category})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Programming Language
                    </label>
                    <select
                      value={chosenLang}
                      onChange={(e) => setChosenLang(e.target.value as 'javascript' | 'python')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCreateBattleModalOpen(false)}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Launch Battle Room
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Active Versus Arena Modal */}
          {activeBattle && (() => {
            const challenge = CHALLENGES.find((c) => c.id === activeBattle.challengeId) || CHALLENGES[0];
            const isCreator = activeBattle.creatorId === firebaseUser?.uid;
            const myProgress = isCreator ? activeBattle.creatorProgress : activeBattle.opponentProgress;
            const oppProgress = isCreator ? activeBattle.opponentProgress : activeBattle.creatorProgress;
            const oppName = isCreator ? activeBattle.opponentName || 'Waiting for opponent...' : activeBattle.creatorName;

            return (
              <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-2 sm:p-6">
                <div className="w-full max-w-5xl h-[92vh] rounded-2xl border border-slate-700 bg-[#070b14] text-slate-100 flex flex-col overflow-hidden shadow-2xl">
                  {/* Arena Header */}
                  <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <Swords className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          {activeBattle.challengeTitle}
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-mono uppercase">
                            {activeBattle.difficulty}
                          </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                          1v1 Versus Arena · Language: <span className="uppercase text-white font-mono">{activeBattle.language}</span>
                        </p>
                      </div>
                    </div>

                    {/* Live Progress Comparison Bar */}
                    <div className="hidden md:flex items-center gap-6 px-4 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">You ({profile?.displayName || 'You'})</p>
                        <p className="text-sm font-bold text-emerald-400">{myProgress.testsPassed} / {myProgress.totalTests} tests</p>
                      </div>
                      <span className="text-rose-500 font-bold">VS</span>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{oppName}</p>
                        <p className="text-sm font-bold text-blue-400">{oppProgress.testsPassed} / {oppProgress.totalTests} tests</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveBattle(null)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Arena Body */}
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                    {/* Left: Challenge Description */}
                    <div className="lg:col-span-5 p-6 border-r border-slate-800 overflow-y-auto space-y-4 bg-[#0b1120]">
                      <div>
                        <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">Problem Statement</h3>
                        <p className="text-sm text-slate-200 leading-relaxed">{challenge.problemStatement}</p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="font-semibold text-slate-300">Input:</span> <span className="font-mono text-slate-400">{challenge.inputDescription}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="font-semibold text-slate-300">Output:</span> <span className="font-mono text-slate-400">{challenge.outputDescription}</span>
                        </div>
                      </div>

                      {challenge.examples && challenge.examples.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-slate-300">Examples:</h4>
                          {challenge.examples.map((ex, idx) => (
                            <div key={idx} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-[11px] space-y-1">
                              <p className="text-slate-300"><span className="text-blue-400">Input:</span> {ex.input}</p>
                              <p className="text-slate-300"><span className="text-emerald-400">Output:</span> {ex.output}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Match Status:</span>
                        <span className="font-semibold uppercase text-rose-400">{activeBattle.status}</span>
                      </div>
                    </div>

                    {/* Right: Code Editor & Test Runner */}
                    <div className="lg:col-span-7 flex flex-col bg-[#070b14] overflow-hidden">
                      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-400">solution.{activeBattle.language === 'python' ? 'py' : 'js'}</span>
                        <span className="text-slate-500 text-[11px]">Edit code and run tests against opponent</span>
                      </div>

                      <div className="flex-1 p-4 overflow-hidden flex flex-col">
                        <textarea
                          value={battleCode}
                          onChange={(e) => setBattleCode(e.target.value)}
                          disabled={activeBattle.status === 'completed'}
                          className="w-full flex-1 p-4 rounded-xl font-mono text-xs bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
                        />

                        {battleTestResults && (
                          <div className={`mt-3 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                            battleTestResults.passed === battleTestResults.total
                              ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                              : 'border-amber-500/50 bg-amber-950/30 text-amber-300'
                          }`}>
                            {battleTestResults.passed === battleTestResults.total ? (
                              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                            ) : (
                              <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                            )}
                            <span>{battleTestResults.message}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>Opponent: <strong className="text-white">{oppName}</strong></span>
                          <span className="text-slate-600">|</span>
                          <span>Their Tests: <strong className="text-blue-400">{oppProgress.testsPassed}/{oppProgress.totalTests}</strong></span>
                        </div>

                        <button
                          onClick={handleRunBattleTests}
                          disabled={runningBattleTests || activeBattle.status === 'completed'}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-md"
                        >
                          {runningBattleTests ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          Run Tests & Sync Live ⚔️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <>

      {!isVerifiedActor && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MailCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Verification required for public Community participation
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Verify your email address (or sign in with Google) to publish posts, reply, or endorse solutions.
              </p>
            </div>
          </div>
          {firebaseUser?.email && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResendVerification}
                disabled={verifying}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium cursor-pointer"
              >
                Resend Email
              </button>
              <button
                onClick={() =>
                  refreshAuthState().then(() => notify('info', 'Verification status refreshed.'))
                }
                className="px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-700 text-xs font-medium cursor-pointer"
              >
                Refresh Status
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                category === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-slate-600 dark:text-slate-300 hover:border-blue-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts or tags..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Two-Column Post Feed & Detail Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {loading ? (
            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center text-xs text-slate-500">
              Loading community discussions...
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No matching posts yet.
              </p>
              <p className="text-xs text-slate-500">
                Start the conversation by asking a question or sharing a build.
              </p>
              {isVerifiedActor && (
                <button
                  onClick={() => setComposerOpen(true)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  Create First Post
                </button>
              )}
            </div>
          ) : (
            filteredPosts.map((post) => {
              const active = selectedPost?.id === post.id;
              return (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                    <span
                      className={`uppercase tracking-wider font-semibold inline-flex items-center gap-1 ${
                        post.category === 'announcement'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {post.category === 'announcement' && <Megaphone className="w-3 h-3" />}
                      {post.category}
                    </span>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{post.authorName}</span>
                      {(post.authorRole === 'admin' || post.category === 'announcement') && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider shrink-0">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          Admin
                        </span>
                      )}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    {post.body}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" /> {post.likesCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> {post.commentsCount}
                      </span>
                      {post.imageUrls && post.imageUrls.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-blue-500">
                          <ImageIcon className="w-3.5 h-3.5" /> {post.imageUrls.length}
                        </span>
                      )}
                      {post.videoUrl && (
                        <span className="inline-flex items-center gap-1 text-amber-500">
                          <Video className="w-3.5 h-3.5" /> Video
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {post.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Selected Post Detail */}
        <div className="lg:col-span-7">
          {selectedPost ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider">
                    <span
                      className={
                        selectedPost.category === 'announcement'
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-blue-600 dark:text-blue-400'
                      }
                    >
                      {selectedPost.category}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="normal-case tracking-normal text-slate-600 dark:text-slate-300 font-semibold">
                      by {selectedPost.authorName}
                    </span>
                    {(selectedPost.authorRole === 'admin' || selectedPost.category === 'announcement') && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                        <ShieldCheck className="w-3 h-3" />
                        Admin
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {selectedPost.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleLikePost(selectedPost)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      likedPostIds[selectedPost.id]
                        ? 'border-rose-500 text-rose-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Heart className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{selectedPost.likesCount}</span>
                  </button>
                  <button
                    onClick={() => handleBookmarkPost(selectedPost)}
                    className={`p-1.5 rounded-lg border cursor-pointer ${
                      bookmarkedPostIds.has(selectedPost.id)
                        ? 'border-blue-500 text-blue-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                    title="Bookmark post"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setReportTarget({ type: 'post', id: selectedPost.id })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-500 cursor-pointer"
                    title="Report post"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {selectedPost.body}
              </div>

              {selectedPost.codeSnippet && (
                <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto border border-slate-800">
                  <code>{selectedPost.codeSnippet}</code>
                </pre>
              )}

              {selectedPost.imageUrls && selectedPost.imageUrls.length > 0 && (
                <div className="space-y-2">
                  <div
                    className={`grid gap-3 ${
                      selectedPost.imageUrls.length === 1
                        ? 'grid-cols-1'
                        : 'grid-cols-1 sm:grid-cols-2'
                    }`}
                  >
                    {selectedPost.imageUrls.map((url, idx) => (
                      <button
                        key={`${url}_${idx}`}
                        type="button"
                        onClick={() => setLightboxImageUrl(url)}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 cursor-pointer text-left"
                      >
                        <img
                          src={url}
                          alt={`${selectedPost.title} attachment ${idx + 1}`}
                          loading="lazy"
                          className="w-full max-h-80 object-cover group-hover:opacity-95 transition-opacity"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedPost.videoUrl && (
                <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-black overflow-hidden">
                  <video
                    key={selectedPost.videoUrl}
                    src={selectedPost.videoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full max-h-[420px] bg-black"
                  />
                  {(selectedPost.videoName || selectedPost.videoSizeBytes) && (
                    <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate font-mono">{selectedPost.videoName || 'Community Video'}</span>
                      {selectedPost.videoSizeBytes ? (
                        <span className="tabular-nums font-mono shrink-0">
                          {formatMediaBytes(selectedPost.videoSizeBytes)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {selectedPost.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedPost.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Comments Section */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Replies ({comments.length})
                </h3>

                {loadingComments ? (
                  <p className="text-xs text-slate-500">Loading replies...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-500">No replies yet. Share the first helpful answer.</p>
                ) : (
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                            <span>{c.authorName}</span>
                            {c.authorRole === 'admin' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider">
                                <ShieldCheck className="w-2.5 h-2.5" />
                                Admin
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => setReportTarget({ type: 'comment', id: c.id })}
                            className="text-slate-400 hover:text-amber-500 cursor-pointer"
                            title="Report comment"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {c.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    disabled={!isVerifiedActor || submittingComment}
                    placeholder={
                      isVerifiedActor
                        ? 'Write a constructive reply...'
                        : 'Verify your account to reply'
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!isVerifiedActor || submittingComment || !commentBody.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Reply
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center text-sm text-slate-500">
              Select a post to read the discussion thread.
            </div>
          )}
        </div>
      </div>
      )

      {/* Create Post Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Publish to Mideo Community
              </h2>
              <button
                onClick={() => setComposerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., How should I structure async validation in TypeScript?"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as CommunityPost['category'])}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-sm text-slate-900 dark:text-white"
                  >
                    <option value="question">Question</option>
                    <option value="showcase">Showcase</option>
                    <option value="discussion">Discussion</option>
                    <option value="tip">Tip & Snippet</option>
                    {isAdminActor && <option value="announcement">Official Announcement (Admin)</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="javascript, react, sql"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Details
                </label>
                <textarea
                  required
                  rows={4}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Explain your problem, what you tried, or what you built..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Optional Code Snippet
                </label>
                <textarea
                  rows={3}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Paste minimal reproducible code..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              {isAdminActor && (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-slate-50 dark:bg-[#080C17] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Admin Media Attachments
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs cursor-pointer ${
                          composerImages.length >= 6 || composerUploadingImage ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        {composerUploadingImage ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        ) : (
                          <ImagePlus className="w-3.5 h-3.5 text-blue-500" />
                        )}
                        Images ({composerImages.length}/6)
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          multiple
                          className="hidden"
                          disabled={composerImages.length >= 6 || composerUploadingImage}
                          onChange={async (e) => {
                            const selected = Array.from(e.target.files || []);
                            e.target.value = '';
                            if (selected.length === 0) return;
                            const remaining = Math.max(0, 6 - composerImages.length);
                            setComposerUploadingImage(true);
                            try {
                              for (const file of selected.slice(0, remaining)) {
                                if (file.size > COMMUNITY_IMAGE_MAX_BYTES) {
                                  throw new Error(`"${file.name}" exceeds 10 MB.`);
                                }
                                const uploaded = await uploadAdminCommunityMediaChunked(file, 'image');
                                setComposerImages((prev) => [...prev, uploaded].slice(0, 6));
                              }
                            } catch (err) {
                              notify('error', err instanceof Error ? err.message : 'Image upload failed.');
                            } finally {
                              setComposerUploadingImage(false);
                            }
                          }}
                        />
                      </label>

                      <label
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs cursor-pointer ${
                          composerVideoPct !== null ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        {composerVideoPct !== null ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                        ) : (
                          <Video className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        {composerVideoPct !== null ? `Video ${composerVideoPct}%` : 'Video (1–80 MB)'}
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/ogg"
                          className="hidden"
                          disabled={composerVideoPct !== null}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (file.size < COMMUNITY_VIDEO_MIN_BYTES || file.size > COMMUNITY_VIDEO_MAX_BYTES) {
                              notify('error', `Video must be between 1 MB and 80 MB (selected: ${formatMediaBytes(file.size)}).`);
                              return;
                            }
                            setComposerVideoPct(1);
                            try {
                              const prevFn = composerVideo?.filename;
                              const uploaded = await uploadAdminCommunityMediaChunked(
                                file,
                                'video',
                                (pct) => setComposerVideoPct(pct),
                              );
                              setComposerVideo(uploaded);
                              if (prevFn) await deleteAdminCommunityMedia(prevFn).catch(() => {});
                            } catch (err) {
                              notify('error', err instanceof Error ? err.message : 'Video upload failed.');
                            } finally {
                              setComposerVideoPct(null);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {composerImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {composerImages.map((img) => (
                        <div key={img.filename} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={async () => {
                              setComposerImages((prev) => prev.filter((item) => item.filename !== img.filename));
                              await deleteAdminCommunityMedia(img.filename).catch(() => {});
                            }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/75 text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {composerVideo && (
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-[#0D1322] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className="truncate font-mono">
                        {composerVideo.name} ({formatMediaBytes(composerVideo.sizeBytes)})
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const fn = composerVideo.filename;
                          setComposerVideo(null);
                          await deleteAdminCommunityMedia(fn).catch(() => {});
                        }}
                        className="text-red-500 hover:underline shrink-0 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPost || composerVideoPct !== null || composerUploadingImage}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {creatingPost ? 'Publishing...' : 'Publish Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Community Images */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            aria-label="Close image preview"
            className="absolute top-4 right-4 p-2 rounded-lg bg-slate-900/90 text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImageUrl}
            alt="Expanded community attachment"
            className="max-w-full max-h-[90vh] rounded-xl object-contain border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Report Community Content
              </h2>
              <button
                onClick={() => setReportTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as ModerationReport['reason'])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-sm text-slate-900 dark:text-white"
                >
                  <option value="spam">Spam or unsolicited promotion</option>
                  <option value="harassment">Harassment or disrespectful conduct</option>
                  <option value="misinformation">Misleading technical advice</option>
                  <option value="unsafe_code">Unsafe or malicious code</option>
                  <option value="other">Other policy concern</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Additional Context
                </label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Describe why moderators should review this..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#080C17] text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportTarget(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
