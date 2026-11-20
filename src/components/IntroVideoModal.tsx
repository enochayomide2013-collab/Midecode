import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';

interface IntroVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const DEFAULT_MP4_URL =
  '/assets/aistudio/Untitled_Scene_11-18_19_52_26_20261118205722_b7453f54.mp4?v=4';
const DEFAULT_WEBM_URL =
  '/assets/aistudio/Untitled_Scene_11-18_19_52_26_20261118205722_b7453f54.webm?v=4';

export const INTRO_VIDEO_URL = (
  (import.meta.env.VITE_INTRO_VIDEO_URL as string | undefined) || DEFAULT_MP4_URL
).trim();

export const INTRO_WEBM_URL =
  import.meta.env.VITE_INTRO_VIDEO_URL ? '' : DEFAULT_WEBM_URL;

const INTRO_POS_STORAGE_KEY = 'mideocode_intro_last_pos';

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

interface PlaybackCandidate {
  url: string;
  mime: string;
  mode: 'direct' | 'blob';
}

function buildOrderedCandidates(): PlaybackCandidate[] {
  const probe =
    typeof document !== 'undefined' ? document.createElement('video') : null;
  const mp4Score = probe
    ? probe.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') ||
      probe.canPlayType('video/mp4')
    : 'maybe';
  const webmScore =
    INTRO_WEBM_URL && probe
      ? probe.canPlayType('video/webm; codecs="vp8, opus"') ||
        probe.canPlayType('video/webm')
      : '';

  const baseFormats: { url: string; mime: string; rank: number }[] = [];
  if (INTRO_VIDEO_URL) {
    baseFormats.push({
      url: INTRO_VIDEO_URL,
      mime: 'video/mp4',
      rank: mp4Score === 'probably' ? 3 : mp4Score === 'maybe' ? 2 : 1,
    });
  }
  if (INTRO_WEBM_URL) {
    baseFormats.push({
      url: INTRO_WEBM_URL,
      mime: 'video/webm',
      rank: webmScore === 'probably' ? 3 : webmScore === 'maybe' ? 2 : 1,
    });
  }

  baseFormats.sort((a, b) => b.rank - a.rank);

  const ordered: PlaybackCandidate[] = [];
  for (const item of baseFormats) {
    ordered.push({ url: item.url, mime: item.mime, mode: 'direct' });
  }
  for (const item of baseFormats) {
    ordered.push({ url: item.url, mime: item.mime, mode: 'blob' });
  }
  return ordered;
}

/**
 * Shared resilient inline player used both inside Sign-In / Sign-Up modals and standalone triggers.
 */
