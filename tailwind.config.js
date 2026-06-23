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
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};
