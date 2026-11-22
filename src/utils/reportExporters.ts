import type { RescueScanReport, TestRunSession } from '../types/mideocode';

export function redactSensitiveText(input: string): string {
  return (input || '')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bsk-[0-9A-Za-z_-]{16,}\b/g, '[REDACTED_SECRET_KEY]')
    .replace(/\bgh[pousr]_[0-9A-Za-z]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
}

function toIsoDateLabel(val: unknown): string {
  if (!val) return new Date().toISOString();
  try {
    if (
      typeof val === 'object' &&
      val !== null &&
      'toDate' in val &&
      typeof (val as { toDate: () => Date }).toDate === 'function'
    ) {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch {
    // Ignore date fallback
  }
  return new Date().toISOString();
}

export function slugifyArtifactName(name: string, fallback = 'mideocode-report'): string {
  return (
    (name || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

export function downloadTextArtifact(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatRescueReportMarkdown(report: RescueScanReport): string {
  const lines: string[] = [
    `# MideoCode Project Rescue Health Report: ${redactSensitiveText(report.projectTitle)}`,
    '',
    `- **Scan Mode:** ${report.scanMode.toUpperCase()}`,
    `- **Health Score:** ${report.healthScore}/100`,
    `- **Files Inspected:** ${report.filesInspected}`,
    `- **Confirmed Issues:** ${report.confirmedCount}`,
    `- **Potential Issues & Suggestions:** ${report.potentialCount}`,
    `- **Generated:** ${toIsoDateLabel(report.createdAt)}`,
    '',
    '## Executive Summary',
    redactSensitiveText(report.summary),
    '',
  ];

  if (report.recommendedRepairOrder.length > 0) {
    lines.push('## Recommended Repair Order');
    report.recommendedRepairOrder.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${redactSensitiveText(step)}`);
    });
    lines.push('');
  }

  if (report.suggestedImprovements.length > 0) {
    lines.push('## Suggested Improvements');
    report.suggestedImprovements.forEach((imp) => {
      lines.push(`- ${redactSensitiveText(imp)}`);
    });
    lines.push('');
  }

  lines.push(`## Detected Issues (${report.issues.length})`);
  if (report.issues.length === 0) {
    lines.push('No confirmed or potential issues detected.');
  } else {
    report.issues.forEach((iss, idx) => {
      lines.push(
        `### ${idx + 1}. [${iss.severity.toUpperCase()} · ${iss.certainty.toUpperCase()}] ${redactSensitiveText(iss.title)}`,
      );
      lines.push(`- **File:** \`${iss.filePath}${iss.line ? `:${iss.line}` : ''}\` · Category: ${iss.category}`);
      lines.push(`- **Summary:** ${redactSensitiveText(iss.summary)}`);
      if (iss.beginnerExplanation) {
        lines.push(`- **Beginner Explanation:** ${redactSensitiveText(iss.beginnerExplanation)}`);
      }
      if (iss.developerExplanation) {
        lines.push(`- **Developer Explanation:** ${redactSensitiveText(iss.developerExplanation)}`);
      }
      if (iss.symbolOrSnippet) {
        lines.push(`- **Snippet:** \`${redactSensitiveText(iss.symbolOrSnippet).replace(/`/g, "'")}\``);
      }
      if (iss.recommendedAction) {
        lines.push(`- **Recommended Action:** ${redactSensitiveText(iss.recommendedAction)}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function sanitizeRescueReportForJson(report: RescueScanReport): string {
  const safeCopy = {
    ...report,
    projectTitle: redactSensitiveText(report.projectTitle),
    summary: redactSensitiveText(report.summary),
    issues: report.issues.map((iss) => ({
      ...iss,
      title: redactSensitiveText(iss.title),
      summary: redactSensitiveText(iss.summary),
      symbolOrSnippet: iss.symbolOrSnippet ? redactSensitiveText(iss.symbolOrSnippet) : iss.symbolOrSnippet,
      evidenceSource: redactSensitiveText(iss.evidenceSource),
      recommendedAction: redactSensitiveText(iss.recommendedAction),
      beginnerExplanation: redactSensitiveText(iss.beginnerExplanation),
      developerExplanation: redactSensitiveText(iss.developerExplanation),
    })),
    recommendedRepairOrder: report.recommendedRepairOrder.map(redactSensitiveText),
    suggestedImprovements: report.suggestedImprovements.map(redactSensitiveText),
  };
  return JSON.stringify(safeCopy, null, 2);
}

export function formatTestRunMarkdown(run: TestRunSession): string {
  const lines: string[] = [
    `# MideoCode TestLab Run Report: ${redactSensitiveText(run.suiteTitle)}`,
    '',
    `- **Project:** ${redactSensitiveText(run.projectTitle)}`,
    `- **Language:** ${run.language}`,
    `- **Test Type:** ${run.testType}`,
    `- **Overall Status:** ${run.status.toUpperCase()}`,
    `- **Passed:** ${run.passedTests} / ${run.totalTests}`,
    `- **Failed / Errors:** ${run.failedTests + run.errorTests}`,
    `- **Skipped:** ${run.skippedTests}`,
    `- **Duration:** ${run.durationMs}ms`,
    `- **Timestamp:** ${toIsoDateLabel(run.createdAt)}`,
    '',
    '## Code Coverage',
  ];

  if (run.coverage?.available) {
    lines.push(
      `- **Line Coverage:** ${run.coverage.linePct ?? 0}%`,
      `- **Statement Coverage:** ${run.coverage.statementPct ?? 0}%`,
      `- **Function Coverage:** ${run.coverage.functionPct ?? 0}%`,
      `- **Branch Coverage:** ${run.coverage.branchPct ?? 0}%`,
    );
  } else {
    lines.push(`- **Coverage Status:** ${redactSensitiveText(run.coverage?.reason || 'Unavailable for this runtime')}`);
  }

  lines.push('', `## Test Case Results (${run.results.length})`);
  run.results.forEach((res, idx) => {
    lines.push(`### ${idx + 1}. [${res.status.toUpperCase()}] ${redactSensitiveText(res.name)}`);
    lines.push(`- **Target:** \`${res.fileRef || 'project'}${res.lineRef ? `:${res.lineRef}` : ''}\` (${res.durationMs}ms)`);
    lines.push(`- **Expected:** ${redactSensitiveText(res.expectedResult)}`);
    lines.push(`- **Actual:** ${redactSensitiveText(res.actualResult)}`);
    if (res.failureMessage) {
      lines.push(`- **Failure Details:** ${redactSensitiveText(res.failureMessage)}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}
