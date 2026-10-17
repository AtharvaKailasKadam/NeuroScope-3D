/**
 * web/src/components/panels/ReadoutPanel.tsx
 *
 * Floating glass panel showing synchronized coordinate readouts:
 * World Space (RAS mm) and Voxel Space (i, j, k integer and continuous).
 * Coordinates are editable directly to navigate the workspace.
 */

import React, { useState } from 'react';
import { Crosshair, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore, useCrosshairVoxel } from '../../store/useStore';
import { formatCoordinates } from '../../lib/format';

export const ReadoutPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const crosshairWorldMm = useStore((s) => s.crosshairWorldMm);
  const setCrosshairWorldMm = useStore((s) => s.setCrosshairWorldMm);
  const setCrosshairFromVoxel = useStore((s) => s.setCrosshairFromVoxel);
  const { index: voxelIndex, continuous: voxelCont } = useCrosshairVoxel();

  const handleWorldChange = (axisIdx: number, valStr: string) => {
    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      const next: [number, number, number] = [...crosshairWorldMm];
      next[axisIdx] = val;
      setCrosshairWorldMm(next);
    }
  };

  const handleVoxelChange = (axisIdx: number, valStr: string) => {
    const val = parseInt(valStr, 10);
    if (!isNaN(val)) {
      const next: [number, number, number] = [...voxelIndex];
      next[axisIdx] = val;
      setCrosshairFromVoxel(next);
    }
  };

  return (
    <div
      data-testid="readout-panel"
      className="glass-panel rounded-xl overflow-hidden shadow-glass border border-white/10 w-72 select-none"
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="glass-panel-header px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
          <Crosshair className="w-3.5 h-3.5 text-sky-400" />
          <span>Coordinate Readout</span>
        </div>
        <button className="text-slate-400 hover:text-white">
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 text-xs">
          {/* World Coordinates (RAS mm) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-sky-300 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-sky-400" /> World Space (RAS mm)
              </span>
              <span className="font-mono text-[10px] text-slate-500">Source of Truth</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono">
              {(['X (R/L)', 'Y (A/P)', 'Z (I/S)'] as const).map((label, idx) => (
                <div key={label} className="bg-slate-900/80 p-1.5 rounded border border-white/5">
                  <span className="text-[9px] text-slate-500 block uppercase">{label}</span>
                  <input
                    type="number"
                    step="0.5"
                    value={crosshairWorldMm[idx].toFixed(1)}
                    onChange={(e) => handleWorldChange(idx, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-bold text-xs focus:outline-none focus:text-sky-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Voxel Indices (i, j, k) */}
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Voxel Indices (i, j, k)</span>
              <span className="font-mono text-[10px] text-slate-500">Derived from Affine</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono">
              {(['i (Col)', 'j (Row)', 'k (Slice)'] as const).map((label, idx) => (
                <div key={label} className="bg-slate-900/80 p-1.5 rounded border border-white/5">
                  <span className="text-[9px] text-slate-500 block uppercase">{label}</span>
                  <input
                    type="number"
                    step="1"
                    value={voxelIndex[idx]}
                    onChange={(e) => handleVoxelChange(idx, e.target.value)}
                    className="w-full bg-transparent text-slate-200 font-bold text-xs focus:outline-none focus:text-sky-300"
                  />
                </div>
              ))}
            </div>

            <div className="text-[10px] text-slate-500 font-mono text-right">
              Continuous: ({formatCoordinates(voxelCont, 2)})
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
