import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  GitCommitHorizontal,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Zap,
  Brain,
  Gauge,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { getIdTokenHeader } from '../services/authService';
import {
  createProjectVersionSnapshot,
  deleteAiConversation,
  getProjectFiles,
  listAiConversations,
  recordDeveloperActivity,
  saveAiConversation,
} from '../services/dataService';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type { AiChatMessage, AiConversation, AiMode } from '../types/mideocode';

type ReasoningDepth = 'fast' | 'balanced' | 'deep';

const MODES: { id: AiMode; label: string; desc: string }[] = [
  { id: 'learn', label: 'Learn', desc: 'Step-by-step concept teaching' },
  { id: 'debug', label: 'Debug', desc: 'Root-cause error diagnosis' },
  { id: 'explain', label: 'Explain', desc: 'Line-by-line code walkthrough' },
  { id: 'practice', label: 'Practice', desc: 'Exercises & guided hints' },
  { id: 'build', label: 'Build', desc: 'Architecture & project planning' },
  { id: 'review', label: 'Review', desc: 'Quality, readability & security' },
];

const MODE_STARTERS: Record<AiMode, { label: string; prompt: string }[]> = {
  learn: [
    { label: 'Explain JS closures', prompt: 'Explain JavaScript closures with a practical real-world example and common pitfalls.' },
    { label: 'Async/Await vs Promises', prompt: 'Compare async/await with Promise.all and show when each is better.' },
  ],
  debug: [
    { label: 'Fix stale state in React', prompt: 'Why does a React state update inside setTimeout or a WebSocket listener read stale values, and how do I fix it cleanly?' },
    { label: 'Debug Python mutable default', prompt: 'Explain why `def add_item(item, items=[]):` causes bugs across calls in Python and show the fix.' },
  ],
  explain: [
    { label: 'Walk through Big-O sorting', prompt: 'Explain how Merge Sort works step by step, including its time and space complexity.' },
    { label: 'How SQL JOINs work', prompt: 'Explain INNER JOIN vs LEFT JOIN with a concrete table example and edge cases.' },
  ],
  practice: [
    { label: 'Python comprehension drill', prompt: 'Give me a focused practice exercise on Python dictionary comprehensions without spoiling the solution.' },
    { label: 'Two-pointer challenge', prompt: 'Give me a medium two-pointer array practice problem with constraints and a hint.' },
  ],
  build: [
    { label: 'Design a rate-limited API', prompt: 'Design a clean Express TypeScript rate-limiting middleware with sliding window counters and tests.' },
    { label: 'Build a debounced search hook', prompt: 'Build a reusable TypeScript `useDebouncedValue` hook with cleanup and an example search component.' },
  ],
  review: [
    { label: 'Security & SQL injection audit', prompt: 'What should I check when reviewing a Node/SQL endpoint for injection, auth bypass, and input validation issues?' },
    { label: 'React re-render audit', prompt: 'Review common causes of unnecessary React re-renders and when useMemo/useCallback actually helps.' },
  ],
};

