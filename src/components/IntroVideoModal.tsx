import { useEffect, useRef, useState } from 'react';
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
  '/assets/aistudio/Untitled_Scene_11-18_19_52_26_20261118205722_b7453f54.mp4?v=3';
const DEFAULT_WEBM_URL =
  '/assets/aistudio/Untitled_Scene_11-18_19_52_26_20261118205722_b7453f54.webm?v=3';

export const INTRO_VIDEO_URL = (
  (import.meta.env.VITE_INTRO_VIDEO_URL as string | undefined) || DEFAULT_MP4_URL
).trim();

const INTRO_WEBM_URL =
  import.meta.env.VITE_INTRO_VIDEO_URL ? '' : DEFAULT_WEBM_URL;

const INTRO_POS_STORAGE_KEY = 'mideocode_intro_last_pos';

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function IntroVideoModal({ isOpen, onClose, onComplete }: IntroVideoModalProps) {
  const { notify } = useMideo();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(40);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [completedRecorded, setCompletedRecorded] = useState(false);
  const [blobFallbackUrl, setBlobFallbackUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const attemptedFallbackRef = useRef(false);

  const revokeBlobFallback = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobFallbackUrl(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      attemptedFallbackRef.current = false;
      revokeBlobFallback();
      return;
    }
    setVideoError(null);
    attemptedFallbackRef.current = false;
    const v = videoRef.current;
    if (v && v.readyState >= 2) {
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const persistPosition = (seconds: number) => {
    try {
      localStorage.setItem(INTRO_POS_STORAGE_KEY, String(Math.floor(seconds)));
    } catch {
      // Ignore storage errors
    }
  };

  const restorePosition = () => {
    const video = videoRef.current;
    if (!video) return;
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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || videoError) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    } else {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setVideoError('Playback could not start automatically. Click Retry or press Play again.');
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
    setVideoError(null);
    setLoading(true);
    attemptedFallbackRef.current = false;
    revokeBlobFallback();
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const tryBlobFallbackOrFail = async (code?: number) => {
    if (!attemptedFallbackRef.current && INTRO_VIDEO_URL) {
      attemptedFallbackRef.current = true;
      setLoading(true);
      const v = videoRef.current;
      const supportsWebm = Boolean(
        INTRO_WEBM_URL && v?.canPlayType('video/webm; codecs="vp8, opus"')
      );
      const supportsMp4 = Boolean(
        v?.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') || v?.canPlayType('video/mp4')
      );
      const candidates = INTRO_WEBM_URL
        ? supportsWebm && !supportsMp4
          ? [INTRO_WEBM_URL, INTRO_VIDEO_URL]
          : [INTRO_VIDEO_URL, INTRO_WEBM_URL]
        : [INTRO_VIDEO_URL];
      for (const candidateUrl of candidates) {
        try {
          const resp = await fetch(candidateUrl, { credentials: 'same-origin', cache: 'no-store' });
          const ctype = (resp.headers.get('content-type') || '').toLowerCase();
          if (resp.ok && ctype.startsWith('video/')) {
            const blob = await resp.blob();
            if (blob.size > 1024) {
              revokeBlobFallback();
              const objUrl = URL.createObjectURL(blob);
              blobUrlRef.current = objUrl;
              setBlobFallbackUrl(objUrl);
              setVideoError(null);
              return;
            }
          }
        } catch {
          // Try next candidate
        }
      }
    }

    setLoading(false);
    setIsPlaying(false);
    const detail =
      code === 2
        ? ' (network interruption)'
        : code === 3
          ? ' (media decode error)'
          : code === 4
            ? ' (media source not supported)'
            : '';
    setVideoError(`Unable to load the Introduction to MideoCode video right now${detail}. Click Retry Video to try again.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#0B101D] shadow-2xl overflow-hidden flex flex-col">
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-white">Introduction to MideoCode (40s)</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close introduction video"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black aspect-video flex items-center justify-center">
          {!INTRO_VIDEO_URL ? (
            <div className="p-6 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300 max-w-sm">
                Introduction video hosting URL is not configured. Set VITE_INTRO_VIDEO_URL to your hosted MP4 URL to enable playback.
              </p>
            </div>
          ) : (
            <video
              key={blobFallbackUrl || 'multi-source'}
              ref={videoRef}
              src={blobFallbackUrl || undefined}
              playsInline
              preload="metadata"
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
                void tryBlobFallbackOrFail(videoRef.current?.error?.code);
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
            >
              {!blobFallbackUrl && INTRO_WEBM_URL && (
                <source src={INTRO_WEBM_URL} type="video/webm" />
              )}
              {!blobFallbackUrl && (
                <source
                  src={INTRO_VIDEO_URL}
                  type="video/mp4"
                  onError={() => {
                    void tryBlobFallbackOrFail(videoRef.current?.error?.code ?? 4);
                  }}
                />
              )}
            </video>
          )}

          {loading && !videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-slate-200 pointer-events-none gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <span className="text-xs font-medium">Loading introduction video...</span>
            </div>
          )}

          {videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 gap-3 z-20">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-xs text-slate-200 max-w-sm">{videoError}</p>
              <button
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
              onClick={togglePlay}
              aria-label="Play introduction video"
              className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer z-10"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>
          )}
        </div>

        {/* Video Control Bar */}
        <div className="p-4 bg-[#0D1322] border-t border-slate-800 space-y-3">
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Video playback progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
            className="h-2 w-full rounded bg-slate-800 overflow-hidden cursor-pointer group"
          >
            <div
              className="h-full bg-blue-600 group-hover:bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <button
                onClick={togglePlay}
                disabled={Boolean(videoError)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Pause' : 'Play Intro'}
              </button>
              <button
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {completedRecorded && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed
                </span>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
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
              <button
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen"
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
