import React from 'react';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Header } from './Header';

interface RootLayoutProps {
  children: React.ReactNode;
}

export const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden font-sans select-none">
      {/* HARD RULE 1: Disclaimer permanent on EVERY screen and route */}
      <DisclaimerBanner />
      <Header />
      <main className="flex-1 relative overflow-hidden flex flex-col">{children}</main>
    </div>
  );
};
