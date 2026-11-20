import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { CheckCircle2, EyeOff, HelpCircle, Loader2, Play, Trophy, XCircle } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { CHALLENGES } from '../data/challengesData';
import { fetchWithAuthAndRetry } from '../services/authService';
import {
  listChallengeAttempts,
  listPublicLeaderboard,
  saveChallengeAttempt,
} from '../services/dataService';
import { extractReadableError } from '../services/firebase';
import type { ChallengeAttempt, ChallengeTestResult, PublicProfile } from '../types/mideocode';

export function ChallengesView() {
  const {
    firebaseUser,
    settings,
    selectedChallengeId,
    openChallenge,
    openCourse,
    grantXp,
    notify,
  } = useMideo();

  const [cadenceFilter, setCadenceFilter] = useState<'all' | 'daily' | 'weekly' | 'topic'>('all');
  const [diffFilter, setDiffFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [language, setLanguage] = useState<'javascript' | 'python'>('javascript');
  const [code, setCode] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [running, setRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<{
    passed: boolean;
    passedCount: number;
    totalCount: number;
    executionMs: number;
    results: ChallengeTestResult[];
  } | null>(null);
  const [attempts, setAttempts] = useState<ChallengeAttempt[]>([]);
  const [leaderboard, setLeaderboard] = useState<PublicProfile[]>([]);

  const challenge = CHALLENGES.find((c) => c.id === selectedChallengeId) || CHALLENGES[0];

  useEffect(() => {
    setCode(challenge.starterCode[language]);
    setEvalResult(null);
    setShowHint(false);
  }, [challenge.id, language]);

  useEffect(() => {
    if (!firebaseUser) return;
    listChallengeAttempts(firebaseUser.uid).then(setAttempts).catch(() => {});
    listPublicLeaderboard().then(setLeaderboard).catch(() => {});
  }, [firebaseUser]);

  const filteredChallenges = CHALLENGES.filter((c) => {
    const matchCad = cadenceFilter === 'all' || c.cadence === cadenceFilter;
    const matchDiff = diffFilter === 'all' || c.difficulty === diffFilter;
    return matchCad && matchDiff;
  });

  const handleSubmit = async () => {
    if (!firebaseUser) return;
    setRunning(true);
    setEvalResult(null);
    try {
      const res = await fetchWithAuthAndRetry('/api/challenges/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          language,
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Challenge execution failed.');
      }

      setEvalResult({
        passed: data.passed,
        passedCount: data.passedCount,
        totalCount: data.totalCount,
        executionMs: data.executionMs,
        results: data.results,
      });

      const saved = await saveChallengeAttempt(firebaseUser.uid, {
        challengeId: challenge.id,
        language,
        code,
        passed: data.passed,
        passedCount: data.passedCount,
        totalCount: data.totalCount,
        executionMs: data.executionMs,
      });
      setAttempts((prev) => [saved, ...prev]);

      if (data.passed) {
        await grantXp('challenge', challenge.id, `Solved challenge: ${challenge.title}`);
        listPublicLeaderboard().then(setLeaderboard).catch(() => {});
      } else {
        notify('info', `${data.passedCount}/${data.totalCount} test cases passed. Review failures below.`);
      }
    } catch (err) {
      notify('error', extractReadableError(err, 'Submission error.'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mideo Challenges</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Isolated server-side test evaluation with hidden edge cases and verified XP rewards.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={cadenceFilter}
            onChange={(e) => setCadenceFilter(e.target.value as 'all' | 'daily' | 'weekly' | 'topic')}
            aria-label="Filter by cadence"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
          >
            <option value="all">All Cadences</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="topic">Topic</option>
          </select>
          <select
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value as 'all' | 'easy' | 'medium' | 'hard')}
            aria-label="Filter by difficulty"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Challenge Selector Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredChallenges.map((c) => {
          const solved = attempts.some((a) => a.challengeId === c.id && a.passed);
          return (
            <button
              key={c.id}
              onClick={() => openChallenge(c.id)}
              className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                c.id === challenge.id
                  ? 'border-blue-600 bg-blue-600/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-slate-400'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span className="capitalize">{c.cadence} · {c.difficulty} · +{c.xpReward} XP</span>
                {solved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
            </button>
          );
        })}
      </div>

      {/* Active Challenge Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Spec & Leaderboard */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium capitalize">
                {challenge.category} · {challenge.difficulty} · +{challenge.xpReward} XP
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{challenge.title}</h2>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{challenge.problemStatement}</p>

            <div className="text-xs space-y-1">
              <p><strong>Input:</strong> <code className="font-mono">{challenge.inputDescription}</code></p>
              <p><strong>Output:</strong> <code className="font-mono">{challenge.outputDescription}</code></p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Examples</h3>
              {challenge.examples.map((ex, i) => (
                <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-1">
                  <div>In: {ex.input}</div>
                  <div>Out: {ex.output}</div>
                  <div className="text-slate-500 font-sans">{ex.explanation}</div>
                </div>
              ))}
            </div>

            <div className="text-xs">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Constraints</h3>
              <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400 space-y-0.5">
                {challenge.constraints.map((con, idx) => <li key={idx}>{con}</li>)}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setShowHint((h) => !h)}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showHint ? 'Hide Hints' : 'Show Hint'}
              </button>
              {challenge.relatedCourseId && (
                <button
                  onClick={() => openCourse(challenge.relatedCourseId!)}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Review Related Course
                </button>
              )}
            </div>
            {showHint && (
              <div className="p-3 rounded-lg bg-blue-600/10 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                {challenge.hints.map((h, i) => <p key={i}>{h}</p>)}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Leaderboard (Verified XP)</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {leaderboard.slice(0, 5).map((u, idx) => (
                <div key={u.uid} className="py-2 flex items-center justify-between">
                  <span className="truncate">{idx + 1}. {u.displayName}</span>
                  <span className="font-mono tabular-nums text-slate-500">{u.xp} XP · Lv {u.level}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Code Editor & Isolated Test Output */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-2">
                {challenge.supportedLanguages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-3 py-1 rounded text-xs font-medium capitalize cursor-pointer ${
                      language === lang ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmit}
                disabled={running}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Submit & Run Tests
              </button>
            </div>
            <CodeMirror
              value={code}
              height="360px"
              theme={settings?.editorTheme === 'githubLight' ? 'light' : oneDark}
              extensions={[language === 'python' ? python() : javascript()]}
              basicSetup={{ tabSize: settings?.tabSize || 2 }}
              style={{ fontSize: `${settings?.editorFontSize || 14}px` }}
              onChange={(val) => setCode(val)}
            />
          </div>

          {evalResult && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {evalResult.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm font-bold">
                    {evalResult.passed ? 'All Test Cases Passed' : 'Some Test Cases Failed'}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {evalResult.passedCount}/{evalResult.totalCount} passed · {evalResult.executionMs}ms
                </span>
              </div>

              <div className="space-y-2">
                {evalResult.results.map((r) => (
                  <div
                    key={r.index}
                    className={`p-3 rounded-lg border text-xs font-mono ${
                      r.passed
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-red-500/40 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-sans font-semibold inline-flex items-center gap-1.5">
                        Test #{r.index}
                        {r.isHidden && <EyeOff className="w-3 h-3 text-slate-400" />}
                      </span>
                      <span>{r.passed ? 'PASS' : 'FAIL'}</span>
                    </div>
                    {!r.isHidden && (
                      <div className="text-slate-600 dark:text-slate-300 space-y-0.5">
                        <div>Input: {r.inputPreview}</div>
                        <div>Expected: {r.expectedPreview} · Actual: {r.actualPreview}</div>
                      </div>
                    )}
                    {r.error && <div className="text-red-500 mt-1">{r.error}</div>}
                  </div>
                ))}
              </div>

              {evalResult.passed && (
                <p className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <strong>Concept Explanation: </strong>{challenge.explanation}
                </p>
              )}
            </div>
          )}

          {/* Submission History */}
          {attempts.filter((a) => a.challengeId === challenge.id).length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5">
              <h3 className="text-xs font-semibold mb-3">Recent Attempts</h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {attempts
                  .filter((a) => a.challengeId === challenge.id)
                  .slice(0, 5)
                  .map((a) => (
                    <div key={a.id} className="py-2 flex items-center justify-between">
                      <span className={a.passed ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'}>
                        {a.passed ? 'Passed' : 'Failed'} ({a.passedCount}/{a.totalCount})
                      </span>
                      <span className="font-mono text-slate-500">{a.language} · {a.executionMs}ms</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
