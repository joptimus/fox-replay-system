export default {
  plugins: {
    tailwindcss: {
      content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
      ],
      theme: {
        extend: {
          colors: {
            'f1-red': '#e10600',
            'f1-black': '#15151e',
            'f1-dark-gray': '#1f1f27',
            'f1-carbon': '#0f0f12',
            'f1-white': '#ffffff',
            'f1-silver': '#9ca3af',
            'f1-border': 'rgba(255, 255, 255, 0.1)',
          },
          fontFamily: {
            'f1-mono': "'JetBrains Mono', monospace",
          },
          fontSize: {
            'f1-xs': '0.65rem',
            'f1-sm': '0.75rem',
            'f1-base': '0.85rem',
          },
        }
      },
    },
    autoprefixer: {},
  },
}