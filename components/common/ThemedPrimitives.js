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
import { getThemeClassName, useAppTheme } from "../../utils/appTheme";

const createThemeAwareComponent = (Component, displayName) => {
  const WrappedComponent = forwardRef(({ className, ...props }, ref) => {
    const { themeMode } = useAppTheme();

    return (
      <Component
        ref={ref}
        className={getThemeClassName(className, themeMode)}
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
