import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Brain,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  FolderGit2,
  Gauge,
  GitCommitHorizontal,
  Globe,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { getIdTokenHeader, readJsonSafe, tryReadJson } from '../services/authService';
import {
  createProjectVersionSnapshot,
  deleteAiConversation,
  getProjectFiles,
  listAiConversations,
  mergeImportedFilesIntoProject,
  recordDeveloperActivity,
  saveAiConversation,
} from '../services/dataService';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type {
  AiChatMessage,
  AiConversation,
  AiMode,
  AiProposedFile,
  NavSection,
} from '../types/mideocode';

type ReasoningDepth = 'fast' | 'balanced' | 'deep';

interface PendingAttachment {
  id: string;
  name: string;
  kind: 'image' | 'text';
  mimeType: string;
  data: string;
}

interface AttachedProjectFile {
  name: string;
  folder?: string;
  language: string;
  content: string;
}

interface InlineRunResult {
  language: string;
  stdout: string;
  stderr: string;
  returnValue?: string | null;
  executionMs?: number;
  htmlPreview?: string;
}

const VALID_VIEWS: NavSection[] = [
  'dashboard',
  'insights',
  'academy',
  'missions',
  'ide',
  'ai',
  'rescue',
  'projects',
  'versions',
  'collaboration',
  'testlab',
  'architect',
  'docs',
  'lab',
  'challenges',
  'quest',
  'community',
  'career',
  'cloud',
  'playground',
  'profile',
  'admin',
];

const MODES: { id: AiMode; label: string; desc: string }[] = [
  { id: 'general', label: 'All-Purpose', desc: 'Answer & build anything efficiently' },
  { id: 'build', label: 'Build', desc: 'Full apps, multi-file code & APIs' },
  { id: 'debug', label: 'Debug', desc: 'Root-cause error diagnosis & fixes' },
  { id: 'learn', label: 'Learn', desc: 'Step-by-step concept teaching' },
  { id: 'explain', label: 'Explain', desc: 'Clear code & system walkthroughs' },
  { id: 'practice', label: 'Practice', desc: 'Exercises & guided hints' },
  { id: 'review', label: 'Review', desc: 'Security, speed & quality audit' },
];

const MODE_STARTERS: Record<AiMode, { label: string; prompt: string }[]> = {
  general: [
    {
      label: 'Build a Pomodoro timer app',
      prompt: 'Build a complete, polished Pomodoro timer web app with HTML, CSS, and JavaScript that I can open directly in Mideo IDE.',
    },
    {
      label: 'Solve & explain a topic',
      prompt: 'Give me a concise breakdown of how HTTP/2 multiplexing works compared to HTTP/1.1, with a real-world analogy.',
    },
    {
      label: 'Plan a full-stack project',
      prompt: 'Create a practical roadmap and database schema for a real-time collaborative task manager.',
    },
  ],
  learn: [
    { label: 'Explain JS closures', prompt: 'Explain JavaScript closures with a practical real-world example and common pitfalls.' },
    { label: 'Async/Await vs Promises', prompt: 'Compare async/await with Promise.all and show when each is better.' },
  ],
  debug: [
    { label: 'Fix stale state in React', prompt: 'Why does a React state update inside setTimeout or a WebSocket listener read stale values, and how do I fix it cleanly?' },
    { label: 'Debug Python mutable default', prompt: 'Explain why `def add_item(item, items=[]):` causes bugs across calls in Python and show the fix.' },
  ],
  explain: [
    { label: 'Walk through Merge Sort', prompt: 'Explain how Merge Sort works step by step, including its time and space complexity.' },
    { label: 'How SQL JOINs work', prompt: 'Explain INNER JOIN vs LEFT JOIN with a concrete table example and edge cases.' },
  ],
  practice: [
    { label: 'Python comprehension drill', prompt: 'Give me a focused practice exercise on Python dictionary comprehensions without spoiling the solution.' },
    { label: 'Two-pointer challenge', prompt: 'Give me a medium two-pointer array practice problem with constraints and a hint.' },
  ],
  build: [
    { label: 'Build a Scientific Calculator', prompt: 'Build a clean responsive scientific calculator app with HTML, CSS, and JavaScript ready for Mideo IDE.' },
    { label: 'Rate-limited Express API', prompt: 'Design and write a complete Express TypeScript sliding-window rate limiter middleware with an example server.' },
  ],
  review: [
    { label: 'Security & SQL injection audit', prompt: 'What should I check when reviewing a Node/SQL endpoint for injection, auth bypass, and input validation issues?' },
    { label: 'React re-render audit', prompt: 'Review common causes of unnecessary React re-renders and when useMemo/useCallback actually helps.' },
  ],
};

