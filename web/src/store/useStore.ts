/**
 * web/src/store/useStore.ts
 *
 * Single source of truth for NeuroScope-3D Spatial UI using Zustand.
 * Coordinates are stored strictly in World Space (RAS mm).
 * Voxel indices are derived on-demand via the volume's affine matrix.
 */

import { create } from 'zustand';
import type { Affine4x4, Point3D } from '../lib/coords';
import { worldToVoxel } from '../lib/coords';
import { loadSampleBraTSCase } from '../lib/sampleCase';

export type JobStatus = 'idle' | 'uploading' | 'running' | 'done' | 'error';
export type ViewMode = 'spatial' | 'slices-only' | '3d-only';

export interface RegionVisibility {
  WT: boolean;
  TC: boolean;
  ET: boolean;
  brain: boolean;
  expertMask: boolean;
}

export interface RegionOpacity {
  WT: number;
  TC: number;
  ET: number;
  brain: number;
}

export interface RegionVolumeData {
  voxels: number;
  ml: number;
  formula: string;
}

export interface ProvenanceData {
  sha256: string;
  commit: string;
  modelName: string;
  version: string;
  licence: string;
  timestamp: string;
  elapsed_s: number;
  from_cache: boolean;
}

export interface MeshData {
  vertices: number[][]; // [x, y, z] in world mm
  faces: number[][]; // [v0, v1, v2]
  normals: number[][]; // [nx, ny, nz]
  colour: string;
  label: string;
  empty: boolean;
}

export interface AppState {
  // Session & Job status
  caseId: string | null;
  jobStatus: JobStatus;
  jobError: string | null;
  elapsedSeconds: number;
  isUploadOpen: boolean;

  // Uploaded files and local object URLs
  uploadedFiles: {
    t1: File | null;
    t1ce: File | null;
    t2: File | null;
    flair: File | null;
    mask: File | null;
  };
  fileUrls: {
    t1: string | null;
    t1ce: string | null;
    t2: string | null;
    flair: string | null;
    mask: string | null;
    segmentation: string | null;
  };

  // Spatial alignment & dimensions
  affine: Affine4x4;
  volumeDimensions: [number, number, number]; // [nx, ny, nz]

  // Single Source of Truth: Crosshair in RAS world mm
  crosshairWorldMm: Point3D;

  // Display settings
  regionVisibility: RegionVisibility;
  regionOpacity: RegionOpacity;
  viewMode: ViewMode;
  slicePlanesVisible: boolean;
  agreementOverlayVisible: boolean;
  uncertaintyOverlayVisible: boolean;

  // Results & Meshes
  volumes: Record<string, RegionVolumeData> | null;
  metrics: {
    dice?: { WT: number; TC: number; ET: number };
    sensitivity?: { WT: number; TC: number; ET: number };
    hd95?: { WT: number; TC: number; ET: number };
  } | null;
  provenance: ProvenanceData | null;
  meshes: Record<string, MeshData> | null;

