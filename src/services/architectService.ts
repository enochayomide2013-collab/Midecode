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
} from './appDb';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry, readJsonSafe } from './authService';
import { recordDeveloperActivity, sanitizeForFirestore } from './dataService';
import type {
  ArchitecturePlan,
  ArchitectureVersion,
} from '../types/mideocode';

export async function listUserArchitectures(uid: string): Promise<ArchitecturePlan[]> {
  try {
    const q = query(collection(db, 'architectures'), where('userId', '==', uid), limit(30));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ArchitecturePlan);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'architectures');
  }
}

export async function listArchitectureVersions(archId: string): Promise<ArchitectureVersion[]> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, 'architectures', archId, 'versions'),
      where('userId', '==', uid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as ArchitectureVersion)
      .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `architectures/${archId}/versions`);
  }
}

export async function generateArchitectureViaApi(input: {
  prompt: string;
  constraints?: string;
}): Promise<Omit<ArchitecturePlan, 'id' | 'userId' | 'versionNumber' | 'status' | 'createdAt' | 'updatedAt'>> {
  const res = await fetchWithAuthAndRetry('/api/architect/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonSafe(res, 'Architecture generation failed.');
}

export async function reviseArchitectureViaApi(input: {
  currentPlan: Omit<ArchitecturePlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
  revisionPrompt: string;
}): Promise<Omit<ArchitecturePlan, 'id' | 'userId' | 'versionNumber' | 'status' | 'createdAt' | 'updatedAt'>> {
  const res = await fetchWithAuthAndRetry('/api/architect/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonSafe(res, 'Architecture revision failed.');
}

export async function exportArchitectureViaApi(
  format: 'sql' | 'openapi_json' | 'firestore_schema',
  plan: ArchitecturePlan,
): Promise<{ filename: string; content: string }> {
  const res = await fetchWithAuthAndRetry('/api/architect/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, plan }),
  });
  return readJsonSafe(res, 'Export failed.');
}

export async function saveArchitecturePlan(
  uid: string,
  planInput: Omit<ArchitecturePlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string },
  changeSummary = 'Initial architecture design',
): Promise<ArchitecturePlan> {
  const archId = planInput.id || `arch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(db, 'architectures', archId);

  try {
    const existing = planInput.id ? await getDoc(ref) : null;
    const nextVersionNumber = existing?.exists()
      ? ((existing.data() as ArchitecturePlan).versionNumber || 1) + 1
      : planInput.versionNumber || 1;

    const cleanCore = sanitizeForFirestore<Record<string, unknown>>({
      projectId: planInput.projectId || undefined,
      title: planInput.title.trim().slice(0, 140),
      prompt: planInput.prompt.trim().slice(0, 4000),
      overview: planInput.overview.slice(0, 4000),
      frontendSpec: (planInput.frontendSpec || '').slice(0, 4000),
      backendSpec: (planInput.backendSpec || '').slice(0, 4000),
      authSpec: (planInput.authSpec || '').slice(0, 4000),
      techStack: (planInput.techStack || []).slice(0, 15),
      modules: (planInput.modules || []).slice(0, 30),
      databaseTables: (planInput.databaseTables || []).slice(0, 30),
      apiEndpoints: (planInput.apiEndpoints || []).slice(0, 40),
      diagrams: (planInput.diagrams || []).slice(0, 10),
      versionNumber: nextVersionNumber,
      status: planInput.status || 'draft',
    });

    if (existing?.exists()) {
      await updateDoc(ref, {
        ...cleanCore,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: archId,
        userId: uid,
        ...cleanCore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Record immutable architecture version snapshot
    const verId = `aver_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    await setDoc(
      doc(db, 'architectures', archId, 'versions', verId),
      sanitizeForFirestore({
        id: verId,
        architectureId: archId,
        userId: uid,
        versionNumber: nextVersionNumber,
        label: `v${nextVersionNumber} — ${planInput.title}`.slice(0, 140),
        changeSummary: changeSummary.slice(0, 500),
        snapshot: cleanCore,
        createdAt: serverTimestamp(),
      }),
    );

    await recordDeveloperActivity(uid, {
      category: 'architect',
      action: `${existing?.exists() ? 'Updated' : 'Designed'} architecture "${planInput.title.slice(0, 60)}"`,
      aiAssisted: true,
      projectId: planInput.projectId,
    });

    const fresh = await getDoc(ref);
    return fresh.data() as ArchitecturePlan;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `architectures/${archId}`);
  }
}

export async function deleteArchitecturePlan(archId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'architectures', archId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `architectures/${archId}`);
  }
}
