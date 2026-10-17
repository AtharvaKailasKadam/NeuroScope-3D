/**
 * web/src/components/viewer3d/CrosshairMarker3D.tsx
 *
 * 3D crosshair marker with anchored leader line and world mm coordinate readout.
 */

import React from 'react';
import { Html } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import { formatCoordinates } from '../../lib/format';

export const CrosshairMarker3D: React.FC = () => {
  const crosshair = useStore((s) => s.crosshairWorldMm);
  const [x, y, z] = crosshair;

  return (
    <group position={[x, y, z]}>
      {/* Central glowing sphere */}
      <mesh>
        <sphereGeometry args={[1.8, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      {/* Axis cross indicators in mm */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([-12, 0, 0, 12, 0, 0, 0, -12, 0, 0, 12, 0, 0, 0, -12, 0, 0, 12]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#38bdf8" linewidth={2} />
      </lineSegments>

      {/* Anchored leader-line badge */}
      <Html distanceFactor={140} position={[8, 8, 8]} center style={{ pointerEvents: 'none' }}>
        <div className="bg-slate-900/90 border border-sky-400/50 backdrop-blur-md px-2 py-0.5 rounded shadow-lg flex items-center space-x-1.5 whitespace-nowrap select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
          <span className="text-[10px] font-mono text-sky-200 font-semibold tracking-tight">
            [{formatCoordinates(crosshair, 1)} mm]
          </span>
        </div>
      </Html>
    </group>
  );
};
