/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#1B6CA8',
          dark:    '#154F7A',
          50:      '#EBF4FB',
        },
        accent: '#0EA5A8',
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(0,0,0,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
