/**
 * web/src/lib/format.ts
 *
 * Formatting utilities for volumetric formulas, sequence heuristics, and coordinates.
 */

import type { Affine4x4 } from './coords';
import { getVoxelSpacing, getVoxelVolumeMm3 } from './coords';

export type MRISequence = 't1' | 't1ce' | 't2' | 'flair' | 'mask';

/**
 * Heuristically guess the MRI sequence type from a filename.
 * Crucial rule: Check 't1ce' or 't1gd' BEFORE 't1' to prevent false positive match.
 */
export function guessSequenceFromFilename(filename: string): MRISequence | null {
  const lower = filename.toLowerCase();

  // Expert mask or ground truth segmentation
  if (
    lower.includes('seg') ||
    lower.includes('mask') ||
    lower.includes('label') ||
    lower.includes('truth')
  ) {
    return 'mask';
  }

  // T1-Gd / Contrast-enhanced: must check before plain T1
  if (
    lower.includes('t1ce') ||
    lower.includes('t1gd') ||
    lower.includes('t1_ce') ||
    lower.includes('t1_gd') ||
    lower.includes('t1+c') ||
    lower.includes('t1+gd') ||
    lower.includes('t1c')
  ) {
    return 't1ce';
  }

  // FLAIR
  if (lower.includes('flair') || lower.includes('t2_flair')) {
    return 'flair';
  }

  // T2-weighted
  if (lower.includes('t2') && !lower.includes('flair')) {
    return 't2';
  }

  // T1-weighted plain
  if (lower.includes('t1')) {
    return 't1';
  }

  return null;
}

/**
 * Format volume breakdown with explicit formula:
 * e.g. "15,000 voxels × (1.0 × 1.0 × 1.0 mm) = 15,000 mm³ = 15.00 mL"
 */
export function formatVolumeFormula(
  voxelCount: number,
  affine: Affine4x4
): {
  voxelsFormatted: string;
  spacingFormatted: string;
  mm3Formatted: string;
  mlFormatted: string;
  fullFormula: string;
} {
  const [dx, dy, dz] = getVoxelSpacing(affine);
  const voxelVolMm3 = getVoxelVolumeMm3(affine);
  const totalMm3 = voxelCount * voxelVolMm3;
  const totalMl = totalMm3 / 1000.0;

  const voxelsFormatted = voxelCount.toLocaleString();
  const spacingFormatted = `(${dx.toFixed(1)} × ${dy.toFixed(1)} × ${dz.toFixed(1)} mm)`;
  const mm3Formatted = `${Math.round(totalMm3).toLocaleString()} mm³`;
  const mlFormatted = `${totalMl.toFixed(2)} mL`;

  const fullFormula = `${voxelsFormatted} voxels × ${spacingFormatted} = ${mm3Formatted} = ${mlFormatted}`;

  return {
    voxelsFormatted,
    spacingFormatted,
    mm3Formatted,
    mlFormatted,
    fullFormula,
  };
}

/**
 * Format coordinates nicely: [x.x, y.y, z.z]
 */
export function formatCoordinates(coords: [number, number, number], decimals = 1): string {
  return `${coords[0].toFixed(decimals)}, ${coords[1].toFixed(decimals)}, ${coords[2].toFixed(decimals)}`;
}

/**
 * Format elapsed execution duration in human readable form (e.g. "14.2s")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}
