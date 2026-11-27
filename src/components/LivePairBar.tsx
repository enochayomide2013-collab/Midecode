import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  MessageSquare,
  Radio,
  Send,
  Users,
  X,
} from 'lucide-react';
import type {
  PairChatMessage,
  PairPresenceMember,
} from '../types/mideocode';
import type { PairConnectionStatus } from '../services/pairProgrammingService';

interface LivePairBarProps {
  connectionStatus: PairConnectionStatus;
  connectionError?: string | null;
  members: PairPresenceMember[];
  myClientId: string;
  followingClientId: string | null;
  onToggleFollow: (clientId: string | null) => void;
  messages: PairChatMessage[];
  activeFileName?: string;
  currentLine?: number;
  onSendMessage: (body: string, includeFileRef: boolean) => Promise<void> | void;
  canChat?: boolean;
}

function formatMessageTime(val: unknown): string {
  if (!val) return '';
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LivePairBar({
  connectionStatus,
  connectionError,
  members,
  myClientId,
  followingClientId,
  onToggleFollow,
  messages,
  activeFileName,
  currentLine,
  onSendMessage,
  canChat = true,
}: LivePairBarProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [tagCurrentLine, setTagCurrentLine] = useState(true);
  const [sending, setSending] = useState(false);

  const peers = members.filter((m) => m.clientId !== myClientId);
  const followedMember = peers.find((m) => m.clientId === followingClientId) || null;

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSendMessage(trimmed, tagCurrentLine);
      setChatInput('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden">
      {/* Compact Live Presence Strip */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
            {connectionStatus === 'connected' ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            ) : (
              <Radio
                className={`w-3.5 h-3.5 ${
                  connectionStatus === 'error' ? 'text-red-500' : 'text-amber-500'
                }`}
              />
            )}
            <span className="tabular-nums">
              {connectionStatus === 'connected'
                ? `Live Pair · ${members.length} online`
                : connectionStatus === 'reconnecting'
                  ? 'Reconnecting pair session...'
                  : connectionStatus === 'error'
                    ? connectionError || 'Pair session unavailable'
                    : 'Connecting pair session...'}
            </span>
          </div>

          {peers.length === 0 ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              No teammates currently in this workspace. Share access via Collab to pair in real time.
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {peers.map((peer) => {
                const isFollowing = followingClientId === peer.clientId;
                return (
                  <div
                    key={peer.clientId}
                    className={`inline-flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg border text-xs ${
                      isFollowing
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {peer.photoURL ? (
                      <img
                        src={peer.photoURL}
                        alt={peer.displayName}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                        {peer.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 max-w-[230px]">
                      <span className="font-medium truncate">{peer.displayName}</span>
                      {peer.activeFileName && (
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          {peer.activeFileName}
                          {peer.cursorLine ? `:${peer.cursorLine}` : ''}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleFollow(isFollowing ? null : peer.clientId)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                        isFollowing
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-500'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Unfollow
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          Follow
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {followedMember && (
            <button
              type="button"
              onClick={() => onToggleFollow(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 text-xs font-medium cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              Following {followedMember.displayName}
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
              chatOpen
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Pair Chat ({messages.length})
          </button>
        </div>
      </div>

      {/* Collapsible Live Pair Chat Drawer */}
      {chatOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              Live Pair Session Chat
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No pair messages yet. Discuss edits, pin a file line, or coordinate saves here.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-lg bg-white dark:bg-[#0D1322] border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{m.senderName}</span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 tabular-nums">
                      {m.fileRef && (
                        <span className="font-mono text-blue-600 dark:text-blue-400">
                          {m.fileRef}
                          {m.lineRef ? `:${m.lineRef}` : ''}
                        </span>
                      )}
                      <span>{formatMessageTime(m.createdAt)}</span>
                    </div>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {m.body}
                  </p>
                </div>
              ))
            )}
          </div>

          {canChat && (
            <form onSubmit={handleChatSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a live message to teammates..."
                  maxLength={2000}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || sending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>
              {activeFileName && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tagCurrentLine}
                    onChange={(e) => setTagCurrentLine(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700"
                  />
                  Attach context:{' '}
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {activeFileName}
                    {currentLine ? `:${currentLine}` : ''}
                  </span>
                </label>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
