/** @type {import('tailwindcss').Config} */
export default {
  // Scan index.html + all JS/JSX so Tailwind only ships classes actually used.
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
