/**
 * web/src/App.tsx
 *
 * Root Application Component.
 * Implements true Spatial UI architecture:
 * - The 3D spatial workspace is the permanent foundation of the entire interface.
 * - Upload wizard, Progress monitoring, and Error reports float as translucent spatial modals
 *   directly over the active 3D environment.
 * - Hard Rule 1: Non-bypassable DisclaimerBanner present on every route and modal state.
 */

import React from 'react';
import { RootLayout } from './components/common/RootLayout';
import { UploadWizard } from './components/upload/UploadWizard';
import { ProgressView } from './components/progress/ProgressView';
import { ResultsWorkspace } from './components/workspace/ResultsWorkspace';
import { ErrorView } from './components/common/ErrorView';
import { useStore } from './store/useStore';

export const App: React.FC = () => {
  const jobStatus = useStore((s) => s.jobStatus);
  const isUploadOpen = useStore((s) => s.isUploadOpen);

  return (
    <RootLayout>
      {/* 1. Permanent Core Spatial Workspace (3D Scene + Floating HUD Panels) */}
      <ResultsWorkspace />

      {/* 2. Floating Spatial Upload Portal */}
      {(isUploadOpen || jobStatus === 'idle') && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <UploadWizard />
        </div>
      )}

      {/* 3. Floating Spatial Pipeline Monitor */}
      {(jobStatus === 'uploading' || jobStatus === 'running') && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <ProgressView />
        </div>
      )}

      {/* 4. Floating Fail-Safe Error View */}
      {jobStatus === 'error' && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <ErrorView />
        </div>
      )}
    </RootLayout>
  );
};

export default App;
