import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, ScrollView, Text, TextInput, TouchableOpacity, View,
  Ionicons, MapView, Marker, Polyline, Location, useNavigation,
  doc, onSnapshot, serverTimestamp, updateDoc, useStore, C, transitionRequestStatusViaApi, kmBetween, Haptics
} from "../shared/ScreenDeps";
import { db } from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * VOL-TRACK DOSYA HARITASI
 * - VOL-TRACK-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-TRACK-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-TRACK-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type ActionKind = false | "checkin" | "route" | "checkout" | "complete" | "cancel";

// [FONKSIYON] VolunteerTaskTrackingScreen: Atanmış görevin saha adımlarını (check-in/yol/tamamla) yönetir.
export const VolunteerTaskTrackingScreen = ({ route }: { route: any }) => {
  const navigation = useNavigation<any>();
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const requestId = route?.params?.requestId as string | undefined;

  const [request, setRequest] = useState<Req | null>(null);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [working, setWorking] = useState<ActionKind>(false);
  const [completionNote, setCompletionNote] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const pulse = useRef(new Animated.Value(0)).current;
  const stepPulse = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(stepPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(stepPulse, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    ).start();
  }, [stepPulse]);

  // [FONKSIYON] goBackSafe: Güvenli geri dönüş yapar; stack yoksa Home'a döner.
  const goBackSafe = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else { try { navigation.goBack(); } catch {} }
  };

  // [FONKSIYON] animateSuccess: Başarılı işlem sonrası kısa görsel geri bildirim gösterir.
  const animateSuccess = (text: string) => {
    setActionNotice(text);
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 260, useNativeDriver: true })
    ]).start();
    setTimeout(() => setActionNotice(""), 1600);
  };

  // VOL-TRACK-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!requestId) return;
    return onSnapshot(
      doc(db, "requests", requestId),
      (snap) => {
        if (snap.exists()) setRequest({ id: snap.id, ...snap.data() } as Req);
      },
      (err: any) => {
        console.warn("[volunteer-task-tracking] request snapshot error:", err);
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Görev takibi verisi yüklenemedi.", "Mission tracking data could not be loaded."), "error");
        }
      }
    );
  }, [requestId, showToast, locale]);

  // VOL-TRACK-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    let timer: any;
    const run = async (): Promise<void> => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await Location.getCurrentPositionAsync({});
      const loc = { latitude: now.coords.latitude, longitude: now.coords.longitude };
      setMyLoc(loc);
      if (requestId && request?.status !== "closed") {
        await updateDoc(doc(db, "requests", requestId), {
          volunteerLive: { lat: loc.latitude, lng: loc.longitude },
          updatedAt: serverTimestamp()
        }).catch(() => null);
      }
    };
    void run();
    timer = setInterval(() => void run(), 15000);
    return () => clearInterval(timer);
  }, [request?.status, requestId]);

  const victimPoint =
    request?.location?.lat && request?.location?.lng
      ? { latitude: request.location.lat, longitude: request.location.lng }
      : null;

  const routePath = useMemo(
    () => (victimPoint && myLoc ? [myLoc, victimPoint] : []),
    [victimPoint, myLoc]
  );

  const stage =
    request?.status === "closed"
      ? 3
      : request?.status === "in_progress"
        ? 2
        : request?.status === "assigned"
          ? 1
          : 0;

  useEffect(() => {
    Animated.timing(lineAnim, { toValue: stage, duration: 700, useNativeDriver: false }).start();
  }, [stage, lineAnim]);

  const steps = [
    { label: L("Görev Alındı", "Mission Accepted"), icon: "checkmark" as const },
    { label: L("Yola Çıkıldı", "En Route"), icon: "walk" as const },
    { label: L("Yardıma Ulaşıldı", "Aid Arrived"), icon: "medkit" as const },
    { label: L("Görev Tamamlandı", "Mission Completed"), icon: "flag" as const }
  ];

  // [FONKSIYON] safeHaptic: İşlem öncesi cihaz titreşim geri bildirimi verir.
  const safeHaptic = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  };

  // VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] markCheckIn: Göreve başlangıç check-in zamanını request dokümanına yazar.
  const markCheckIn = async () => {
    if (!requestId || working || request?.checkInAt) return;
    setWorking("checkin");
    try {
      await safeHaptic();
      await updateDoc(doc(db, "requests", requestId), {
        checkInAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      animateSuccess(L("Check-in kaydedildi", "Check-in saved"));
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Check-in kaydedilemedi.", "Check-in could not be saved."));
    } finally {
      setWorking(false);
    }
  };

  // VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] startRoute: Görevi "yola çıkıldı / in_progress" durumuna geçirir.
  const startRoute = async () => {
    if (!requestId || working) return;
    setWorking("route");
    try {
      await safeHaptic();
      await transitionRequestStatusViaApi(requestId, "START_ROUTE");
      animateSuccess(L("Görev durumu güncellendi", "Mission status updated"));
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Durum güncellenemedi.", "Status could not be updated."));
    } finally {
      setWorking(false);
    }
  };

  // VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] markCheckOut: Saha çıkış zamanını request dokümanına kaydeder.
  const markCheckOut = async () => {
    if (!requestId || working || request?.checkOutAt) return;
    setWorking("checkout");
    try {
      await safeHaptic();
      await updateDoc(doc(db, "requests", requestId), {
        checkOutAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      animateSuccess(L("Check-out kaydedildi", "Check-out saved"));
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Check-out kaydedilemedi.", "Check-out could not be saved."));
    } finally {
      setWorking(false);
    }
  };

  // VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] completeTask: Gerekirse not kaydedip görevi COMPLETE akışıyla kapatır.
  const completeTask = async () => {
    if (!requestId || working) return;
    setWorking("complete");
    try {
      await safeHaptic();
      if (completionNote.trim()) {
        await updateDoc(doc(db, "requests", requestId), {
          completionNote: completionNote.trim(),
          updatedAt: serverTimestamp()
        });
      }
      await transitionRequestStatusViaApi(requestId, "COMPLETE");
      animateSuccess(L("Görev tamamlandı", "Mission completed"));
      setTimeout(() => goBackSafe(), 500);
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Görev tamamlanamadı.", "Mission could not be completed."));
    } finally {
      setWorking(false);
    }
  };

  // VOL-TRACK-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] cancelTask: Onay sonrası görevi bırakır ve talebi tekrar açık duruma taşır.
  const cancelTask = () => {
    if (!requestId || working) return;
    Alert.alert(
      L("Görevden Vazgeç", "Cancel Mission"),
      L("Görevi bırakıp talebi tekrar aktif duruma almak istiyor musunuz?", "Do you want to leave this mission and reopen the request?"),
      [
        { text: L("İptal", "Cancel"), style: "cancel" },
        {
          text: L("Vazgeç", "Leave"),
          style: "destructive",
          onPress: async () => {
            setWorking("cancel");
            try {
              await safeHaptic();
              await transitionRequestStatusViaApi(requestId, "REOPEN");
              await updateDoc(doc(db, "requests", requestId), {
                assignedVolunteerId: null,
                updatedAt: serverTimestamp()
              }).catch(() => null);
              animateSuccess(L("Görev bırakıldı", "Mission released"));
              setTimeout(() => goBackSafe(), 500);
            } catch (e: any) {
              Alert.alert(L("Hata", "Error"), e?.message || L("Görev bırakılamadı.", "Mission could not be released."));
            } finally {
              setWorking(false);
            }
          }
        }
      ]
    );
  };

  const shell = lightMode ? "#f8fafc" : amoledMode ? "#06070a" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#0a0c10" : "#2a0d16";
  const card = lightMode ? "#ffffff" : amoledMode ? "#101218" : "#3a101c";
  const soft = "rgba(255,255,255,0.06)";

  const canCheckIn = !!request && request.status === "assigned" && !request.checkInAt;
  const canStartRoute = !!request && request.status === "assigned";
  const canCheckOut = !!request && request.status === "in_progress" && !request.checkOutAt;
  const canComplete = !!request && request.status === "in_progress";
  const canCancel = !!request && (request.status === "assigned" || request.status === "in_progress");

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 92 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <TouchableOpacity
            onPress={goBackSafe}
            style={{
              width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: soft
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff1f2" />
          </TouchableOpacity>
          <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 15, marginLeft: 10 }}>{L("Afet Yardımı Sistemi", "Disaster Aid System")}</Text>
        </View>

        <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 34, lineHeight: 38, marginBottom: 10 }}>
          {L("Görev Takibi", "Mission Tracking")}
        </Text>

        <Animated.View
          style={{
            transform: [{ scale: pulseScale }],
            opacity: actionNotice ? 1 : 0,
            marginBottom: actionNotice ? 10 : 0,
            height: actionNotice ? undefined : 0
          }}
        >
          <View
            style={{
              borderRadius: 14,
              backgroundColor: "rgba(34,197,94,0.14)",
              borderWidth: 1,
              borderColor: "rgba(34,197,94,0.24)",
              paddingVertical: 10,
              paddingHorizontal: 12
            }}
          >
            <Text style={{ color: "#dcfce7", fontFamily: "Inter-Bold", fontSize: 12 }}>{actionNotice}</Text>
          </View>
        </Animated.View>

        <View style={{ borderRadius: 22, backgroundColor: panel, borderWidth: 1, borderColor: soft, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>{L("GÖREV AŞAMALARI", "MISSION STAGES")}</Text>
          {steps.map((stepItem, i) => {
            const active = i === stage;
            const done = i < stage || (request?.status === "closed" && i === 3);
            const pulseOpacity = stepPulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] });
            const pulseScale = stepPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
            return (
              <View key={stepItem.label} style={{ flexDirection: "row" }}>
                <View style={{ width: 44, alignItems: "center" }}>
                  {/* Animated outer ring for active step */}
                  {active ? (
                    <Animated.View style={{
                      position: "absolute",
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: "rgba(239,68,68,0.18)",
                      opacity: pulseOpacity,
                      transform: [{ scale: pulseScale }]
                    }} />
                  ) : null}
                  <View style={{
                    width: active ? 40 : done ? 32 : 30,
                    height: active ? 40 : done ? 32 : 30,
                    borderRadius: active ? 20 : done ? 16 : 15,
                    backgroundColor: active ? "#ef4444" : done ? "#22c55e" : "rgba(255,255,255,0.1)",
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? "rgba(248,113,113,0.5)" : done ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.15)",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: active ? "#ef4444" : done ? "#22c55e" : "transparent",
                    shadowOpacity: active ? 0.55 : done ? 0.3 : 0,
                    shadowRadius: active ? 12 : 6,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: active ? 10 : done ? 4 : 0
                  }}>
                    <Ionicons name={done ? "checkmark" : stepItem.icon} size={active ? 18 : 14} color="white" />
                  </View>
                  {i < steps.length - 1 ? (
                    <View style={{ width: 2, height: 44, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <Animated.View style={{
                        width: 2,
                        backgroundColor: "#ef4444",
                        height: lineAnim.interpolate({
                          inputRange: [0, steps.length - 1],
                          outputRange: ["0%", "100%"]
                        })
                      }} />
                      {done ? <View style={{ position: "absolute", top: 0, width: 2, height: "100%", backgroundColor: "#22c55e" }} /> : null}
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingLeft: 12, paddingTop: active ? 8 : 5, paddingBottom: i < steps.length - 1 ? 8 : 0 }}>
                  <Text style={{
                    color: active ? "#fff1f2" : done ? "#86efac" : "#64748b",
                    fontFamily: active ? "Inter-Bold" : "Inter",
                    fontSize: active ? 16 : 14
                  }}>
                    {stepItem.label}
                  </Text>
                  {active ? (
                    <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
                      {L("Şu an bu aşamadasınız", "You are at this stage")}
                    </Text>
                  ) : done ? (
                    <Text style={{ color: "#4ade80", fontFamily: "Inter-Bold", fontSize: 10, marginTop: 2 }}>✓ TAMAMLANDI</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 12 }}>
            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{L("ETA", "ETA")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, marginTop: 4 }}>
              {request?.status === "closed" ? L("Tamam", "Done") : request?.status === "in_progress" ? `15 ${L("dk", "min")}` : L("Hazırlanıyor", "Preparing")}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 12 }}>
            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{L("Mesafe", "Distance")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, marginTop: 4 }}>
              {kmBetween(myLoc, request?.location) || "-"} km
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 12 }}>
            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{L("Check-in", "Check-in")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14, marginTop: 4 }}>
              {request?.checkInAt ? L("Kayıtlı", "Saved") : L("Yok", "None")}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 12 }}>
            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{L("Check-out", "Check-out")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14, marginTop: 4 }}>
              {request?.checkOutAt ? L("Kayıtlı", "Saved") : L("Yok", "None")}
            </Text>
          </View>
        </View>

        <View style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: soft, backgroundColor: panel, marginBottom: 14 }}>
          <View style={{ height: 210 }}>
            {routePath.length === 2 ? (
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  latitude: routePath[0].latitude,
                  longitude: routePath[0].longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker coordinate={routePath[0]} pinColor={C.blue} title={L("Gönüllü", "Volunteer")} />
                <Marker coordinate={routePath[1]} pinColor={C.red} title={L("Afetzede", "Victim")} />
                <Polyline coordinates={routePath as any} strokeColor={C.blue} strokeWidth={4} />
              </MapView>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: card }}>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter" }}>{L("Rota yükleniyor...", "Loading route...")}</Text>
              </View>
            )}
          </View>
          <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: soft }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Canlı konum güncelleniyor (15 sn)", "Live location updates (15s)")}</Text>
            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 3 }}>
              {L("Yol durumunu ve görev aşamasını yönetici paneline aktarır.", "Sends route status and mission stage to coordinator panel.")}
            </Text>
          </View>
        </View>

        <View style={{ borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginBottom: 8 }}>{L("Görev Notu / Teslim Raporu", "Mission Note / Delivery Report")}</Text>
          <TextInput
            value={completionNote}
            onChangeText={setCompletionNote}
            placeholder={L("Teslim notu, ihtiyaç durumu, saha gözlemi...", "Delivery note, needs status, field observation...")}
            placeholderTextColor="#9ca3af"
            multiline
            style={{
              minHeight: 78,
              color: "white",
              fontFamily: "Inter",
              fontSize: 12,
              backgroundColor: "rgba(255,255,255,0.03)",
              borderWidth: 1,
              borderColor: soft,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              textAlignVertical: "top" as any
            }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <TouchableOpacity
            onPress={markCheckIn}
            disabled={!canCheckIn || !!working}
            style={{
              flex: 1, borderRadius: 14, height: 46, alignItems: "center", justifyContent: "center",
              backgroundColor: canCheckIn ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
              borderWidth: 1, borderColor: canCheckIn ? "rgba(34,197,94,0.24)" : soft
            }}
          >
            <Text style={{ color: canCheckIn ? "#dcfce7" : "#94a3b8", fontFamily: "Inter-Bold", fontSize: 12 }}>
              {working === "checkin" ? L("KAYDEDİLİYOR...", "SAVING...") : L("CHECK-IN", "CHECK-IN")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={markCheckOut}
            disabled={!canCheckOut || !!working}
            style={{
              flex: 1, borderRadius: 14, height: 46, alignItems: "center", justifyContent: "center",
              backgroundColor: canCheckOut ? "rgba(59,130,246,0.14)" : "rgba(255,255,255,0.03)",
              borderWidth: 1, borderColor: canCheckOut ? "rgba(59,130,246,0.24)" : soft
            }}
          >
            <Text style={{ color: canCheckOut ? "#dbeafe" : "#94a3b8", fontFamily: "Inter-Bold", fontSize: 12 }}>
              {working === "checkout" ? L("KAYDEDİLİYOR...", "SAVING...") : L("CHECK-OUT", "CHECK-OUT")}
            </Text>
          </TouchableOpacity>
        </View>

        {canStartRoute ? (
          <TouchableOpacity
            onPress={startRoute}
            disabled={!!working}
            style={{ borderRadius: 18, overflow: "hidden", marginBottom: 10, shadowColor: "#c5121f", shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 }}
          >
            <View style={{ height: 60, backgroundColor: "#c5121f", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Ionicons name={working === "route" ? "hourglass-outline" : "navigate-outline"} size={22} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17 }}>
                {working === "route" ? L("GÜNCELLENİYOR...", "UPDATING...") : L("YOLA ÇIKTIM", "EN ROUTE")}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {canComplete ? (
          <TouchableOpacity
            onPress={completeTask}
            disabled={!!working}
            style={{ borderRadius: 18, overflow: "hidden", marginBottom: 10, shadowColor: "#15803d", shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 }}
          >
            <View style={{ height: 60, backgroundColor: "#15803d", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Ionicons name={working === "complete" ? "hourglass-outline" : "flag-outline"} size={22} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17 }}>
                {working === "complete" ? L("TAMAMLANIYOR...", "COMPLETING...") : L("YARDIMA ULAŞTIM / TAMAMLANDI", "AID ARRIVED / COMPLETED")}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {canCancel ? (
          <TouchableOpacity
            onPress={cancelTask}
            disabled={!!working}
            style={{
              height: 48,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.26)",
              backgroundColor: "rgba(239,68,68,0.06)",
              marginBottom: 10
            }}
          >
            <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 13 }}>
              {working === "cancel" ? L("İŞLENİYOR...", "PROCESSING...") : L("GÖREVDEN VAZGEÇ", "LEAVE MISSION")}
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={{ textAlign: "center", color: "#fda4af", fontFamily: "Inter", fontSize: 12 }}>
          {L("Görev tamamlandığında sistem otomatik olarak güncellenecektir.", "System updates automatically when mission is completed.")}
        </Text>
      </ScrollView>
    </View>
  );
};
