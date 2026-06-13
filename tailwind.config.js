/** @type {import('tailwindcss').Config} */
const lightThemeColors = [
  "#F4F7F6",
  "#EDF5F7",
  "#FFFFFF",
  "#F8FAF9",
  "#EEF5EE",
  "#E7F1EF",
  "#EAF2F8",
  "#EEF5EA",
  "#ECF5EF",
  "#F8F0DF",
  "#8AB7B3",
  "#1B8E84",
  "#247F7F",
  "#6A7C7C",
  "#1F8A57",
  "#5F7E7E",
  "#536A6A",
  "#6E7D62",
  "#6F7E21",
  "#8A620C",
  "#102020",
  "#B23A3A",
  "#8B650C",
  "#956B00",
];

const lightThemeOpacitySuffixes = [
  "",
  "/10",
  "/15",
  "/18",
  "/20",
  "/22",
  "/24",
  "/25",
  "/28",
  "/30",
  "/32",
  "/35",
  "/40",
  "/45",
  "/50",
  "/52",
  "/55",
  "/60",
  "/65",
  "/70",
  "/75",
  "/80",
  "/85",
  "/88",
  "/90",
  "/95",
];

const lightThemeSafelist = ["bg", "text", "border", "border-l", "shadow"].flatMap(
  (prefix) =>
    lightThemeColors.flatMap((color) =>
      lightThemeOpacitySuffixes.map((suffix) => `${prefix}-[${color}]${suffix}`)
    )
);

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
  safelist: lightThemeSafelist,
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
