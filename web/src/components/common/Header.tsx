import React from 'react';
import { Activity, RotateCcw, Layers, Box, Eye, UploadCloud } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const Header: React.FC = () => {
  const caseId = useStore((s) => s.caseId);
  const jobStatus = useStore((s) => s.jobStatus);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const setIsUploadOpen = useStore((s) => s.setIsUploadOpen);
  const reset = useStore((s) => s.reset);

  return (
    <header className="h-14 border-b border-white/10 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between select-none shrink-0 z-40">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              NeuroScope-3D
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                Spatial UI v1.0
              </span>
            </h1>
          </div>
        </div>

        {caseId && (
          <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-white/10 text-xs text-slate-400">
            <span>Case:</span>
            <code className="text-sky-300 font-mono text-[11px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-white/5">
              {caseId}
            </code>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-lg border border-white/10">
        <button
          onClick={() => setViewMode('spatial')}
          className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition-all ${
            viewMode === 'spatial'
              ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="Spatial UI (Edge-to-edge 3D + linked slices)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Spatial View</span>
        </button>
        <button
          onClick={() => setViewMode('3d-only')}
          className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition-all ${
            viewMode === '3d-only'
              ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="3D Scene Only"
        >
          <Box className="w-3.5 h-3.5" />
          <span>3D Full</span>
        </button>
        <button
          onClick={() => setViewMode('slices-only')}
          className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition-all ${
            viewMode === 'slices-only'
              ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="Multi-planar 2D Slices"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>2D Slices</span>
        </button>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={() => setIsUploadOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 transition-colors flex items-center space-x-1.5"
          title="Upload new patient NIfTI series"
        >
          <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
          <span>Upload Scans</span>
        </button>

        {jobStatus === 'done' && (
          <button
            onClick={reset}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-white/5 transition-colors flex items-center space-x-1"
            title="Reset workspace"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
