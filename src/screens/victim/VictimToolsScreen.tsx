import {
  React, useEffect, useRef, useState,
  Alert, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Ionicons, useStore
} from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

import { createLoopingSound, stopAndUnloadSound } from "../../services/audio";
let CameraModule: any = null;
try {
  CameraModule = require("expo-camera");
} catch {
  CameraModule = null;
}

/**
 * VICTIM-TOOLS DOSYA HARITASI
 * - VICTIM-TOOLS-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - VICTIM-TOOLS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-TOOLS-SAFE: Bu bolum hata/izin durumlarinda guvenli yedek akis davranisini tanimlar.
 * - VICTIM-TOOLS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimToolsScreen: Fener, düdük, mors ve sismograf acil araç ekranını yönetir.
export const VictimToolsScreen = ({ navigation }: { navigation: any }) => {
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const locale = useStore((state) => state.locale);
  const Lc = (tr: string, en: string) => l(locale, tr, en);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchMode, setTorchMode] = useState<"led" | "screen" | "strobe">("led");
  const [whistleOn, setWhistleOn] = useState(false);
  const [whistlePreset, setWhistlePreset] = useState<"quake" | "siren" | "pulse">("quake");
  const [morseText, setMorseText] = useState("SOS");
  const [morseBlinking, setMorseBlinking] = useState(false);
  const [morseVisible, setMorseVisible] = useState(false);
  const [sismographOn, setSismographOn] = useState(false);
  const [sismoBars, setSismoBars] = useState<number[]>(Array.from({ length: 24 }, () => 0.2));
  const [cameraPerm, setCameraPerm] = useState<"unknown" | "granted" | "denied">("unknown");
  const whistleSoundRef = useRef<any>(null);

  // VICTIM-TOOLS-SAFE: Bu bolum hata/izin durumlarinda guvenli yedek akis davranisini tanimlar.
  useEffect(() => {
    if (!CameraModule?.CameraView && torchMode === "led") {
      setTorchMode("screen");
    }
  }, [torchMode]);

  // VICTIM-TOOLS-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
  useEffect(() => {
    let timer: any;
    if (sismographOn) {
      timer = setInterval(() => {
        setSismoBars((prev) => prev.map((_, i) => (i > 16 ? Math.random() * 0.9 + 0.1 : Math.random() * 0.35 + 0.05)));
      }, 150);
    }
    return () => timer && clearInterval(timer);
  }, [sismographOn]);

  // VICTIM-TOOLS-SAFE: Bu bolum hata/izin durumlarinda guvenli yedek akis davranisini tanimlar.
  useEffect(() => {
    return () => {
      (async () => {
        await stopAndUnloadSound(whistleSoundRef);
      })();
    };
  }, []);

  // VICTIM-TOOLS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] ensureCameraPermission: LED fener için kamera iznini kontrol eder/ister.
  const ensureCameraPermission = async (): Promise<boolean> => {
    if (!CameraModule?.Camera?.requestCameraPermissionsAsync && !CameraModule?.CameraView?.requestCameraPermissionsAsync) {
      setTorchMode("screen");
      return false;
    }
    try {
      const reqFn = CameraModule.CameraView?.requestCameraPermissionsAsync || CameraModule.Camera?.requestCameraPermissionsAsync;
      const res = await reqFn();
      const granted = res?.status === "granted";
      setCameraPerm(granted ? "granted" : "denied");
      if (!granted) Alert.alert(Lc("Hata", "Error"), Lc("Fener icin kamera izni gerekli.", "Camera permission required for flashlight."));
      return granted;
    } catch {
      Alert.alert(Lc("Hata", "Error"), Lc("Kamera izni alinmadi.", "Camera permission denied."));
      return false;
    }
  };

  // VICTIM-TOOLS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] toggleTorch: Seçilen moda göre feneri açar/kapatır.
  const toggleTorch = async () => {
    if (!torchEnabled && torchMode === "led") {
      if (!CameraModule?.CameraView && !CameraModule?.Camera) {
        setTorchMode("screen");
        setTorchEnabled(true);
        return;
      }
      const ok = cameraPerm === "granted" ? true : await ensureCameraPermission();
      if (!ok) return;
    }
    setTorchEnabled((v) => !v);
  };

  // VICTIM-TOOLS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] toggleWhistle: Acil düdük ses döngüsünü başlatır veya durdurur.
  const toggleWhistle = async () => {
    try {
      if (whistleOn) {
        setWhistleOn(false);
        await stopAndUnloadSound(whistleSoundRef);
        return;
      }
      await stopAndUnloadSound(whistleSoundRef);
      setWhistleOn(true);
      const uri =
        whistlePreset === "quake"
          ? "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
          : whistlePreset === "siren"
            ? "https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg"
            : "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
      whistleSoundRef.current = await createLoopingSound(uri);
    } catch {
      setWhistleOn(false);
      Alert.alert(Lc("Hata", "Error"), Lc("Duduk sesi acilamadi. Baglanti veya ses izinlerini kontrol edin.", "Could not play whistle sound. Check connection or audio permissions."));
    }
  };

  const morseMap: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----."
  };

  // [FONKSIYON] playMorse: Metni mors koduna çevirip sinyal/titreşim akışını çalıştırır.
  const playMorse = async () => {
    if (morseBlinking) return;
    const text = morseText.toUpperCase().slice(0, 16);
    const sequence = text.split("").map((ch) => morseMap[ch] || "").filter(Boolean).join(" ");
    if (!sequence) return Alert.alert(Lc("Bilgi", "Info"), Lc("Mors icin harf/rakam girin.", "Enter letters or digits for Morse."));
    setMorseBlinking(true);
    try {
      for (const ch of sequence) {
        if (ch === " ") {
          setMorseVisible(false);
          await new Promise((r) => setTimeout(r, 220));
          continue;
        }
        setMorseVisible(true);
        await Haptics.impactAsync(ch === "-" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
        await new Promise((r) => setTimeout(r, ch === "-" ? 360 : 140));
        setMorseVisible(false);
        await new Promise((r) => setTimeout(r, 120));
      }
    } finally {
      setMorseVisible(false);
      setMorseBlinking(false);
    }
  };

  const bg = lightMode ? "#f8fafc" : amoledMode ? "#08080b" : "#2b0912";
  const cardBg = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.03)" : "rgba(105, 18, 34, 0.94)";
  const showScreenLight = torchEnabled && torchMode !== "led";
  const CameraView = CameraModule?.CameraView;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {torchEnabled && torchMode === "led" && CameraView ? (
        <View style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, opacity: 0.01 }}>
          <CameraView style={{ width: 1, height: 1 }} facing="back" enableTorch />
        </View>
      ) : null}
      {showScreenLight ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: torchMode === "screen" ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.18)",
            zIndex: 1
          }}
        />
      ) : null}

      <LinearGradient colors={lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#120406", "#150507", "#150507"] : ["#2a0b13", "#4a1220", "#6a1728"]} style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 28, lineHeight: 32 }}>{Lc("Acil Araclar Pro", "Emergency Tools Pro")}</Text>
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 2 }}>{Lc("Fener • Duduk • Mors • Sismograf", "Flashlight • Whistle • Morse • Seismograph")}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 }}>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => { void toggleTorch(); }} style={{ flex: 1, borderRadius: 18, backgroundColor: torchEnabled ? "rgba(245,158,11,0.14)" : cardBg, borderWidth: 1, borderColor: torchEnabled ? "rgba(245,158,11,0.24)" : "rgba(255,255,255,0.06)", padding: 13 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: torchEnabled ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 9 }}>
              <Ionicons name="flashlight-outline" size={20} color={torchEnabled ? "#fbbf24" : "#fff1f2"} />
            </View>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{Lc("Fener", "Flashlight")}</Text>
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
              {torchEnabled ? (torchMode === "led" ? Lc("LED torch aktif", "LED torch active") : torchMode === "screen" ? Lc("Ekran feneri aktif", "Screen light active") : Lc("Strobe ekran modu aktif", "Strobe screen mode active")) : Lc("Torch modunu sec ve baslat", "Select torch mode and start")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleWhistle} style={{ flex: 1, borderRadius: 18, backgroundColor: whistleOn ? "rgba(239,68,68,0.14)" : cardBg, borderWidth: 1, borderColor: whistleOn ? "rgba(248,113,113,0.24)" : "rgba(255,255,255,0.06)", padding: 13 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: whistleOn ? "rgba(239,68,68,0.16)" : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 9 }}>
              <Ionicons name="volume-high-outline" size={20} color={whistleOn ? "#f87171" : "#fff1f2"} />
            </View>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{Lc("Duduk", "Whistle")}</Text>
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
              {whistleOn ? `${Lc("Deprem dudugu aktif", "Emergency whistle active")} • ${whistlePreset.toUpperCase()}` : Lc("Yuksek ses alarmi (titresimsiz)", "High volume alarm (no vibration)")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, marginBottom: 10 }}>
          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginBottom: 8 }}>{Lc("Fener Modlari", "Flashlight Modes")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { key: "led", label: "LED Torch", sub: Lc("Gercek fener", "Real torch") },
              { key: "screen", label: "Screen", sub: Lc("Tam ekran", "Full screen") },
              { key: "strobe", label: "Strobe", sub: Lc("Yanip sonme", "Flashing") }
            ].map((m) => (
              <TouchableOpacity key={m.key} onPress={() => setTorchMode(m.key as any)} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: torchMode === m.key ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.06)", backgroundColor: torchMode === m.key ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.03)", paddingVertical: 8, alignItems: "center" }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{m.label}</Text>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 9, marginTop: 2 }}>{m.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, marginBottom: 10 }}>
          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginBottom: 8 }}>{Lc("Duduk Presetleri", "Whistle Presets")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { key: "quake", label: Lc("Deprem", "Quake"), db: "90dB+" },
              { key: "siren", label: "Siren", db: "85dB+" },
              { key: "pulse", label: "Pulse", db: Lc("Kesikli", "Intermittent") }
            ].map((p) => (
              <TouchableOpacity key={p.key} onPress={() => setWhistlePreset(p.key as any)} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: whistlePreset === p.key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.06)", backgroundColor: whistlePreset === p.key ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)", paddingVertical: 8, alignItems: "center" }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{p.label}</Text>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 9, marginTop: 2 }}>{p.db}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{Lc("Mors Isaretleyici", "Morse Signaller")}</Text>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: morseVisible ? "#ef4444" : "rgba(255,255,255,0.12)" }} />
          </View>
          <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginBottom: 8 }}>{Lc("Harf/rakam girip titresim destekli mors sinyali uretin.", "Enter letters/digits to generate vibration-supported Morse signal.")}</Text>
          <TextInput
            value={morseText}
            onChangeText={(t) => setMorseText(t.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 16))}
            placeholder="SOS"
            placeholderTextColor="#94a3b8"
            style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", color: "white", paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter-Bold" }}
          />
          <TouchableOpacity onPress={playMorse} style={{ marginTop: 8, borderRadius: 12, backgroundColor: "#991b1b", alignItems: "center", justifyContent: "center", height: 42 }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{morseBlinking ? Lc("MORS CALISIYOR...", "MORSE RUNNING...") : Lc("MORS CALISTIR", "RUN MORSE")}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{Lc("Sismograf", "Seismograph")}</Text>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{Lc("Ortam hareket simulasyonu / dikkat cekici gorsel mod", "Ambient motion simulation / attention-grabbing visual mode")}</Text>
            </View>
            <TouchableOpacity onPress={() => setSismographOn((v) => !v)} style={{ borderRadius: 999, backgroundColor: sismographOn ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: sismographOn ? "#86efac" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 }}>{sismographOn ? Lc("AKTIF", "ACTIVE") : Lc("PASIF", "INACTIVE")}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 74, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", paddingHorizontal: 7, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
            {sismoBars.map((v, i) => (
              <View key={i} style={{ flex: 1, height: `${Math.max(9, Math.round(v * 100))}%`, borderRadius: 3, backgroundColor: v > 0.7 ? "#ef4444" : v > 0.45 ? "#f59e0b" : "#22c55e" }} />
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
};

