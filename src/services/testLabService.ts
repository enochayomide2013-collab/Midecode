import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import { recordDeveloperActivity, sanitizeForFirestore } from './dataService';
import type {
  Project,
  ProjectFile,
  TestCaseItem,
  TestCaseResult,
  TestCoverageSummary,
  TestRunSession,
  TestSuite,
  TestType,
} from '../types/mideocode';

export async function listTestSuitesForUser(uid: string): Promise<TestSuite[]> {
  try {
    const ownedQ = query(collection(db, 'testSuites'), where('userId', '==', uid), limit(30));
    const sharedQ = query(
      collection(db, 'testSuites'),
      where('collaboratorIds', 'array-contains', uid),
      limit(30),
    );
    const [ownedSnap, sharedSnap] = await Promise.all([getDocs(ownedQ), getDocs(sharedQ)]);
    const map = new Map<string, TestSuite>();
    for (const d of ownedSnap.docs) map.set(d.id, d.data() as TestSuite);
    for (const d of sharedSnap.docs) map.set(d.id, d.data() as TestSuite);
    return Array.from(map.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'testSuites');
  }
}

export async function saveTestSuite(
  uid: string,
  project: Project,
  input: {
    id?: string;
    title: string;
    language: string;
    framework: string;
    testType: TestType;
    cases: TestCaseItem[];
    approved: boolean;
  },
): Promise<TestSuite> {
  const suiteId = input.id || `ts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(db, 'testSuites', suiteId);
  try {
    const existingSnap = input.id ? await getDoc(ref) : null;
    if (existingSnap?.exists()) {
      await updateDoc(
        ref,
        sanitizeForFirestore({
          title: input.title.trim().slice(0, 140),
          cases: input.cases.slice(0, 50),
          approved: input.approved,
          collaboratorIds:
            project.collaboratorIds && project.collaboratorIds.length > 0
              ? project.collaboratorIds
              : undefined,
          updatedAt: serverTimestamp(),
        }),
      );
    } else {
      await setDoc(
        ref,
        sanitizeForFirestore({
          id: suiteId,
          userId: uid,
          projectId: project.id,
          projectTitle: project.title.slice(0, 120),
          title: input.title.trim().slice(0, 140),
          language: input.language.slice(0, 32),
          framework: input.framework.slice(0, 64),
          testType: input.testType,
          cases: input.cases.slice(0, 50),
          approved: input.approved,
          collaboratorIds:
            project.collaboratorIds && project.collaboratorIds.length > 0
              ? project.collaboratorIds
              : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    const fresh = await getDoc(ref);
    return fresh.data() as TestSuite;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `testSuites/${suiteId}`);
  }
}

export async function deleteTestSuite(suiteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'testSuites', suiteId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `testSuites/${suiteId}`);
  }
}

export async function listTestRunsForUser(uid: string): Promise<TestRunSession[]> {
  try {
    const ownedQ = query(
      collection(db, 'testRuns'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(40),
    );
    const sharedQ = query(
      collection(db, 'testRuns'),
      where('collaboratorIds', 'array-contains', uid),
      limit(30),
    );
    const [ownedSnap, sharedSnap] = await Promise.all([getDocs(ownedQ), getDocs(sharedQ)]);
    const map = new Map<string, TestRunSession>();
    for (const d of ownedSnap.docs) map.set(d.id, d.data() as TestRunSession);
    for (const d of sharedSnap.docs) map.set(d.id, d.data() as TestRunSession);
    return Array.from(map.values());
  } catch (err) {
    // Fallback if composite index on userId + createdAt isn't built yet
    try {
      const q = query(collection(db, 'testRuns'), where('userId', '==', uid), limit(40));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as TestRunSession);
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.LIST, 'testRuns');
    }
  }
}

export async function generateTestsViaApi(input: {
  projectTitle: string;
  language: string;
  files: ProjectFile[];
  testTypes: TestType[];
  focusPrompt?: string;
}): Promise<{ framework: string; suiteTitle: string; cases: TestCaseItem[] }> {
  const res = await fetchWithAuthAndRetry('/api/testlab/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      language: input.language,
      files: input.files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
      testTypes: input.testTypes,
      focusPrompt: input.focusPrompt,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate test cases.');
  }
  return data;
}

export async function executeAndRecordTestSuite(
  uid: string,
  project: Project,
  suite: Pick<TestSuite, 'id' | 'title' | 'language' | 'testType' | 'cases'>,
  files: ProjectFile[],
): Promise<TestRunSession> {
  const res = await fetchWithAuthAndRetry('/api/testlab/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: suite.language,
      files: files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
      cases: suite.cases,
    }),
  });
  const exec = (await res.json()) as {
    status: 'passed' | 'failed' | 'error';
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    errorTests: number;
    durationMs: number;
    results: TestCaseResult[];
    coverage: TestCoverageSummary;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(exec.error || 'Test execution failed on isolated server runner.');
  }

  const runId = `trun_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const aiAssisted = suite.cases.some((c) => c.aiGenerated);
  const passPct =
    exec.totalTests > 0 ? Math.round((exec.passedTests / exec.totalTests) * 100) : 0;

  try {
    const payload = sanitizeForFirestore<Record<string, unknown>>({
      id: runId,
      userId: uid,
      projectId: project.id,
      projectTitle: project.title.slice(0, 120),
      suiteId: suite.id,
      suiteTitle: suite.title.slice(0, 140),
      language: suite.language.slice(0, 32),
      testType: suite.testType,
      status: exec.status,
      totalTests: exec.totalTests,
      passedTests: exec.passedTests,
      failedTests: exec.failedTests,
      skippedTests: exec.skippedTests,
      errorTests: exec.errorTests,
      durationMs: exec.durationMs,
      results: exec.results.slice(0, 50),
      coverage: exec.coverage,
      aiAssisted,
      collaboratorIds:
        project.collaboratorIds && project.collaboratorIds.length > 0
          ? project.collaboratorIds
          : undefined,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'testRuns', runId), payload);

    await recordDeveloperActivity(uid, {
      category: 'testlab',
      action: `Ran "${suite.title}" (${exec.passedTests}/${exec.totalTests} passed)`,
      language: suite.language,
      aiAssisted,
      scorePct: passPct,
      projectId: project.id,
    });

    const saved = await getDoc(doc(db, 'testRuns', runId));
    return saved.data() as TestRunSession;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `testRuns/${runId}`);
  }
}

export async function askTestLabAssistant(input: {
  question: string;
  projectTitle: string;
  language: string;
  files: ProjectFile[];
  failedResults: TestCaseResult[];
  coverage?: TestCoverageSummary;
}): Promise<string> {
  const res = await fetchWithAuthAndRetry('/api/testlab/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: input.question,
      projectTitle: input.projectTitle,
      language: input.language,
      files: input.files.map((f) => ({ name: f.name, language: f.language, content: f.content })),
      failedResults: input.failedResults,
      coverage: input.coverage,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to contact TestLab AI assistant.');
  }
  return data.reply as string;
}