function inferProjectLanguage(files: AiProposedFile[]): 'web' | 'javascript' | 'python' | 'sql' {
  const names = files.map((f) => `${f.filename} ${f.language}`.toLowerCase());
  if (names.some((n) => n.includes('.html') || n.includes('html') || n.includes('.css'))) return 'web';
  if (names.some((n) => n.includes('.py') || n.includes('python'))) return 'python';
  if (names.some((n) => n.includes('.sql') || n.includes('sql'))) return 'sql';
  return 'javascript';
}

export function AiView() {
  const {
    firebaseUser,
    profile,
    settings,
    accessibleProjects,
    activeIdeProjectId,
    setActiveIdeProjectId,
    setActiveView,
    setIdeFocusMode,
    openTestLabForProject,
    openArchitectForProject,
    openRescueForProject,
    aiLaunch,
    clearAiLaunch,
    openInIde,
    refreshUserData,
    notify,
  } = useMideo();

  const activeIdeProject = accessibleProjects.find((p) => p.id === activeIdeProjectId) || null;
  const canEditActiveProject = Boolean(
    activeIdeProject &&
      firebaseUser &&
      (activeIdeProject.ownerId === firebaseUser.uid ||
        activeIdeProject.collaboratorRoles?.[firebaseUser.uid] === 'editor'),
  );

  const [mode, setMode] = useState<AiMode>('general');
  const [depth, setDepth] = useState<ReasoningDepth>(
    settings?.aiStylePreference || profile?.aiStylePreference || 'balanced',
  );
  const [useWebSearch, setUseWebSearch] = useState<boolean>(true);
  const hasSyncedAiPrefRef = useRef(false);
  useEffect(() => {
    const pref = settings?.aiStylePreference || profile?.aiStylePreference;
    if (pref && !hasSyncedAiPrefRef.current) {
      hasSyncedAiPrefRef.current = true;
      setDepth(pref);
    }
  }, [settings?.aiStylePreference, profile?.aiStylePreference]);

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
    projectTitle?: string;
    projectFiles?: AttachedProjectFile[];
  } | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachingProject, setAttachingProject] = useState(false);
  const [applyingProjectMsgId, setApplyingProjectMsgId] = useState<string | null>(null);
  const [inlineRunResult, setInlineRunResult] = useState<InlineRunResult | null>(null);
  const [runningInlineCode, setRunningInlineCode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    listAiConversations(firebaseUser.uid)
      .then((list) => setConversations(list))
      .catch(() => {});
  }, [firebaseUser]);

  useEffect(() => {
    if (!aiLaunch) return;
    setMode(aiLaunch.mode || 'general');
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

  const handleAttachActiveProject = async () => {
    if (!activeIdeProject || attachingProject) return;
    setAttachingProject(true);
    try {
      const files = await getProjectFiles(activeIdeProject.id);
      if (files.length === 0) {
        notify('info', `Project "${activeIdeProject.title}" currently has no files.`);
        return;
      }
      setAuthorizedContext((prev) => ({
        ...(prev || {}),
        projectTitle: activeIdeProject.title,
        language: activeIdeProject.language,
        projectFiles: files.map((f) => ({
          name: f.name,
          folder: f.folder || '',
          language: f.language || 'javascript',
          content: f.content || '',
        })),
      }));
      setIncludeContext(true);
      notify('success', `Attached ${files.length} file(s) from "${activeIdeProject.title}" to Mideo AI.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not load active project files.');
    } finally {
      setAttachingProject(false);
    }
  };

  const readFileAsAttachment = (file: File): Promise<PendingAttachment | null> =>
    new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        if (file.size > 4_000_000) {
          notify('error', `Image "${file.name}" exceeds 4 MB limit.`);
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'image',
            mimeType: file.type || 'image/png',
            data: typeof reader.result === 'string' ? reader.result : '',
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        if (file.size > 500_000) {
          notify('error', `File "${file.name}" exceeds 500 KB text limit.`);
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'text',
            mimeType: file.type || 'text/plain',
            data: typeof reader.result === 'string' ? reader.result : '',
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      }
    });

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: PendingAttachment[] = [];
    for (const file of Array.from(fileList).slice(0, 5 - attachments.length)) {
      const parsed = await readFileAsAttachment(file);
      if (parsed && parsed.data) next.push(parsed);
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next].slice(0, 5));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const parsed = await readFileAsAttachment(file);
          if (parsed && parsed.data) {
            setAttachments((prev) => [...prev, parsed].slice(0, 5));
            notify('info', 'Screenshot attached to prompt.');
          }
        }
      }
    }
  };

  const sendPrompt = async (promptText: string, overrideMessages?: AiChatMessage[]) => {
    const clean = promptText.trim();
    const activeAttachments = [...attachments];
    if ((!clean && activeAttachments.length === 0) || loading) return;

    const effectivePrompt = clean || 'Analyze the attached file(s) and help me with next steps.';
    setErrorMsg(null);
    const userMsg: AiChatMessage = {
      id: `m_${Date.now()}_u`,
      role: 'user',
      content: effectivePrompt,
      ...(activeAttachments.length > 0
        ? {
            attachments: activeAttachments.map((a) => ({ name: a.name, kind: a.kind })),
          }
        : {}),
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
    setAttachments([]);
    setLoading(true);
    setStreamingMsgId(assistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    const requestPayload = {
      mode,
      depth,
      useWebSearch,
      prompt: effectivePrompt,
      history: baseMsgs.slice(-16, -1).map((m) => ({ role: m.role, content: m.content })),
      includeContext: includeContext && Boolean(authorizedContext),
      attachments: activeAttachments.map((a) => ({
        name: a.name,
        kind: a.kind,
        mimeType: a.mimeType,
        data: a.data,
      })),
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
        const errData = await tryReadJson<{ error?: string }>(res);
        throw new Error(errData?.error || 'Failed to get AI response.');
      }

      if (!contentType.includes('text/event-stream') || !res.body) {
        const data = await readJsonSafe<{
          reply?: string;
          proposedCode?: AiChatMessage['proposedCode'];
          proposedFiles?: AiChatMessage['proposedFiles'];
          actions?: AiChatMessage['actions'];
          sources?: AiChatMessage['sources'];
        }>(res, 'Failed to get AI response.');
        const finalAssistant: AiChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: data.reply || 'No response returned.',
          ...(data.proposedCode && data.proposedCode.code ? { proposedCode: data.proposedCode } : {}),
          ...(Array.isArray(data.proposedFiles) && data.proposedFiles.length > 0
            ? { proposedFiles: data.proposedFiles }
            : {}),
          ...(Array.isArray(data.actions) && data.actions.length > 0 ? { actions: data.actions } : {}),
          ...(Array.isArray(data.sources) && data.sources.length > 0 ? { sources: data.sources } : {}),
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
      let latestProposedFiles: AiChatMessage['proposedFiles'];
      let latestActions: AiChatMessage['actions'];
      let latestSources: AiChatMessage['sources'];
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

          type SseEvent = {
            type: 'snapshot' | 'done' | 'error';
            text?: string;
            reply?: string;
            proposedCode?: AiChatMessage['proposedCode'];
            proposedFiles?: AiChatMessage['proposedFiles'];
            actions?: AiChatMessage['actions'];
            sources?: AiChatMessage['sources'];
            error?: string;
          };
          let evt: SseEvent | null = null;
          try {
            evt = JSON.parse(jsonStr) as SseEvent;
          } catch {
            continue;
          }
          if (!evt) continue;

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
            latestProposedFiles = evt.proposedFiles;
            latestActions = evt.actions;
            latestSources = evt.sources;
          }
        }
      }

      // If stream ended cleanly without any tokens/done event, fall back to JSON endpoint
      if (!receivedDone && !latestReply.trim()) {
        const fallbackRes = await fetch('/api/ai/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        const fallbackData = await readJsonSafe<{
          reply?: string;
          proposedCode?: AiChatMessage['proposedCode'];
          proposedFiles?: AiChatMessage['proposedFiles'];
        }>(fallbackRes, 'Mideo AI request failed.');
        latestReply = fallbackData.reply || 'No response generated.';
        latestProposedCode = fallbackData.proposedCode;
        latestProposedFiles = fallbackData.proposedFiles;
        receivedDone = true;
      }

      const finalAssistant: AiChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: latestReply || (receivedDone ? 'No response generated.' : 'Response stopped.'),
        ...(latestProposedCode && latestProposedCode.code ? { proposedCode: latestProposedCode } : {}),
        ...(latestProposedFiles && latestProposedFiles.length > 0 ? { proposedFiles: latestProposedFiles } : {}),
        ...(latestActions && latestActions.length > 0 ? { actions: latestActions } : {}),
        ...(latestSources && latestSources.length > 0 ? { sources: latestSources } : {}),
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
    setInlineRunResult(null);
  };

  const handleRunCodeBlock = async (code: string, language: string) => {
    const norm = language.toLowerCase();
    if (norm === 'html') {
      setInlineRunResult({
        language: 'html',
        stdout: '',
        stderr: '',
        htmlPreview: code,
      });
      return;
    }

    const execLang = norm === 'py' || norm === 'python' ? 'python' : 'javascript';
    setRunningInlineCode(true);
    try {
      const headers = await getIdTokenHeader();
      const res = await fetch('/api/ide/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ language: execLang, code }),
      });
      const data = await readJsonSafe<{
        stdout?: string;
        stderr?: string;
        returnValue?: string | null;
        executionMs?: number;
      }>(res, 'Execution failed.');
      setInlineRunResult({
        language: execLang,
        stdout: String(data.stdout || ''),
        stderr: String(data.stderr || ''),
        returnValue: data.returnValue ?? null,
        executionMs: typeof data.executionMs === 'number' ? data.executionMs : undefined,
      });
    } catch (err) {
      setInlineRunResult({
        language: execLang,
        stdout: '',
        stderr: err instanceof Error ? err.message : 'Execution failed.',
      });
    } finally {
      setRunningInlineCode(false);
    }
  };

  const openSnippetInIde = (code: string, language: string, filename?: string) => {
    const norm = language.toLowerCase();
    const ideLang: 'web' | 'javascript' | 'python' | 'sql' =
      norm === 'python' || norm === 'py'
        ? 'python'
        : norm === 'html' || norm === 'css' || norm === 'web'
          ? 'web'
          : norm === 'sql'
            ? 'sql'
            : 'javascript';
    const fallbackName =
      ideLang === 'python'
        ? 'main.py'
        : ideLang === 'web'
          ? 'index.html'
          : ideLang === 'sql'
            ? 'query.sql'
            : 'index.js';
    openInIde({
      title: `AI Build: ${filename || 'Workspace'}`,
      language: ideLang,
      files: [
        {
          name: filename || fallbackName,
          folder: '',
          language: norm === 'html' || norm === 'css' || norm === 'python' || norm === 'sql' ? norm : 'javascript',
          content: code,
        },
      ],
    }).then(() => notify('success', 'Opened in a new Mideo IDE workspace.'));
  };

  const createProjectFromProposedFiles = async (files: AiProposedFile[], labelHint?: string) => {
    const lang = inferProjectLanguage(files);
    await openInIde({
      title: labelHint ? `AI App: ${labelHint.slice(0, 48)}` : 'Mideo AI Generated Project',
      language: lang,
      files: files.map((f) => ({
        name: f.filename,
        folder: f.folder || '',
        language: f.language || 'javascript',
        content: f.code,
      })),
    });
    notify('success', `Created ${files.length}-file project and opened in Mideo IDE.`);
  };

  const applyProposedFilesToActiveProject = async (msgId: string, files: AiProposedFile[]) => {
    if (!firebaseUser || !activeIdeProject || !canEditActiveProject) return;
    setApplyingProjectMsgId(msgId);
    try {
      const existing = await getProjectFiles(activeIdeProject.id);
      await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeIdeProject.id,
        activeIdeProject.version,
        `Pre-AI update (${files.length} file${files.length === 1 ? '' : 's'})`,
        existing,
        {
          ownerId: activeIdeProject.ownerId,
          authorName: profile?.displayName || firebaseUser.email || 'Developer',
          changeType: mode === 'debug' ? 'ai_fix' : 'ai_build',
          aiOperation: `Mideo AI (${mode})`,
          collaboratorIds: activeIdeProject.collaboratorIds,
        },
      );
      const merged = await mergeImportedFilesIntoProject(
        firebaseUser.uid,
        profile?.displayName || firebaseUser.email || 'Developer',
        activeIdeProject.id,
        existing,
        files.map((f) => ({
          name: f.filename,
          folder: f.folder || '',
          language: f.language || 'javascript',
          content: f.code,
        })),
      );
      await refreshUserData();
      setActiveIdeProjectId(activeIdeProject.id);
      notify(
        'success',
        `Applied to "${activeIdeProject.title}" (${merged.addedCount} added, ${merged.updatedCount} updated). Version snapshot saved.`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to apply files to active project.');
    } finally {
      setApplyingProjectMsgId(null);
    }
  };

  const saveProposedSnapshotToActiveProject = async (proposed: NonNullable<AiChatMessage['proposedCode']>) => {
    if (!firebaseUser || !activeIdeProject || !canEditActiveProject) return;
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

  const executeWorkspaceAction = (action: { type: 'open_view' | 'focus_mode'; target: string; label: string }) => {
    if (action.type === 'focus_mode') {
      const next = action.target === 'off' ? false : action.target === 'on' ? true : undefined;
      if (typeof next === 'boolean') {
        setIdeFocusMode(next);
      } else {
        setIdeFocusMode(true);
      }
      setActiveView('ide');
      notify('success', 'IDE Focus Mode updated.');
      return;
    }

    const targetView = action.target.toLowerCase() as NavSection;
    if (targetView === 'testlab' && activeIdeProject) {
      openTestLabForProject(activeIdeProject.id);
      return;
    }
    if (targetView === 'architect' && activeIdeProject) {
      openArchitectForProject(activeIdeProject.id);
      return;
    }
    if (targetView === 'rescue' && activeIdeProject) {
      openRescueForProject(activeIdeProject.id);
      return;
    }
    if (VALID_VIEWS.includes(targetView)) {
      setActiveView(targetView);
    } else {
      notify('info', `Action: ${action.label}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[680px]">
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
        {/* Header Controls */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none">Mideo AI</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Universal AI partner · Web grounding · Live code execution · Multi-file IDE builder
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Web Search Grounding Toggle */}
              <button
                type="button"
                onClick={() => setUseWebSearch((v) => !v)}
                title="Ground answers with live Google Search results when helpful"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  useWebSearch
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Web Search {useWebSearch ? 'On' : 'Off'}
              </button>

              {/* Attach Active IDE Project */}
              {activeIdeProject && (
                <button
                  type="button"
                  onClick={handleAttachActiveProject}
                  disabled={attachingProject}
                  title={`Load files from "${activeIdeProject.title}" into Mideo AI context`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {attachingProject ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  ) : (
                    <FolderGit2 className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  Attach IDE Project
                </button>
              )}

              {/* Reasoning Depth Selector */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDepth('fast')}
                  title="Lowest latency for quick answers and syntax checks"
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
                  {authorizedContext.projectTitle
                    ? `${authorizedContext.projectTitle} (${authorizedContext.projectFiles?.length || 0} files)`
                    : authorizedContext.missionTitle ||
                      authorizedContext.lessonTitle ||
                      authorizedContext.filename ||
                      authorizedContext.language}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={(e) => setIncludeContext(e.target.checked)}
                  />
                  <span>Authorize context</span>
                </label>
                <button
                  type="button"
                  onClick={() => setAuthorizedContext(null)}
                  className="text-slate-400 hover:text-red-500 cursor-pointer"
                  aria-label="Remove attached context"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
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
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                Ask any question, upload screenshots or code files, attach your active IDE project, build multi-file apps, or run generated code directly here.
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
                <div className="space-y-2">
                  <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.attachments.map((att, aIdx) => (
                        <span
                          key={aIdx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-[11px] text-blue-700 dark:text-blue-300"
                        >
                          {att.kind === 'image' ? (
                            <ImageIcon className="w-3 h-3" />
                          ) : (
                            <FileCode2 className="w-3 h-3" />
                          )}
                          {att.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : msg.content ? (
                <MarkdownRenderer
                  content={msg.content}
                  onOpenCodeInIde={openSnippetInIde}
                  onRunCode={handleRunCodeBlock}
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Thinking &amp; streaming response...</span>
                </div>
              )}

              {/* Single Proposed Replacement Code */}
              {msg.proposedCode && msg.proposedCode.code && (
                <div className="mt-4 rounded-lg border border-blue-500/40 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span>Proposed File · {msg.proposedCode.filename || 'snippet'}</span>
                    <div className="flex items-center gap-2">
                      {canEditActiveProject && (
                        <>
                          <button
                            type="button"
                            disabled={applyingProjectMsgId === msg.id}
                            onClick={() =>
                              applyProposedFilesToActiveProject(msg.id, [
                                {
                                  filename: msg.proposedCode!.filename || 'index.js',
                                  language: msg.proposedCode!.language || 'javascript',
                                  code: msg.proposedCode!.code,
                                },
                              ])
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            Apply to Active Project
                          </button>
                          <button
                            type="button"
                            onClick={() => saveProposedSnapshotToActiveProject(msg.proposedCode!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-600 hover:border-blue-400 text-slate-200 font-medium whitespace-nowrap cursor-pointer"
                          >
                            <GitCommitHorizontal className="w-3.5 h-3.5" />
                            Snapshot
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          openSnippetInIde(
                            msg.proposedCode?.code || '',
                            msg.proposedCode?.language || 'javascript',
                            msg.proposedCode?.filename,
                          )
                        }
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium whitespace-nowrap cursor-pointer"
                      >
                        Open in New IDE
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 bg-[#090D16] text-slate-100 font-mono text-xs overflow-x-auto">
                    {msg.proposedCode.code}
                  </pre>
                </div>
              )}

              {/* Multi-File Generated Workspace Output */}
              {msg.proposedFiles && msg.proposedFiles.length > 0 && (
                <div className="mt-4 rounded-lg border border-violet-500/40 bg-slate-900/95 overflow-hidden">
                  <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-1.5">
                      <FolderGit2 className="w-4 h-4 text-violet-400" />
                      Multi-File Project Ready ({msg.proposedFiles.length} files)
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {canEditActiveProject && (
                        <button
                          type="button"
                          disabled={applyingProjectMsgId === msg.id}
                          onClick={() => applyProposedFilesToActiveProject(msg.id, msg.proposedFiles!)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
                        >
                          {applyingProjectMsgId === msg.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Apply to "{activeIdeProject?.title}"
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          createProjectFromProposedFiles(
                            msg.proposedFiles!,
                            messages[idx - 1]?.content,
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        Create &amp; Open in Mideo IDE
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5 flex flex-wrap gap-1.5 bg-[#090D16]">
                    {msg.proposedFiles.map((f, fIdx) => (
                      <span
                        key={fIdx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-800 bg-slate-900 text-[11px] font-mono text-slate-300"
                      >
                        <FileCode2 className="w-3 h-3 text-blue-400" />
                        {f.folder ? `${f.folder}/${f.filename}` : f.filename}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace Navigation / Focus Mode Quick Actions */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.actions.map((act, aIdx) => (
                    <button
                      key={aIdx}
                      type="button"
                      onClick={() => executeWorkspaceAction(act)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                    >
                      {act.label}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Grounded Web Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-emerald-500" />
                    Web Sources
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((src, sIdx) => (
                      <a
                        key={sIdx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-blue-600 dark:text-blue-400 hover:border-blue-500"
                      >
                        <span className="max-w-[200px] truncate">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Inline Live Code Execution / HTML Preview Output */}
          {(runningInlineCode || inlineRunResult) && (
            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#090D16] text-slate-100 overflow-hidden max-w-3xl">
              <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                  <Terminal className="w-3.5 h-3.5" />
                  {runningInlineCode
                    ? 'Running code...'
                    : inlineRunResult?.htmlPreview
                      ? 'Live HTML Preview'
                      : `Execution Output (${inlineRunResult?.language}${
                          inlineRunResult?.executionMs !== undefined
                            ? ` · ${inlineRunResult.executionMs}ms`
                            : ''
                        })`}
                </span>
                <button
                  type="button"
                  onClick={() => setInlineRunResult(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close output"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {runningInlineCode ? (
                <div className="p-3.5 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  Executing in Mideo sandbox...
                </div>
              ) : inlineRunResult?.htmlPreview ? (
                <iframe
                  title="AI HTML Preview"
                  sandbox="allow-scripts"
                  srcDoc={inlineRunResult.htmlPreview}
                  className="w-full h-64 bg-white"
                />
              ) : (
                <div className="p-3.5 font-mono text-xs space-y-1.5 max-h-60 overflow-y-auto">
                  {inlineRunResult?.stdout && (
                    <pre className="whitespace-pre-wrap text-emerald-300">{inlineRunResult.stdout}</pre>
                  )}
                  {inlineRunResult?.returnValue !== null &&
                    inlineRunResult?.returnValue !== undefined &&
                    inlineRunResult.returnValue !== 'undefined' && (
                      <div className="text-blue-300">Return: {inlineRunResult.returnValue}</div>
                    )}
                  {inlineRunResult?.stderr && (
                    <pre className="whitespace-pre-wrap text-red-400">{inlineRunResult.stderr}</pre>
                  )}
                  {!inlineRunResult?.stdout &&
                    !inlineRunResult?.stderr &&
                    (inlineRunResult?.returnValue === null ||
                      inlineRunResult?.returnValue === undefined ||
                      inlineRunResult?.returnValue === 'undefined') && (
                      <div className="text-slate-400">(Program finished with no output)</div>
                    )}
                </div>
              )}
            </div>
          )}

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
          className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                >
                  {att.kind === 'image' ? (
                    <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                  ) : (
                    <FileCode2 className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  <span className="max-w-[160px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((p) => p.id !== att.id))}
                    className="text-slate-400 hover:text-red-500 cursor-pointer"
                    aria-label={`Remove ${att.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.js,.ts,.tsx,.jsx,.py,.html,.css,.sql,.json,.md,.txt,.log,.csv,.java,.go,.rs,.cpp,.c,.cs,.php"
              className="hidden"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach code file, log, or screenshot"
              className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
              aria-label="Attach file or image"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendPrompt(input);
                }
              }}
              placeholder="Ask Mideo AI anything — code, debug, build apps, analyze files/images, research, or control your workspace..."
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
                disabled={!input.trim() && attachments.length === 0}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
