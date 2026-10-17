import { describe, expect, it } from 'vitest';
import {
  determinant3x3,
  getVoxelSpacing,
  getVoxelVolumeMm3,
  IDENTITY_AFFINE,
  invertAffine,
  isLeftHanded,
  voxelToWorld,
  worldToVoxel,
  worldToVoxelIndex,
  type Affine4x4,
} from './coords';

describe('Coordinate Math (coords.ts)', () => {
  it('handles identity affine correctly', () => {
    const voxel: [number, number, number] = [10, 20, 30];
    const world = voxelToWorld(voxel, IDENTITY_AFFINE);
    expect(world).toEqual([10, 20, 30]);

    const backToVoxel = worldToVoxel(world, IDENTITY_AFFINE);
    expect(backToVoxel).toEqual([10, 20, 30]);

    expect(determinant3x3(IDENTITY_AFFINE)).toBe(1);
    expect(isLeftHanded(IDENTITY_AFFINE)).toBe(false);
  });

  it('correctly transforms anisotropic scaling and translation', () => {
    // 1.5mm x 1.5mm x 3.0mm with translation [-100, -120, -50]
    const affine: Affine4x4 = [
      [1.5, 0, 0, -100],
      [0, 1.5, 0, -120],
      [0, 0, 3.0, -50],
      [0, 0, 0, 1],
    ];

    const voxel: [number, number, number] = [40, 60, 20];
    const world = voxelToWorld(voxel, affine);
    // x = 1.5*40 - 100 = -40
    // y = 1.5*60 - 120 = -30
    // z = 3.0*20 - 50 = 10
    expect(world[0]).toBeCloseTo(-40);
    expect(world[1]).toBeCloseTo(-30);
    expect(world[2]).toBeCloseTo(10);

    const backToVoxel = worldToVoxel(world, affine);
    expect(backToVoxel[0]).toBeCloseTo(40);
    expect(backToVoxel[1]).toBeCloseTo(60);
    expect(backToVoxel[2]).toBeCloseTo(20);

    const spacing = getVoxelSpacing(affine);
    expect(spacing[0]).toBeCloseTo(1.5);
    expect(spacing[1]).toBeCloseTo(1.5);
    expect(spacing[2]).toBeCloseTo(3.0);

    const voxelVol = getVoxelVolumeMm3(affine);
    expect(voxelVol).toBeCloseTo(1.5 * 1.5 * 3.0); // 6.75 mm^3
  });

  it('supports negative-determinant (left-handed / flipped) affines', () => {
    // Standard radiological LAS / sagittal-flipped affine with negative determinant
    const flippedAffine: Affine4x4 = [
      [-1.0, 0, 0, 120],
      [0, 1.0, 0, -120],
      [0, 0, 1.0, -60],
      [0, 0, 0, 1],
    ];

    expect(isLeftHanded(flippedAffine)).toBe(true);
    expect(determinant3x3(flippedAffine)).toBe(-1.0);
    expect(getVoxelVolumeMm3(flippedAffine)).toBe(1.0);

    const inv = invertAffine(flippedAffine);
    // Inverting a diagonal with [-1, 1, 1] gives [-1, 1, 1]
    expect(inv[0][0]).toBeCloseTo(-1.0);
    expect(inv[1][1]).toBeCloseTo(1.0);
    expect(inv[2][2]).toBeCloseTo(1.0);

    const testVoxel: [number, number, number] = [25, 40, 50];
    const world = voxelToWorld(testVoxel, flippedAffine);
    // x = -25 + 120 = 95
    expect(world[0]).toBeCloseTo(95);

    const recoveredVoxel = worldToVoxel(world, flippedAffine);
    expect(recoveredVoxel[0]).toBeCloseTo(25);
    expect(recoveredVoxel[1]).toBeCloseTo(40);
    expect(recoveredVoxel[2]).toBeCloseTo(50);

    const index = worldToVoxelIndex(world, flippedAffine);
    expect(index).toEqual([25, 40, 50]);
  });

  it('handles arbitrary rotation matrices and preserves Euclidean distance', () => {
    // 90 degree rotation about Z axis
    const rotAffine: Affine4x4 = [
      [0, -1, 0, 50],
      [1, 0, 0, 30],
      [0, 0, 1, 10],
      [0, 0, 0, 1],
    ];

    const v1: [number, number, number] = [10, 20, 30];
    const w1 = voxelToWorld(v1, rotAffine);
    const v1Recovered = worldToVoxel(w1, rotAffine);

    expect(v1Recovered[0]).toBeCloseTo(10);
    expect(v1Recovered[1]).toBeCloseTo(20);
    expect(v1Recovered[2]).toBeCloseTo(30);
  });
});
