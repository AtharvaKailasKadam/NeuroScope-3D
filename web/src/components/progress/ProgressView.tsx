/**
 * web/src/components/progress/ProgressView.tsx
 *
 * Staged progress view polled from the backend job status endpoint.
 * Shows elapsed time, active stage indicator, and transitions safely into results or error.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Cpu, Layers, FileSpreadsheet, Box } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { getResult, getMeshes, getSegmentationUrl } from '../../api/client';
import { formatDuration } from '../../lib/format';

interface Stage {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: Stage[] = [
  {
    id: 'validate',
    name: 'Input Validation',
    description: 'Checking dimensions, affines, sequences & header integrity',
    icon: CheckCircle2,
  },
  {
    id: 'sanity',
    name: 'Brain Coverage Sanity Check',
    description: 'Assessing brain tissue volume and skull-stripping status',
    icon: Cpu,
  },
  {
    id: 'infer',
    name: 'SegResNet 3D Inference',
    description: 'Sliding window inference with MONAI BraTS bundle',
    icon: Layers,
  },
  {
    id: 'meshes',
    name: 'Extracting 3D Surface Meshes',
    description: 'Marching cubes surface extraction in world mm',
    icon: Box,
  },
  {
    id: 'report',
    name: 'Volumetric Report Generation',
    description: 'Calculating analytical volumes & generating PDF report',
    icon: FileSpreadsheet,
  },
];

export const ProgressView: React.FC = () => {
  const caseId = useStore((s) => s.caseId);
  const setJobStatus = useStore((s) => s.setJobStatus);
  const setResults = useStore((s) => s.setResults);
  const setMeshes = useStore((s) => s.setMeshes);
  const setFileUrls = useStore((s) => s.setFileUrls);
  const setElapsedSeconds = useStore((s) => s.setElapsedSeconds);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        setElapsedSeconds(next);
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [setElapsedSeconds]);

  // Determine artificial stage progression based on elapsed time until backend reports done
  const getActiveStageIndex = (timeSec: number): number => {
    if (timeSec < 3) return 0; // validate
    if (timeSec < 6) return 1; // sanity
    if (timeSec < 20) return 2; // infer
    if (timeSec < 28) return 3; // meshes
    return 4; // report
  };

  const activeIndex = getActiveStageIndex(elapsed);

  // Poll backend
  useEffect(() => {
    if (!caseId) return;

    let isMounted = true;
    let pollTimeout: any = null;

    const poll = async () => {
      try {
        const res = await getResult(caseId);

        if (!isMounted) return;

        if (res.status === 'error') {
          setJobStatus('error', res.error || 'Segmentation pipeline encountered an error.');
          return;
        }

        if (res.status === 'done') {
          // Fetch meshes concurrently
          try {
            const meshesData = await getMeshes(caseId);
            setMeshes(meshesData.meshes);
          } catch (meshErr) {
            console.warn('Mesh fetch warning:', meshErr);
          }

          // Point segmentation URL to backend endpoint
          setFileUrls({ segmentation: getSegmentationUrl(caseId) });

          // Populate results
          setResults({
            volumes: res.result.volumes,
            provenance: {
              sha256: res.result.sha256,
              commit: res.result.commit,
              modelName: 'MONAI SegResNet (BraTS)',
              version: '1.0.0',
              licence: 'Apache-2.0',
              timestamp: new Date().toISOString(),
              elapsed_s: res.result.elapsed_s,
              from_cache: res.result.from_cache,
            },
            metrics: res.result.mask_comparison,
          });

          setJobStatus('done');
          return;
        }

        // Keep polling every 1.5 seconds if still running
        pollTimeout = setTimeout(poll, 1500);
      } catch (err: any) {
        if (!isMounted) return;
        pollTimeout = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [caseId, setJobStatus, setResults, setMeshes, setFileUrls]);

  return (
    <div className="flex-1 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-xl glass-panel rounded-2xl p-8 space-y-8 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
              Segmentation in Progress
            </h3>
            <p className="text-xs text-slate-400">
              Processing 3D multi-parametric MRI volume on local model
            </p>
          </div>
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-white/10 text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              Elapsed
            </div>
            <div className="text-sm font-mono font-bold text-sky-300">
              {formatDuration(elapsed)}
            </div>
          </div>
        </div>

        {/* Staged checklist */}
        <div className="space-y-4">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div
                key={stage.id}
                className={`flex items-start space-x-3.5 p-3 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-sky-500/10 border border-sky-400/30 shadow-inner'
                    : isCompleted
                      ? 'opacity-85'
                      : 'opacity-40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCurrent ? (
                    <div className="w-5 h-5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center text-[10px] text-slate-500">
                      {idx + 1}
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${isCurrent ? 'text-sky-300' : 'text-slate-200'}`}
                    >
                      {stage.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider animate-pulse">
                        Processing...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                    {stage.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Safety Footer note */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Case ID: <code className="text-slate-400 font-mono">{caseId?.slice(0, 12)}...</code>
          </span>
          <span>GPU fp16 sliding window (batch size 1)</span>
        </div>
      </div>
    </div>
  );
};
