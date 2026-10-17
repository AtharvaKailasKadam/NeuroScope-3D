/**
 * web/src/lib/coords.ts
 *
 * Coordinate conversion between World Space (RAS mm) and Voxel Space (i, j, k).
 * Handles arbitrary 4x4 NIfTI affines, including anisotropic spacing and
 * negative-determinant (left-handed / radiological) transforms.
 */

export type Point3D = [number, number, number];
export type Affine4x4 = number[][]; // 4 rows, 4 columns: [row][col]

/**
 * Standard identity 4x4 matrix
 */
export const IDENTITY_AFFINE: Affine4x4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/**
 * Calculate determinant of the 3x3 upper-left spatial submatrix.
 */
export function determinant3x3(affine: Affine4x4): number {
  const a = affine[0][0],
    b = affine[0][1],
    c = affine[0][2];
  const d = affine[1][0],
    e = affine[1][1],
    f = affine[1][2];
  const g = affine[2][0],
    h = affine[2][1],
    i = affine[2][2];

  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Check if the affine has a negative determinant (left-handed coordinate system).
 */
export function isLeftHanded(affine: Affine4x4): boolean {
  return determinant3x3(affine) < 0;
}

/**
 * Invert a 4x4 affine matrix of the form:
 * [ M  T ]
 * [ 0  1 ]
 *
 * Inverse is:
 * [ M^-1  -M^-1 * T ]
 * [ 0          1    ]
 */
export function invertAffine(affine: Affine4x4): Affine4x4 {
  const a = affine[0][0],
    b = affine[0][1],
    c = affine[0][2];
  const d = affine[1][0],
    e = affine[1][1],
    f = affine[1][2];
  const g = affine[2][0],
    h = affine[2][1],
    i = affine[2][2];

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-9) {
    throw new Error('Singular affine matrix cannot be inverted.');
  }

  const invDet = 1.0 / det;

  // Adjugate matrix elements for 3x3 inverse
  const m00 = (e * i - f * h) * invDet;
  const m01 = (c * h - b * i) * invDet;
  const m02 = (b * f - c * e) * invDet;

  const m10 = (f * g - d * i) * invDet;
  const m11 = (a * i - c * g) * invDet;
  const m12 = (c * d - a * f) * invDet;

  const m20 = (d * h - e * g) * invDet;
  const m21 = (b * g - a * h) * invDet;
  const m22 = (a * e - b * d) * invDet;

  // Translation vector
  const tx = affine[0][3];
  const ty = affine[1][3];
  const tz = affine[2][3];

  // -M^-1 * T
  const itx = -(m00 * tx + m01 * ty + m02 * tz);
  const ity = -(m10 * tx + m11 * ty + m12 * tz);
  const itz = -(m20 * tx + m21 * ty + m22 * tz);

  return [
    [m00, m01, m02, itx],
    [m10, m11, m12, ity],
    [m20, m21, m22, itz],
    [0, 0, 0, 1],
  ];
}

/**
 * Transform a voxel coordinate [i, j, k] to world mm [x, y, z] using affine.
 * World = Affine * [i, j, k, 1]^T
 */
export function voxelToWorld(voxel: Point3D, affine: Affine4x4): Point3D {
  const [i, j, k] = voxel;
  const x = affine[0][0] * i + affine[0][1] * j + affine[0][2] * k + affine[0][3];
  const y = affine[1][0] * i + affine[1][1] * j + affine[1][2] * k + affine[1][3];
  const z = affine[2][0] * i + affine[2][1] * j + affine[2][2] * k + affine[2][3];
  return [x, y, z];
}

/**
 * Transform world mm [x, y, z] to continuous voxel coordinate [i, j, k].
 * Voxel = Affine^-1 * [x, y, z, 1]^T
 */
export function worldToVoxel(world: Point3D, affine: Affine4x4): Point3D {
  const inv = invertAffine(affine);
  const [x, y, z] = world;
  const i = inv[0][0] * x + inv[0][1] * y + inv[0][2] * z + inv[0][3];
  const j = inv[1][0] * x + inv[1][1] * y + inv[1][2] * z + inv[1][3];
  const k = inv[2][0] * x + inv[2][1] * y + inv[2][2] * z + inv[2][3];
  return [i, j, k];
}

/**
 * Transform world mm [x, y, z] to integer voxel index [i, j, k] (rounded).
 */
export function worldToVoxelIndex(world: Point3D, affine: Affine4x4): Point3D {
  const [i, j, k] = worldToVoxel(world, affine);
  return [Math.round(i), Math.round(j), Math.round(k)];
}

/**
 * Extract physical voxel spacing (voxel dimensions in mm) from the column norms of the affine.
 */
export function getVoxelSpacing(affine: Affine4x4): Point3D {
  const dx = Math.sqrt(affine[0][0] ** 2 + affine[1][0] ** 2 + affine[2][0] ** 2);
  const dy = Math.sqrt(affine[0][1] ** 2 + affine[1][1] ** 2 + affine[2][1] ** 2);
  const dz = Math.sqrt(affine[0][2] ** 2 + affine[1][2] ** 2 + affine[2][2] ** 2);
  return [dx, dy, dz];
}

/**
 * Compute the voxel volume in mm^3: |det(affine[:3, :3])|
 */
export function getVoxelVolumeMm3(affine: Affine4x4): number {
  return Math.abs(determinant3x3(affine));
}
