import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  getProjectMembershipForPairHub,
  verifySessionToken,
} from './localAuthAndStore.ts';
import type {
  PairChatMessage,
  PairFileSavedNotice,
  PairPresenceMember,
  ProjectCollaboratorRole,
} from '../types/mideocode.ts';

interface PairHubConfig {
  firebaseProjectId?: string;
  firestoreDatabaseId?: string;
}

interface RoomClient {
  clientId: string;
  ws: WebSocket;
  uid: string;
  displayName: string;
  photoURL?: string;
  role: ProjectCollaboratorRole;
  activeFileId?: string;
  activeFileName?: string;
  cursorLine?: number;
  isTyping?: boolean;
  joinedAt: string;
  updatedAt: string;
  lastHeartbeatAt: number;
}

const VALID_PROJECT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function attachPairProgrammingWebSocket(
  httpServer: HttpServer,
  _config?: PairHubConfig,
): { wss: WebSocketServer; getRoomMembers: (projectId: string) => PairPresenceMember[] } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const rooms = new Map<string, Map<string, RoomClient>>();

  function toPresenceMembers(room: Map<string, RoomClient>): PairPresenceMember[] {
    return Array.from(room.values()).map((c) => ({
      clientId: c.clientId,
      uid: c.uid,
      displayName: c.displayName,
      photoURL: c.photoURL,
      role: c.role,
      activeFileId: c.activeFileId,
      activeFileName: c.activeFileName,
      cursorLine: c.cursorLine,
      isTyping: c.isTyping,
      joinedAt: c.joinedAt,
      updatedAt: c.updatedAt,
    }));
  }

  function broadcastToRoom(
    projectId: string,
    payload: Record<string, unknown>,
    excludeClientId?: string,
  ) {
    const room = rooms.get(projectId);
    if (!room) return;
    const raw = JSON.stringify(payload);
    for (const client of room.values()) {
      if (excludeClientId && client.clientId === excludeClientId) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  async function verifyProjectMembership(
    projectId: string,
    uid: string,
  ): Promise<{ authorized: boolean; role: ProjectCollaboratorRole; collaboratorIds: string[] }> {
    return getProjectMembershipForPairHub(projectId, uid);
  }

  // Sweep stale sockets every 25s in case a client drops without TCP FIN
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [projectId, room] of rooms.entries()) {
      let removedAny = false;
      for (const [clientId, client] of room.entries()) {
        if (now - client.lastHeartbeatAt > 50_000 || client.ws.readyState !== WebSocket.OPEN) {
          try {
            client.ws.terminate();
          } catch {
            // ignore
          }
          room.delete(clientId);
          removedAny = true;
        }
      }
      if (removedAny) {
        if (room.size === 0) {
          rooms.delete(projectId);
        } else {
          broadcastToRoom(projectId, {
            type: 'presence:sync',
            projectId,
            members: toPresenceMembers(room),
          });
        }
      }
    }
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    try {
      const host = req.headers.host || 'localhost:3000';
      const parsed = new URL(req.url || '/', `http://${host}`);
      if (parsed.pathname !== '/ws/pair') {
        return;
      }
      const projectId = parsed.searchParams.get('projectId') || '';
      if (!VALID_PROJECT_ID.test(projectId)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, projectId);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, projectId: string) => {
    let authedClient: RoomClient | null = null;
    const authTimeout = setTimeout(() => {
      if (!authedClient && ws.readyState === WebSocket.OPEN) {
        ws.close(4401, 'Authentication timeout');
      }
    }, 10_000);

    const cleanupClient = () => {
      clearTimeout(authTimeout);
      if (!authedClient) return;
      const room = rooms.get(projectId);
      if (room) {
        room.delete(authedClient.clientId);
        if (room.size === 0) {
          rooms.delete(projectId);
        } else {
          broadcastToRoom(projectId, {
            type: 'presence:sync',
            projectId,
            members: toPresenceMembers(room),
          });
        }
      }
      authedClient = null;
    };

    ws.on('close', cleanupClient);
    ws.on('error', cleanupClient);

    ws.on('message', async (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString('utf-8')) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        if (authedClient) {
          authedClient.lastHeartbeatAt = Date.now();
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        return;
      }

      if (msg.type === 'auth') {
        const token = typeof msg.token === 'string' ? msg.token.trim() : '';
        const clientIdRaw = typeof msg.clientId === 'string' ? msg.clientId.trim() : '';
        const requestedName = typeof msg.displayName === 'string' ? msg.displayName.trim() : '';
        const requestedPhoto = typeof msg.photoURL === 'string' ? msg.photoURL.trim() : '';

        if (!token) {
          ws.close(4401, 'Missing authentication token');
          return;
        }

        try {
          const decoded = verifySessionToken(token);
          if (!decoded) {
            ws.close(4401, 'Invalid or expired authentication session');
            return;
          }
          const membership = await verifyProjectMembership(projectId, decoded.uid);
          if (!membership.authorized) {
            ws.close(4403, 'Not authorized for this project workspace');
            return;
          }

          clearTimeout(authTimeout);
          const clientId =
            VALID_PROJECT_ID.test(clientIdRaw)
              ? clientIdRaw
              : `cl_${decoded.uid.slice(0, 8)}_${Date.now().toString(36)}`;
          const nowIso = new Date().toISOString();
          const client: RoomClient = {
            clientId,
            ws,
            uid: decoded.uid,
            displayName: (requestedName || decoded.displayName || decoded.email || 'Collaborator').slice(0, 80),
            photoURL: (requestedPhoto || decoded.photoURL || undefined)?.slice(0, 500),
            role: membership.role,
            activeFileId: typeof msg.activeFileId === 'string' ? msg.activeFileId.slice(0, 128) : undefined,
            activeFileName: typeof msg.activeFileName === 'string' ? msg.activeFileName.slice(0, 120) : undefined,
            cursorLine:
              typeof msg.cursorLine === 'number' && Number.isFinite(msg.cursorLine) && msg.cursorLine >= 1
                ? Math.round(msg.cursorLine)
                : undefined,
            isTyping: false,
            joinedAt: nowIso,
            updatedAt: nowIso,
            lastHeartbeatAt: Date.now(),
          };

          authedClient = client;
          let room = rooms.get(projectId);
          if (!room) {
            room = new Map<string, RoomClient>();
            rooms.set(projectId, room);
          }
          room.set(client.clientId, client);

          const members = toPresenceMembers(room);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'auth:ok',
                projectId,
                clientId: client.clientId,
                role: client.role,
                members,
              }),
            );
          }
          broadcastToRoom(
            projectId,
            {
              type: 'presence:sync',
              projectId,
              members,
            },
            client.clientId,
          );
        } catch {
          ws.close(4401, 'Invalid authentication session');
        }
        return;
      }

      if (!authedClient) {
        return;
      }

      authedClient.lastHeartbeatAt = Date.now();
      const room = rooms.get(projectId);
      if (!room) return;

      if (msg.type === 'presence:update') {
        authedClient.activeFileId =
          typeof msg.activeFileId === 'string' ? msg.activeFileId.slice(0, 128) : authedClient.activeFileId;
        authedClient.activeFileName =
          typeof msg.activeFileName === 'string' ? msg.activeFileName.slice(0, 120) : authedClient.activeFileName;
        if (typeof msg.cursorLine === 'number' && Number.isFinite(msg.cursorLine) && msg.cursorLine >= 1) {
          authedClient.cursorLine = Math.round(msg.cursorLine);
        }
        if (typeof msg.isTyping === 'boolean') {
          authedClient.isTyping = msg.isTyping;
        }
        authedClient.updatedAt = new Date().toISOString();

        broadcastToRoom(projectId, {
          type: 'presence:sync',
          projectId,
          members: toPresenceMembers(room),
        });
        return;
      }

      if (msg.type === 'file:saved') {
        if (authedClient.role === 'viewer') return;
        const notice: PairFileSavedNotice = {
          projectId,
          fileId: typeof msg.fileId === 'string' ? msg.fileId.slice(0, 128) : '',
          fileName: typeof msg.fileName === 'string' ? msg.fileName.slice(0, 120) : '',
          version: typeof msg.version === 'number' && Number.isFinite(msg.version) ? msg.version : 1,
          updatedByUid: authedClient.uid,
          updatedByName: authedClient.displayName,
          updatedAt: new Date().toISOString(),
        };
        if (notice.fileId) {
          broadcastToRoom(
            projectId,
            {
              type: 'file:saved',
              notice,
            },
            authedClient.clientId,
          );
        }
        return;
      }

      if (msg.type === 'chat:send') {
        const body = typeof msg.body === 'string' ? msg.body.trim().slice(0, 2000) : '';
        if (!body) return;
        const message: PairChatMessage = {
          id:
            typeof msg.id === 'string' && VALID_PROJECT_ID.test(msg.id)
              ? msg.id
              : `pmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          projectId,
          senderId: authedClient.uid,
          senderName: authedClient.displayName,
          senderPhotoURL: authedClient.photoURL,
          body,
          fileRef: typeof msg.fileRef === 'string' ? msg.fileRef.slice(0, 180) : undefined,
          lineRef:
            typeof msg.lineRef === 'number' && Number.isFinite(msg.lineRef) && msg.lineRef >= 1
              ? Math.round(msg.lineRef)
              : undefined,
          createdAt: new Date().toISOString(),
        };
        broadcastToRoom(projectId, {
          type: 'chat:message',
          message,
        });
      }
    });
  });

  return {
    wss,
    getRoomMembers: (projectId: string) => {
      const room = rooms.get(projectId);
      return room ? toPresenceMembers(room) : [];
    },
  };
}
