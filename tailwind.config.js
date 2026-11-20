/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        offwhite: '#faf9f5',
        forest: {
          50: '#f0f7f1',
          100: '#dcefdc',
          200: '#badfb9',
          300: '#8ec78e',
          400: '#5fa964',
          500: '#3f8c4a',
          600: '#2d6f3a',
          700: '#2d5a3d',
          800: '#264834',
          900: '#1e3a2b',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(30, 58, 43, 0.08), 0 4px 16px rgba(30, 58, 43, 0.06)',
      },
    },
  },
  plugins: [],
};
