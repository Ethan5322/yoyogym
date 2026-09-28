/** @type {import('tailwindcss').Config} */
// Dark Premium Athletic theme — colors & typography from spec Part 7.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // The Yoyo Gyms palette (CLAUDE.md §37; values in shared/brand.js).
        // The accent stays runtime-configurable per gym: branding.js sets
        // --accent-rgb, and the RGB form is what lets `border-accent/30` and
        // friends actually be see-through.
        accent: 'rgb(var(--accent-rgb, 191 246 66) / <alpha-value>)',
        'accent-soft': 'var(--accent-soft, rgb(191 246 66 / 0.15))',
        'accent-ink': 'var(--accent-ink, #0B1400)', // text ON the accent
        gold: '#C8922A',
        bg: '#070C10', // near-black ground
        surface: '#10181D', // cards
        elevated: '#172026', // raised surfaces
        bubble: '#172026',
        body: '#F0EDE8', // warm white
        muted: '#8A8580', // soft gray
        success: '#00C851',
        warning: '#FF8C00',
        error: '#E63946',
      },
      fontFamily: {
        // Hero/commanding = Bebas Neue · Section = Oswald · Body = Inter ·
        // Data/codes = DM Mono. Loaded via index.html.
        display: ['"Bebas Neue"', 'Oswald', 'sans-serif'],
        heading: ['Oswald', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
