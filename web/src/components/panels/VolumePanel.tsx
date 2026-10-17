/**
 * web/src/components/panels/VolumePanel.tsx
 *
 * Floating glass panel showing the analytical volumetric calculations.
 * Labels each volume as "estimated volume" and prints the exact mathematical formula:
 * Voxels × Spacing = mm³ = mL
 */

import React, { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { formatVolumeFormula } from '../../lib/format';

interface RegionDisplay {
  key: string;
  label: string;
  colorClass: string;
  dotColor: string;
}

const REGION_META: RegionDisplay[] = [
  { key: 'WT', label: 'Whole Tumour', colorClass: 'text-amber-300', dotColor: 'bg-amber-400' },
  { key: 'TC', label: 'Tumour Core', colorClass: 'text-pink-300', dotColor: 'bg-pink-400' },
  { key: 'ET', label: 'Enhancing Tumour', colorClass: 'text-cyan-300', dotColor: 'bg-cyan-400' },
];

export const VolumePanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const volumes = useStore((s) => s.volumes);
  const affine = useStore((s) => s.affine);
  const metrics = useStore((s) => s.metrics);

  return (
    <div
      data-testid="volume-panel"
      className="glass-panel rounded-xl overflow-hidden shadow-glass border border-white/10 w-80 select-none"
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="glass-panel-header px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
          <Calculator className="w-3.5 h-3.5 text-sky-400" />
          <span>Estimated Volumes</span>
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
        <div className="p-3.5 space-y-3.5 text-xs">
          <div className="text-[11px] text-slate-400 leading-tight flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Analytical formula:{' '}
              <code className="text-sky-300 font-mono text-[10px]">N × |det(affine)| / 1000</code>
            </span>
          </div>

          {/* Region Volume Cards */}
          <div className="space-y-2.5">
            {REGION_META.map((meta) => {
              const data = volumes ? volumes[meta.key] : null;
              const voxelCount = data ? data.voxels : 0;
              const formulaInfo = formatVolumeFormula(voxelCount, affine);

              return (
                <div
                  key={meta.key}
                  className="bg-slate-900/70 border border-white/5 rounded-lg p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                      <span className="font-semibold text-slate-200">{meta.label}</span>
                    </div>
                    <span className={`font-mono font-bold text-sm ${meta.colorClass}`}>
                      {data ? `${data.ml.toFixed(2)} mL` : formulaInfo.mlFormatted}
                    </span>
                  </div>

                  {/* Formula Breakdown */}
                  <div className="font-mono text-[10px] text-slate-400 bg-black/40 px-2 py-1 rounded border border-white/5 leading-relaxed break-words">
                    {data?.formula || formulaInfo.fullFormula}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Optional Mask Agreement Metrics */}
          {metrics && (
            <div className="pt-2 border-t border-white/5 space-y-1.5">
              <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider block">
                Expert Mask Agreement
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
                <div className="bg-slate-900/70 p-1.5 rounded border border-white/5">
                  <span className="text-slate-500 block">WT Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.WT?.toFixed(3) ?? 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-900/70 p-1.5 rounded border border-white/5">
                  <span className="text-slate-500 block">TC Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.TC?.toFixed(3) ?? 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-900/70 p-1.5 rounded border border-white/5">
                  <span className="text-slate-500 block">ET Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.ET?.toFixed(3) ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-500 text-center italic">
            Suspected tumour regions predicted by the model.
          </div>
        </div>
      )}
    </div>
  );
};
