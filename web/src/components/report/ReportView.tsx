/**
 * web/src/components/report/ReportView.tsx
 *
 * In-app structured report page showing:
 * - Direct link/download to the generated ReportLab PDF
 * - Volumetric findings with analytical formulas
 * - Model provenance (name, SegResNet architecture, license, input SHA-256, commit, timestamp)
 * - Transparent clinical limitations & safety disclosures
 */

import React from 'react';
import { FileText, Download, ShieldAlert, GitCommit, Hash, Cpu, ArrowLeft } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getReportUrl } from '../../api/client';
import { formatDuration } from '../../lib/format';

interface ReportViewProps {
  onBackToWorkspace: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ onBackToWorkspace }) => {
  const caseId = useStore((s) => s.caseId);
  const volumes = useStore((s) => s.volumes);
  const metrics = useStore((s) => s.metrics);
  const provenance = useStore((s) => s.provenance);

  const pdfUrl = caseId ? getReportUrl(caseId) : '#';

  return (
    <div className="flex-1 overflow-y-auto p-6 flex justify-center select-text">
      <div className="w-full max-w-4xl space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <button
            onClick={onBackToWorkspace}
            className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 border border-white/10 flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Spatial Workspace</span>
          </button>

          {caseId && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-sky-500/25 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF Report</span>
            </a>
          )}
        </div>

        {/* Title & Case Header */}
        <div className="glass-panel rounded-xl p-6 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <FileText className="w-6 h-6 text-sky-400" />
              Volumetric Analysis & Provenance Report
            </h2>
            <span className="text-xs font-mono bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded">
              RESEARCH PROTOTYPE
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Case Identifier:{' '}
            <code className="text-slate-200 font-mono bg-slate-900/80 px-1.5 py-0.5 rounded border border-white/5">
              {caseId || 'Unknown'}
            </code>
          </p>
        </div>

        {/* Estimated Volumes Summary */}
        <div className="glass-panel rounded-xl p-6 border border-white/10 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Estimated Volumes Summary
          </h3>
          <p className="text-xs text-slate-400">
            Suspected tumour regions predicted by the model. All volumes are analytical estimates
            computed directly using the native voxel spacing without assuming 1 mm isotropic grid.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                key: 'WT',
                name: 'Whole Tumour (WT)',
                badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
              },
              {
                key: 'TC',
                name: 'Tumour Core (TC)',
                badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
              },
              {
                key: 'ET',
                name: 'Enhancing Tumour (ET)',
                badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
              },
            ].map((reg) => {
              const data = volumes ? volumes[reg.key] : null;
              return (
                <div
                  key={reg.key}
                  className="bg-slate-900/70 border border-white/5 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{reg.name}</span>
                    <span
                      className={`text-[10px] font-mono px-1 py-0.5 rounded border ${reg.badge}`}
                    >
                      {reg.key}
                    </span>
                  </div>
                  <div className="text-xl font-mono font-bold text-white">
                    {data ? `${data.ml.toFixed(2)} mL` : 'N/A'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 break-words leading-tight bg-black/40 p-1.5 rounded">
                    {data?.formula || 'Formula pending calculation'}
                  </div>
                </div>
              );
            })}
          </div>

          {metrics && (
            <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
              <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                Ground Truth Mask Comparison
              </h4>
              <div className="grid grid-cols-3 gap-3 text-center text-xs font-mono">
                <div className="bg-slate-900/80 p-2 rounded border border-white/5">
                  <span className="text-slate-400 block text-[11px]">WT Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.WT?.toFixed(4) ?? 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-white/5">
                  <span className="text-slate-400 block text-[11px]">TC Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.TC?.toFixed(4) ?? 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-white/5">
                  <span className="text-slate-400 block text-[11px]">ET Dice</span>
                  <span className="text-emerald-400 font-bold">
                    {metrics.dice?.ET?.toFixed(4) ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Technical Provenance Card */}
        <div className="glass-panel rounded-xl p-6 border border-white/10 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            Model & Technical Provenance
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Model Architecture</span>
              <span className="font-semibold text-slate-200">
                MONAI SegResNet (brats_mri_segmentation)
              </span>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Software License</span>
              <span className="font-semibold text-slate-200">Apache-2.0</span>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px] flex items-center gap-1">
                <Hash className="w-3 h-3 text-sky-400" /> Input Series SHA-256
              </span>
              <span className="font-mono text-[11px] text-slate-300 break-all">
                {provenance?.sha256 || 'N/A'}
              </span>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px] flex items-center gap-1">
                <GitCommit className="w-3 h-3 text-sky-400" /> Code Commit
              </span>
              <span className="font-mono text-[11px] text-slate-300">
                {provenance?.commit || 'local'}
              </span>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Pipeline Elapsed Time</span>
              <span className="font-mono text-slate-200">
                {provenance?.elapsed_s ? formatDuration(provenance.elapsed_s) : 'N/A'}
              </span>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Execution Timestamp</span>
              <span className="font-mono text-[11px] text-slate-300">
                {provenance?.timestamp ? new Date(provenance.timestamp).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Regulatory & Limitations Disclosure */}
        <div className="glass-panel rounded-xl p-6 border border-amber-500/25 bg-amber-500/5 space-y-3 text-xs text-amber-200">
          <div className="flex items-center space-x-2 font-bold text-amber-300">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Limitations & Non-Diagnostic Disclosure</span>
          </div>

          <ul className="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
            <li>
              <strong>Skull-Stripping Requirement:</strong> The underlying SegResNet model was
              trained exclusively on skull-stripped volumes. Unstripped scans or non-brain tissue
              may lead to unpredictable segmentations.
            </li>
            <li>
              <strong>Pediatric Scans Caveat:</strong> BraTS training sets consist exclusively of
              adult glioblastomas and lower-grade gliomas; performance on pediatric brains has not
              been established.
            </li>
            <li>
              <strong>Post-Operative Cavities:</strong> Resection cavities with surrounding edema or
              blood products can cause false-positive signal intensities.
            </li>
            <li>
              <strong>Intended Use:</strong> This system is strictly an academic research and
              educational prototype. It does not constitute a diagnostic finding and must never
              replace qualified clinical judgement.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
