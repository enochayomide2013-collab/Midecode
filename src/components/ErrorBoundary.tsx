import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let friendly = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
      if (parsed.error) {
        friendly = `${parsed.error} (${parsed.operationType || 'operation'} on ${parsed.path || 'workspace'})`;
      }
    } catch {
      // Keep raw message
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-8">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h1 className="text-xl font-semibold">Application Recovery</h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6 break-words">
            {friendly}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reload MideoCode
          </button>
        </div>
      </div>
    );
  }
}
