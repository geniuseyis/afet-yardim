import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Vibration, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { Dimensions, Linking, Modal, Platform, RefreshControl } from "react-native";
import { loadSafeContacts } from "../../services/familySafetyLocal";
import { createLoopingSound, stopAndUnloadSound } from "../../services/audio";
import { appendSosLogStatus, createSosLog, subscribeMySosLogs } from "../../services/sosLogs";
import { l } from "../../services/i18n";

/**
 * VICTIM-HOME DOSYA HARITASI
 * - VICTIM-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VICTIM-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VICTIM-HOME-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-HOME-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimHome: Afetzede ana ekranını, SOS akışını ve hızlı yönlendirmeleri yönetir.
export const VictimHome = () => {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const locale = useStore((state) => state.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const showToast = useStore((state) => state.showToast);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [active, setActive] = useState<Req | null>(null);
  const [recentRequests, setRecentRequests] = useState<Req[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState<Record<string, boolean>>({});
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [whistleOn, setWhistleOn] = useState(false);
  const [whistlePreset, setWhistlePreset] = useState<"siren" | "beacon" | "sos">("siren");
  const [morseText, setMorseText] = useState("SOS");
  const [morseBlinking, setMorseBlinking] = useState(false);
  const [morseVisible, setMorseVisible] = useState(false);
  const [sismographOn, setSismographOn] = useState(false);
  const [sismoBars, setSismoBars] = useState<number[]>(Array.from({ length: 20 }, () => 0.2));
  const [sosHolding, setSosHolding] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; code: number; wind: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sosLogs, setSosLogs] = useState<Array<{ id: string; status?: string; note?: string; createdAt?: any; updatedAt?: any }>>([]);
  const [firstAidModalKey, setFirstAidModalKey] = useState<"cpr" | "bleed" | "fracture" | "burn" | null>(null);
  const notifSheetAnim = useRef(new Animated.Value(0)).current;
  const toolsSheetAnim = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const whistleSoundRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await Location.getCurrentPositionAsync({});
      const coords = { latitude: now.coords.latitude, longitude: now.coords.longitude };
      setLocation(coords);
      // Hava durumu: Open-Meteo ücretsiz API, anahtar gerektirmez
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FIstanbul`
        );
        const json = await res.json();
        if (json?.current) {
          setWeather({
            temp: Math.round(json.current.temperature_2m ?? 0),
            code: json.current.weather_code ?? 0,
            wind: Math.round(json.current.wind_speed_10m ?? 0)
          });
        }
      } catch {
        // hava durumu opsiyonel, hata sessiz geç
      }
    })();
  }, []);

  // VICTIM-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "requests"), where("createdBy", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req)).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setRecentRequests(list.slice(0, 4));
        setActive(list.find((r) => r.status !== "closed") || null);
      },
      (err) => {
        console.warn("[victim home] snapshot:", err);
        setRecentRequests([]);
        setActive(null);
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Ana sayfa verileri yüklenemedi.", "Home data could not be loaded."), "error");
        }
      }
    );
  }, [user, showToast]);

  // VICTIM-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMySosLogs((rows) => setSosLogs(rows));
  }, [user?.uid]);

  // VICTIM-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1400, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    let timer: any;
    if (sismographOn) {
      timer = setInterval(() => {
        setSismoBars((prev) => prev.map((_, i) => {
          const pulse = i > 14 ? Math.random() * 0.9 + 0.1 : Math.random() * 0.35 + 0.05;
          return pulse;
        }));
      }, 180);
    }
    return () => timer && clearInterval(timer);
  }, [sismographOn]);

  useEffect(() => {
    return () => {
      (async () => {
        await stopAndUnloadSound(whistleSoundRef);
      })();
    };
  }, []);

  useEffect(() => {
    Animated.spring(notifSheetAnim, {
      toValue: showNotifPanel ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180
    }).start();
  }, [showNotifPanel, notifSheetAnim]);

  useEffect(() => {
    Animated.spring(toolsSheetAnim, {
      toValue: showToolsPanel ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180
    }).start();
  }, [showToolsPanel, toolsSheetAnim]);

  // [FONKSIYON] openDial112: Cihazın telefon uygulamasında 112 arama ekranını açar.
  const openDial112 = async (): Promise<void> => {
    try {
      const telUrl = "tel:112";
      const canOpen = await Linking.canOpenURL(telUrl);
      if (!canOpen) throw new Error("tel desteklenmiyor");
      await Linking.openURL(telUrl);
    } catch {
      showToast("112 arama ekranı açılamadı.", "error");
    }
  };

  // [FONKSIYON] openFamilySmsComposer: Kayıtlı yakınlara ön tanımlı acil SMS taslağı açar.
  const openFamilySmsComposer = async (): Promise<boolean> => {
    try {
      if (!user?.uid) {
        showToast("Yakınlar listesi bulunamadı.", "error");
        return false;
      }
      const contacts = await loadSafeContacts(user.uid);
      const phones = Array.from(
        new Set(
          contacts
            .map((c) => c.phone?.replace(/\D/g, "").slice(0, 11))
            .filter((p): p is string => !!p && p.length >= 10)
        )
      );
      if (!phones.length) {
        showToast("SMS gönderilecek yakınınız bulunmuyor.", "error");
        return false;
      }

      const coordText = location
        ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
        : "Konum alınmadı";
      const mapLink = location
        ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
        : "";
      const body =
        `AFET SOS: Acil yardım gerekiyor. ` +
        `Konum: ${coordText}` +
        (mapLink ? `\nHarita: ${mapLink}` : "") +
        `\nLütfen 112 ve yakınlar ile iletişime geçin.`;

      const bodySep = Platform.OS === "ios" ? "&" : "?";
      const smsUrl = `sms:${phones.join(",")}${bodySep}body=${encodeURIComponent(body)}`;
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (!canOpen) throw new Error("sms desteklenmiyor");
      await Linking.openURL(smsUrl);
      return true;
    } catch {
      showToast("SMS oluşturma ekranı açılamadı.", "error");
      return false;
    }
  };

  // [FONKSIYON] sendSOS: SOS logunu oluşturur, 112 aramayı ve yakınlara SMS akışını tetikler.
  const sendSOS = async (): Promise<void> => {
    let logId: string | null = null;
    try {
      const contacts = user?.uid ? await loadSafeContacts(user.uid) : [];
      logId = await createSosLog({
        location: location || null,
        contactCount: contacts.length,
        note: "SOS baslatildi"
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast("SOS başlatıldı. 112 arama ekranı açılıyor...", "success");
      await openDial112();
      await appendSosLogStatus(logId, "dial_opened", "112 arama ekrani acildi");

      const smsOpened = await openFamilySmsComposer();
      if (smsOpened) {
        await appendSosLogStatus(logId, "sms_composer_opened", "SMS composer acildi");
      }

      await appendSosLogStatus(logId, "completed", "SOS akisi tamamlandi");
    } catch (e) {
      if (logId) {
        try {
          await appendSosLogStatus(logId, "failed", "SOS akisi hata verdi");
        } catch {
          // noop
        }
      }
      showToast("SOS akışında hata oluştu.", "error");
    }
  };

  // [FONKSIYON] toggleWhistle: Seçilen preset ile acil düdük sesini başlatır/durdurur.
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
        whistlePreset === "siren"
          ? "https://actions.google.com/sounds/v1/emergency/beeper_emergency_call.ogg"
          : whistlePreset === "beacon"
            ? "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
            : "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg";
      whistleSoundRef.current = await createLoopingSound(uri);
    } catch {
      setWhistleOn(false);
      showToast("Düdük sesi açılamadı. expo-audio kurulumunu kontrol edin.", "error");
    }
  };

  const morseMap: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----."
  };

  // [FONKSIYON] playMorse: Girilen metni mors dizisine çevirip titreşimli sinyal üretir.
  const playMorse = async () => {
    if (morseBlinking) return;
    const text = morseText.toUpperCase().slice(0, 12);
    const sequence = text.split("").map((ch) => morseMap[ch] || "").filter(Boolean).join(" ");
    if (!sequence) return Alert.alert("Bilgi", "Mors için harf/rakam girin.");
    setMorseBlinking(true);
    try {
      for (const ch of sequence) {
        if (ch === " ") {
          setMorseVisible(false);
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        setMorseVisible(true);
        await Haptics.impactAsync(ch === "-" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
        await new Promise((r) => setTimeout(r, ch === "-" ? 380 : 140));
        setMorseVisible(false);
        await new Promise((r) => setTimeout(r, 120));
      }
    } finally {
      setMorseVisible(false);
      setMorseBlinking(false);
    }
  };

  // [FONKSIYON] onSosPressIn: SOS butonuna basılı tutma animasyonunu başlatır.
  const onSosPressIn = () => {
    setSosHolding(true);
    holdAnim.stopAnimation();
    holdAnim.setValue(0);
    Animated.timing(holdAnim, {
      toValue: 1,
      duration: 850,
      useNativeDriver: false
    }).start();
  };

  // [FONKSIYON] onSosPressOut: SOS basılı tutma animasyonunu sonlandırır/sıfırlar.
  const onSosPressOut = () => {
    setSosHolding(false);
    holdAnim.stopAnimation();
    Animated.timing(holdAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const firstAidCards = [
    { key: "cpr", title: L("CPR / Kalp", "CPR / Cardiac"), icon: "heart", color: "#ef4444", bg: "#fee2e2" },
    { key: "bleed", title: L("Kanama", "Bleeding"), icon: "water", color: "#f59e0b", bg: "#fef3c7" },
    { key: "fracture", title: L("Kırık / Çıkık", "Fracture / Dislocation"), icon: "fitness", color: "#3b82f6", bg: "#dbeafe" },
    { key: "burn", title: L("Yanık", "Burn"), icon: "flame", color: "#eab308", bg: "#fef9c3" }
  ] as const;

  const firstAidGuideText: Record<"cpr" | "bleed" | "fracture" | "burn", {
    titleTr: string;
    titleEn: string;
    icon: string;
    iconColor: string;
    iconBg: string;
    stepsTr: string[];
    stepsEn: string[];
  }> = {
    cpr: {
      titleTr: "CPR / Kalp Masajı",
      titleEn: "CPR / Cardiac Massage",
      icon: "heart",
      iconColor: "#fb7185",
      iconBg: "rgba(239,68,68,0.18)",
      stepsTr: [
        "Güvenliği sağla, 112'yi ara.",
        "Sert zemine yatır.",
        "Göğüs kemiğinin alt yarısına el topuğunu koy.",
        "Dakikada 100-120 bası yap.",
        "30 bası / 2 nefes şeklinde devam et."
      ],
      stepsEn: [
        "Ensure safety and call emergency services.",
        "Lay the person on a firm surface.",
        "Place your palm on the lower half of the sternum.",
        "Perform 100-120 compressions per minute.",
        "Continue with 30 compressions / 2 breaths."
      ]
    },
    bleed: {
      titleTr: "Kanama Kontrolü",
      titleEn: "Bleeding Control",
      icon: "water",
      iconColor: "#fb923c",
      iconBg: "rgba(249,115,22,0.2)",
      stepsTr: [
        "Temiz bezle yaranın üzerine doğrudan bastır.",
        "Kanama durmazsa ikinci bez koy (ilkini kaldırma).",
        "Uzvu kalp seviyesinden yukarıda tut.",
        "Turnike sadece son çare olarak uygulanır."
      ],
      stepsEn: [
        "Apply direct pressure with a clean cloth.",
        "If bleeding continues, add another cloth without removing the first.",
        "Keep the limb elevated above heart level.",
        "Use a tourniquet only as a last resort."
      ]
    },
    fracture: {
      titleTr: "Kırık / Çıkık",
      titleEn: "Fracture / Dislocation",
      icon: "fitness",
      iconColor: "#60a5fa",
      iconBg: "rgba(59,130,246,0.2)",
      stepsTr: [
        "Bölgeyi hareket ettirme.",
        "Desteklemek için sert cisim (tahta vb.) ile sabitle.",
        "Şişliği önlemek için soğuk uygula.",
        "Asla kemiği yerine oturtmaya çalışma."
      ],
      stepsEn: [
        "Do not move the injured area.",
        "Immobilize with a rigid support (e.g., board).",
        "Apply cold to reduce swelling.",
        "Never try to reset the bone yourself."
      ]
    },
    burn: {
      titleTr: "Yanık Müdahalesi",
      titleEn: "Burn Care",
      icon: "flame",
      iconColor: "#facc15",
      iconBg: "rgba(234,179,8,0.2)",
      stepsTr: [
        "Bölgeyi en az 20 dk serin (buzlu olmayan) su altında tut.",
        "Giysiler yapışmışsa çekme, etrafından kes.",
        "Su toplayan yerleri patlatma.",
        "Üzerini temiz, nemli bezle ört."
      ],
      stepsEn: [
        "Cool the area under clean running water for at least 20 minutes.",
        "If clothing sticks, do not pull; cut around it.",
        "Do not pop blisters.",
        "Cover with a clean, moist cloth."
      ]
    }
  };

  // [FONKSIYON] openFirstAidGuide: İlk yardım kartına göre açıklama modalını açar.
  const openFirstAidGuide = (key: string) => {
    const typedKey = (["cpr", "bleed", "fracture", "burn"].includes(key) ? key : null) as "cpr" | "bleed" | "fracture" | "burn" | null;
    if (!typedKey) {
      showToast(L("Bu başlık için içerik hazırlanıyor.", "Content for this topic is being prepared."), "info");
      return;
    }
    setFirstAidModalKey(typedKey);
  };

  const urgentOpenCount = recentRequests.filter((r) => r.status !== "closed" && isUrgent(r.urgency)).length;
  const holdScale = holdAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const ringScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] });
  const ringOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] });
  const holdProgressWidth = holdAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#020204" : "#0b0910";
  const cardBg = lightMode ? "#ffffff" : "rgba(255,255,255,0.04)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textMuted = lightMode ? "#94a3b8" : "#94a3b8";
  const notifDeleteWidth = 86;
  const notifRowWidth = Math.max(230, Dimensions.get("window").width - 24 - 24 - 8);
  const notifRequests = recentRequests.filter((r) => !dismissedNotifs[r.id]);
  const firstAidGuide = firstAidModalKey ? firstAidGuideText[firstAidModalKey] : null;
  const firstAidTitle = firstAidGuide ? L(firstAidGuide.titleTr, firstAidGuide.titleEn) : "";
  const firstAidSteps = firstAidGuide ? (locale === "en" ? firstAidGuide.stepsEn : firstAidGuide.stepsTr) : [];
  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      <ScrollView style={{ flex: 1, backgroundColor: shellBg }} contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 900); }} tintColor="#ef4444" colors={["#ef4444"]} />}
      >
      <LinearGradient colors={lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000", "#000000"] : ["#14070c", "#2a0a14", "#3c0b19"]} style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 22 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <View>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 34, lineHeight: 36 }}>{L("Durum", "Status")}</Text>
            <Text style={{ color: "#fca5a5", fontFamily: "Inter-Bold", fontSize: 34, lineHeight: 36 }}>{L("Bildir", "Report")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 7 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: location ? "#10b981" : "#f59e0b", marginRight: 6 }} />
              <Text style={{ color: location ? "#6ee7b7" : "#fde68a", fontFamily: "Inter", fontSize: 11 }}>
                {location ? L("GPS AKTİF (±5m)", "GPS ACTIVE (±5m)") : L("GPS BAĞLANTISI BEKLENİYOR", "WAITING FOR GPS")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowNotifPanel((p) => !p)}
            style={{
              width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center"
            }}
          >
            <Ionicons name="notifications-outline" size={20} color="white" />
            {urgentOpenCount > 0 ? <View style={{ position: "absolute", top: 11, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444", borderWidth: 1, borderColor: "white" }} /> : null}
          </TouchableOpacity>
        </View>

        {/* GPS Mini Harita Widget (orijinal stil) */}
        <View style={{
          borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 12
        }}>
          <View style={{ height: 150 }}>
            {location ? (
              <MapView
                style={{ flex: 1 }}
                initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker coordinate={location} pinColor={C.blue} />
                {active?.location?.lat && active?.location?.lng ? (
                  <Marker coordinate={{ latitude: active.location.lat, longitude: active.location.lng }} pinColor={active?.status === "in_progress" ? C.amber : C.blue} />
                ) : null}
              </MapView>
            ) : (
              <View style={[s.center, { backgroundColor: "#111827" }]}><Text style={{ color: "#cbd5e1", fontFamily: "Inter" }}>{L("Konum bekleniyor...", "Waiting for location...")}</Text></View>
            )}
            <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(17,24,39,0.18)" }} />
            <View style={{
              position: "absolute", left: 10, right: 10, bottom: 10,
              backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
              borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between"
            }}>
              <View>
                <Text style={{ color: "#fca5a5", fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.4 }}>{L("CANLI İZLEME", "LIVE TRACKING")}</Text>
                <Text style={{ color: "white", fontFamily: "Inter", fontSize: 13 }}>
                  {active ? `${active.type || L("Aktif talep", "Active request")} • ${statusLabel[active.status || "open"]}` : L("Aktif talep yok", "No active request")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate("Map")}
                style={{ backgroundColor: "rgba(16,185,129,0.16)", borderColor: "rgba(16,185,129,0.35)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: "#6ee7b7", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("TAM HARİTA", "FULL MAP")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Hava Durumu Widget (orijinal stil) */}
        {weather ? (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 22 }}>
                {weather.code === 0 ? "☀️" : weather.code <= 3 ? "🌤️" : weather.code <= 48 ? "🌫️" : weather.code <= 67 ? "🌧️" : weather.code <= 77 ? "🌨️" : weather.code <= 82 ? "⛈️" : "🌩️"}
              </Text>
              <View>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20 }}>{weather.temp}°C</Text>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 11 }}>{L("Anlık Hava", "Current Weather")}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="speedometer-outline" size={13} color="rgba(255,255,255,0.65)" />
                <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 12 }}>{weather.wind} km/s</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Inter", fontSize: 10, marginTop: 2 }}>{L("Rüzgar", "Wind")}</Text>
            </View>
          </View>
        ) : null}

        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Animated.View style={{ transform: [{ scale: ringScale }], opacity: ringOpacity, position: "absolute", width: 244, height: 244, borderRadius: 122, backgroundColor: "#ef4444" }} />
          <Animated.View style={{ transform: [{ scale: holdScale }] }}>
            <TouchableOpacity
            delayLongPress={600}
            onLongPress={sendSOS}
            onPress={() => showToast(L("Acil SOS için butona basılı tutun.", "Hold the button for emergency SOS."), "info")}
            onPressIn={onSosPressIn}
            onPressOut={onSosPressOut}
            style={{ width: 210, height: 210, borderRadius: 105, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ position: "absolute", width: 236, height: 236, borderRadius: 118, borderWidth: 1, borderColor: "rgba(239,68,68,0.18)" }} />
            <View style={{ position: "absolute", width: 224, height: 224, borderRadius: 112, borderWidth: 1, borderColor: "rgba(239,68,68,0.08)" }} />
            <LinearGradient
              colors={["#ff3b3b", "#c1121f", "#7f1018"]}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={{
                width: 206, height: 206, borderRadius: 103,
                borderWidth: 5, borderColor: "#1f0a0e",
                alignItems: "center", justifyContent: "center",
                shadowColor: "#ef4444", shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12
              }}
            >
              <View style={{ position: "absolute", left: 16, right: 16, top: 16, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <Animated.View style={{ height: "100%", width: holdProgressWidth, backgroundColor: "rgba(255,255,255,0.9)" }} />
              </View>
              <Ionicons name="radio" size={42} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 42, lineHeight: 44, marginTop: 4 }}>SOS</Text>
              <View style={{ marginTop: 10, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ color: "#fee2e2", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 1 }}>
                  {sosHolding ? L("ACİL MOD HAZIRLANIYOR...", "PREPARING EMERGENCY...") : L("BASILI TUT", "HOLD")}
                </Text>
              </View>
            </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>


      {/* ============ AİLE PAYLAŞIMI (hızlı eylemlerin üstünde, ayrı blok) ============ */}
      <View style={{ marginTop: 18 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate("VictimFamilySafety")}
          activeOpacity={0.85}
          style={{
            width: "100%", borderRadius: 18, borderWidth: 1, borderColor: "rgba(16,185,129,0.22)",
            backgroundColor: "rgba(16,185,129,0.08)", padding: 12, flexDirection: "row", alignItems: "center"
          }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#10b981", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            <Ionicons name="people" size={20} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#d1fae5", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Aile Paylaşımı", "Family Sharing")}</Text>
            <Text style={{ color: "#86efac", fontFamily: "Inter", fontSize: 11 }}>{L("Yakınlarınla konum ve durum paylaş", "Share location & status")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, gap: 6 }}>
            <Text style={{ color: "#d1fae5", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("PAYLAŞ", "SHARE")}</Text>
            <Ionicons name="paper-plane-outline" size={14} color="#6ee7b7" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ============ HIZLI EYLEMLER (Tasarım 2 — vibrant gradient 2x2) ============ */}
      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.8 }}>{L("HIZLI EYLEMLER", "QUICK ACTIONS")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#ef4444" }} />
            <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 10 }}>{L("4 hızlı erişim", "4 quick links")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            { onPress: () => navigation.navigate("VictimRequest"), title: L("Talep Oluştur", "Create Request"), subtitle: L("Detaylı yardım iste", "Send detailed request"), icon: "document-text" as any, colors: ["#dc2626", "#7f1018"], badge: L("AI Destekli", "AI Powered") },
            { onPress: () => navigation.navigate("Map"), title: L("Canlı Harita", "Live Map"), subtitle: L("Yardım & konum görünümü", "Aid & location view"), icon: "map" as any, colors: ["#0ea5e9", "#1e40af"], badge: L("Gerçek Zamanlı", "Real-time") },
            { onPress: () => navigation.navigate("ChatDetail", { bot: true, title: "Afet.AI" }), title: "Afet.AI", subtitle: L("Akıllı triage asistanı", "Smart triage assistant"), icon: "sparkles" as any, colors: ["#8b5cf6", "#5b21b6"], badge: L("Gemini AI", "Gemini AI") },
            { onPress: () => navigation.navigate("Alerts"), title: L("Uyarılar", "Alerts"), subtitle: L("AFAD afet bildirimleri", "AFAD disaster alerts"), icon: "notifications" as any, colors: ["#f59e0b", "#b45309"], badge: L("Anlık", "Live") }
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={item.onPress}
              activeOpacity={0.85}
              style={{ width: "48%", borderRadius: 20, overflow: "hidden", shadowColor: item.colors[0], shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}
            >
              <LinearGradient
                colors={item.colors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 14, minHeight: 130, justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={item.icon} size={20} color="white" />
                  </View>
                  <View style={{ borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 8, letterSpacing: 0.3 }}>{item.badge}</Text>
                  </View>
                </View>
                <View>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 15 }}>{item.title}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter", fontSize: 11, marginTop: 3, lineHeight: 14 }} numberOfLines={2}>{item.subtitle}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ============ İLK YARDIM REHBERİ — Tek Birleşik Kart ============ */}
      <View style={{ marginTop: 16 }}>
        <View style={{ borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 14, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="medkit" size={18} color="#ef4444" />
              </View>
              <View>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{L("İlk Yardım Rehberi", "First Aid Guide")}</Text>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{L("Acil durumda hızlı rehber", "Quick guide in emergencies")}</Text>
              </View>
            </View>
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.1)", paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ color: lightMode ? "#047857" : "#6ee7b7", fontFamily: "Inter-Bold", fontSize: 9 }}>OFFLINE</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {firstAidCards.map((card) => (
              <TouchableOpacity
                key={card.key}
                onPress={() => openFirstAidGuide(card.key)}
                activeOpacity={0.85}
                style={{ width: "48%", borderRadius: 14, borderWidth: 1, borderColor: cardBorder, backgroundColor: lightMode ? "#f8fafc" : "rgba(255,255,255,0.03)", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: card.bg, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={card.icon as any} size={18} color={card.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }} numberOfLines={1}>{card.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                    <Text style={{ color: card.color, fontFamily: "Inter-Bold", fontSize: 9 }}>{L("AÇ", "OPEN")}</Text>
                    <Ionicons name="chevron-forward" size={10} color={card.color} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ============ ACİL ARAÇLAR PANELİ — Premium Gradient CTA ============ */}
      <View style={{ marginTop: 14 }}>
        <TouchableOpacity
          onPress={() => setShowToolsPanel((v) => !v)}
          activeOpacity={0.85}
          style={{ borderRadius: 20, overflow: "hidden", shadowColor: "#dc2626", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
        >
          <LinearGradient
            colors={["#7f1018", "#c1121f", "#dc2626"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="build" size={22} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Acil Araçlar Paneli", "Emergency Tools Panel")}</Text>
                  <View style={{ borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 8 }}>PRO</Text>
                  </View>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{L("Hayat kurtaran 4 acil araç", "4 life-saving tools")}</Text>
              </View>
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="chevron-forward" size={16} color="white" />
              </View>
            </View>
            {/* Mini araç önizleme */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                { icon: "flashlight-outline" as any, label: L("Fener", "Light") },
                { icon: "volume-high-outline" as any, label: L("Düdük", "Whistle") },
                { icon: "pulse-outline" as any, label: L("Mors", "Morse") },
                { icon: "stats-chart-outline" as any, label: L("Sismo", "Seismo") }
              ].map((tool, i) => (
                <View key={i} style={{ flex: 1, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingVertical: 8, alignItems: "center", gap: 4 }}>
                  <Ionicons name={tool.icon} size={16} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{tool.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      </LinearGradient>

      </ScrollView>

      {showToolsPanel ? (
        <View style={{ position: "absolute", inset: 0, zIndex: 10, justifyContent: "center" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowToolsPanel(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.52)" }} />
          <Animated.View
            style={{
              marginHorizontal: 12,
              borderRadius: 22,
              backgroundColor: "rgba(88,10,24,0.97)",
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.24)",
              padding: 12,
              maxHeight: "78%",
              shadowColor: "#000",
              shadowOpacity: 0.32,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 12 },
              elevation: 18,
              transform: [{ translateY: toolsSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
              opacity: toolsSheetAnim
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Acil Araçlar Paneli", "Emergency Tools Panel")}</Text>
                <TouchableOpacity onPress={() => setShowToolsPanel(false)}><Ionicons name="close" size={18} color="#fecaca" /></TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <TouchableOpacity onPress={() => { setShowToolsPanel(false); navigation.navigate("VictimTools"); }} style={{ flex: 1, borderRadius: 16, backgroundColor: "rgba(127,29,29,0.26)", borderWidth: 1, borderColor: "rgba(248,113,113,0.16)", padding: 12 }}>
                  <Ionicons name="flashlight-outline" size={20} color="#fff" />
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 8 }}>{L("Fener", "Flashlight")}</Text>
                  <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{L("Acil Araçlar Pro ekranından aç", "Open from Emergency Tools Pro")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleWhistle} style={{ flex: 1, borderRadius: 16, backgroundColor: whistleOn ? "rgba(239,68,68,0.14)" : "rgba(127,29,29,0.26)", borderWidth: 1, borderColor: whistleOn ? "rgba(248,113,113,0.28)" : "rgba(248,113,113,0.16)", padding: 12 }}>
                  <Ionicons name="volume-high-outline" size={20} color={whistleOn ? "#f87171" : "#fff"} />
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 8 }}>{L("Düdük", "Whistle")}</Text>
                  <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{whistleOn ? `${L("Aktif", "Active")} • ${whistlePreset.toUpperCase()}` : L("Yüksek alarm sesi", "High alarm sound")}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {[
                  { key: "siren", label: "Siren", db: "90dB+" },
                  { key: "beacon", label: "Beacon", db: "80dB+" },
                  { key: "sos", label: "SOS", db: "Pulse" }
                ].map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => setWhistlePreset(p.key as any)}
                    style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: whistlePreset === p.key ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.06)", backgroundColor: whistlePreset === p.key ? "rgba(239,68,68,0.12)" : "rgba(127,29,29,0.22)", paddingVertical: 8, alignItems: "center" }}
                  >
                    <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{p.label}</Text>
                    <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 9, marginTop: 1 }}>{p.db}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ borderRadius: 16, backgroundColor: "rgba(127,29,29,0.22)", borderWidth: 1, borderColor: "rgba(248,113,113,0.12)", padding: 10, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Mors İşaretleyici", "Morse Signaler")}</Text>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: morseVisible ? "#ef4444" : "rgba(255,255,255,0.12)" }} />
                </View>
                <TextInput
                  value={morseText}
                  onChangeText={(t) => setMorseText(t.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 12))}
                  placeholder="SOS"
                  placeholderTextColor="#94a3b8"
                  style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(248,113,113,0.12)", color: "white", paddingHorizontal: 10, paddingVertical: 8, fontFamily: "Inter-Bold" }}
                />
                <TouchableOpacity onPress={playMorse} style={{ marginTop: 8, borderRadius: 12, backgroundColor: "#991b1b", alignItems: "center", justifyContent: "center", height: 40 }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{morseBlinking ? L("MORS ÇALIŞIYOR...", "MORSE RUNNING...") : L("MORS ÇALIŞTIR", "RUN MORSE")}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ borderRadius: 16, backgroundColor: "rgba(127,29,29,0.22)", borderWidth: 1, borderColor: "rgba(248,113,113,0.12)", padding: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Sismograf", "Seismograph")}</Text>
                  <TouchableOpacity onPress={() => setSismographOn((v) => !v)} style={{ borderRadius: 999, backgroundColor: sismographOn ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 9, paddingVertical: 4 }}>
                    <Text style={{ color: sismographOn ? "#86efac" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 }}>{sismographOn ? L("AKTİF", "ACTIVE") : L("PASİF", "INACTIVE")}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 54, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", paddingHorizontal: 6, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                  {sismoBars.map((v, i) => (
                    <View key={i} style={{ flex: 1, height: `${Math.max(8, Math.round(v * 100))}%`, borderRadius: 3, backgroundColor: v > 0.7 ? "#ef4444" : v > 0.45 ? "#f59e0b" : "#22c55e" }} />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity onPress={() => { setShowToolsPanel(false); navigation.navigate("VictimTools"); }} style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(127,29,29,0.26)", borderWidth: 1, borderColor: "rgba(248,113,113,0.14)", height: 42, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("ACİL ARAÇLAR PRO", "EMERGENCY TOOLS PRO")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowToolsPanel(false)} style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.22)", height: 42, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("PANELİ KAPAT", "CLOSE PANEL")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}

      {showNotifPanel ? (
        <View style={{ position: "absolute", inset: 0, zIndex: 12 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowNotifPanel(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.42)" }} />
          <Animated.View
            style={{
              position: "absolute",
              top: 82,
              left: 12,
              right: 12,
              borderRadius: 22,
              backgroundColor: "rgba(79,9,22,0.98)",
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.24)",
              padding: 12,
              shadowColor: "#000",
              shadowOpacity: 0.3,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 12 },
              elevation: 20,
              transform: [{ translateY: notifSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
              opacity: notifSheetAnim
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 16 }}>{L("Bildirim Merkezi", "Notification Center")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity onPress={() => { setShowNotifPanel(false); navigation.navigate("Alerts"); }} style={{ borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("TÜM UYARILAR", "ALL ALERTS")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowNotifPanel(false)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                  <Ionicons name="close" size={16} color="#fecaca" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 }}>
              <Text style={{ color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.6 }}>{L("ACİL ÖZET", "EMERGENCY SUMMARY")}</Text>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter", fontSize: 12, marginTop: 4 }}>
                {urgentOpenCount > 0 ? L(`${urgentOpenCount} acil talep hareket halinde veya beklemede.`, `${urgentOpenCount} urgent request(s) in progress or pending.`) : L("Şu anda acil öncelikli yeni bildirim bulunmuyor.", "No urgent priority notifications at the moment.")}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
              {notifRequests.length ? notifRequests.slice(0, 6).map((r) => (
                <ScrollView
                  key={r.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  bounces={false}
                  snapToOffsets={[0, notifDeleteWidth]}
                  decelerationRate="fast"
                  style={{ marginBottom: 7 }}
                  contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
                >
                  <TouchableOpacity
                    onPress={() => { setShowNotifPanel(false); navigation.navigate("VictimRequestStatus", { requestId: r.id }); }}
                    style={{
                      width: notifRowWidth,
                      borderRadius: 14,
                      backgroundColor: "rgba(255,255,255,0.03)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.06)",
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      flexDirection: "row",
                      alignItems: "center"
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isUrgent(r.urgency) ? "#ef4444" : "#22c55e", marginRight: 9 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }} numberOfLines={1}>{r.type || L("Yardım Talebi", "Help Request")}</Text>
                      <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11 }} numberOfLines={1}>{statusLabel[r.status || "open"]} • {urgencyLabel(r.urgency)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#fff1f2" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDismissedNotifs((prev) => ({ ...prev, [r.id]: true }))}
                    style={{
                      width: notifDeleteWidth - 8,
                      marginLeft: 8,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#dc2626",
                      borderWidth: 1,
                      borderColor: "rgba(248,113,113,0.25)"
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="white" />
                    <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10, marginTop: 2 }}>{L("SİL", "DEL")}</Text>
                  </TouchableOpacity>
                </ScrollView>
              )) : (
                <Text style={{ color: "#fee2e2", fontFamily: "Inter", fontSize: 12 }}>{L("Yeni bildirim yok.", "No new notifications.")}</Text>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}

      <Modal
        visible={Boolean(firstAidGuide)}
        transparent
        animationType="fade"
        onRequestClose={() => setFirstAidModalKey(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 28,
              backgroundColor: lightMode ? "#ffffff" : "#070b18",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.25)",
              paddingHorizontal: 20,
              paddingVertical: 20
            }}
          >
            {firstAidGuide ? (
              <>
                <View style={{ width: 86, height: 86, borderRadius: 43, alignSelf: "center", backgroundColor: firstAidGuide.iconBg, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <Ionicons name={firstAidGuide.icon as any} size={40} color={firstAidGuide.iconColor} />
                </View>
                <Text style={{ color: lightMode ? "#0f172a" : "#f1f5f9", fontFamily: "Inter-Bold", fontSize: 22, textAlign: "center", marginBottom: 12 }}>
                  {firstAidTitle}
                </Text>
                <View style={{ gap: 8 }}>
                  {firstAidSteps.map((step, idx) => (
                    <Text key={`${firstAidModalKey}-${idx}`} style={{ color: lightMode ? "#334155" : "#cbd5e1", fontFamily: "Inter", fontSize: 15, lineHeight: 26 }}>
                      {`${idx + 1}. ${step}`}
                    </Text>
                  ))}
                </View>
              </>
            ) : null}

            <TouchableOpacity
              onPress={() => setFirstAidModalKey(null)}
              style={{
                marginTop: 18,
                borderRadius: 16,
                height: 54,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: lightMode ? "#e2e8f0" : "#1d2b45"
              }}
            >
              <Text style={{ color: lightMode ? "#0f172a" : "#f1f5f9", fontFamily: "Inter-Bold", fontSize: 20 }}>
                {L("Anlaşıldı", "Got it")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};
