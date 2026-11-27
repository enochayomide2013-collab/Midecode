import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, RefreshCw } from 'lucide-react';
import type {
  ContributionCategoryFilter,
  ContributionDayCell,
  ContributionHeatmapData,
} from '../types/mideocode';

interface ContributionHeatmapProps {
  data: ContributionHeatmapData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigateInsights: () => void;
  onOpenIde: () => void;
  onOpenAcademy: () => void;
}

const FILTER_OPTIONS: { id: ContributionCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'missions', label: 'Missions' },
  { id: 'projects', label: 'Projects & IDE' },
  { id: 'tests', label: 'Tests' },
];

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Mon',
  3: 'Wed',
  5: 'Fri',
};

function getFilteredCount(cell: ContributionDayCell, filter: ContributionCategoryFilter): number {
  if (cell.isFuture) return 0;
  if (filter === 'all') return cell.count;
  return cell.breakdown[filter] ?? 0;
}

function getIntensityLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxCount <= 4) {
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  }
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-slate-100 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-800',
  1: 'bg-emerald-200 dark:bg-emerald-950/90 border-emerald-300/80 dark:border-emerald-900',
  2: 'bg-emerald-400 dark:bg-emerald-800 border-emerald-500/70 dark:border-emerald-700',
  3: 'bg-emerald-500 dark:bg-emerald-600 border-emerald-600/80 dark:border-emerald-500',
  4: 'bg-emerald-600 dark:bg-emerald-400 border-emerald-700/80 dark:border-emerald-300',
};

function formatUtcDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatUtcShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function ContributionHeatmap({
  data,
  loading,
  error,
  onRetry,
  onNavigateInsights,
  onOpenIde,
  onOpenAcademy,
}: ContributionHeatmapProps) {
  const [filter, setFilter] = useState<ContributionCategoryFilter>('all');
  const [hoveredCell, setHoveredCell] = useState<ContributionDayCell | null>(null);
  const [pinnedCell, setPinnedCell] = useState<ContributionDayCell | null>(null);

  const computedStats = useMemo(() => {
    if (!data) {
      return {
        total: 0,
        activeDays: 0,
        currentStreak: 0,
        longestStreak: 0,
        bestDay: null as { dateKey: string; count: number } | null,
        maxCount: 0,
        todayCell: null as ContributionDayCell | null,
      };
    }

    let total = 0;
    let activeDays = 0;
    let maxCount = 0;
    let bestDay: { dateKey: string; count: number } | null = null;
    let runningStreak = 0;
    let longestStreak = 0;
    const flatNonFuture: { dateKey: string; count: number }[] = [];
    let todayCell: ContributionDayCell | null = null;

    for (const week of data.weeks) {
      for (const cell of week) {
        if (cell.dateKey === data.endDateKey) {
          todayCell = cell;
        }
        if (cell.isFuture) continue;
        const c = getFilteredCount(cell, filter);
        flatNonFuture.push({ dateKey: cell.dateKey, count: c });
        if (c > 0) {
          total += c;
          activeDays += 1;
          if (c > maxCount) maxCount = c;
          if (!bestDay || c > bestDay.count) {
            bestDay = { dateKey: cell.dateKey, count: c };
          }
          runningStreak += 1;
          if (runningStreak > longestStreak) longestStreak = runningStreak;
        } else {
          runningStreak = 0;
        }
      }
    }

    let currentStreak = 0;
    for (let i = flatNonFuture.length - 1; i >= 0; i--) {
      if (flatNonFuture[i].count > 0) {
        currentStreak += 1;
      } else if (i === flatNonFuture.length - 1) {
        continue;
      } else {
        break;
      }
    }

    return {
      total,
      activeDays,
      currentStreak,
      longestStreak,
      bestDay,
      maxCount,
      todayCell,
    };
  }, [data, filter]);

  const activeCell = hoveredCell || pinnedCell || computedStats.todayCell;
  const activeCellCount = activeCell ? getFilteredCount(activeCell, filter) : 0;

  const breakdownParts = useMemo(() => {
    if (!activeCell) return [];
    const bd = activeCell.breakdown;
    const parts: string[] = [];
    if (bd.lessons > 0) parts.push(`${bd.lessons} ${bd.lessons === 1 ? 'lesson' : 'lessons'}`);
    if (bd.challenges > 0) parts.push(`${bd.challenges} ${bd.challenges === 1 ? 'challenge' : 'challenges'}`);
    if (bd.missions > 0) parts.push(`${bd.missions} ${bd.missions === 1 ? 'mission' : 'missions'}`);
    if (bd.projects > 0) parts.push(`${bd.projects} ${bd.projects === 1 ? 'workspace/IDE' : 'workspace/IDE'}`);
    if (bd.tests > 0) parts.push(`${bd.tests} ${bd.tests === 1 ? 'test run' : 'test runs'}`);
    if (bd.ai > 0) parts.push(`${bd.ai} AI ${bd.ai === 1 ? 'session' : 'sessions'}`);
    return parts;
  }, [activeCell]);

  return (
    <section
      aria-labelledby="contribution-heatmap-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2
              id="contribution-heatmap-heading"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Coding Activity
            </h2>
            {data && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                · {formatUtcShortDate(data.startDateKey)} – {formatUtcShortDate(data.endDateKey)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daily coding, lessons, challenges, missions, and test activity synced from your Firestore progress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category Segmented Filter */}
          <div
            role="tablist"
            aria-label="Filter coding activity by category"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {FILTER_OPTIONS.map((opt) => {
              const selected = filter === opt.id;
              return (
                <button
                  key={opt.id}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selected
                      ? 'bg-white dark:bg-[#0D1322] text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onNavigateInsights}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
          >
            <span>View Full Insights</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip (Unboxed inline telemetry) */}
      {!loading && !error && data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-4">
          <span>
            <strong className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
              {computedStats.total}
            </strong>{' '}
            {computedStats.total === 1 ? 'contribution' : 'contributions'} in the last year
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            Active Days:{' '}
            <strong className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
              {computedStats.activeDays}
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            Current Streak:{' '}
            <strong className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
              {computedStats.currentStreak}d
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            Longest Streak:{' '}
            <strong className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
              {computedStats.longestStreak}d
            </strong>
          </span>
          {computedStats.bestDay && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>
                Best Day:{' '}
                <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                  {computedStats.bestDay.count}
                </strong>{' '}
                on {formatUtcShortDate(computedStats.bestDay.dateKey)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading coding activity heatmap">
          <div className="h-4 w-56 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-28 w-full rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-dashed border-rose-300 dark:border-rose-800/70 rounded-lg px-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Unable to load coding activity history
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* 53-Week × 7-Day Calendar Grid */}
      {data && !error && (
        <div className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              {/* Month Labels Row */}
              <div className="relative h-5 ml-8 mb-1" style={{ width: `${data.weeks.length * 15}px` }}>
                {data.monthLabels.map((m) => (
                  <span
                    key={`${m.label}-${m.weekIndex}`}
                    className="absolute top-0 text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none"
                    style={{ left: `${m.weekIndex * 15}px` }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>

              {/* Weekday Labels + 53 Week Columns */}
              <div className="flex items-start gap-2">
                <div className="grid grid-rows-7 gap-[3px] w-6 shrink-0 pt-0.5 text-[10px] text-slate-500 dark:text-slate-400 select-none">
                  {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
                    <span key={dow} className="h-[12px] leading-[12px]">
                      {WEEKDAY_LABELS[dow] || ''}
                    </span>
                  ))}
                </div>

                <div
                  role="grid"
                  aria-label="53-week coding contribution calendar"
                  className="flex gap-[3px]"
                >
                  {data.weeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-rows-7 gap-[3px]">
                      {week.map((cell) => {
                        if (cell.isFuture) {
                          return (
                            <div
                              key={cell.dateKey}
                              aria-hidden="true"
                              className="w-[12px] h-[12px] rounded-[2px] opacity-0"
                            />
                          );
                        }
                        const count = getFilteredCount(cell, filter);
                        const level = getIntensityLevel(count, computedStats.maxCount);
                        const isPinned = pinnedCell?.dateKey === cell.dateKey;
                        const isToday = cell.dateKey === data.endDateKey;
                        const label = `${count} ${count === 1 ? 'contribution' : 'contributions'} on ${formatUtcDateLabel(cell.dateKey)}`;

                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            aria-label={label}
                            title={label}
                            data-date={cell.dateKey}
                            data-count={count}
                            data-level={level}
                            onMouseEnter={() => setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onFocus={() => setHoveredCell(cell)}
                            onBlur={() => setHoveredCell(null)}
                            onClick={() =>
                              setPinnedCell((prev) =>
                                prev?.dateKey === cell.dateKey ? null : cell,
                              )
                            }
                            className={`w-[12px] h-[12px] rounded-[2px] border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer ${LEVEL_CLASSES[level]} ${
                              isPinned
                                ? 'ring-2 ring-slate-900 dark:ring-white'
                                : isToday
                                  ? 'ring-1 ring-slate-400 dark:ring-slate-500'
                                  : ''
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer: Selected Day Breakdown + Intensity Legend */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-xs">
            <div className="space-y-1 min-w-0">
              {activeCell ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatUtcDateLabel(activeCell.dateKey)}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {activeCellCount} {activeCellCount === 1 ? 'contribution' : 'contributions'}
                    </span>
                    {breakdownParts.length > 0 && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {breakdownParts.join(' · ')}
                        </span>
                      </>
                    )}
                  </div>
                  {activeCell.actions.length > 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeCell.actions.slice(0, 3).join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  Hover or select any square to inspect daily coding activity.
                </span>
              )}
            </div>

            {/* Intensity Legend */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
              <span>Less</span>
              {([0, 1, 2, 3, 4] as const).map((lvl) => (
                <span
                  key={lvl}
                  aria-hidden="true"
                  className={`w-[11px] h-[11px] rounded-[2px] border ${LEVEL_CLASSES[lvl]}`}
                />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* Empty-Activity Action Prompt */}
          {computedStats.total === 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                {filter === 'all'
                  ? 'No recorded activity yet. Complete an Academy lesson, solve a Challenge, or save code in Mideo IDE to start your streak.'
                  : `No recorded ${FILTER_OPTIONS.find((f) => f.id === filter)?.label.toLowerCase()} activity in the past year.`}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onOpenAcademy}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                >
                  Open Academy
                </button>
                <button
                  type="button"
                  onClick={onOpenIde}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Open Mideo IDE
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
