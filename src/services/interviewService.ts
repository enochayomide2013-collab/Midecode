import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import { sanitizeForFirestore } from './dataService';
import type {
  MockInterviewQuestionTurn,
  MockInterviewScorecard,
  MockInterviewSession,
} from '../types/mideocode';

export async function requestInterviewFollowup(input: {
  careerPathTitle: string;
  challengeId: string;
  language: 'javascript' | 'python';
  code: string;
  passedCount: number;
  totalCount: number;
  elapsedSeconds: number;
  transcript: MockInterviewQuestionTurn[];
}): Promise<{ briefReaction: string; question: string; topicTag: string }> {
  const res = await fetchWithAuthAndRetry('/api/interviews/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    briefReaction?: string;
    question?: string;
    topicTag?: string;
    error?: string;
  };
  if (!res.ok || !data.question) {
    throw new Error(data.error || 'Unable to generate interviewer question.');
  }
  return {
    briefReaction: data.briefReaction || '',
    question: data.question,
    topicTag: data.topicTag || 'Technical Follow-up',
  };
}

export async function evaluateMockInterview(input: {
  careerPathTitle: string;
  challengeId: string;
  language: 'javascript' | 'python';
  code: string;
  passedTests: number;
  totalTests: number;
  durationMinutes: number;
  elapsedSeconds: number;
  transcript: MockInterviewQuestionTurn[];
}): Promise<MockInterviewScorecard> {
  const res = await fetchWithAuthAndRetry('/api/interviews/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    scorecard?: MockInterviewScorecard;
    error?: string;
  };
  if (!res.ok || !data.scorecard) {
    throw new Error(data.error || 'Unable to evaluate mock interview session.');
  }
  return data.scorecard;
}

export async function saveMockInterviewSession(
  userId: string,
  input: Omit<MockInterviewSession, 'id' | 'userId' | 'createdAt'>,
): Promise<MockInterviewSession> {
  const interviewId = `miv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const docRef = doc(db, 'mockInterviews', interviewId);
  const record = sanitizeForFirestore({
    id: interviewId,
    userId,
    careerPathId: input.careerPathId.slice(0, 64),
    careerPathTitle: input.careerPathTitle.slice(0, 120),
    challengeId: input.challengeId.slice(0, 80),
    challengeTitle: input.challengeTitle.slice(0, 140),
    difficulty: input.difficulty,
    language: input.language,
    durationMinutes: Math.max(5, Math.min(120, Math.round(input.durationMinutes))),
    elapsedSeconds: Math.max(0, Math.min(7200, Math.round(input.elapsedSeconds))),
    status: input.status,
    passedTests: Math.max(0, Math.round(input.passedTests)),
    totalTests: Math.max(0, Math.round(input.totalTests)),
    codeSubmitted: input.codeSubmitted.slice(0, 50000),
    transcript: input.transcript.slice(0, 40),
    scorecard: input.scorecard,
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(docRef, record);
    return {
      ...record,
      createdAt: new Date().toISOString(),
    } as MockInterviewSession;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `mockInterviews/${interviewId}`);
  }
}

export async function listUserMockInterviews(userId: string): Promise<MockInterviewSession[]> {
  try {
    const q = query(
      collection(db, 'mockInterviews'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MockInterviewSession);
  } catch {
    try {
      const q = query(
        collection(db, 'mockInterviews'),
        where('userId', '==', userId),
        limit(25),
      );
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => d.data() as MockInterviewSession);
      return items.sort((a, b) => {
        const at =
          a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
            ? (a.createdAt as { toMillis: () => number }).toMillis()
            : new Date(String(a.createdAt || 0)).getTime();
        const bt =
          b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
            ? (b.createdAt as { toMillis: () => number }).toMillis()
            : new Date(String(b.createdAt || 0)).getTime();
        return bt - at;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'mockInterviews');
    }
  }
}

export async function deleteMockInterviewSession(interviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'mockInterviews', interviewId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mockInterviews/${interviewId}`);
  }
}
