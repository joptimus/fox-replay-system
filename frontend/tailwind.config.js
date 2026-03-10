/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'f1-red': '#e63946',
        'f1-black': '#111119',
        'f1-dark-gray': '#16161f',
        'f1-carbon': '#0c0c14',
        'f1-white': '#e8e8ee',
        'f1-silver': '#666680',
        'f1-border': 'rgba(255, 255, 255, 0.055)',
        'f1-faint': '#3a3a50',
        'accent-red': '#e63946',
        'accent-green': '#00e676',
        'accent-cyan': '#27f4d2',
        'accent-yellow': '#ffd600',
      },
      fontFamily: {
        'ui': "'Chakra Petch', sans-serif",
        'mono': "'Share Tech Mono', monospace",
      },
    }
  },
  plugins: [],
}
