/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Use 'class' strategy for manual theme toggle + system preference detection
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme colors (legacy - can be phased out)
        'dark-bg': '#0F0F11',
        'dark-card': '#18181B',
        'dark-border': '#27272A',
        'dark-hover': '#050505',
      }
    },
  },
  plugins: [],
  safelist: [
    { pattern: /^bg-\[/ },
    { pattern: /^text-\[/ },
    { pattern: /^border-\[/ },
  ]
}