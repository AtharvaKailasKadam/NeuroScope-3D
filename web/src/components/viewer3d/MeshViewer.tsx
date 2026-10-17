/**
 * web/src/components/viewer3d/MeshViewer.tsx
 *
 * Renders 3D surface meshes (WT, TC, ET, brain) in world mm space.
 * Features:
 * - Direct click-to-crosshair in 3D space
 * - Centroid-anchored 3D badges that follow mesh centers and scale/fade with distance
 * - Depth-aware translucent shading
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useStore, type MeshData } from '../../store/useStore';
import type { ThreeEvent } from '@react-three/fiber';

interface MeshItemProps {
  regionKey: string;
  data: MeshData;
  opacity: number;
  visible: boolean;
  onMeshClick: (worldPoint: [number, number, number]) => void;
}

const MeshItem: React.FC<MeshItemProps> = ({ regionKey, data, opacity, visible, onMeshClick }) => {
  const geometry = useMemo(() => {
    if (!data.vertices || data.vertices.length === 0 || !data.faces || data.faces.length === 0) {
      return null;
    }

    const geom = new THREE.BufferGeometry();

    // Flatten vertices
    const positions = new Float32Array(data.vertices.length * 3);
    for (let i = 0; i < data.vertices.length; i++) {
      positions[i * 3] = data.vertices[i][0];
      positions[i * 3 + 1] = data.vertices[i][1];
      positions[i * 3 + 2] = data.vertices[i][2];
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Flatten faces
    const indices = new Uint32Array(data.faces.length * 3);
    for (let i = 0; i < data.faces.length; i++) {
      indices[i * 3] = data.faces[i][0];
      indices[i * 3 + 1] = data.faces[i][1];
      indices[i * 3 + 2] = data.faces[i][2];
    }
    geom.setIndex(new THREE.BufferAttribute(indices, 1));

    // Normals
    if (data.normals && data.normals.length === data.vertices.length) {
      const normals = new Float32Array(data.normals.length * 3);
      for (let i = 0; i < data.normals.length; i++) {
        normals[i * 3] = data.normals[i][0];
        normals[i * 3 + 1] = data.normals[i][1];
        normals[i * 3 + 2] = data.normals[i][2];
      }
      geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
      geom.computeVertexNormals();
    }

    geom.computeBoundingSphere();
    return geom;
  }, [data]);

  // Compute 3D centroid of this mesh
  const centroid = useMemo<[number, number, number] | null>(() => {
    if (!data.vertices || data.vertices.length === 0) return null;
    let sx = 0,
      sy = 0,
      sz = 0;
    const step = Math.max(1, Math.floor(data.vertices.length / 500));
    let count = 0;
    for (let i = 0; i < data.vertices.length; i += step) {
      sx += data.vertices[i][0];
      sy += data.vertices[i][1];
      sz += data.vertices[i][2];
      count++;
    }
    return [sx / count, sy / count, sz / count];
  }, [data.vertices]);

  if (!geometry || !visible) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onMeshClick([e.point.x, e.point.y, e.point.z]);
  };

  const isBrain = regionKey === 'brain';

  return (
    <group>
      <mesh geometry={geometry} onClick={handleClick} castShadow={!isBrain} receiveShadow>
        <meshStandardMaterial
          color={data.colour}
          transparent
          opacity={opacity}
          roughness={isBrain ? 0.6 : 0.25}
          metalness={isBrain ? 0.05 : 0.15}
          side={THREE.DoubleSide}
          depthWrite={opacity > 0.8}
          wireframe={isBrain && opacity < 0.25}
        />
      </mesh>

      {/* Centroid-anchored 3D badge for sub-tumour regions */}
      {!isBrain && centroid && (
        <group position={[centroid[0], centroid[1], centroid[2] + 12]}>
          <Html distanceFactor={160} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/15 shadow-glass whitespace-nowrap select-none transition-opacity duration-300">
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: data.colour }}
              />
              <span className="text-[10px] font-semibold text-slate-200 tracking-tight">
                {data.label}
              </span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
};

export const MeshViewer: React.FC = () => {
  const meshes = useStore((s) => s.meshes);
  const regionVisibility = useStore((s) => s.regionVisibility);
  const regionOpacity = useStore((s) => s.regionOpacity);
  const setCrosshairWorldMm = useStore((s) => s.setCrosshairWorldMm);

  if (!meshes) return null;

  return (
    <group>
      {Object.entries(meshes).map(([key, data]) => {
        const isVisible = regionVisibility[key as keyof typeof regionVisibility] ?? true;
        const opacity = regionOpacity[key as keyof typeof regionOpacity] ?? 0.8;

        return (
          <MeshItem
            key={key}
            regionKey={key}
            data={data}
            visible={isVisible}
            opacity={opacity}
            onMeshClick={setCrosshairWorldMm}
          />
        );
      })}
    </group>
  );
};
