import { createContext, useContext } from "react";

export const THEME_MODES = Object.freeze({
  DARK: "dark",
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

export const APP_THEMES = Object.freeze({
  [THEME_MODES.DARK]: Object.freeze({
    mode: THEME_MODES.DARK,
    colors: darkColors,
  }),
});

export const normalizeThemeMode = () => THEME_MODES.DARK;

export const getAppTheme = () => APP_THEMES.dark;

export const getThemeClassName = (className) => className;

export const getThemeStyle = () => undefined;

export const AppThemeContext = createContext({
  themeMode: THEME_MODES.DARK,
  colors: APP_THEMES.dark.colors,
  setThemeMode: () => {},
  isDark: true,
  isLight: false,
});

export const useAppTheme = () => useContext(AppThemeContext);
