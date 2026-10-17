import { describe, expect, it } from 'vitest';
import type { Affine4x4 } from './coords';
import { formatVolumeFormula, guessSequenceFromFilename } from './format';

describe('Formatting & Heuristics (format.ts)', () => {
  it('guesses sequence types with strict T1ce precedence over T1', () => {
    expect(guessSequenceFromFilename('BraTS2021_00001_t1ce.nii.gz')).toBe('t1ce');
    expect(guessSequenceFromFilename('sub-01_ses-01_T1Gd.nii.gz')).toBe('t1ce');
    expect(guessSequenceFromFilename('patient_t1_ce.nii')).toBe('t1ce');
    expect(guessSequenceFromFilename('case_t1+c.nii.gz')).toBe('t1ce');

    expect(guessSequenceFromFilename('BraTS2021_00001_t1.nii.gz')).toBe('t1');
    expect(guessSequenceFromFilename('sub-01_ses-01_T1w.nii.gz')).toBe('t1');

    expect(guessSequenceFromFilename('BraTS2021_00001_t2.nii.gz')).toBe('t2');
    expect(guessSequenceFromFilename('BraTS2021_00001_flair.nii.gz')).toBe('flair');
    expect(guessSequenceFromFilename('scan_t2_flair.nii.gz')).toBe('flair');

    expect(guessSequenceFromFilename('BraTS2021_00001_seg.nii.gz')).toBe('mask');
    expect(guessSequenceFromFilename('expert_mask.nii')).toBe('mask');
  });

  it('formats volume calculation with exact formula and spacing', () => {
    // 1.0 x 1.0 x 3.0 mm spacing
    const affine: Affine4x4 = [
      [1.0, 0, 0, 0],
      [0, 1.0, 0, 0],
      [0, 0, 3.0, 0],
      [0, 0, 0, 1],
    ];

    const res = formatVolumeFormula(15000, affine);
    expect(res.voxelsFormatted).toBe('15,000');
    expect(res.spacingFormatted).toBe('(1.0 × 1.0 × 3.0 mm)');
    expect(res.mm3Formatted).toBe('45,000 mm³');
    expect(res.mlFormatted).toBe('45.00 mL');
    expect(res.fullFormula).toBe('15,000 voxels × (1.0 × 1.0 × 3.0 mm) = 45,000 mm³ = 45.00 mL');
  });

  it('formats isotropic 1mm voxels correctly', () => {
    const affine: Affine4x4 = [
      [1.0, 0, 0, 0],
      [0, 1.0, 0, 0],
      [0, 0, 1.0, 0],
      [0, 0, 0, 1],
    ];

    const res = formatVolumeFormula(8250, affine);
    expect(res.voxelsFormatted).toBe('8,250');
    expect(res.spacingFormatted).toBe('(1.0 × 1.0 × 1.0 mm)');
    expect(res.mm3Formatted).toBe('8,250 mm³');
    expect(res.mlFormatted).toBe('8.25 mL');
  });
});
