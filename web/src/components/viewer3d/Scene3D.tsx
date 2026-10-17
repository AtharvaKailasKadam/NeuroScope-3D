/**
 * web/src/components/viewer3d/Scene3D.tsx
 *
 * Core 3D spatial scene. Fills viewport edge-to-edge.
 * Features:
 * - Spatial depth cues (fog, soft key/fill lighting, 3D coordinate floor grid)
 * - OrbitControls with inertia damping
 * - GizmoViewcube orientation gizmo
 * - Snap camera buttons (Anterior, Posterior, Left, Right, Superior, Inferior)
 * - Interactive 3D mesh surface rendering & centroid badges
 * - Synchronized slice plane quads & 3D crosshair marker
 */

import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewcube, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MeshViewer } from './MeshViewer';
import { SlicePlanes } from './SlicePlanes';
import { CrosshairMarker3D } from './CrosshairMarker3D';
import { useStore } from '../../store/useStore';
import { Crosshair, Compass } from 'lucide-react';

export const Scene3D: React.FC = () => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const crosshair = useStore((s) => s.crosshairWorldMm);

  const snapTo = (pos: [number, number, number], up: [number, number, number] = [0, 0, 1]) => {
    if (!controlsRef.current) return;
    const camera = controlsRef.current.object;
    camera.position.set(...pos);
    camera.up.set(...up);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const centerOnCrosshair = () => {
    if (!controlsRef.current) return;
    controlsRef.current.target.set(...crosshair);
    controlsRef.current.update();
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#090d16] via-[#060911] to-[#030509]">
      <Canvas
        camera={{ position: [180, -230, 150], fov: 42, near: 1, far: 2500, up: [0, 0, 1] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        shadows
      >
        <color attach="background" args={['#090d16']} />
        <fog attach="fog" args={['#090d16', 350, 1300]} />

        {/* Soft clinical-lab lighting */}
        <ambientLight intensity={0.65} />
        <directionalLight position={[250, -200, 350]} intensity={1.1} castShadow />
        <directionalLight position={[-200, 250, -120]} intensity={0.35} color="#60a5fa" />
        <directionalLight position={[0, -320, 0]} intensity={0.45} color="#38bdf8" />

        {/* 3D Coordinate floor grid */}
        <Grid
          position={[0, 0, -90]}
          args={[400, 400]}
          cellSize={20}
          cellThickness={0.6}
          cellColor="#1e293b"
          sectionSize={100}
          sectionThickness={1.2}
          sectionColor="#334155"
          fadeDistance={450}
          fadeStrength={1.5}
        />

        {/* 3D Visual elements */}
        <MeshViewer />
        <SlicePlanes />
        <CrosshairMarker3D />

        {/* Camera interaction */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={25}
          maxDistance={950}
        />

        {/* Orientation Cube Gizmo */}
        <GizmoHelper alignment="bottom-right" margin={[75, 75]}>
          <GizmoViewcube
            faces={[
              'Right (R)',
              'Left (L)',
              'Anterior (A)',
              'Posterior (P)',
              'Superior (S)',
              'Inferior (I)',
            ]}
            opacity={0.9}
            color="#0f172a"
            strokeColor="#334155"
            textColor="#f8fafc"
          />
        </GizmoHelper>
      </Canvas>

      {/* Floating Snap & Alignment Controls */}
      <div className="absolute top-4 left-4 flex flex-col space-y-2 z-10 select-none">
        <div className="bg-slate-900/85 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-glass flex items-center space-x-1">
          <span className="text-[10px] font-mono uppercase text-slate-400 px-2 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-400" /> Snap:
          </span>
          <button
            onClick={() => snapTo([0, -320, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Anterior (Front)"
          >
            Ant (A)
          </button>
          <button
            onClick={() => snapTo([0, 320, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Posterior (Back)"
          >
            Post (P)
          </button>
          <button
            onClick={() => snapTo([-320, 0, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Left (L)"
          >
            Left (L)
          </button>
          <button
            onClick={() => snapTo([320, 0, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Right (R)"
          >
            Right (R)
          </button>
          <button
            onClick={() => snapTo([0, 0, 320], [0, 1, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Superior (Top)"
          >
            Sup (S)
          </button>
          <button
            onClick={() => snapTo([0, 0, -320], [0, -1, 0])}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-sky-500/30 text-slate-300 hover:text-sky-200 border border-white/5 transition-all"
            title="Inferior (Bottom)"
          >
            Inf (I)
          </button>
        </div>

        <button
          onClick={centerOnCrosshair}
          className="self-start bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-glass text-[11px] text-slate-300 hover:text-white flex items-center space-x-2 transition-all hover:border-sky-400/40"
          title="Center 3D camera target on current crosshair"
        >
          <Crosshair className="w-3.5 h-3.5 text-sky-400" />
          <span>Jump to Crosshair</span>
        </button>
      </div>
    </div>
  );
};
