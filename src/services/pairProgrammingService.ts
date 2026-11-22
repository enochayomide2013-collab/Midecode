import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { sanitizeForFirestore } from './dataService';
import type {
  PairChatMessage,
  PairFileSavedNotice,
  PairPresenceMember,
  Project,
} from '../types/mideocode';

export type PairConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface PairSessionCallbacks {
  onStatusChange?: (status: PairConnectionStatus, reason?: string) => void;
  onPresenceSync?: (members: PairPresenceMember[]) => void;
  onRealtimeChat?: (message: PairChatMessage) => void;
  onFileSavedNotice?: (notice: PairFileSavedNotice) => void;
}

export class PairSessionClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private retryAttempt = 0;
  private closedManually = false;
  private isAuthenticated = false;
  public readonly clientId: string;

  private readonly projectId: string;
  private readonly displayName: string;
  private readonly photoURL?: string;
  private readonly callbacks: PairSessionCallbacks;

  private lastPresence: {
    activeFileId?: string;
    activeFileName?: string;
    cursorLine?: number;
    isTyping?: boolean;
  } = {};

  constructor(
    projectId: string,
    displayName: string,
    photoURL: string | undefined,
    callbacks: PairSessionCallbacks,
  ) {
    this.projectId = projectId;
    this.displayName = displayName;
    this.photoURL = photoURL;
    this.callbacks = callbacks;
    this.clientId = `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  public connect() {
    this.closedManually = false;
    this.openSocket();
  }

  public disconnect() {
    this.closedManually = true;
    this.isAuthenticated = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnected');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.callbacks.onStatusChange?.('disconnected');
  }

  public updatePresence(patch: {
    activeFileId?: string;
    activeFileName?: string;
    cursorLine?: number;
    isTyping?: boolean;
  }) {
    this.lastPresence = { ...this.lastPresence, ...patch };
    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.ws.send(
        JSON.stringify({
          type: 'presence:update',
          ...this.lastPresence,
        }),
      );
    }
  }

  public notifyFileSaved(payload: { fileId: string; fileName: string; version: number }) {
    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.ws.send(
        JSON.stringify({
          type: 'file:saved',
          fileId: payload.fileId,
          fileName: payload.fileName,
          version: payload.version,
        }),
      );
    }
  }

  public sendRealtimeChat(payload: { id: string; body: string; fileRef?: string; lineRef?: number }) {
    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.ws.send(
        JSON.stringify({
          type: 'chat:send',
          id: payload.id,
          body: payload.body,
          fileRef: payload.fileRef,
          lineRef: payload.lineRef,
        }),
      );
    }
  }

  private async openSocket() {
    if (this.closedManually) return;
    const user = auth.currentUser;
    if (!user) {
      this.callbacks.onStatusChange?.('disconnected', 'Sign in required for pair session');
      return;
    }

    this.callbacks.onStatusChange?.(this.retryAttempt > 0 ? 'reconnecting' : 'connecting');

    let idToken = '';
    try {
      idToken = await user.getIdToken();
    } catch {
      this.scheduleReconnect();
      return;
    }

    if (this.closedManually) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/pair?projectId=${encodeURIComponent(this.projectId)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.isAuthenticated = false;

    ws.onopen = () => {
      if (this.closedManually || ws !== this.ws) return;
      ws.send(
        JSON.stringify({
          type: 'auth',
          token: idToken,
          clientId: this.clientId,
          displayName: this.displayName,
          photoURL: this.photoURL,
          ...this.lastPresence,
        }),
      );

      if (this.heartbeatTimer !== null) {
        window.clearInterval(this.heartbeatTimer);
      }
      this.heartbeatTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20_000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (msg.type === 'auth:ok') {
          this.isAuthenticated = true;
          this.retryAttempt = 0;
          this.callbacks.onStatusChange?.('connected');
          if (Array.isArray(msg.members)) {
            this.callbacks.onPresenceSync?.(msg.members as PairPresenceMember[]);
          }
          return;
        }
        if (msg.type === 'presence:sync' && Array.isArray(msg.members)) {
          this.callbacks.onPresenceSync?.(msg.members as PairPresenceMember[]);
          return;
        }
        if (msg.type === 'chat:message' && msg.message) {
          this.callbacks.onRealtimeChat?.(msg.message as PairChatMessage);
          return;
        }
        if (msg.type === 'file:saved' && msg.notice) {
          this.callbacks.onFileSavedNotice?.(msg.notice as PairFileSavedNotice);
        }
      } catch {
        // Ignore malformed WS frame
      }
    };

    ws.onclose = (ev) => {
      if (this.heartbeatTimer !== null) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.isAuthenticated = false;
      if (this.closedManually) return;
      if (ev.code === 4403 || ev.code === 4401) {
        this.callbacks.onStatusChange?.('error', ev.reason || 'Pair session unauthorized');
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose handles backoff reconnect cleanly
    };
  }

  private scheduleReconnect() {
    if (this.closedManually) return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    const delay = Math.min(15_000, 1000 * Math.pow(2, this.retryAttempt));
    this.retryAttempt += 1;
    this.callbacks.onStatusChange?.('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.openSocket();
    }, delay);
  }
}

function createdAtMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  const t = new Date(String(val)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortPairMessagesAsc(messages: PairChatMessage[]): PairChatMessage[] {
  return [...messages].sort((a, b) => createdAtMillis(a.createdAt) - createdAtMillis(b.createdAt));
}

export async function listPairMessages(projectId: string, currentUid?: string): Promise<PairChatMessage[]> {
  const uid = currentUid || auth.currentUser?.uid;
  if (!uid) return [];

  const msgCol = collection(db, 'projects', projectId, 'pairMessages');
  try {
    const [memberSnap, ownSnap] = await Promise.all([
      getDocs(query(msgCol, where('collaboratorIds', 'array-contains', uid), limit(150))),
      getDocs(query(msgCol, where('senderId', '==', uid), limit(150))),
    ]);
    const byId = new Map<string, PairChatMessage>();
    for (const d of memberSnap.docs) byId.set(d.id, d.data() as PairChatMessage);
    for (const d of ownSnap.docs) byId.set(d.id, d.data() as PairChatMessage);
    return sortPairMessagesAsc(Array.from(byId.values())).slice(-120);
  } catch {
    return [];
  }
}

export function subscribePairMessages(
  projectId: string,
  currentUid: string,
  onMessages: (messages: PairChatMessage[]) => void,
): () => void {
  if (!currentUid) return () => {};
  const q = query(
    collection(db, 'projects', projectId, 'pairMessages'),
    where('collaboratorIds', 'array-contains', currentUid),
    limit(150),
  );
  return onSnapshot(
    q,
    (snap) => {
      const sorted = sortPairMessagesAsc(snap.docs.map((d) => d.data() as PairChatMessage));
      onMessages(sorted.slice(-120));
    },
    () => {
      listPairMessages(projectId, currentUid)
        .then(onMessages)
        .catch(() => {});
    },
  );
}

export async function persistPairMessage(
  project: Project,
  senderId: string,
  senderName: string,
  senderPhotoURL: string | undefined,
  input: { id?: string; body: string; fileRef?: string; lineRef?: number },
): Promise<PairChatMessage> {
  const msgId =
    input.id || `pmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const allMemberIds = Array.from(
    new Set([project.ownerId, ...(project.collaboratorIds || [])].filter(Boolean)),
  ).slice(0, 25);

  const payload = sanitizeForFirestore({
    id: msgId,
    projectId: project.id,
    senderId,
    senderName: senderName.slice(0, 80) || 'Collaborator',
    senderPhotoURL: senderPhotoURL?.slice(0, 500),
    body: input.body.trim().slice(0, 2000),
    fileRef: input.fileRef?.slice(0, 180),
    lineRef:
      typeof input.lineRef === 'number' && Number.isFinite(input.lineRef) && input.lineRef >= 1
        ? Math.round(input.lineRef)
        : undefined,
    collaboratorIds: allMemberIds,
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'projects', project.id, 'pairMessages', msgId), payload);
    return {
      ...payload,
      createdAt: new Date().toISOString(),
    } as PairChatMessage;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${project.id}/pairMessages/${msgId}`);
  }
}
