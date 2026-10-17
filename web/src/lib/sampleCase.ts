/**
 * web/src/lib/sampleCase.ts
 *
 * Generates high-fidelity 3D geometric meshes for instant spatial exploration:
 * - Brain anatomical silhouette
 * - WT (Whole Tumour)
 * - TC (Tumour Core)
 * - ET (Enhancing Tumour)
 * All coordinates in World RAS mm matching realistic adult BraTS MRI dimensions.
 */

import type { MeshData, RegionVolumeData, ProvenanceData } from '../store/useStore';
import type { Affine4x4 } from './coords';

interface SphereOptions {
  center: [number, number, number];
  radii: [number, number, number];
  latSegments?: number;
  lonSegments?: number;
  noiseScale?: number;
  noiseAmp?: number;
}

function generateEllipsoidMesh(opts: SphereOptions): {
  vertices: number[][];
  faces: number[][];
  normals: number[][];
} {
  const { center, radii, latSegments = 24, lonSegments = 32, noiseAmp = 0 } = opts;
  const vertices: number[][] = [];
  const normals: number[][] = [];
  const faces: number[][] = [];

  for (let lat = 0; lat <= latSegments; lat++) {
    const theta = (lat * Math.PI) / latSegments;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonSegments; lon++) {
      const phi = (lon * 2 * Math.PI) / lonSegments;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      // Normal sphere coordinates
      const nx = cosPhi * sinTheta;
      const ny = sinPhi * sinTheta;
      const nz = cosTheta;

      // Subtle organic deformation
      const wobble =
        1.0 +
        (noiseAmp > 0
          ? Math.sin(nx * 4 + ny * 3) * 0.08 * noiseAmp + Math.cos(nz * 5) * 0.06 * noiseAmp
          : 0);

      const vx = center[0] + nx * radii[0] * wobble;
      const vy = center[1] + ny * radii[1] * wobble;
      const vz = center[2] + nz * radii[2] * wobble;

      vertices.push([vx, vy, vz]);
      normals.push([nx, ny, nz]);
    }
  }

  const stride = lonSegments + 1;
  for (let lat = 0; lat < latSegments; lat++) {
    for (let lon = 0; lon < lonSegments; lon++) {
      const first = lat * stride + lon;
      const second = first + stride;

      faces.push([first, second, first + 1]);
      faces.push([second, second + 1, first + 1]);
    }
  }

  return { vertices, faces, normals };
}

export function loadSampleBraTSCase(): {
  caseId: string;
  affine: Affine4x4;
  volumeDimensions: [number, number, number];
  crosshairWorldMm: [number, number, number];
  meshes: Record<string, MeshData>;
  volumes: Record<string, RegionVolumeData>;
  provenance: ProvenanceData;
  metrics: {
    dice: { WT: number; TC: number; ET: number };
    sensitivity: { WT: number; TC: number; ET: number };
    hd95: { WT: number; TC: number; ET: number };
  };
} {
  // Standard 1mm isotropic affine with origin centered in brain
  const affine: Affine4x4 = [
    [1, 0, 0, -120],
    [0, 1, 0, -120],
    [0, 0, 1, -78],
    [0, 0, 0, 1],
  ];

  // 1. Brain surface mesh
  const brainMesh = generateEllipsoidMesh({
    center: [0, 8, 12],
    radii: [68, 86, 64],
    latSegments: 28,
    lonSegments: 36,
    noiseAmp: 0.6,
  });

  // 2. Whole Tumour (WT) in left parietal-temporal region
  const tumourCenter: [number, number, number] = [-28, 18, 26];
  const wtMesh = generateEllipsoidMesh({
    center: tumourCenter,
    radii: [24, 21, 19],
    latSegments: 20,
    lonSegments: 26,
    noiseAmp: 0.8,
  });

  // 3. Tumour Core (TC)
  const tcMesh = generateEllipsoidMesh({
    center: [-27, 19, 27],
    radii: [17, 15, 14],
    latSegments: 18,
    lonSegments: 24,
    noiseAmp: 0.5,
  });

  // 4. Enhancing Tumour (ET)
  const etMesh = generateEllipsoidMesh({
    center: [-26, 20, 28],
    radii: [12, 10, 9],
    latSegments: 16,
    lonSegments: 20,
    noiseAmp: 0.3,
  });

  const meshes: Record<string, MeshData> = {
    brain: {
      ...brainMesh,
      colour: '#3b82f6',
      label: 'Brain Surface',
      empty: false,
    },
    WT: {
      ...wtMesh,
      colour: '#f59e0b',
      label: 'Whole Tumour',
      empty: false,
    },
    TC: {
      ...tcMesh,
      colour: '#ec4899',
      label: 'Tumour Core',
      empty: false,
    },
    ET: {
      ...etMesh,
      colour: '#06b6d4',
      label: 'Enhancing Tumour',
      empty: false,
    },
  };

  const volumes: Record<string, RegionVolumeData> = {
    WT: {
      voxels: 19840,
      ml: 19.84,
      formula: '19,840 voxels × (1.0 × 1.0 × 1.0 mm) = 19,840 mm³ = 19.84 mL',
    },
    TC: {
      voxels: 8250,
      ml: 8.25,
      formula: '8,250 voxels × (1.0 × 1.0 × 1.0 mm) = 8,250 mm³ = 8.25 mL',
    },
    ET: {
      voxels: 3120,
      ml: 3.12,
      formula: '3,120 voxels × (1.0 × 1.0 × 1.0 mm) = 3,120 mm³ = 3.12 mL',
    },
  };

  const provenance: ProvenanceData = {
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    commit: '675022a',
    modelName: 'MONAI SegResNet (brats_mri_segmentation)',
    version: '1.0.0',
    licence: 'Apache-2.0',
    timestamp: new Date().toISOString(),
    elapsed_s: 14.8,
    from_cache: false,
  };

  const metrics = {
    dice: { WT: 0.912, TC: 0.884, ET: 0.846 },
    sensitivity: { WT: 0.925, TC: 0.891, ET: 0.858 },
    hd95: { WT: 4.8, TC: 5.2, ET: 3.9 },
  };

  return {
    caseId: 'BraTS2021_00482_demo',
    affine,
    volumeDimensions: [240, 240, 155],
    crosshairWorldMm: tumourCenter,
    meshes,
    volumes,
    provenance,
    metrics,
  };
}
