/**
 * web/src/components/viewer2d/MultiPlanarView.tsx
 *
 * Container rendering the three orthogonal anatomical 2D slices:
 * Axial, Coronal, and Sagittal with radiological orientation markers.
 */

import React from 'react';
import { SliceViewer2D } from './SliceViewer2D';

export const MultiPlanarView: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 w-full h-full p-2">
      {/* 1. Axial (Horizontal) */}
      <SliceViewer2D
        plane="axial"
        title="Axial (Transverse)"
        labels={{ top: 'A (Anterior)', bottom: 'P (Posterior)', left: 'R', right: 'L' }}
      />

      {/* 2. Coronal (Frontal) */}
      <SliceViewer2D
        plane="coronal"
        title="Coronal"
        labels={{ top: 'S (Superior)', bottom: 'I (Inferior)', left: 'R', right: 'L' }}
      />

      {/* 3. Sagittal (Profile) */}
      <SliceViewer2D
        plane="sagittal"
        title="Sagittal"
        labels={{
          top: 'S (Superior)',
          bottom: 'I (Inferior)',
          left: 'A (Anterior)',
          right: 'P (Posterior)',
        }}
      />
    </div>
  );
};
