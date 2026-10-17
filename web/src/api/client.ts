/**
 * web/src/api/client.ts
 *
 * Typed client for all NeuroScope-3D FastAPI backend endpoints.
 * All requests are sent to the local backend proxy (/api).
 */

import type { MeshData, RegionVolumeData } from '../store/useStore';

export interface HealthResponse {
  status: string;
  disclaimer: string;
  model: string;
  licence: string;
  device: 'cuda' | 'cpu';
}

export interface UploadResponse {
  case_id: string;
  files: Record<string, string>;
  message: string;
  disclaimer: string;
}

export interface PredictStartResponse {
  case_id: string;
  status: 'running' | 'done';
  poll_url?: string;
}

export interface PollResultRunning {
  case_id: string;
  status: 'running';
}

export interface PollResultDone {
  case_id: string;
  status: 'done';
  result: {
    prediction_path: string;
    sha256: string;
    commit: string;
    elapsed_s: number;
    from_cache: boolean;
    volumes: Record<string, RegionVolumeData>;
    mask_comparison?: {
      dice: { WT: number; TC: number; ET: number };
      sensitivity: { WT: number; TC: number; ET: number };
      hd95: { WT: number; TC: number; ET: number };
    };
  };
  disclaimer: string;
}

export interface PollResultError {
  case_id: string;
  status: 'error';
  error: string;
  result: null;
  disclaimer: string;
}

export type PollResultResponse = PollResultRunning | PollResultDone | PollResultError;

export interface MeshesResponse {
  meshes: Record<string, MeshData>;
  disclaimer: string;
}

const API_BASE = '/api';

/**
 * Check backend health & pre-loaded model status
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch('/health');
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return res.json();
}

/**
 * Upload the 4 required MRI sequence files and optional expert mask.
 */
export async function uploadFiles(files: {
  t1: File;
  t1ce: File;
  t2: File;
  flair: File;
  mask?: File | null;
}): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('t1', files.t1);
  formData.append('t1ce', files.t1ce);
  formData.append('t2', files.t2);
  formData.append('flair', files.flair);
  if (files.mask) {
    formData.append('mask', files.mask);
  }

  const res = await fetch(`${API_BASE}/upload/`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let errorMsg = `Upload failed with status ${res.status}`;
    try {
      const err = await res.json();
      if (err.detail) errorMsg = err.detail;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Trigger background segmentation pipeline for an uploaded case_id.
 */
export async function startPrediction(caseId: string): Promise<PredictStartResponse> {
  const res = await fetch(`${API_BASE}/predict/${encodeURIComponent(caseId)}`, {
    method: 'POST',
  });

  if (!res.ok) {
    let errorMsg = `Prediction trigger failed with status ${res.status}`;
    try {
      const err = await res.json();
      if (err.detail) errorMsg = err.detail;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Poll job status and fetch results summary.
 */
export async function getResult(caseId: string): Promise<PollResultResponse> {
  const res = await fetch(`${API_BASE}/results/${encodeURIComponent(caseId)}`);

  if (res.status === 422) {
    // Pipeline error with safe message
    const data = await res.json();
    return data as PollResultError;
  }

  if (!res.ok) {
    let errorMsg = `Failed to get results for case ${caseId}`;
    try {
      const err = await res.json();
      if (err.detail) errorMsg = err.detail;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Get direct download URL for predicted segmentation NIfTI.
 */
export function getSegmentationUrl(caseId: string): string {
  return `${API_BASE}/results/${encodeURIComponent(caseId)}/segmentation`;
}

/**
 * Fetch 3D meshes (WT, TC, ET) with vertices in world mm coordinates.
 */
export async function getMeshes(caseId: string): Promise<MeshesResponse> {
  const res = await fetch(`${API_BASE}/results/${encodeURIComponent(caseId)}/meshes`);
  if (!res.ok) {
    let errorMsg = `Failed to fetch 3D meshes (status ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) errorMsg = err.detail;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

/**
 * Get direct download URL for generated PDF report.
 */
export function getReportUrl(caseId: string): string {
  return `${API_BASE}/results/${encodeURIComponent(caseId)}/report`;
}
