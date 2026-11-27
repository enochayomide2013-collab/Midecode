import { deleteDoc, doc } from './appDb';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry, readJsonSafe } from './authService';
import type {
  FileDiffSummary,
  ProjectVersionSnapshot,
} from '../types/mideocode';

export async function compareSnapshotsViaApi(
  baseSnapshot: ProjectVersionSnapshot[],
  targetSnapshot: ProjectVersionSnapshot[],
): Promise<{
  files: FileDiffSummary[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}> {
  const res = await fetchWithAuthAndRetry('/api/versions/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseSnapshot, targetSnapshot }),
  });
  return readJsonSafe<{
    files: FileDiffSummary[];
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    unchangedCount: number;
  }>(res, 'Failed to compute snapshot diff.');
}

export async function deleteProjectVersionSnapshot(
  projectId: string,
  versionId: string,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'projects', projectId, 'versions', versionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/versions/${versionId}`);
  }
}
