/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        medium: {
          gas: '#d0463b',
          steam: '#2d6cdf',
          water: '#2d6cdf',
          hot_water: '#f97316',
          fuel_gas: '#4b5563'
        }
      }
    }
  },
  plugins: []
};
