import { forwardRef } from "react";
import {
  FlatList as RNFlatList,
  Image as RNImage,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity as RNTouchableOpacity,
  TouchableWithoutFeedback,
  View as RNView,
} from "react-native";
import {
  getThemeClassName,
  getThemeStyle,
  useAppTheme,
} from "../../utils/appTheme";

const createThemeAwareComponent = (Component, displayName) => {
  const WrappedComponent = forwardRef(({ className, style, ...props }, ref) => {
    const { themeMode } = useAppTheme();
    const themeStyle = getThemeStyle(className, themeMode);

    return (
      <Component
        ref={ref}
        className={getThemeClassName(className, themeMode)}
        style={themeStyle ? [themeStyle, style] : style}
        {...props}
      />
    );
  });

  WrappedComponent.displayName = displayName;
  return WrappedComponent;
};

export const View = createThemeAwareComponent(RNView, "ThemeAwareView");
export const Text = createThemeAwareComponent(RNText, "ThemeAwareText");
export const ScrollView = createThemeAwareComponent(
  RNScrollView,
  "ThemeAwareScrollView"
);
export const FlatList = createThemeAwareComponent(
  RNFlatList,
  "ThemeAwareFlatList"
);
export const TouchableOpacity = createThemeAwareComponent(
  RNTouchableOpacity,
  "ThemeAwareTouchableOpacity"
);
export const TextInput = createThemeAwareComponent(
  RNTextInput,
  "ThemeAwareTextInput"
);
export const Pressable = createThemeAwareComponent(
  RNPressable,
  "ThemeAwarePressable"
);
export const Image = createThemeAwareComponent(RNImage, "ThemeAwareImage");
export const KeyboardAvoidingView = createThemeAwareComponent(
  RNKeyboardAvoidingView,
  "ThemeAwareKeyboardAvoidingView"
);

export { TouchableWithoutFeedback };
