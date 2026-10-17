/**
 * web/src/components/viewer3d/SlicePlanes.tsx
 *
 * Visualizes the 3 orthogonal slice planes (Axial, Coronal, Sagittal)
 * inside the 3D scene directly at the current shared crosshair world position.
 */

import React from 'react';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';

export const SlicePlanes: React.FC = () => {
  const crosshair = useStore((s) => s.crosshairWorldMm);
  const visible = useStore((s) => s.slicePlanesVisible);
  const volumeDims = useStore((s) => s.volumeDimensions);

  if (!visible) return null;

  const [x, y, z] = crosshair;
  // Extent size in mm based on typical brain volume (approx 220 x 220 x 180 mm)
  const sizeX = volumeDims[0] || 220;
  const sizeY = volumeDims[1] || 220;
  const sizeZ = volumeDims[2] || 180;

  return (
    <group>
      {/* 1. Axial plane (XY plane at Z) */}
      <group position={[0, 0, z]}>
        <mesh>
          <planeGeometry args={[sizeX, sizeY]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(sizeX, sizeY)]} />
          <lineBasicMaterial color="#38bdf8" transparent opacity={0.65} linewidth={1.5} />
        </lineSegments>
      </group>

      {/* 2. Coronal plane (XZ plane at Y) */}
      <group position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[sizeX, sizeZ]} />
          <meshBasicMaterial
            color="#34d399"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(sizeX, sizeZ)]} />
          <lineBasicMaterial color="#34d399" transparent opacity={0.65} linewidth={1.5} />
        </lineSegments>
      </group>

      {/* 3. Sagittal plane (YZ plane at X) */}
      <group position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[sizeZ, sizeY]} />
          <meshBasicMaterial
            color="#f43f5e"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(sizeZ, sizeY)]} />
          <lineBasicMaterial color="#f43f5e" transparent opacity={0.65} linewidth={1.5} />
        </lineSegments>
      </group>
    </group>
  );
};
