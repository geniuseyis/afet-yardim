import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

interface SkeletonBoxProps {
  width?: number | `${number}%` | "100%";
  height?: number;
  borderRadius?: number;
  style?: object;
  lightMode?: boolean;
}

export const SkeletonBox = ({
  width = "100%",
  height = 14,
  borderRadius = 7,
  style,
  lightMode = false,
}: SkeletonBoxProps) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: lightMode ? "rgba(15,23,42,0.09)" : "rgba(255,255,255,0.1)",
          opacity,
        },
        style,
      ]}
    />
  );
};

export const SkeletonCard = ({ lightMode = false }: { lightMode?: boolean }) => (
  <View
    style={{
      borderRadius: 16,
      borderWidth: 1,
      borderColor: lightMode ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.06)",
      backgroundColor: lightMode ? "#ffffff" : "rgba(255,255,255,0.04)",
      padding: 14,
      marginBottom: 10,
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
      <SkeletonBox width={36} height={36} borderRadius={10} lightMode={lightMode} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <SkeletonBox width="65%" height={13} borderRadius={6} lightMode={lightMode} />
        <SkeletonBox
          width="85%"
          height={11}
          borderRadius={5}
          lightMode={lightMode}
          style={{ marginTop: 7 }}
        />
      </View>
    </View>
    <SkeletonBox width="100%" height={11} borderRadius={5} lightMode={lightMode} />
    <SkeletonBox
      width="55%"
      height={11}
      borderRadius={5}
      lightMode={lightMode}
      style={{ marginTop: 7 }}
    />
  </View>
);

export const SkeletonHero = ({ lightMode = false }: { lightMode?: boolean }) => (
  <View
    style={{
      borderRadius: 22,
      borderWidth: 1,
      borderColor: lightMode ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.06)",
      backgroundColor: lightMode ? "#f1f5f9" : "rgba(255,255,255,0.04)",
      padding: 16,
      marginBottom: 12,
    }}
  >
    <SkeletonBox width="45%" height={13} borderRadius={6} lightMode={lightMode} />
    <SkeletonBox width="70%" height={22} borderRadius={8} lightMode={lightMode} style={{ marginTop: 8 }} />
    <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
      <View style={{ flex: 1, borderRadius: 14, height: 64, backgroundColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)", opacity: 0.6 }} />
      <View style={{ flex: 1, borderRadius: 14, height: 64, backgroundColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)", opacity: 0.6 }} />
      <View style={{ flex: 1, borderRadius: 14, height: 64, backgroundColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)", opacity: 0.6 }} />
    </View>
  </View>
);

export const SkeletonList = ({
  count = 3,
  lightMode = false,
}: {
  count?: number;
  lightMode?: boolean;
}) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} lightMode={lightMode} />
    ))}
  </>
);
