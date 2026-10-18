/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        elder: {
          blue: '#1E40AF',
          gold: '#D97706',
          green: '#15803D',
          red: '#DC2626',
          warm: '#FFFBEB',
          card: '#FFFFFF',
          text: '#0F172A',
          subtext: '#334155',
        },
      },
      fontSize: {
        'elder-sm': ['1.125rem', { lineHeight: '1.75rem' }],
        'elder-base': ['1.25rem', { lineHeight: '2rem' }],
        'elder-lg': ['1.5rem', { lineHeight: '2.25rem' }],
        'elder-xl': ['1.875rem', { lineHeight: '2.5rem' }],
        'elder-2xl': ['2.25rem', { lineHeight: '2.75rem' }],
        'elder-3xl': ['3rem', { lineHeight: '1.2' }],
      },
      minHeight: {
        'button-elder': '72px',
      },
      boxShadow: {
        'elder': '0 8px 30px rgba(0, 0, 0, 0.12)',
        'elder-lg': '0 12px 40px rgba(0, 0, 0, 0.18)',
      },
    },
  },
  plugins: [],
}
