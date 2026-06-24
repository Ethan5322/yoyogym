/** @type {import('tailwindcss').Config} */
// Dark Premium Athletic theme — colors & typography from spec Part 7.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent is configurable per gym (loaded from settings at runtime
        // via CSS variable --accent). These are the spec defaults.
        accent: 'var(--accent, #E63946)',
        'accent-soft': 'var(--accent-soft, rgba(230,57,70,0.15))',
        bg: '#0A0A0A',
        surface: '#141414',
        elevated: '#1C1C1C',
        bubble: '#1A1A1A',
        body: '#F5F0E8',
        muted: '#9A9590',
        success: '#2ECC71',
        error: '#E74C3C',
      },
      fontFamily: {
        // Headers: athletic/powerful. Body: clean/readable. Loaded via index.html.
        display: ['Oswald', 'Bebas Neue', 'sans-serif'],
        body: ['Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      lineHeight: {
        relaxed: '1.75',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'corner-pulse': {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
        'scan-sweep': {
          '0%': { top: '4%' },
          '100%': { top: '92%' },
        },
        'ping-soft': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        skeleton: {
          '0%,100%': { opacity: '0.5' },
          '50%': { opacity: '0.9' },
        },
        'flash-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '35%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.15)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out',
        'slide-up': 'slide-up 320ms cubic-bezier(0.16,1,0.3,1)',
        'corner-pulse': 'corner-pulse 1.2s ease-in-out infinite',
        'scan-sweep': 'scan-sweep 1.8s ease-in-out infinite alternate',
        'ping-soft': 'ping-soft 1.4s ease-out infinite',
        skeleton: 'skeleton 1.4s ease-in-out infinite',
        flash: 'flash-in 800ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
