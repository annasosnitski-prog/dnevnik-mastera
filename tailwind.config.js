/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ink-bg': '#111010',
        'ink-card': '#2A2A2A',
        'ink-border': '#333',
        'ink-accent': '#FAD5A5',
        'ink-text': '#FFFFFF',
        'ink-muted': '#999999',
        'ink-dim': '#666666',
      },
      fontFamily: {
        'heebo': ['Heebo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
