import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { useStore } from './store/useStore';

// Expose store for e2e and integration testing
if (typeof window !== 'undefined') {
  (window as any).__NEUROSCOPE_STORE__ = useStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
