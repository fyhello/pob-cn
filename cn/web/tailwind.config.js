/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        poe: {
          bg: '#0a0a0c',
          panel: '#121216',
          card: '#18181f',
          border: '#2a2a35',
          gold: '#c8a85c',
          blue: '#4a90e2',
          red: '#d9534f',
          green: '#5cb85c',
          purple: '#9b59b6',
          unique: '#af6025',
          rare: '#ffff77',
          magic: '#8888ff'
        }
      }
    },
  },
  plugins: [],
}
