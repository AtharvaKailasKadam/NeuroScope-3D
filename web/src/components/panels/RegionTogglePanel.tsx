/**
 * web/src/components/panels/RegionTogglePanel.tsx
 *
 * Floating glass panel for toggling region visibility, adjusting layer opacity,
 * and switching slice plane guides. Uses colour-blind-safe palette.
 */

import React, { useState } from 'react';
import { Layers, Eye, EyeOff, Sliders, ChevronDown, ChevronUp, Grid, Flame } from 'lucide-react';
import { useStore, type RegionVisibility, type RegionOpacity } from '../../store/useStore';

interface RegionConfig {
  key: keyof RegionVisibility;
  label: string;
  code: string;
  colorHex: string;
  badgeClass: string;
}

const REGIONS: RegionConfig[] = [
  {
    key: 'WT',
    label: 'Whole Tumour',
    code: 'Labels 1, 2, 4',
    colorHex: '#f59e0b',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  {
    key: 'TC',
    label: 'Tumour Core',
    code: 'Labels 1, 4',
    colorHex: '#ec4899',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  },
  {
    key: 'ET',
    label: 'Enhancing Tumour',
    code: 'Label 4',
    colorHex: '#06b6d4',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  {
    key: 'brain',
    label: 'Brain Surface',
    code: 'Parenchyma',
    colorHex: '#3b82f6',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
];

export const RegionTogglePanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const regionVisibility = useStore((s) => s.regionVisibility);
  const regionOpacity = useStore((s) => s.regionOpacity);
  const slicePlanesVisible = useStore((s) => s.slicePlanesVisible);
  const uncertaintyOverlayVisible = useStore((s) => s.uncertaintyOverlayVisible);
  const setRegionVisibility = useStore((s) => s.setRegionVisibility);
  const setRegionOpacity = useStore((s) => s.setRegionOpacity);
  const setSlicePlanesVisible = useStore((s) => s.setSlicePlanesVisible);
  const setUncertaintyOverlayVisible = useStore((s) => s.setUncertaintyOverlayVisible);

  return (
    <div className="glass-panel rounded-xl overflow-hidden shadow-glass border border-white/10 w-72 select-none">
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="glass-panel-header px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span>Regions & Layers</span>
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
        <div className="p-3 space-y-3.5 text-xs">
          {/* Slice Planes Toggle */}
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-sky-400" />
              <span>3D Slice Planes</span>
            </span>
            <button
              onClick={() => setSlicePlanesVisible(!slicePlanesVisible)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                slicePlanesVisible
                  ? 'bg-sky-500/25 text-sky-300 border border-sky-400/30'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {slicePlanesVisible ? 'SHOWN' : 'HIDDEN'}
            </button>
          </div>

          {/* Uncertainty Overlay Toggle */}
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Uncertainty Map (TTA)</span>
            </span>
            <button
              onClick={() => setUncertaintyOverlayVisible(!uncertaintyOverlayVisible)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                uncertaintyOverlayVisible
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/30'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {uncertaintyOverlayVisible ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* Region List */}
          <div className="space-y-3">
            {REGIONS.map((region) => {
              const isVisible = regionVisibility[region.key];
              const opacity = regionOpacity[region.key as keyof RegionOpacity] ?? 0.8;

              return (
                <div key={region.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setRegionVisibility(region.key, !isVisible)}
                        className={`p-1 rounded transition-colors ${
                          isVisible
                            ? 'text-white hover:text-sky-300'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={isVisible ? 'Hide region' : 'Show region'}
                      >
                        {isVisible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <div className="flex items-center space-x-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: region.colorHex }}
                        />
                        <span
                          className={`font-medium ${isVisible ? 'text-slate-200' : 'text-slate-500'}`}
                        >
                          {region.label}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-1 py-0.5 rounded border ${region.badgeClass}`}
                    >
                      {region.code}
                    </span>
                  </div>

                  {/* Opacity slider */}
                  {isVisible && region.key in regionOpacity && (
                    <div className="flex items-center space-x-2 pl-6">
                      <Sliders className="w-3 h-3 text-slate-500 shrink-0" />
                      <input
                        type="range"
                        min="0.05"
                        max="1.0"
                        step="0.05"
                        value={opacity}
                        onChange={(e) =>
                          setRegionOpacity(
                            region.key as keyof RegionOpacity,
                            parseFloat(e.target.value)
                          )
                        }
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                        title={`Opacity: ${(opacity * 100).toFixed(0)}%`}
                      />
                      <span className="text-[10px] font-mono text-slate-400 w-7 text-right">
                        {(opacity * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