export function IntroVideoInlinePlayer({
  onComplete,
  compact = false,
}: {
  onComplete?: () => void;
  compact?: boolean;
}) {
  const { notify } = useMideo();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const candidates = useMemo(() => buildOrderedCandidates(), []);

  const [candidateIdx, setCandidateIdx] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState<string>(candidates[0]?.url || INTRO_VIDEO_URL);
  const blobUrlsRef = useRef<string[]>([]);
  const advanceLockRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(40);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [completedRecorded, setCompletedRecorded] = useState(false);

  const cleanupBlobs = useCallback(() => {
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanupBlobs();
    };
  }, [cleanupBlobs]);

  const loadCandidateAt = useCallback(
    async (nextIdx: number, errorCode?: number) => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      try {
        for (let idx = nextIdx; idx < candidates.length; idx += 1) {
          const cand = candidates[idx];
          if (cand.mode === 'direct') {
            setCandidateIdx(idx);
            setResolvedSrc(cand.url);
            setVideoError(null);
            setLoading(true);
            return;
          }
          try {
            const resp = await fetch(cand.url, {
              credentials: 'same-origin',
              cache: 'no-store',
            });
            const ctype = (resp.headers.get('content-type') || '').toLowerCase();
            if (resp.ok && (ctype.startsWith('video/') || ctype.includes('octet-stream'))) {
              const blob = await resp.blob();
              if (blob.size > 1024) {
                const typedBlob = blob.type.startsWith('video/')
                  ? blob
                  : new Blob([blob], { type: cand.mime });
                const objUrl = URL.createObjectURL(typedBlob);
                blobUrlsRef.current.push(objUrl);
                setCandidateIdx(idx);
                setResolvedSrc(objUrl);
                setVideoError(null);
                setLoading(true);
                return;
              }
            }
          } catch {
            // Try next candidate
          }
        }

        setLoading(false);
        setIsPlaying(false);
        const detail =
          errorCode === 2
            ? ' (network interruption)'
            : errorCode === 3
              ? ' (media decode error)'
              : errorCode === 4
                ? ' (media source not supported)'
                : '';
        setVideoError(
          `Unable to load the Introduction to MideoCode video right now${detail}. Click Retry Video to try again.`,
        );
      } finally {
        advanceLockRef.current = false;
      }
    },
    [candidates],
  );

  const restorePosition = () => {
    const video = videoRef.current;
    if (!video || compact) return;
    try {
      const raw = localStorage.getItem(INTRO_POS_STORAGE_KEY);
      const saved = raw ? Number(raw) : 0;
      if (Number.isFinite(saved) && saved > 1 && video.duration > 0 && saved < video.duration - 2) {
        video.currentTime = saved;
        setCurrentTime(saved);
        setProgressPct((saved / video.duration) * 100);
      }
    } catch {
      // Ignore storage errors
    }
  };

  const persistPosition = (seconds: number) => {
    if (compact) return;
    try {
      localStorage.setItem(INTRO_POS_STORAGE_KEY, String(Math.floor(seconds)));
    } catch {
      // Ignore storage errors
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || videoError) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    } else {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setLoading(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setVideoError('Playback was blocked by browser autoplay policy. Click Play to start.');
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * video.duration;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setProgressPct(ratio * 100);
    persistPosition(nextTime);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    if (dur > 0) {
      setDuration(dur);
      const pct = (cur / dur) * 100;
      setProgressPct(pct);
      persistPosition(cur);
      if (pct >= 90 && !completedRecorded) {
        setCompletedRecorded(true);
        if (onComplete) onComplete();
        notify('success', 'Introduction video completed! Welcome to MideoCode.');
      }
    }
  };

  const handleRetry = () => {
    cleanupBlobs();
    setVideoError(null);
    setLoading(true);
    setCandidateIdx(0);
    setResolvedSrc(candidates[0]?.url || INTRO_VIDEO_URL);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  return (
    <div className="flex flex-col">
      <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
        {!INTRO_VIDEO_URL ? (
          <div className="p-6 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-xs text-slate-300 max-w-sm">
              Introduction video hosting URL is not configured.
            </p>
          </div>
        ) : (
          <video
            key={`${candidateIdx}-${resolvedSrc}`}
            ref={videoRef}
            src={resolvedSrc}
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              if (videoRef.current?.duration) setDuration(videoRef.current.duration);
              restorePosition();
              setLoading(false);
            }}
            onLoadedData={() => setLoading(false)}
            onCanPlay={() => setLoading(false)}
            onCanPlayThrough={() => setLoading(false)}
            onWaiting={() => setLoading(true)}
            onPlaying={() => {
              setLoading(false);
              setIsPlaying(true);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => {
              const code = videoRef.current?.error?.code;
              void loadCandidateAt(candidateIdx + 1, code);
            }}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              setIsPlaying(false);
              persistPosition(0);
              if (!completedRecorded) {
                setCompletedRecorded(true);
                if (onComplete) onComplete();
              }
            }}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
          />
        )}

        {loading && !videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-slate-200 pointer-events-none gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            <span className="text-[11px] font-medium">Loading introduction video...</span>
          </div>
        )}

        {videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-5 gap-3 z-20">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <p className="text-xs text-slate-200 max-w-sm">{videoError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Video
            </button>
          </div>
        )}

        {!isPlaying && !loading && !videoError && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play introduction video"
            className={`absolute inset-0 m-auto rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer z-10 ${
              compact ? 'w-12 h-12' : 'w-16 h-16'
            }`}
          >
            <Play className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} fill-current ml-0.5`} />
          </button>
        )}
      </div>

      {/* Video Control Bar */}
      <div className={`${compact ? 'p-2.5 space-y-2' : 'p-4 space-y-3'} bg-[#0D1322] border-t border-slate-800`}>
        <div
          onClick={handleSeek}
          role="slider"
          aria-label="Video playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          className="h-1.5 w-full rounded bg-slate-800 overflow-hidden cursor-pointer group"
        >
          <div
            className="h-full bg-blue-600 group-hover:bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              disabled={Boolean(videoError)}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {isPlaying ? 'Pause' : compact ? 'Play' : 'Play Intro'}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {completedRecorded && !compact && (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Completed
              </span>
            )}
            {!compact && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleSpeedChange(rate)}
                    className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IntroVideoModal({ isOpen, onClose, onComplete }: IntroVideoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#0B101D] shadow-2xl overflow-hidden flex flex-col">
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-white">Introduction to MideoCode (40s)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close introduction video"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <IntroVideoInlinePlayer onComplete={onComplete} />
      </div>
    </div>
  );
}
