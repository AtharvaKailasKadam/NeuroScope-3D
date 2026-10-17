/**
 * web/src/components/workspace/ResultsWorkspace.tsx
 *
 * True Spatial UI Workspace:
 * - Edge-to-edge 3D Three.js canvas fills 100% of the screen
 * - Floating glassmorphic HUD controls (Region/Layer toggles, Coordinate readout, Volume formulas)
 * - 2D Orthogonal Slices float as a glass viewport dock directly over the 3D space
 * - Smooth mode switching (Spatial Hybrid, 3D Full, 2D Slices)
 */

import React, { useState } from 'react';
import { Scene3D } from '../viewer3d/Scene3D';
import { MultiPlanarView } from '../viewer2d/MultiPlanarView';
import { RegionTogglePanel } from '../panels/RegionTogglePanel';
import { ReadoutPanel } from '../panels/ReadoutPanel';
import { VolumePanel } from '../panels/VolumePanel';
import { ReportView } from '../report/ReportView';
import { useStore } from '../../store/useStore';
import { FileText, Download, ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { getReportUrl } from '../../api/client';

export const ResultsWorkspace: React.FC = () => {
  const viewMode = useStore((s) => s.viewMode);
  const caseId = useStore((s) => s.caseId);
  const [showReport, setShowReport] = useState(false);
  const [slicesMinimized, setSlicesMinimized] = useState(false);

  if (showReport) {
    return <ReportView onBackToWorkspace={() => setShowReport(false)} />;
  }

  const pdfUrl = caseId ? getReportUrl(caseId) : '#';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090d16] select-none">
      {/* 1. Full Edge-to-Edge 3D Scene Canvas */}
      {viewMode !== 'slices-only' && (
        <div className="absolute inset-0 w-full h-full z-0">
          <Scene3D />
        </div>
      )}

      {/* 2. Slices-Only Fullscreen Mode */}
      {viewMode === 'slices-only' && (
        <div className="absolute inset-0 w-full h-full p-3 z-10 bg-[#090d16]">
          <MultiPlanarView />
        </div>
      )}

      {/* 3. Floating Synchronized 2D Slices Dock (Spatial View) */}
      {viewMode === 'spatial' && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 w-[95%] max-w-5xl glass-panel rounded-2xl border border-white/15 shadow-glass overflow-hidden ${
            slicesMinimized ? 'h-9' : 'h-64'
          }`}
        >
          <div
            onClick={() => setSlicesMinimized(!slicesMinimized)}
            className="h-9 px-4 flex items-center justify-between glass-panel-header cursor-pointer hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Linked 2D Orthogonal Slices</span>
              <span className="text-[10px] text-sky-300 font-mono bg-sky-500/20 px-1.5 py-0.5 rounded border border-sky-400/30">
                World RAS mm
              </span>
            </div>
            <button className="text-slate-400 hover:text-white p-1">
              {slicesMinimized ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          {!slicesMinimized && (
            <div className="h-[calc(100%-2.25rem)] p-2 bg-slate-950/80">
              <MultiPlanarView />
            </div>
          )}
        </div>
      )}

      {/* 4. Floating Glass HUD Panels (Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col space-y-3 pointer-events-auto">
        <RegionTogglePanel />
        <VolumePanel />
      </div>

      {/* 5. Floating Coordinate Readout Panel (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
        <ReadoutPanel />
      </div>

      {/* 6. Action Bar for Report & Export (Bottom-Right) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center space-x-2 pointer-events-auto">
        <button
          onClick={() => setShowReport(true)}
          className="px-3.5 py-2 rounded-xl glass-panel hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-white/15 shadow-glass flex items-center space-x-1.5 transition-all hover:text-white hover:scale-[1.02]"
        >
          <FileText className="w-4 h-4 text-sky-400" />
          <span>In-App Report</span>
        </button>

        {caseId && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-sky-500/80 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-500/25 flex items-center space-x-1.5 transition-all hover:scale-[1.02]"
          >
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </a>
        )}
      </div>
    </div>
  );
};
