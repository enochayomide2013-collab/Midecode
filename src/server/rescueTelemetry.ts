import type {
  RescueAdminEvent,
  RescueAdminTelemetry,
  RescueScanJob,
} from '../types/mideocode.ts';

const MAX_SCAN_JOBS = 120;
const MAX_ADMIN_EVENTS = 160;

const scanJobs = new Map<string, RescueScanJob>();
const adminEvents: RescueAdminEvent[] = [];

export function saveScanJobRecord(job: RescueScanJob): void {
  if (scanJobs.has(job.jobId)) {
    scanJobs.delete(job.jobId);
  }
  scanJobs.set(job.jobId, job);

  while (scanJobs.size > MAX_SCAN_JOBS) {
    const oldestKey = scanJobs.keys().next().value;
    if (!oldestKey) break;
    scanJobs.delete(oldestKey);
  }
}

export function getScanJobRecord(jobId: string): RescueScanJob | undefined {
  return scanJobs.get(jobId);
}

export function listRecentScanJobs(): RescueScanJob[] {
  return Array.from(scanJobs.values()).reverse().slice(0, 50);
}

export function recordRescueAdminEvent(input: {
  kind: RescueAdminEvent['kind'];
  userId?: string;
  projectTitle?: string;
  message: string;
  details?: string;
}): RescueAdminEvent {
  const evt: RescueAdminEvent = {
    id: `revt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind: input.kind,
    userId: input.userId,
    projectTitle: input.projectTitle?.slice(0, 140),
    message: input.message.slice(0, 400),
    details: input.details?.slice(0, 800),
    createdAt: new Date().toISOString(),
  };
  adminEvents.unshift(evt);
  if (adminEvents.length > MAX_ADMIN_EVENTS) {
    adminEvents.length = MAX_ADMIN_EVENTS;
  }
  return evt;
}

export function getRescueAdminTelemetry(): RescueAdminTelemetry {
  const allJobs = listRecentScanJobs();
  const activeJobs = allJobs.filter((j) => j.status === 'running');
  const recentJobs = allJobs.slice(0, 30);

  return {
    activeJobs,
    recentJobs,
    failedImports: adminEvents.filter((e) => e.kind === 'failed_import').slice(0, 30),
    failedScans: adminEvents.filter((e) => e.kind === 'failed_scan').slice(0, 30),
    aiErrors: adminEvents.filter((e) => e.kind === 'ai_error').slice(0, 30),
    securityEvents: adminEvents.filter((e) => e.kind === 'security_event').slice(0, 30),
    generatedAt: new Date().toISOString(),
  };
}