  // Actions
  setCrosshairWorldMm: (world: Point3D) => void;
  setCrosshairFromVoxel: (voxel: Point3D) => void;
  setRegionVisibility: (region: keyof RegionVisibility, visible: boolean) => void;
  setRegionOpacity: (region: keyof RegionOpacity, opacity: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSlicePlanesVisible: (visible: boolean) => void;
  setAgreementOverlayVisible: (visible: boolean) => void;
  setUncertaintyOverlayVisible: (visible: boolean) => void;
  setVolumeAffine: (affine: Affine4x4, dimensions?: [number, number, number]) => void;
  setCaseId: (id: string | null) => void;
  setJobStatus: (status: JobStatus, error?: string | null) => void;
  setIsUploadOpen: (open: boolean) => void;
  setElapsedSeconds: (seconds: number) => void;
  setUploadedFiles: (files: Partial<AppState['uploadedFiles']>) => void;
  setFileUrls: (urls: Partial<AppState['fileUrls']>) => void;
  setResults: (data: {
    volumes: Record<string, RegionVolumeData>;
    provenance: ProvenanceData;
    metrics?: AppState['metrics'];
  }) => void;
  setMeshes: (meshes: Record<string, MeshData>) => void;
  reset: () => void;
}

const initialRegionVisibility: RegionVisibility = {
  WT: true,
  TC: true,
  ET: true,
  brain: true,
  expertMask: false,
};

const initialRegionOpacity: RegionOpacity = {
  WT: 0.55,
  TC: 0.75,
  ET: 0.9,
  brain: 0.18,
};

// Initialize with sample BraTS case so 3D Spatial UI is alive and interactive immediately on load
const initialSample = loadSampleBraTSCase();

export const useStore = create<AppState>((set, get) => ({
  caseId: initialSample.caseId,
  jobStatus: 'done',
  jobError: null,
  elapsedSeconds: 0,
  isUploadOpen: false,

  uploadedFiles: {
    t1: null,
    t1ce: null,
    t2: null,
    flair: null,
    mask: null,
  },
  fileUrls: {
    t1: null,
    t1ce: null,
    t2: null,
    flair: null,
    mask: null,
    segmentation: null,
  },

  affine: initialSample.affine,
  volumeDimensions: initialSample.volumeDimensions,
  crosshairWorldMm: initialSample.crosshairWorldMm,

  regionVisibility: initialRegionVisibility,
  regionOpacity: initialRegionOpacity,
  viewMode: 'spatial',
  slicePlanesVisible: true,
  agreementOverlayVisible: false,
  uncertaintyOverlayVisible: false,

  volumes: initialSample.volumes,
  metrics: initialSample.metrics,
  provenance: initialSample.provenance,
  meshes: initialSample.meshes,

  setCrosshairWorldMm: (crosshairWorldMm) => set({ crosshairWorldMm }),

  setCrosshairFromVoxel: (voxel) => {
    const { affine } = get();
    // Voxel to world: world = affine * [i, j, k, 1]^T
    const [i, j, k] = voxel;
    const x = affine[0][0] * i + affine[0][1] * j + affine[0][2] * k + affine[0][3];
    const y = affine[1][0] * i + affine[1][1] * j + affine[1][2] * k + affine[1][3];
    const z = affine[2][0] * i + affine[2][1] * j + affine[2][2] * k + affine[2][3];
    set({ crosshairWorldMm: [x, y, z] });
  },

  setRegionVisibility: (region, visible) =>
    set((state) => ({
      regionVisibility: { ...state.regionVisibility, [region]: visible },
    })),

  setRegionOpacity: (region, opacity) =>
    set((state) => ({
      regionOpacity: { ...state.regionOpacity, [region]: opacity },
    })),

  setViewMode: (viewMode) => set({ viewMode }),
  setSlicePlanesVisible: (slicePlanesVisible) => set({ slicePlanesVisible }),
  setAgreementOverlayVisible: (agreementOverlayVisible) => set({ agreementOverlayVisible }),
  setUncertaintyOverlayVisible: (uncertaintyOverlayVisible) => set({ uncertaintyOverlayVisible }),

  setVolumeAffine: (affine, dimensions) =>
    set((state) => ({
      affine,
      volumeDimensions: dimensions || state.volumeDimensions,
    })),

  setCaseId: (caseId) => set({ caseId }),
  setJobStatus: (jobStatus, jobError = null) => set({ jobStatus, jobError }),
  setIsUploadOpen: (isUploadOpen) => set({ isUploadOpen }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),

  setUploadedFiles: (files) =>
    set((state) => ({
      uploadedFiles: { ...state.uploadedFiles, ...files },
    })),

  setFileUrls: (urls) =>
    set((state) => ({
      fileUrls: { ...state.fileUrls, ...urls },
    })),

  setResults: ({ volumes, provenance, metrics }) =>
    set({
      volumes,
      provenance,
      metrics: metrics || null,
      jobStatus: 'done',
    }),

  setMeshes: (meshes) => set({ meshes }),

  reset: () =>
    set({
      isUploadOpen: true,
      jobStatus: 'idle',
      jobError: null,
      elapsedSeconds: 0,
      uploadedFiles: { t1: null, t1ce: null, t2: null, flair: null, mask: null },
      fileUrls: { t1: null, t1ce: null, t2: null, flair: null, mask: null, segmentation: null },
      volumes: null,
      metrics: null,
      provenance: null,
      meshes: null,
      crosshairWorldMm: [0, 0, 0],
    }),
}));

/**
 * Selector hook: Computes continuous voxel coordinate and integer voxel index
 * from the single source of truth (crosshairWorldMm) and current affine.
 */
export function useCrosshairVoxel(): { continuous: Point3D; index: Point3D } {
  const crosshairWorldMm = useStore((s) => s.crosshairWorldMm);
  const affine = useStore((s) => s.affine);

  const [i, j, k] = worldToVoxel(crosshairWorldMm, affine);
  return {
    continuous: [i, j, k],
    index: [Math.round(i), Math.round(j), Math.round(k)],
  };
}
