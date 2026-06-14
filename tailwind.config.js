/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./constants/**/*.{js,jsx,ts,tsx}",
    "./hooks/**/*.{js,jsx,ts,tsx}",
    "./navigation/**/*.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./theme/**/*.{js,jsx,ts,tsx}",
    "./utils/**/*.{js,jsx,ts,tsx}",
    "./App.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#061414",
        card: "#0B1F1F",
        card2: "#123131",
        border: "#337a7a",
        accent: "#66b9b9",
        "accent-soft": "#99bdbd",
        text: "#E8F4F4",
        muted: "#9FB5B5",
        success: "#7DFFB3",
        warning: "#FFD166",
        danger: "#FF7B7B",
      },
    },
  },
  plugins: [],
};
