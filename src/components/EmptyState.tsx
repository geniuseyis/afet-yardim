import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type EmptyStateProps = {
  icon?: string;
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
  lightMode?: boolean;
};

export const EmptyState = ({
  icon = "file-tray-outline",
  title,
  sub,
  actionLabel,
  onAction,
  lightMode = false,
}: EmptyStateProps) => {
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 32,
        paddingHorizontal: 20,
      }}
    >
      {/* Icon circle */}
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.12)",
          borderWidth: 1.5,
          borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.2)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        {/* Inner ring decoration */}
        <View
          style={{
            position: "absolute",
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: lightMode ? "rgba(239,68,68,0.12)" : "rgba(248,113,113,0.14)",
          }}
        />
        <Ionicons name={icon as any} size={30} color={lightMode ? "#be123c" : "#fda4af"} />
      </View>

      <Text
        style={{
          color: textPrimary,
          fontFamily: "Inter-Bold",
          fontSize: 15,
          textAlign: "center",
          marginBottom: sub ? 6 : 0,
        }}
      >
        {title}
      </Text>

      {sub ? (
        <Text
          style={{
            color: textSec,
            fontFamily: "Inter",
            fontSize: 13,
            textAlign: "center",
            lineHeight: 18,
            maxWidth: 260,
          }}
        >
          {sub}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={{
            marginTop: 16,
            borderRadius: 999,
            backgroundColor: lightMode ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.16)",
            borderWidth: 1,
            borderColor: lightMode ? "rgba(239,68,68,0.2)" : "rgba(248,113,113,0.24)",
            paddingHorizontal: 18,
            paddingVertical: 9,
          }}
        >
          <Text
            style={{
              color: lightMode ? "#9f1239" : "#fecaca",
              fontFamily: "Inter-Bold",
              fontSize: 13,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
