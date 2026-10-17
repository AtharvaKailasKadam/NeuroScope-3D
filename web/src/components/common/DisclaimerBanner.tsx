/**
 * web/src/components/common/DisclaimerBanner.tsx
 *
 * HARD RULE 1:
 * Permanent, visible banner on EVERY screen and route
 * (upload, validating, processing, results, error, report):
 * "Research and teaching prototype only. Not a diagnosis. Uses public, de-identified research data only."
 */

import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <div
      data-testid="disclaimer-banner"
      id="disclaimer-banner"
      role="banner"
      aria-label="Medical Research Disclaimer"
      className="w-full bg-amber-500/10 border-b border-amber-500/25 px-4 py-2 flex items-center justify-between text-xs text-amber-200 select-none z-50 backdrop-blur-md"
    >
      <div className="flex items-center space-x-2 font-medium">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
        <span className="tracking-wide">
          <strong className="font-semibold text-amber-300">
            RESEARCH & TEACHING PROTOTYPE ONLY:
          </strong>{' '}
          Not a diagnosis. Uses public, de-identified research data only.
        </span>
      </div>

      <div className="hidden md:flex items-center space-x-4 text-amber-400/80 text-[11px]">
        <span className="flex items-center space-x-1">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Local execution · Scans never leave machine</span>
        </span>
        <span className="text-amber-500/40">|</span>
        <span>Auto-deleted within 24 hours</span>
      </div>
    </div>
  );
};
