/** @type {import('tailwindcss').Config} */
export default {
  // Scan index.html + all JS/JSX so Tailwind only ships classes actually used.
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#080c14',
          900: '#0d1526',
          800: '#111d38',
          700: '#1a2a50',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