export function AiView() {
  const {
    firebaseUser,
    profile,
    accessibleProjects,
    activeIdeProjectId,
    aiLaunch,
    clearAiLaunch,
    openInIde,
    notify,
  } = useMideo();

  const activeIdeProject = accessibleProjects.find((p) => p.id === activeIdeProjectId) || null;
  const canSnapshotActiveProject = Boolean(
    activeIdeProject &&
      firebaseUser &&
      (activeIdeProject.ownerId === firebaseUser.uid ||
        activeIdeProject.collaboratorRoles?.[firebaseUser.uid] === 'editor'),
  );

  const [mode, setMode] = useState<AiMode>('learn');
  const [depth, setDepth] = useState<ReasoningDepth>('balanced');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(`conv_${Date.now()}`);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [authorizedContext, setAuthorizedContext] = useState<{
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
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    listAiConversations(firebaseUser.uid)
      .then((list) => setConversations(list))
      .catch(() => {});
  }, [firebaseUser]);

  useEffect(() => {
    if (!aiLaunch) return;
    setMode(aiLaunch.mode);
    setInput(aiLaunch.prompt);
    setAuthorizedContext(aiLaunch.context || null);
    setIncludeContext(Boolean(aiLaunch.context));
    clearAiLaunch();
  }, [aiLaunch, clearAiLaunch]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingMsgId]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreamingMsgId(null);
  };

  const persistConversation = async (msgs: AiChatMessage[]) => {
    if (!firebaseUser || msgs.length === 0) return;
    const title = msgs[0]?.content.slice(0, 56) || 'Mideo AI Session';
    await saveAiConversation(firebaseUser.uid, {
      id: activeConvId,
      title,
      mode,
      messages: msgs,
    });
    const refreshed = await listAiConversations(firebaseUser.uid);
    setConversations(refreshed);
  };

  const sendPrompt = async (promptText: string, overrideMessages?: AiChatMessage[]) => {
    const clean = promptText.trim();
    if (!clean || loading) return;

    setErrorMsg(null);
    const userMsg: AiChatMessage = {
      id: `m_${Date.now()}_u`,
      role: 'user',
      content: clean,
      createdAt: new Date().toISOString(),
    };
    const assistantId = `m_${Date.now()}_a`;
    const baseMsgs = [...(overrideMessages ?? messages), userMsg];
    const placeholderAssistant: AiChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    setMessages([...baseMsgs, placeholderAssistant]);
    setInput('');
    setLoading(true);
    setStreamingMsgId(assistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    const requestPayload = {
      mode,
      depth,
      prompt: clean,
      history: baseMsgs.slice(-12, -1).map((m) => ({ role: m.role, content: m.content })),
      includeContext: includeContext && Boolean(authorizedContext),
      learnerProfile: profile
        ? {
            experienceLevel: profile.experienceLevel,
            preferredLanguages: profile.preferredLanguages,
            activeCareerPathId: profile.activeCareerPathId,
          }
        : undefined,
      context: includeContext ? authorizedContext : undefined,
    };

    try {
      const headers = await getIdTokenHeader();
      const res = await fetch('/api/ai/assist/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get AI response.');
      }

      if (!contentType.includes('text/event-stream') || !res.body) {
        const data = await res.json();
        const finalAssistant: AiChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: data.reply || 'No response returned.',
          ...(data.proposedCode && data.proposedCode.code ? { proposedCode: data.proposedCode } : {}),
          createdAt: new Date().toISOString(),
        };
        const finalMsgs = [...baseMsgs, finalAssistant];
        setMessages(finalMsgs);
        await persistConversation(finalMsgs);
        if (firebaseUser) {
          recordDeveloperActivity(firebaseUser.uid, {
            category: 'ai',
            action: `Mideo AI (${mode})`,
            language: authorizedContext?.language,
            aiAssisted: true,
          }).catch(() => {});
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let latestReply = '';
      let latestProposedCode: AiChatMessage['proposedCode'];
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          const dataLine = rawEvent
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const jsonStr = dataLine.slice(6).trim();
          if (!jsonStr) continue;

          const evt = JSON.parse(jsonStr) as {
            type: 'snapshot' | 'done' | 'error';
            text?: string;
            reply?: string;
            proposedCode?: AiChatMessage['proposedCode'];
            error?: string;
          };

          if (evt.type === 'error') {
            throw new Error(evt.error || 'Mideo AI stream failed.');
          }
          if (evt.type === 'snapshot' && typeof evt.text === 'string') {
            latestReply = evt.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: latestReply } : m)),
            );
          }
          if (evt.type === 'done') {
            receivedDone = true;
            latestReply = evt.reply || latestReply || 'No response generated.';
            latestProposedCode = evt.proposedCode;
          }
        }
      }

      const finalAssistant: AiChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: latestReply || (receivedDone ? 'No response generated.' : 'Response stopped.'),
        ...(latestProposedCode && latestProposedCode.code ? { proposedCode: latestProposedCode } : {}),
        createdAt: new Date().toISOString(),
      };
      const finalMsgs = [...baseMsgs, finalAssistant];
      setMessages(finalMsgs);
      await persistConversation(finalMsgs);
      if (firebaseUser) {
        recordDeveloperActivity(firebaseUser.uid, {
          category: 'ai',
          action: `Mideo AI (${mode})`,
          language: authorizedContext?.language,
          aiAssisted: true,
        }).catch(() => {});
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Keep whatever text streamed before user stopped
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === assistantId && !m.content.trim()
              ? { ...m, content: '_Generation stopped._' }
              : m,
          );
          persistConversation(updated).catch(() => {});
          return updated;
        });
        return;
      }
      setMessages(baseMsgs);
      setErrorMsg(err instanceof Error ? err.message : 'Mideo AI request failed.');
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamingMsgId(null);
    }
  };

  const handleNewChat = () => {
    stopGeneration();
    setActiveConvId(`conv_${Date.now()}`);
    setMessages([]);
    setErrorMsg(null);
  };

  const openSnippetInIde = (code: string, language: string, filename?: string) => {
    const ideLang = language === 'python' ? 'python' : 'javascript';
    openInIde({
      title: `AI Suggestion: ${filename || 'Workspace'}`,
      language: ideLang,
      files: [
        {
          name: filename || (ideLang === 'python' ? 'main.py' : 'index.js'),
          folder: '',
          language: ideLang,
          content: code,
        },
      ],
    }).then(() => notify('success', 'Code opened in a new Mideo IDE workspace.'));
  };

  const saveProposedSnapshotToActiveProject = async (proposed: NonNullable<AiChatMessage['proposedCode']>) => {
    if (!firebaseUser || !activeIdeProject || !canSnapshotActiveProject) return;
    try {
      const files = await getProjectFiles(activeIdeProject.id);
      await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeIdeProject.id,
        activeIdeProject.version,
        `AI ${mode}: ${proposed.filename || 'suggestion'}`,
        files,
        {
          ownerId: activeIdeProject.ownerId,
          authorName: profile?.displayName || firebaseUser.email || 'Developer',
          changeType: mode === 'debug' ? 'ai_fix' : 'ai_build',
          aiOperation: proposed.filename || mode,
          collaboratorIds: activeIdeProject.collaboratorIds,
        },
      );
      notify('success', `Saved AI snapshot to "${activeIdeProject.title}" Version History.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save project snapshot.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[660px]">
      {/* Conversation Sidebar */}
      <aside className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 flex flex-col">
        <button
          onClick={handleNewChat}
          className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 mb-4 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>

        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">History</h2>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Saved conversations appear here.</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer ${
                  conv.id === activeConvId
                    ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                onClick={() => {
                  stopGeneration();
                  setActiveConvId(conv.id);
                  setMode(conv.mode);
                  setMessages(conv.messages || []);
                }}
              >
                <span className="truncate">{conv.title}</span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteAiConversation(conv.id);
                    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                    if (conv.id === activeConvId) handleNewChat();
                  }}
                  aria-label="Delete conversation"
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main AI Workspace */}
      <div className="lg:col-span-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] flex flex-col overflow-hidden">
        {/* Mode Selector, Reasoning Depth & Context Authorization */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none">Mideo AI</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Adaptive Gemini coding tutor · real-time streaming
                </p>
              </div>
            </div>

            {/* Reasoning Depth Selector */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDepth('fast')}
                title="Lowest latency for quick definitions and syntax checks"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  depth === 'fast'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3" />
                Fast
              </button>
              <button
                type="button"
                onClick={() => setDepth('balanced')}
                title="Balanced intelligence and response speed"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  depth === 'balanced'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Gauge className="w-3 h-3" />
                Balanced
              </button>
              <button
                type="button"
                onClick={() => setDepth('deep')}
                title="Maximum reasoning depth for debugging and architecture"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  depth === 'deep'
                    ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Brain className="w-3 h-3" />
                Deep
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                title={m.desc}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  mode === m.id
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {authorizedContext && (
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="truncate">
                  Context ready:{' '}
                  {authorizedContext.missionTitle ||
                    authorizedContext.lessonTitle ||
                    authorizedContext.filename ||
                    authorizedContext.language}
                </span>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                />
                <span>Authorize context</span>
              </label>
            </div>
          )}
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto min-h-[380px]">
          {messages.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {MODES.find((m) => m.id === mode)?.desc}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Tailored to your {profile?.experienceLevel || 'developer'} level with multi-turn memory, live streaming, and direct IDE export.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {MODE_STARTERS[mode].map((starter) => (
                  <button
                    key={starter.label}
                    onClick={() => sendPrompt(starter.prompt)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs hover:border-blue-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`p-4 rounded-xl border ${
                msg.role === 'user'
                  ? 'border-blue-500/30 bg-blue-600/10 ml-auto max-w-2xl'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 max-w-3xl'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                <span className="font-semibold">
                  {msg.role === 'user' ? 'You' : `Mideo AI (${mode} · ${depth})`}
                </span>
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg.content);
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        } catch {
                          notify('error', 'Clipboard copy blocked by browser permissions.');
                        }
                      }}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </button>
                    {idx === messages.length - 1 && !loading && (
                      <button
                        onClick={() => {
                          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                          if (lastUser) sendPrompt(lastUser.content, messages.slice(0, -2));
                        }}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate
                      </button>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' ? (
                <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              ) : msg.content ? (
                <MarkdownRenderer content={msg.content} onOpenCodeInIde={openSnippetInIde} />
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Thinking &amp; streaming response...</span>
                </div>
              )}

              {msg.proposedCode && msg.proposedCode.code && (
                <div className="mt-4 rounded-lg border border-blue-500/40 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span>Proposed Code Suggestion · {msg.proposedCode.filename || 'snippet'}</span>
                    <div className="flex items-center gap-2">
                      {canSnapshotActiveProject && (
                        <button
                          onClick={() => saveProposedSnapshotToActiveProject(msg.proposedCode!)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-600 hover:border-blue-400 text-slate-200 font-medium whitespace-nowrap cursor-pointer"
                        >
                          <GitCommitHorizontal className="w-3.5 h-3.5" />
                          Snapshot Project
                        </button>
                      )}
                      <button
                        onClick={() =>
                          openSnippetInIde(
                            msg.proposedCode?.code || '',
                            msg.proposedCode?.language || 'javascript',
                            msg.proposedCode?.filename,
                          )
                        }
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium whitespace-nowrap cursor-pointer"
                      >
                        Review &amp; Open in IDE
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 bg-[#090D16] text-slate-100 font-mono text-xs overflow-x-auto">
                    {msg.proposedCode.code}
                  </pre>
                </div>
              )}
            </div>
          ))}

          {errorMsg && (
            <div className="p-3 rounded-lg border border-red-400 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Prompt Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-end gap-3"
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPrompt(input);
              }
            }}
            placeholder={`Ask Mideo AI in ${mode} mode... (Enter to send, Shift+Enter for new line)`}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
          />
          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
