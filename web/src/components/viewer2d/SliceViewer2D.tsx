/**
 * web/src/components/viewer2d/SliceViewer2D.tsx
 *
 * Dedicated NiiVue 2D slice viewer for a single anatomical plane (Axial, Coronal, or Sagittal).
 * Renders the structural MRI scan with predicted segmentation overlay.
 * Binds mouse interactions directly to the single source of truth crosshair store in World RAS mm.
 */

import React, { useEffect, useRef } from 'react';
import { Niivue } from '@niivue/niivue';
import { useStore } from '../../store/useStore';
import type { Affine4x4 } from '../../lib/coords';

export type SlicePlane = 'axial' | 'coronal' | 'sagittal';

interface SliceViewer2DProps {
  plane: SlicePlane;
  title: string;
  labels: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
}

export const SliceViewer2D: React.FC<SliceViewer2DProps> = ({ plane, title, labels }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);

  const crosshairWorldMm = useStore((s) => s.crosshairWorldMm);
  const setCrosshairWorldMm = useStore((s) => s.setCrosshairWorldMm);
  const setVolumeAffine = useStore((s) => s.setVolumeAffine);
  const fileUrls = useStore((s) => s.fileUrls);

  // Determine plane slice type code in NiiVue
  const getSliceType = (p: SlicePlane): number => {
    switch (p) {
      case 'axial':
        return 0; // axial
      case 'coronal':
        return 1; // coronal
      case 'sagittal':
        return 2; // sagittal
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const nv = new Niivue({
      backColor: [0.035, 0.05, 0.08, 1.0],
      show3Dcrosshair: true,
      crosshairColor: [0.22, 0.74, 0.97, 0.85],
      crosshairWidth: 1.5,
      isColorbar: false,
      textHeight: 0.03,
    });

    nv.attachToCanvas(canvasRef.current);
    nv.setSliceType(getSliceType(plane));
    nvRef.current = nv;

    // Listen to user click/drag inside this NiiVue canvas
    nv.onLocationChange = (data: any) => {
      if (data && data.mm && Array.isArray(data.mm) && data.mm.length >= 3) {
        const [x, y, z] = data.mm;
        // Avoid infinite feedback loops by checking if changed
        const current = useStore.getState().crosshairWorldMm;
        if (
          Math.abs(current[0] - x) > 0.05 ||
          Math.abs(current[1] - y) > 0.05 ||
          Math.abs(current[2] - z) > 0.05
        ) {
          setCrosshairWorldMm([x, y, z]);
        }
      }
    };

    // Load available volumes
    const loadData = async () => {
      const volumeList: any[] = [];

      // Primary anatomical background: preference FLAIR -> T1ce -> T1 -> T2
      const bgUrl = fileUrls.flair || fileUrls.t1ce || fileUrls.t1 || fileUrls.t2;
      if (bgUrl) {
        volumeList.push({
          url: bgUrl,
          colormap: 'gray',
          opacity: 1.0,
        });
      }

      // Predicted segmentation mask overlay
      if (fileUrls.segmentation) {
        volumeList.push({
          url: fileUrls.segmentation,
          colormap: 'warm',
          opacity: 0.65,
        });
      }

      if (volumeList.length > 0) {
        try {
          await nv.loadVolumes(volumeList);

          // Extract real 4x4 affine and volume dimensions from the loaded volume
          if (nv.volumes && nv.volumes.length > 0 && nv.volumes[0].hdr) {
            const hdr = nv.volumes[0].hdr;
            if (hdr.affine && Array.isArray(hdr.affine)) {
              // Convert flat 16-array or 4x4 array to Affine4x4
              let affine4x4: Affine4x4;
              if (hdr.affine.length === 16) {
                const a = hdr.affine;
                affine4x4 = [
                  [a[0], a[1], a[2], a[3]],
                  [a[4], a[5], a[6], a[7]],
                  [a[8], a[9], a[10], a[11]],
                  [a[12], a[13], a[14], a[15]],
                ];
              } else {
                affine4x4 = hdr.affine;
              }

              const dims: [number, number, number] = [
                hdr.dims ? hdr.dims[1] : 240,
                hdr.dims ? hdr.dims[2] : 240,
                hdr.dims ? hdr.dims[3] : 155,
              ];
              setVolumeAffine(affine4x4, dims);
            }
          }
        } catch (e) {
          console.warn(`[NiiVue ${plane}] Volume load notice:`, e);
        }
      }
    };

    loadData();

    return () => {
      // Clean up NiiVue instance on unmount
      if (nvRef.current) {
        nvRef.current = null;
      }
    };
  }, [
    plane,
    fileUrls.flair,
    fileUrls.t1ce,
    fileUrls.t1,
    fileUrls.t2,
    fileUrls.segmentation,
    setCrosshairWorldMm,
    setVolumeAffine,
  ]);

  // Sync incoming crosshair position changes to NiiVue canvas
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes || nv.volumes.length === 0) return;

    try {
      // Set slice position in mm if available
      if (typeof nv.setSliceMM === 'function') {
        const [x, y, z] = crosshairWorldMm;
        switch (plane) {
          case 'axial':
            nv.setSliceMM(z);
            break;
          case 'coronal':
            nv.setSliceMM(y);
            break;
          case 'sagittal':
            nv.setSliceMM(x);
            break;
        }
      }
      nv.drawScene();
    } catch {
      // fallback
    }
  }, [crosshairWorldMm, plane]);

  return (
    <div
      data-testid={`slice-panel-${plane}`}
      className="relative w-full h-full flex flex-col glass-panel rounded-xl overflow-hidden border border-white/10 shadow-lg group select-none"
    >
      {/* Top Header Bar */}
      <div className="h-6 px-2.5 flex items-center justify-between glass-panel-header text-[11px] font-semibold tracking-wider text-slate-300">
        <span>{title}</span>
        <span className="text-[10px] text-slate-500 font-mono">2D Orthogonal</span>
      </div>

      {/* Canvas Viewport */}
      <div className="relative flex-1 bg-black/90 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid={`niivue-canvas-${plane}`}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Anatomical Direction Orientation Labels */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-sky-400/80 bg-slate-900/60 px-1 rounded pointer-events-none">
          {labels.top}
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-sky-400/80 bg-slate-900/60 px-1 rounded pointer-events-none">
          {labels.bottom}
        </div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-sky-400/80 bg-slate-900/60 px-1 rounded pointer-events-none">
          {labels.left}
        </div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-sky-400/80 bg-slate-900/60 px-1 rounded pointer-events-none">
          {labels.right}
        </div>
      </div>
    </div>
  );
};
