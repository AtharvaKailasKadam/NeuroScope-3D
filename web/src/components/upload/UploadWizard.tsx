/**
 * web/src/components/upload/UploadWizard.tsx
 *
 * Drag-and-drop upload screen for four required NIfTI sequences:
 * T1, T1Gd (T1ce), T2, FLAIR, plus an optional 5th expert mask slot.
 * Automatically classifies sequences from filename heuristics and allows manual override.
 * Displays explicit 24-hour retention notice.
 */

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCheck,
  AlertCircle,
  Clock,
  Trash2,
  ArrowRight,
  Sparkles,
  X,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { guessSequenceFromFilename, type MRISequence } from '../../lib/format';
import { uploadFiles, startPrediction } from '../../api/client';
import { loadSampleBraTSCase } from '../../lib/sampleCase';

interface SequenceSlot {
  key: MRISequence;
  label: string;
  description: string;
  required: boolean;
  color: string;
}

const SLOTS: SequenceSlot[] = [
  {
    key: 't1ce',
    label: 'T1Gd / T1ce',
    description: 'Contrast-enhanced T1 (required for tumour core)',
    required: true,
    color: 'border-cyan-500/40 text-cyan-400',
  },
  {
    key: 't1',
    label: 'T1-weighted',
    description: 'Anatomical reference scan',
    required: true,
    color: 'border-blue-500/40 text-blue-400',
  },
  {
    key: 't2',
    label: 'T2-weighted',
    description: 'Fluid sensitive scan',
    required: true,
    color: 'border-emerald-500/40 text-emerald-400',
  },
  {
    key: 'flair',
    label: 'FLAIR',
    description: 'T2 Fluid-Attenuated Inversion Recovery',
    required: true,
    color: 'border-amber-500/40 text-amber-400',
  },
  {
    key: 'mask',
    label: 'Expert Mask',
    description: 'Ground truth segmentation (optional comparison)',
    required: false,
    color: 'border-purple-500/40 text-purple-400',
  },
];

