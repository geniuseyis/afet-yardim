import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "../theme/tokens";

export const AppCard = ({ children }: { children: React.ReactNode }) => (
  <View style={s.card}>{children}</View>
);

export const AppButton = ({
  title,
  onPress,
  disabled
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[s.btnWrap, disabled && { opacity: 0.55 }]}>
    <LinearGradient colors={[tokens.color.brandRed, tokens.color.brandRedDark]} style={s.btnInner}>
      <Text style={s.btnText}>{title}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

export const StatusBadge = ({ label, danger }: { label: string; danger?: boolean }) => (
  <View style={[s.badge, { backgroundColor: danger ? "#fee2e2" : "#e0f2fe" }]}>
    <Text style={[s.badgeText, { color: danger ? "#991b1b" : "#0c4a6e" }]}>{label}</Text>
  </View>
);

export const TopBar = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <View style={s.topRow}>
    <TouchableOpacity onPress={onBack} hitSlop={8}>
      <Ionicons name="arrow-back" size={22} color={tokens.color.text} />
    </TouchableOpacity>
    <Text style={s.topTitle}>{title}</Text>
    <View style={{ width: 22 }} />
  </View>
);

export const EmptyState = ({ text }: { text: string }) => (
  <View style={s.emptyWrap}>
    <Text style={s.emptyText}>{text}</Text>
  </View>
);

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.card,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md
  },
  btnWrap: { borderRadius: tokens.radius.pill, overflow: "hidden" },
  btnInner: { height: 52, alignItems: "center", justifyContent: "center" },
  btnText: { color: "white", fontFamily: "Inter-Bold", fontSize: 16 },
  badge: { borderRadius: tokens.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: "Inter-Bold", fontSize: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  topTitle: { color: tokens.color.text, fontSize: 16, fontFamily: "Inter" },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  emptyText: { color: tokens.color.muted, fontFamily: "Inter", fontSize: 14 }
});
