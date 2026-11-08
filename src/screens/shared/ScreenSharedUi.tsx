import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "./ScreenConstants";
import { s } from "./ScreenStyles";

/**
 * SCREEN-SHARED-UI DOSYA HARITASI
 * - SHARED-UI-TOPBAR: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 * - SHARED-UI-AUTHFIELD: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 * - SHARED-UI-PATTERN: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */
// SHARED-UI-COMPONENT: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
export const TopBar = ({ navigation, title }: { navigation: any; title: string }) => (
  <View style={s.topBar}>
    <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={s.topBarBackBtn}>
      <Ionicons name="arrow-back" size={20} color={s.topBarTitle.color as string} />
    </TouchableOpacity>
    <Text style={s.topBarTitle}>{title}</Text>
    <View style={{ width: 34 }} />
  </View>
);

// SHARED-UI-COMPONENT: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
export const AuthField = ({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  maxLength,
  rightIcon,
  onRightPress,
  onSubmitEditing,
  returnKeyType
}: {
  icon: any;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  maxLength?: number;
  rightIcon?: any;
  onRightPress?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "next" | "go" | "send";
}) => (
  <View style={s.authFieldWrap}>
    <Ionicons name={icon} size={18} color="rgba(255,255,255,0.52)" />
    <TextInput
      style={s.authFieldInput}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.5)"
      value={secureTextEntry ? "•".repeat(value.length) : value}
      onChangeText={(text) => {
        if (!secureTextEntry) { onChangeText(text); return; }
        if (text.length > value.length) {
          onChangeText(value + text.slice(value.length).replace(/•/g, ""));
        } else {
          onChangeText(value.slice(0, text.length));
        }
      }}
      secureTextEntry={false}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize="none"
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType ?? "done"}
      blurOnSubmit={!onSubmitEditing || returnKeyType === "done" || returnKeyType === undefined}
    />
    {!!rightIcon && (
      <TouchableOpacity onPress={onRightPress} hitSlop={8}>
        <Ionicons name={rightIcon} size={20} color="rgba(255,255,255,0.52)" />
      </TouchableOpacity>
    )}
  </View>
);

// SHARED-UI-COMPONENT: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
export const RedPattern = () => (
  <>
    <View style={s.authPatternTop} />
    <View style={s.authPatternBottom} />
    <View style={s.authPatternLineA} />
    <View style={s.authPatternLineB} />
    <View style={s.authPatternLineC} />
  </>
);
