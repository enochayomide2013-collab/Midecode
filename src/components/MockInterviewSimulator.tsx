import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Award,
  CheckCircle2,
  Clock,
  EyeOff,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Timer,
  X,
  XCircle,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { CAREER_PATHWAYS, CHALLENGES } from '../data/challengesData';
import { fetchWithAuthAndRetry, readJsonSafe, tryReadJson } from '../services/authService';
import {
  evaluateMockInterview,
  requestInterviewFollowup,
  saveMockInterviewSession,
} from '../services/interviewService';
import { extractReadableError } from '../services/firebase';
import type {
  ChallengeTestResult,
  MockInterviewQuestionTurn,
  MockInterviewScorecard,
  MockInterviewSession,
} from '../types/mideocode';

interface MockInterviewSimulatorProps {
  initialCareerPathId?: string;
  initialChallengeId?: string;
  initialLanguage?: 'javascript' | 'python';
  onClose: () => void;
  onSessionCompleted?: (session: MockInterviewSession) => void;
}

type SimulatorPhase = 'setup' | 'active' | 'scorecard';

function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MockInterviewSimulator({
  initialCareerPathId,
  initialChallengeId,
  initialLanguage,
  onClose,
  onSessionCompleted,
}: MockInterviewSimulatorProps) {
  const { firebaseUser, settings, profile, notify } = useMideo();

  const [phase, setPhase] = useState<SimulatorPhase>('setup');
  const [careerPathId, setCareerPathId] = useState(
    initialCareerPathId || profile?.activeCareerPathId || CAREER_PATHWAYS[0].id,
  );
  const [challengeId, setChallengeId] = useState(initialChallengeId || CHALLENGES[0].id);
  const [language, setLanguage] = useState<'javascript' | 'python'>(initialLanguage || 'javascript');
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 45>(30);

  // Active session state
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  const [paused, setPaused] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResult, setTestResult] = useState<{
    passed: boolean;
    passedCount: number;
    totalCount: number;
    executionMs: number;
    results: ChallengeTestResult[];
  } | null>(null);

  // Interviewer chat state
  const [transcript, setTranscript] = useState<MockInterviewQuestionTurn[]>([]);
  const [candidateReply, setCandidateReply] = useState('');
  const [askingInterviewer, setAskingInterviewer] = useState(false);
  const [submittingInterview, setSubmittingInterview] = useState(false);
  const [finalScorecard, setFinalScorecard] = useState<MockInterviewScorecard | null>(null);
  const [finalSession, setFinalSession] = useState<MockInterviewSession | null>(null);

  const autoSubmittedRef = useRef(false);
  const activeChallenge = useMemo(
    () => CHALLENGES.find((c) => c.id === challengeId) || CHALLENGES[0],
    [challengeId],
  );
  const activeCareerPath = useMemo(
    () => CAREER_PATHWAYS.find((p) => p.id === careerPathId) || CAREER_PATHWAYS[0],
    [careerPathId],
  );

  const handleFinishAndEvaluate = useCallback(
    async (reason: 'completed' | 'time_expired') => {
      if (!firebaseUser || submittingInterview) return;
      setSubmittingInterview(true);
      setPaused(true);

      const elapsedSeconds = Math.max(1, durationMinutes * 60 - secondsLeft);
      let latestPassed = testResult?.passedCount ?? 0;
      let latestTotal = testResult?.totalCount ?? 0;

      // Always execute latest code against authoritative server test suite before grading
      try {
        const execRes = await fetchWithAuthAndRetry('/api/challenges/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: activeChallenge.id,
            language,
            code,
          }),
        });
        if (execRes.ok) {
          const execData = await tryReadJson<{
            passedCount?: number;
            totalCount?: number;
            passed?: boolean;
            executionMs?: number;
            results?: ChallengeTestResult[];
          }>(execRes);
          if (execData) {
            latestPassed = Number(execData.passedCount ?? 0);
            latestTotal = Number(execData.totalCount ?? 0);
            setTestResult({
              passed: Boolean(execData.passed),
              passedCount: latestPassed,
              totalCount: latestTotal,
              executionMs: Number(execData.executionMs ?? 0),
              results: Array.isArray(execData.results) ? execData.results : [],
            });
          }
        }
      } catch {
        // Proceed with last known test metrics if final test request fails
      }

      try {
        const scorecard = await evaluateMockInterview({
          careerPathTitle: activeCareerPath.title,
          challengeId: activeChallenge.id,
          language,
          code,
          passedTests: latestPassed,
          totalTests: Math.max(1, latestTotal),
          durationMinutes,
          elapsedSeconds,
          transcript,
        });

        const saved = await saveMockInterviewSession(firebaseUser.uid, {
          careerPathId: activeCareerPath.id,
          careerPathTitle: activeCareerPath.title,
          challengeId: activeChallenge.id,
          challengeTitle: activeChallenge.title,
          difficulty: activeChallenge.difficulty,
          language,
          durationMinutes,
          elapsedSeconds,
          status: reason,
          passedTests: latestPassed,
          totalTests: latestTotal,
          codeSubmitted: code,
          transcript,
          scorecard,
        });

        setFinalScorecard(scorecard);
        setFinalSession(saved);
        setPhase('scorecard');
        onSessionCompleted?.(saved);
        notify('success', `Mock interview evaluated (${scorecard.overallScore}/100).`);
      } catch (err) {
        notify('error', extractReadableError(err, 'Unable to evaluate mock interview.'));
      } finally {
        setSubmittingInterview(false);
      }
    },
    [
      activeCareerPath.id,
      activeCareerPath.title,
      activeChallenge.difficulty,
      activeChallenge.id,
      activeChallenge.title,
      code,
      durationMinutes,
      firebaseUser,
      language,
      notify,
      onSessionCompleted,
      secondsLeft,
      submittingInterview,
      testResult?.passedCount,
      testResult?.totalCount,
      transcript,
    ],
  );

  useEffect(() => {
    if (phase !== 'active' || paused || submittingInterview) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleFinishAndEvaluate('time_expired');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, paused, submittingInterview, handleFinishAndEvaluate]);

  const startSession = async () => {
    autoSubmittedRef.current = false;
    setCode(activeChallenge.starterCode[language]);
    setSecondsLeft(durationMinutes * 60);
    setPaused(false);
    setTestResult(null);
    setFinalScorecard(null);
    setFinalSession(null);
    setTranscript([
      {
        id: `turn_${Date.now()}`,
        role: 'interviewer',
        topicTag: 'Opening Prompt',
        content: `Welcome to your ${durationMinutes}-minute ${activeCareerPath.title} mock interview. Walk through "${activeChallenge.title}" in ${language}. Once you write an initial solution and run the tests, ask me for a technical follow-up or share your complexity reasoning.`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setPhase('active');
  };

  const handleRunTests = async () => {
    if (!firebaseUser || runningTests) return;
    setRunningTests(true);
    try {
      const res = await fetchWithAuthAndRetry('/api/challenges/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: activeChallenge.id,
          language,
          code,
        }),
      });
      const data = await readJsonSafe<{
        passed?: boolean;
        passedCount?: number;
        totalCount?: number;
        executionMs?: number;
        results?: ChallengeTestResult[];
      }>(res, 'Challenge execution failed.');
      setTestResult({
        passed: Boolean(data.passed),
        passedCount: Number(data.passedCount ?? 0),
        totalCount: Number(data.totalCount ?? 0),
        executionMs: Number(data.executionMs ?? 0),
        results: Array.isArray(data.results) ? data.results : [],
      });
      if (data.passed) {
        notify('success', `All ${data.totalCount} test cases passed! Ready for interviewer follow-up.`);
      } else {
        notify('info', `${data.passedCount}/${data.totalCount} test cases passed.`);
      }
    } catch (err) {
      notify('error', extractReadableError(err, 'Unable to run tests.'));
    } finally {
      setRunningTests(false);
    }
  };

  const handleRequestFollowup = async (withCandidateTurn?: MockInterviewQuestionTurn) => {
    if (askingInterviewer) return;
    setAskingInterviewer(true);
    const updatedTranscript = withCandidateTurn
      ? [...transcript, withCandidateTurn]
      : transcript;

    try {
      const followup = await requestInterviewFollowup({
        careerPathTitle: activeCareerPath.title,
        challengeId: activeChallenge.id,
        language,
        code,
        passedCount: testResult?.passedCount ?? 0,
        totalCount: testResult?.totalCount ?? 0,
        elapsedSeconds: Math.max(0, durationMinutes * 60 - secondsLeft),
        transcript: updatedTranscript,
      });

      const interviewerTurn: MockInterviewQuestionTurn = {
        id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'interviewer',
        topicTag: followup.topicTag,
        content: followup.briefReaction
          ? `${followup.briefReaction}\n\n${followup.question}`
          : followup.question,
        createdAt: new Date().toISOString(),
      };
      setTranscript([...updatedTranscript, interviewerTurn]);
    } catch (err) {
      notify('error', extractReadableError(err, 'Unable to get interviewer follow-up.'));
    } finally {
      setAskingInterviewer(false);
    }
  };

  const handleSubmitCandidateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = candidateReply.trim();
    if (!trimmed || askingInterviewer) return;
    const candidateTurn: MockInterviewQuestionTurn = {
      id: `turn_${Date.now()}_c`,
      role: 'candidate',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setTranscript((prev) => [...prev, candidateTurn]);
    setCandidateReply('');
    await handleRequestFollowup(candidateTurn);
  };

  const urgencyColor =
    secondsLeft <= 60
      ? 'text-red-500 border-red-500/40 bg-red-500/10'
      : secondsLeft <= 300
        ? 'text-amber-500 border-amber-500/40 bg-amber-500/10'
        : 'text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-7xl max-h-[94vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B101D] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Simulator Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-[#0D1322]">
          <div className="flex items-center gap-3">
            <Timer className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Timed Mock Coding Interview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeCareerPath.title} · {activeChallenge.title}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {phase === 'active' && (
              <>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold tabular-nums ${urgencyColor}`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{formatCountdown(secondsLeft)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  disabled={submittingInterview}
                  onClick={() => handleFinishAndEvaluate('completed')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {submittingInterview ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Award className="w-3.5 h-3.5" />
                  )}
                  {submittingInterview ? 'Scoring Interview...' : 'Finish & Score'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close mock interview simulator"
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* STAGE 1: SETUP */}
          {phase === 'setup' && (
            <div className="max-w-3xl mx-auto space-y-6 py-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Configure Your Mock Technical Interview
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Write and test code under realistic time constraints, answer live AI interviewer follow-ups on complexity and edge cases, and save a graded Readiness Scorecard to your Career profile.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Target Career Track
                  </label>
                  <select
                    value={careerPathId}
                    onChange={(e) => setCareerPathId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  >
                    {CAREER_PATHWAYS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Coding Challenge
                  </label>
                  <select
                    value={challengeId}
                    onChange={(e) => setChallengeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  >
                    {CHALLENGES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.difficulty} · {c.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Language
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['javascript', 'python'] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize cursor-pointer ${
                          language === lang
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Interview Timer
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([15, 30, 45] as const).map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationMinutes(mins)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold tabular-nums cursor-pointer ${
                          durationMinutes === mins
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {mins} min
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1322] space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Challenge Brief: {activeChallenge.title}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeChallenge.problemStatement}
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={startSession}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start {durationMinutes}-Minute Interview
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: ACTIVE INTERVIEW */}
          {phase === 'active' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Problem Statement */}
              <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1322] p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {activeChallenge.difficulty} · {activeChallenge.category}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {activeChallenge.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeChallenge.problemStatement}
                </p>
                <div className="text-xs space-y-1">
                  <p>
                    <strong>Input:</strong>{' '}
                    <code className="font-mono text-[11px]">{activeChallenge.inputDescription}</code>
                  </p>
                  <p>
                    <strong>Output:</strong>{' '}
                    <code className="font-mono text-[11px]">{activeChallenge.outputDescription}</code>
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Examples</h4>
                  {activeChallenge.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1"
                    >
                      <div>In: {ex.input}</div>
                      <div>Out: {ex.output}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-1">
                    Constraints
                  </h4>
                  <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    {activeChallenge.constraints.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Center: Code Editor & Server Tests */}
              <div className="lg:col-span-5 space-y-3 flex flex-col">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
                    <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 capitalize">
                      {language} Solution
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCode(activeChallenge.starterCode[language])}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={handleRunTests}
                        disabled={runningTests}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        {runningTests ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {runningTests ? 'Running...' : 'Run Tests'}
                      </button>
                    </div>
                  </div>
                  <CodeMirror
                    value={code}
                    height="360px"
                    theme={settings?.editorTheme === 'githubLight' ? 'light' : oneDark}
                    extensions={[language === 'python' ? python() : javascript()]}
                    onChange={setCode}
                    style={{ fontSize: `${settings?.editorFontSize || 14}px` }}
                  />
                </div>

                {/* Test Results Panel */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-3.5 space-y-2.5 max-h-56 overflow-y-auto">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Test Suite Output
                    </span>
                    {testResult && (
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          testResult.passed ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {testResult.passedCount}/{testResult.totalCount} passed · {testResult.executionMs}ms
                      </span>
                    )}
                  </div>
                  {!testResult ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Click Run Tests to validate your implementation against visible and hidden edge cases.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {testResult.results.map((r) => (
                        <div
                          key={r.index}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {r.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            )}
                            <span className="font-mono truncate">
                              {r.isHidden ? (
                                <span className="inline-flex items-center gap-1 text-slate-500">
                                  <EyeOff className="w-3 h-3" /> Hidden Case #{r.index}
                                </span>
                              ) : (
                                `Case #${r.index}: ${r.inputPreview}`
                              )}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              r.passed ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {r.error ? r.error.slice(0, 40) : r.passed ? 'Passed' : `Got ${r.actualPreview}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: AI Technical Interviewer Panel */}
              <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1322] flex flex-col max-h-[75vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      AI Technical Interviewer
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestFollowup()}
                    disabled={askingInterviewer}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    {askingInterviewer ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Ask Follow-Up
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                  {transcript.map((turn) => (
                    <div
                      key={turn.id}
                      className={`p-3 rounded-xl text-xs space-y-1 ${
                        turn.role === 'interviewer'
                          ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                          : 'bg-blue-600 text-white ml-6'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] opacity-75">
                        <span className="font-semibold uppercase tracking-wider">
                          {turn.role === 'interviewer' ? 'Interviewer' : 'Your Response'}
                        </span>
                        {turn.topicTag && <span>{turn.topicTag}</span>}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleSubmitCandidateReply}
                  className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#080C17] space-y-2"
                >
                  <textarea
                    rows={3}
                    value={candidateReply}
                    onChange={(e) => setCandidateReply(e.target.value)}
                    placeholder="Explain your time/space complexity, trade-offs, or edge-case handling..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      Written reasoning counts toward Communication score
                    </span>
                    <button
                      type="submit"
                      disabled={!candidateReply.trim() || askingInterviewer}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Submit Answer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* STAGE 3: READINESS SCORECARD */}
          {phase === 'scorecard' && finalScorecard && (
            <div className="max-w-4xl mx-auto space-y-6 py-2">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1322] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {activeCareerPath.title} · {activeChallenge.title} ({language})
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {finalScorecard.readinessLabel}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {finalSession
                      ? `Completed in ${Math.floor(finalSession.elapsedSeconds / 60)}m ${finalSession.elapsedSeconds % 60}s · Tests: ${finalSession.passedTests}/${finalSession.totalTests} passed · Saved to Career History`
                      : 'Evaluated'}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Overall Readiness Score
                  </div>
                  <div className="text-4xl font-extrabold tabular-nums text-blue-600 dark:text-blue-400">
                    {finalScorecard.overallScore}
                    <span className="text-lg text-slate-400">/100</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Correctness (40%)', score: finalScorecard.correctnessScore },
                  { label: 'Complexity (25%)', score: finalScorecard.complexityScore },
                  { label: 'Code Quality (20%)', score: finalScorecard.codeQualityScore },
                  { label: 'Communication (15%)', score: finalScorecard.communicationScore },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2"
                  >
                    <div className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</div>
                    <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {metric.score}%
                    </div>
                    <div className="h-1.5 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${metric.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-1">
                  <div className="text-xs text-slate-500">Detected Time Complexity</div>
                  <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                    {finalScorecard.detectedTimeComplexity}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-1">
                  <div className="text-xs text-slate-500">Detected Space Complexity</div>
                  <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                    {finalScorecard.detectedSpaceComplexity}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Strengths Observed
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {finalScorecard.strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Areas to Sharpen
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {finalScorecard.improvements.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1322] space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Interviewer Summary
                </h4>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {finalScorecard.summaryFeedback}
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('setup')}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Run Another Interview
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