export const UploadWizard: React.FC = () => {
  const setJobStatus = useStore((s) => s.setJobStatus);
  const setCaseId = useStore((s) => s.setCaseId);
  const caseId = useStore((s) => s.caseId);
  const isUploadOpen = useStore((s) => s.isUploadOpen);
  const setIsUploadOpen = useStore((s) => s.setIsUploadOpen);
  const setUploadedFiles = useStore((s) => s.setUploadedFiles);
  const setFileUrls = useStore((s) => s.setFileUrls);
  const setVolumeAffine = useStore((s) => s.setVolumeAffine);
  const setCrosshairWorldMm = useStore((s) => s.setCrosshairWorldMm);
  const setMeshes = useStore((s) => s.setMeshes);
  const setResults = useStore((s) => s.setResults);

  const [filesMap, setFilesMap] = useState<Record<MRISequence, File | null>>({
    t1: null,
    t1ce: null,
    t2: null,
    flair: null,
    mask: null,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (fileList: FileList | File[]) => {
    setErrorMsg(null);
    const updated = { ...filesMap };

    Array.from(fileList).forEach((file) => {
      // Validate file extension
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.nii') && !lowerName.endsWith('.nii.gz')) {
        setErrorMsg(
          `File "${file.name}" rejected: Only .nii and .nii.gz NIfTI files are accepted.`
        );
        return;
      }

      // Check client-side 1GB size limit
      if (file.size > 1024 * 1024 * 1024) {
        setErrorMsg(`File "${file.name}" exceeds the 1 GB size limit.`);
        return;
      }

      // Auto-detect sequence
      const guessed = guessSequenceFromFilename(file.name);
      if (guessed) {
        updated[guessed] = file;
      } else {
        // Find first empty required slot
        const emptySlot = SLOTS.find((s) => !updated[s.key]);
        if (emptySlot) {
          updated[emptySlot.key] = file;
        }
      }
    });

    setFilesMap(updated);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleRemove = (key: MRISequence) => {
    setFilesMap((prev) => ({ ...prev, [key]: null }));
  };

  const handleSlotFileChange = (key: MRISequence, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 1024 * 1024 * 1024) {
        setErrorMsg(`File "${file.name}" exceeds the 1 GB limit.`);
        return;
      }
      setFilesMap((prev) => ({ ...prev, [key]: file }));
    }
  };

  const requiredSlotsFilled = filesMap.t1 && filesMap.t1ce && filesMap.t2 && filesMap.flair;

  const handleSubmit = async () => {
    if (!requiredSlotsFilled) {
      setErrorMsg(
        'Please upload all 4 required sequences (T1, T1Gd, T2, FLAIR) before submitting.'
      );
      return;
    }

    try {
      setErrorMsg(null);
      setJobStatus('uploading');

      // Save local file blobs for immediate 2D viewer background loading
      const localUrls = {
        t1: URL.createObjectURL(filesMap.t1!),
        t1ce: URL.createObjectURL(filesMap.t1ce!),
        t2: URL.createObjectURL(filesMap.t2!),
        flair: URL.createObjectURL(filesMap.flair!),
        mask: filesMap.mask ? URL.createObjectURL(filesMap.mask) : null,
      };

      setUploadedFiles(filesMap);
      setFileUrls(localUrls);

      // Upload to backend
      const uploadRes = await uploadFiles({
        t1: filesMap.t1!,
        t1ce: filesMap.t1ce!,
        t2: filesMap.t2!,
        flair: filesMap.flair!,
        mask: filesMap.mask,
      });

      setCaseId(uploadRes.case_id);

      // Trigger segmentation pipeline
      await startPrediction(uploadRes.case_id);
      setJobStatus('running');
    } catch (err: any) {
      setJobStatus('error', err.message || 'Upload failed');
    }
  };

  const handleLoadDemo = () => {
    const sample = loadSampleBraTSCase();
    setCaseId(sample.caseId);
    setVolumeAffine(sample.affine, sample.volumeDimensions);
    setCrosshairWorldMm(sample.crosshairWorldMm);
    setMeshes(sample.meshes);
    setResults({
      volumes: sample.volumes,
      provenance: sample.provenance,
      metrics: sample.metrics,
    });
    setJobStatus('done');
    setIsUploadOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-4xl space-y-6 relative">
        {/* Close Button if workspace is ready */}
        {(isUploadOpen || caseId) && (
          <button
            onClick={() => setIsUploadOpen(false)}
            className="absolute top-0 right-0 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Return to 3D Spatial Workspace"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Title */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">Upload MRI Sequences</h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Select or drag-and-drop the 4 standard BraTS multiparametric NIfTI scans. Sequences are
            automatically mapped from filenames and verified.
          </p>
        </div>

        {/* Retention Note */}
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Uploads are deleted automatically within 24 hours.</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Max 1 GB per file · NIfTI (.nii/.nii.gz)
          </span>
        </div>

        {/* Global Error Banner if any */}
        {errorMsg && (
          <div className="bg-rose-500/15 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-sky-400 bg-sky-500/10 scale-[1.005]'
              : 'border-slate-700 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".nii,.gz"
            className="hidden"
            onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
          />
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-sky-400 mb-3 border border-white/5">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-200">
            Drag & drop all sequence files here, or{' '}
            <span className="text-sky-400 underline underline-offset-2">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports multi-file selection (.nii and .nii.gz)
          </p>
        </div>

        {/* Sequence Slots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SLOTS.map((slot) => {
            const file = filesMap[slot.key];
            return (
              <div
                key={slot.key}
                className={`glass-panel rounded-lg p-3.5 flex flex-col justify-between border ${
                  file ? slot.color : 'border-slate-800/80 bg-slate-900/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wide flex items-center gap-1.5">
                      {slot.label}
                      {slot.required ? (
                        <span className="text-[10px] text-amber-400 font-normal">*required</span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-normal">optional</span>
                      )}
                    </span>
                    {file && <FileCheck className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                    {slot.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-xs">
                  {file ? (
                    <div className="flex items-center justify-between w-full">
                      <span
                        className="font-mono text-[11px] truncate text-slate-300 max-w-[180px]"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(slot.key);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full text-center py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 cursor-pointer text-[11px] transition-colors">
                      Select file
                      <input
                        type="file"
                        accept=".nii,.gz"
                        className="hidden"
                        onChange={(e) => handleSlotFileChange(slot.key, e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleLoadDemo}
            type="button"
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-sky-500/20 to-purple-500/20 hover:from-sky-500/30 hover:to-purple-500/30 text-sky-200 border border-sky-400/40 shadow-glass flex items-center space-x-2 transition-all hover:scale-[1.01]"
          >
            <Sparkles className="w-4 h-4 text-sky-300" />
            <span>Load Demo Spatial Case</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={!requiredSlotsFilled}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all ${
              requiredSlotsFilled
                ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
            }`}
          >
            <span>Proceed to Segmentation</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
