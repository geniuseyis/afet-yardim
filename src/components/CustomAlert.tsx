import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

export type AlertConfig = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  tone?: "error" | "success" | "info" | "warning";
};

type Props = AlertConfig & {
  visible: boolean;
  onDismiss: () => void;
  lightMode?: boolean;
};

const TONE_CONFIG = {
  error: {
    icon: "alert-circle" as const,
    gradient: ["#c1121f", "#991b1b"] as [string, string],
    iconBg: "rgba(193,18,31,0.15)",
  },
  success: {
    icon: "checkmark-circle" as const,
    gradient: ["#059669", "#065f46"] as [string, string],
    iconBg: "rgba(5,150,105,0.15)",
  },
  warning: {
    icon: "warning" as const,
    gradient: ["#d97706", "#92400e"] as [string, string],
    iconBg: "rgba(217,119,6,0.15)",
  },
  info: {
    icon: "information-circle" as const,
    gradient: ["#c1121f", "#7f1d1d"] as [string, string],  // kırmızı
    iconBg: "rgba(193,18,31,0.12)",
  },
};

export const CustomAlert: React.FC<Props> = ({
  visible, title, message, buttons, tone = "info", onDismiss, lightMode = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const cfg = TONE_CONFIG[tone];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, speed: 22, bounciness: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const resolvedButtons: AlertButton[] = buttons && buttons.length > 0
    ? buttons
    : [{ text: "Tamam", onPress: onDismiss, style: "default" }];

  const bg = lightMode ? "#ffffff" : "#0f172a";
  const titleColor = lightMode ? "#0f172a" : "#f8fafc";
  const msgColor = lightMode ? "#475569" : "#94a3b8";
  const borderColor = lightMode ? "#e2e8f0" : "#1e293b";
  const cancelBg = lightMode ? "#f1f5f9" : "#1e293b";
  const cancelText = lightMode ? "#475569" : "#94a3b8";

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={s.backdrop} onPress={onDismiss}>
        <Animated.View
          style={[s.card, { backgroundColor: bg, borderColor, opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Üst gradient şerit */}
          <LinearGradient colors={cfg.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.strip} />

          {/* İkon */}
          <View style={[s.iconWrap, { backgroundColor: cfg.iconBg }]}>
            <Ionicons name={cfg.icon} size={30} color={cfg.gradient[0]} />
          </View>

          {/* Başlık */}
          <Text style={[s.title, { color: titleColor }]}>{title}</Text>

          {/* Mesaj */}
          {!!message && <Text style={[s.message, { color: msgColor }]}>{message}</Text>}

          {/* Ayırıcı */}
          <View style={[s.divider, { backgroundColor: borderColor }]} />

          {/* Butonlar */}
          <View style={[s.btnRow, resolvedButtons.length > 2 && { flexDirection: "column" }]}>
            {resolvedButtons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              const isLast = i === resolvedButtons.length - 1;
              const isPrimary = !isDestructive && !isCancel && isLast;

              if (isPrimary || isDestructive) {
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.btnBase, resolvedButtons.length > 1 && { flex: 1 }]}
                    onPress={() => { btn.onPress?.(); onDismiss(); }}
                    activeOpacity={0.82}
                  >
                    <LinearGradient
                      colors={isDestructive ? ["#c1121f", "#991b1b"] : cfg.gradient}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.btnGradient}
                    >
                      <Text style={s.btnPrimaryText}>{btn.text}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.btnBase, s.btnSecondary, { backgroundColor: cancelBg }, resolvedButtons.length > 1 && { flex: 1 }]}
                  onPress={() => { btn.onPress?.(); onDismiss(); }}
                  activeOpacity={0.75}
                >
                  <Text style={[s.btnSecondaryText, { color: cancelText }]}>{btn.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  card: { width: "100%", maxWidth: 360, borderRadius: 20, borderWidth: 1, overflow: "hidden", paddingBottom: 16 },
  strip: { height: 4, width: "100%" },
  iconWrap: { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20, marginBottom: 8, alignSelf: "center" },
  title: { fontFamily: "Inter-Bold", fontSize: 17, textAlign: "center", paddingHorizontal: 20, marginBottom: 6 },
  message: { fontFamily: "Inter", fontSize: 14, lineHeight: 21, textAlign: "center", paddingHorizontal: 20, marginBottom: 4 },
  divider: { height: 1, marginTop: 16, marginBottom: 12 },
  btnRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  btnBase: { borderRadius: 12, overflow: "hidden", minHeight: 44 },
  btnGradient: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, minHeight: 44 },
  btnSecondary: { alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnPrimaryText: { fontFamily: "Inter-Bold", fontSize: 15, color: "#ffffff" },
  btnSecondaryText: { fontFamily: "Inter-Bold", fontSize: 15 },
});
