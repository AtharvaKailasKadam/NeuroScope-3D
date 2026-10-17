/**
 * web/src/components/common/ErrorView.tsx
 *
 * HARD RULE 3:
 * Show specific backend error message and NO result view.
 * Never render slices, meshes, or volumes for a failed job.
 * Never show a raw stack trace.
 */

import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const ErrorView: React.FC = () => {
  const jobError = useStore((s) => s.jobError);
  const reset = useStore((s) => s.reset);

  // Clean error message: strip any raw python file path or tracebacks
  const cleanMessage = React.useMemo(() => {
    if (!jobError) return 'An unexpected error occurred during processing.';
    // If error contains traceback lines, extract the root exception message
    if (jobError.includes('Traceback')) {
      const lines = jobError.trim().split('\n');
      return lines[lines.length - 1] || 'Pipeline processing failed.';
    }
    return jobError;
  }, [jobError]);

  return (
    <div
      data-testid="error-view"
      id="error-view"
      className="flex-1 flex items-center justify-center p-6 select-none"
    >
      <div className="w-full max-w-lg glass-panel rounded-2xl p-8 border border-rose-500/30 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white tracking-tight">
            Pipeline Validation Failed
          </h3>
          <p className="text-xs text-slate-400">
            The inputs could not be processed by the model safety pipeline.
          </p>
        </div>

        {/* Clean specific backend message */}
        <div className="bg-slate-900/80 border border-rose-500/20 rounded-xl p-4 text-left">
          <div className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider mb-1">
            Reason / Diagnostic Details
          </div>
          <div
            data-testid="error-message"
            className="text-xs text-slate-200 font-mono leading-relaxed break-words"
          >
            {cleanMessage}
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-normal">
          Please verify your NIfTI sequences match in dimensions, orientation, and skull-stripped
          coverage, then try again.
        </p>

        <div className="pt-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-sky-500/20"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try Again with New Files</span>
          </button>
        </div>
      </div>
    </div>
  );
};
