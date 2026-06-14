import { createContext, useContext } from "react";

export const THEME_STORAGE_KEY = "themeMode";

export const THEME_MODES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

const darkColors = Object.freeze({
  mode: "dark",
  bg: "#061414",
  card: "#0B1F1F",
  card2: "#123131",
  surface: "#0B1F1F",
  elevatedCard: "#123131",
  border: "#337a7a",
  divider: "#337a7a",
  accent: "#66b9b9",
  accentSoft: "#99bdbd",
  text: "#E8F4F4",
  textPrimary: "#E8F4F4",
  textSecondary: "#9FB5B5",
  textMuted: "#9FB5B5",
  muted: "#9FB5B5",
  success: "#7DFFB3",
  warning: "#FFD166",
  danger: "#FF7B7B",
  info: "#5EEAD4",
  inputBackground: "#061414",
  chipBackground: "#123131",
  modalBackground: "#0B1F1F",
  overlay: "#061414",
  shadow: "#66b9b9",
});

const lightColors = Object.freeze({
  mode: "light",
  bg: "#F4F7F6",
  card: "#FFFFFF",
  card2: "#E7F1EF",
  surface: "#FFFFFF",
  elevatedCard: "#E7F1EF",
  border: "#8AB7B3",
  divider: "#C7DAD7",
  accent: "#247F7F",
  accentSoft: "#5F7E7E",
  text: "#102020",
  textPrimary: "#102020",
  textSecondary: "#536A6A",
  textMuted: "#6A7C7C",
  muted: "#6A7C7C",
  success: "#1F8A57",
  warning: "#8A620C",
  danger: "#B23A3A",
  info: "#1B8E84",
  inputBackground: "#F8FAF9",
  chipBackground: "#E7F1EF",
  modalBackground: "#FFFFFF",
  overlay: "#F4F7F6",
  shadow: "#8AB7B3",
});

export const APP_THEMES = Object.freeze({
  [THEME_MODES.DARK]: Object.freeze({
    mode: THEME_MODES.DARK,
    colors: darkColors,
  }),
  [THEME_MODES.LIGHT]: Object.freeze({
    mode: THEME_MODES.LIGHT,
    colors: lightColors,
  }),
});

const LIGHT_CLASS_COLOR_MAP = Object.freeze({
  "#061414": "#F4F7F6",
  "#0A1D24": "#EDF5F7",
  "#0B1F1F": "#FFFFFF",
  "#101416": "#F8FAF9",
  "#111F1A": "#EEF5EE",
  "#123131": "#E7F1EF",
  "#132836": "#EAF2F8",
  "#182419": "#EEF5EA",
  "#182D22": "#ECF5EF",
  "#2A2218": "#F8F0DF",
  "#337a7a": "#8AB7B3",
  "#5EEAD4": "#1B8E84",
  "#66b9b9": "#247F7F",
  "#6D8787": "#6A7C7C",
  "#7DFFB3": "#1F8A57",
  "#99bdbd": "#5F7E7E",
  "#9FB5B5": "#536A6A",
  "#9FB88D": "#6E7D62",
  "#B6C26E": "#6F7E21",
  "#D9A441": "#8A620C",
  "#E8F4F4": "#102020",
  "#FF7B7B": "#B23A3A",
  "#FFCF7A": "#8B650C",
  "#FFD166": "#956B00",
});

const NORMALIZED_LIGHT_CLASS_COLOR_MAP = Object.freeze(
  Object.entries(LIGHT_CLASS_COLOR_MAP).reduce((acc, [darkColor, lightColor]) => {
    acc[darkColor.toUpperCase()] = lightColor;
    return acc;
  }, {})
);

export const normalizeThemeMode = (value) =>
  value === THEME_MODES.LIGHT ? THEME_MODES.LIGHT : THEME_MODES.DARK;

export const getAppTheme = (themeMode) =>
  APP_THEMES[normalizeThemeMode(themeMode)] || APP_THEMES.dark;

export const getThemeClassName = (className, themeMode) => {
  if (themeMode !== THEME_MODES.LIGHT || typeof className !== "string") {
    return className;
  }

  return className.replace(/#[A-Fa-f0-9]{6}/g, (match) => {
    const normalized = match.toUpperCase();
    return NORMALIZED_LIGHT_CLASS_COLOR_MAP[normalized] || match;
  });
};

export const AppThemeContext = createContext({
  themeMode: THEME_MODES.DARK,
  colors: APP_THEMES.dark.colors,
  setThemeMode: () => {},
  isDark: true,
  isLight: false,
});

export const useAppTheme = () => useContext(AppThemeContext);
