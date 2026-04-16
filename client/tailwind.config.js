/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#b4c7ff',
          300: '#84a1ff',
          400: '#5b7cfb',
          500: '#3a56f2',
          600: '#2a3ede',
          700: '#2230b2',
          800: '#1f2b8f',
          900: '#1b2570'
        }
      }
    }
  },
  plugins: []
};
