import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * SPLASH DOSYA HARITASI
 * - SPLASH-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 * - SPLASH-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - SPLASH-THEME: Bu bolumde tema, renk modu ve dil gecisleri yonetilir.
 */
export const SplashScreen = ({ navigation }: { navigation: any }) => {
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const fade = useRef(new Animated.Value(0)).current;
  // SPLASH-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }).start();
    const t = setTimeout(() => navigation.replace("Auth"), 2200);
    return () => clearTimeout(t);
  }, [fade, navigation]);

  return (
    <LinearGradient
      colors={
        lightMode
          ? (["#ffffff", "#f3f4f6", "#e5e7eb"] as any)
          : amoledMode
            ? (["#1a060d", "#09030a", "#020205"] as any)
            : (["#7a001f", "#a10c2d", "#450016"] as any)
      }
      style={s.splash}
    >
      <RedPattern />
      <Animated.View style={{ opacity: fade, alignItems: "center", paddingHorizontal: 28 }}>
        <View style={[s.splashIconWrap, lightMode && { borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(255,255,255,0.9)" }]}>
          <Ionicons name="heart-outline" size={64} color={lightMode ? "#b91c1c" : "white"} />
          <View style={[s.splashPlusWrap, lightMode && { backgroundColor: "white" }]}>
            <Ionicons name="add" size={22} color="#9b102f" />
          </View>
        </View>
        <Text style={[s.splashMainTitle, lightMode && { color: "#0f172a" }]}>
          {l(locale, "Afet Yardım", "Disaster Aid")}
          {"\n"}
          {l(locale, "Koordinat ve", "Coordinate &")}
          {"\n"}
          {l(locale, "Haritalama Sistemi", "Mapping System")}
        </Text>
        <Text style={[s.splashSubTitle, lightMode && { color: "#334155" }]}>{l(locale, "Acil Durumlarda Gücünüz", "Your Power in Emergencies")}</Text>
        <Text style={[s.splashFoot, lightMode && { color: "#64748b" }]}>{l(locale, "Konum • Koordinasyon • Hızlı Müdahale", "Location • Coordination • Rapid Response")}</Text>
      </Animated.View>
    </LinearGradient>
  );
};

