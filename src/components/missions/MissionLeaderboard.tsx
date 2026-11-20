import { useEffect, useState } from 'react';
import { Award, Clock, Gauge, Trophy } from 'lucide-react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useMideo } from '../../context/MideoContext';
import { syncCompletedAttemptToLeaderboard } from '../../services/missionService';
import type { MissionLeaderboardEntry } from '../../types/mideocode';

interface MissionLeaderboardProps {
  missionId: string;
}

export function MissionLeaderboard({ missionId }: MissionLeaderboardProps) {
  const { firebaseUser, profile } = useMideo();
  const [entries, setEntries] = useState<MissionLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Backfill the signed-in learner's existing completed attempt if not yet on leaderboard
  useEffect(() => {
    if (!firebaseUser || !missionId) return;
    syncCompletedAttemptToLeaderboard(
      firebaseUser.uid,
      missionId,
      profile?.displayName,
      profile?.photoURL,
    ).catch(() => {});
  }, [firebaseUser, missionId, profile?.displayName, profile?.photoURL]);

  // Real-time subscription to public non-PII Mission Leaderboard collection
  useEffect(() => {
    if (!missionId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'missionLeaderboard'),
      where('missionId', '==', missionId),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const byUser = new Map<string, MissionLeaderboardEntry>();
        snapshot.docs.forEach((d) => {
          const item = d.data() as MissionLeaderboardEntry;
          const prev = byUser.get(item.userId);
          if (
            !prev ||
            item.durationSeconds < prev.durationSeconds ||
            (item.durationSeconds === prev.durationSeconds && item.version < prev.version)
          ) {
            byUser.set(item.userId, item);
          }
        });

        const sorted = Array.from(byUser.values()).sort((a, b) => {
          if (a.durationSeconds !== b.durationSeconds) {
            return a.durationSeconds - b.durationSeconds;
          }
          if (a.version !== b.version) {
            return a.version - b.version;
          }
          return (b.efficiencyScore || 0) - (a.efficiencyScore || 0);
        });

        setEntries(sorted);
        setLoading(false);
      },
      (err) => {
        console.warn('Mission leaderboard listener error:', err.message);
        setError('Unable to load real-time leaderboard right now.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [missionId]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins === 0) return `${s}s`;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    return `${mins}m ${s}s`;
  };

  if (loading) {
    return (
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center text-xs text-slate-500">
        Connecting to real-time mission leaderboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center text-xs text-red-500">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-center space-y-2">
        <Trophy className="w-6 h-6 text-slate-400 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No Completed Attempts Yet</h3>
        <p className="text-xs text-slate-500">
          Be the first developer to complete this mission and claim the #1 spot on the live leaderboard!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Live Mission Speed & Code Efficiency Leaderboard
          </h2>
        </div>
        <span className="text-xs font-mono tabular-nums text-emerald-500">
          Live · {entries.length} finisher{entries.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {entries.map((entry, idx) => {
          const isCurrentUser = Boolean(firebaseUser && entry.userId === firebaseUser.uid);
          return (
            <div
              key={entry.userId}
              className={`py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3 text-xs ${
                isCurrentUser ? 'bg-blue-500/5 -mx-2 px-2 rounded-lg' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full font-bold flex items-center justify-center shrink-0 ${
                    idx === 0
                      ? 'bg-amber-500 text-white'
                      : idx === 1
                        ? 'bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white'
                        : idx === 2
                          ? 'bg-amber-700/70 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  #{idx + 1}
                </span>
                {entry.photoURL ? (
                  <img
                    src={entry.photoURL}
                    alt={entry.displayName}
                    className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {entry.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <span>{entry.displayName}</span>
                    {isCurrentUser && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-600/15 text-blue-500 text-[10px] font-bold">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                    <span>v{entry.version} submission</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-violet-500 dark:text-violet-400">
                      <Gauge className="w-3 h-3" />
                      {entry.efficiencyScore} pts
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                <span className="inline-flex items-center gap-1" title="Completion speed">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  {formatDuration(entry.durationSeconds)}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Award className="w-3.5 h-3.5" />
                  +{entry.xpAwarded} XP
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
