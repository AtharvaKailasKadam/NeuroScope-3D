/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        'panel-border': 'var(--color-panel-border)',
        'panel-header': 'var(--color-panel-header)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'region-wt': 'var(--color-wt)',
        'region-tc': 'var(--color-tc)',
        'region-et': 'var(--color-et)',
        'region-brain': 'var(--color-brain)',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        'glass-hover': '0 12px 40px 0 rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
}
