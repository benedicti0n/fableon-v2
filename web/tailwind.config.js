/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0f1115',
          panel: '#151922',
          raised: '#1c212b',
          line: '#28303d',
          text: '#e7e9ee',
          muted: '#a3a9b6',
          faint: '#6b7280',
          amber: '#f5a524',
          teal: '#2dd4bf',
          blue: '#60a5fa',
          green: '#34d399',
          violet: '#c084fc',
          red: '#f87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        deva: ['"Noto Sans Devanagari"', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
