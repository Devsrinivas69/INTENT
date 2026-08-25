import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './panel.html', './overlay.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        intent: {
          bg: '#000000',
          surface: 'rgba(10, 10, 10, 0.85)',
          panel: 'rgba(0, 0, 0, 0.78)',
          border: 'rgba(255, 255, 255, 0.15)',
          borderHover: 'rgba(255, 255, 255, 0.35)',
          borderActive: 'rgba(255, 255, 255, 0.85)',
          text: '#FFFFFF',
          muted: 'rgba(255, 255, 255, 0.55)',
          dim: 'rgba(255, 255, 255, 0.30)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
      },
      fontSize: {
        xxs: '0.65rem',
      },
    },
  },
  plugins: [],
} satisfies Config
