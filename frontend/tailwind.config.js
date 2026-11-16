/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind throws on web with the default 'media' mode; the app themes through its own tokens.
  darkMode: 'class',
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
