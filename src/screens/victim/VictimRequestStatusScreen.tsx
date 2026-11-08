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
import { Image } from "react-native";
import { l } from "../../services/i18n";

/**
 * VICTIM-STATUS DOSYA HARITASI
 * - VICTIM-STATUS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VICTIM-STATUS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VICTIM-STATUS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-STATUS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimRequestStatusScreen: Talebin canlı durum, adım ve rota bilgisini gösterir.
export const VictimRequestStatusScreen = ({ navigation, route }: { navigation: any; route: any }) => {
  const { user } = useStore();
  const locale = useStore((state) => state.locale);
  const showToast = useStore((state) => state.showToast);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const requestId = route?.params?.requestId as string | undefined;
  const [request, setRequest] = useState<Req | null>(null);

  // VICTIM-STATUS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user) return;
    if (requestId) {
      return onSnapshot(
        doc(db, "requests", requestId),
        (snap) => {
          if (snap.exists()) setRequest({ id: snap.id, ...snap.data() } as Req);
        },
        (err) => {
          console.warn("[victim request status] doc snapshot:", err);
          setRequest(null);
          if (!String((err as any)?.code || "").includes("permission-denied")) {
            showToast(L("Talep durumu yüklenemedi.", "Request status could not be loaded."), "error");
          }
        }
      );
    }
    const qCreatedBy = query(collection(db, "requests"), where("createdBy", "==", user.uid), limit(80));
    const qUserId = query(collection(db, "requests"), where("userId", "==", user.uid), limit(80));
    let createdRows: Req[] = [];
    let userRows: Req[] = [];

    // [FONKSIYON] mergeLatest: createdBy/userId sorgularını birleştirip en güncel talebi seçer.
    const mergeLatest = () => {
      const map = new Map<string, Req>();
      [...createdRows, ...userRows].forEach((r) => map.set(r.id, r));
      const sorted = Array.from(map.values()).sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
      setRequest(sorted[0] || null);
    };

    const unsubCreated = onSnapshot(
      qCreatedBy,
      (snap) => {
        createdRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req));
        mergeLatest();
      },
      (err) => {
        console.warn("[victim request status] list snapshot(createdBy):", err);
        createdRows = [];
        mergeLatest();
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Talep listesi yüklenemedi.", "Request list could not be loaded."), "error");
        }
      }
    );

    const unsubUser = onSnapshot(
      qUserId,
      (snap) => {
        userRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req));
        mergeLatest();
      },
      (err) => {
        console.warn("[victim request status] list snapshot(userId):", err);
        userRows = [];
        mergeLatest();
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Talep listesi yüklenemedi.", "Request list could not be loaded."), "error");
        }
      }
    );

    return () => {
      unsubCreated();
      unsubUser();
    };
  }, [user, requestId, showToast, locale]);

  const activeStep = request?.status === "closed" ? 4 : request?.status === "in_progress" ? 3 : request?.status === "assigned" ? 2 : 1;

  const volunteerPoint = request?.volunteerLive?.lat && request?.volunteerLive?.lng
    ? { latitude: request.volunteerLive.lat, longitude: request.volunteerLive.lng }
    : request?.location?.lat && request?.location?.lng
    ? { latitude: request.location.lat + 0.0045, longitude: request.location.lng - 0.007 }
    : null;

  const victimPoint = request?.location?.lat && request?.location?.lng ? { latitude: request.location.lat, longitude: request.location.lng } : null;
  const path = volunteerPoint && victimPoint ? [volunteerPoint, victimPoint] : [];
  const routeHint =
    request?.status === "closed"
      ? L("Yardım ekibi konumunuza ulaştı", "Aid team reached your location")
      : request?.status === "in_progress"
      ? L("Yardım ekibi konumunuza doğru ilerliyor", "Aid team is heading to your location")
      : request?.status === "assigned"
      ? L("Gönüllü atandı, hazırlık aşamasında", "Volunteer assigned, preparing")
      : L("Atama bekleniyor", "Waiting for assignment");
  const createdMs = toMillis(request?.createdAt);
  const ageMin = createdMs ? Math.max(1, Math.round((Date.now() - createdMs) / 60000)) : null;
  const ageLabel = ageMin == null
    ? "—"
    : ageMin < 60
      ? L(`${ageMin} dk önce`, `${ageMin} min ago`)
      : ageMin < 1440
        ? L(`${Math.round(ageMin / 60)} sa önce`, `${Math.round(ageMin / 60)} h ago`)
        : L(`${Math.round(ageMin / 1440)} gün önce`, `${Math.round(ageMin / 1440)} d ago`);

  const meta = requestTypeMeta(request?.type);
  const status = request?.status || "open";
  const statusAccent =
    status === "closed" ? "#22c55e"
    : status === "in_progress" ? "#3b82f6"
    : status === "assigned" ? "#f59e0b"
    : "#ef4444";
  const statusBigLabel =
    status === "closed" ? L("Yardım Tamamlandı", "Help Completed")
    : status === "in_progress" ? L("Ekip Yolda", "Team En Route")
    : status === "assigned" ? L("Gönüllü Atandı", "Volunteer Assigned")
    : L("Talep Alındı", "Request Received");
  const statusSubLabel =
    status === "closed" ? L("Talebiniz başarıyla kapatıldı", "Your request was closed successfully")
    : status === "in_progress" ? L("Ekip konumunuza ilerliyor", "Team is heading to your location")
    : status === "assigned" ? L("Atanan gönüllü hazırlanıyor", "Assigned volunteer is preparing")
    : L("Koordinatör size gönüllü atayacak", "Coordinator will assign a volunteer");
  const statusIcon: any =
    status === "closed" ? "checkmark-done-circle"
    : status === "in_progress" ? "navigate-circle"
    : status === "assigned" ? "person-circle"
    : "alert-circle";
  const urgencyLow = `${request?.urgency || ""}`.toLocaleLowerCase("tr");
  const urgencyAccent = urgencyLow.includes("acil") || urgencyLow.includes("yuk") || urgencyLow.includes("high") ? "#ef4444"
    : urgencyLow.includes("orta") || urgencyLow.includes("med") ? "#f59e0b"
    : "#22c55e";

  const aiWaitHint =
      request?.type?.toLowerCase().includes("saglik") || request?.type?.toLowerCase().includes("yarali")
      ? L(
          "Yaralıyı gereksiz hareket ettirmeyin. Kanama varsa temiz baskı uygulayın ve AI destekten adım alın.",
          "Avoid unnecessary movement. If there is bleeding, apply clean pressure and follow AI guidance."
        )
      : request?.type?.toLowerCase().includes("barin")
      ? L(
          "Güvenli, açık ve ikinci risklerden uzak noktada bekleyin. Toplanma alanlarını haritadan kontrol edin.",
          "Wait in a safe open point away from secondary risks. Check assembly points on the map."
        )
      : L(
          "Telefon bataryasını koruyun, konumunuzu açık tutun ve gerekirse Afet.AI ile ek yönlendirme alın.",
          "Preserve phone battery, keep location on, and get extra guidance from Afet.AI if needed."
        );

  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#060408" : "#0f0610";
  const cardBg = lightMode ? "#ffffff" : "rgba(255,255,255,0.04)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#cbd5e1";
  const textMuted = lightMode ? "#94a3b8" : "#94a3b8";

  // Timeline adımları (4 adım, sade)
  const tlSteps = [
    { key: "open", label: L("Talep Alındı", "Request Received"), icon: "document-text" as any },
    { key: "assigned", label: L("Gönüllü Atandı", "Volunteer Assigned"), icon: "person-add" as any },
    { key: "in_progress", label: L("Ekip Yolda", "Team En Route"), icon: "navigate" as any },
    { key: "closed", label: L("Tamamlandı", "Completed"), icon: "checkmark-done" as any }
  ];
  const activeIdx = tlSteps.findIndex((s) => s.key === status);
  const safeActiveIdx = activeIdx < 0 ? 0 : activeIdx;

  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      {/* Gradient header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#3f0914", "#1f060d"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <TouchableOpacity onPress={() => navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate("Home")} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım", "Disaster Aid")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Talep Durumu", "Request Status")}</Text>
          </View>
          {request ? (
            <View style={{ borderRadius: 999, backgroundColor: `${statusAccent}28`, borderWidth: 1.5, borderColor: `${statusAccent}80`, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusAccent }} />
              <Text style={{ color: statusAccent, fontFamily: "Inter-Bold", fontSize: 10 }}>{status === "closed" ? L("KAPALI", "CLOSED") : L("CANLI", "LIVE")}</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {!request ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Ionicons name="hourglass-outline" size={26} color="#ef4444" />
          </View>
          <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 16 }}>{L("Aktif talep yok", "No active request")}</Text>
          <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12, marginTop: 4, textAlign: "center" }}>{L("Yeni bir talep oluşturduğunuzda durumu burada görünecek.", "Status will appear here once you create a request.")}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}>

          {/* HERO STATUS CARD */}
          <View style={{ borderRadius: 22, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: `${statusAccent}30`, backgroundColor: cardBg }}>
            <LinearGradient
              colors={[`${statusAccent}22`, `${statusAccent}08`] as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: 18 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: `${statusAccent}18`, borderWidth: 1.5, borderColor: `${statusAccent}55`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={statusIcon} size={34} color={statusAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: statusAccent, fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 1.2 }}>{L("DURUM", "STATUS")}</Text>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 19, marginTop: 2 }}>{statusBigLabel}</Text>
                  <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginTop: 4, lineHeight: 16 }}>{statusSubLabel}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", marginTop: 14, gap: 10 }}>
                <View style={{ flex: 1, borderRadius: 12, backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="time-outline" size={14} color={textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 9 }}>{L("OLUŞTURMA", "CREATED")}</Text>
                    <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>{ageLabel}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, borderRadius: 12, backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="finger-print-outline" size={14} color={textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 9 }}>{L("TALEP ID", "REQUEST ID")}</Text>
                    <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>#{(request.id || "").slice(0, 8).toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* TIMELINE */}
          <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 14 }}>{L("Operasyon Akışı", "Operation Flow")}</Text>
            {tlSteps.map((step, i) => {
              const done = i < safeActiveIdx;
              const active = i === safeActiveIdx;
              const isLast = i === tlSteps.length - 1;
              const dotBg = done ? "#22c55e" : active ? statusAccent : lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)";
              const dotBorder = done || active ? dotBg : lightMode ? "#cbd5e1" : "rgba(255,255,255,0.15)";
              const iconColor = done || active ? "white" : textMuted;
              return (
                <View key={step.key} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ alignItems: "center", marginRight: 12 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: dotBg, borderWidth: 2, borderColor: dotBorder, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={done ? "checkmark" : step.icon} size={16} color={iconColor} />
                    </View>
                    {!isLast ? (
                      <View style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: done ? "#22c55e" : lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)", marginTop: 2, marginBottom: 2 }} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, paddingTop: 6, paddingBottom: isLast ? 0 : 14 }}>
                    <Text style={{ color: active ? statusAccent : done ? "#22c55e" : textSec, fontFamily: "Inter-Bold", fontSize: 13 }}>{step.label}</Text>
                    {active ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusAccent }} />
                        <Text style={{ color: statusAccent, fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.5 }}>{L("ŞU ANDA", "NOW")}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* INFO PILLS — Tür + Aciliyet */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: meta.bg, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 9, letterSpacing: 0.8 }}>{L("TÜR", "TYPE")}</Text>
              </View>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }} numberOfLines={2}>{meta.label}</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${urgencyAccent}20`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="alert-circle" size={16} color={urgencyAccent} />
                </View>
                <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 9, letterSpacing: 0.8 }}>{L("ACİLİYET", "URGENCY")}</Text>
              </View>
              <Text style={{ color: urgencyAccent, fontFamily: "Inter-Bold", fontSize: 13 }}>{request.urgency || L("Acil", "Urgent")}</Text>
            </View>
          </View>

          {/* PHOTO */}
          {(request as any)?.photoUrl ? (
            <View style={{ borderRadius: 18, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg }}>
              <Image source={{ uri: (request as any).photoUrl }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
              <View style={{ position: "absolute", top: 10, left: 10, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="camera" size={11} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("Talep Fotoğrafı", "Request Photo")}</Text>
              </View>
            </View>
          ) : null}

          {/* DESCRIPTION */}
          {request.description ? (
            <View style={{ borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text-outline" size={14} color="#ef4444" />
                  </View>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Açıklama", "Description")}</Text>
                </View>
                {request.status !== "closed" ? (
                  <TouchableOpacity
                    onPress={() => navigation.navigate("VictimRequest", { editRequestId: request.id, editDescription: request.description })}
                    style={{ borderRadius: 999, backgroundColor: "rgba(59,130,246,0.12)", borderWidth: 1, borderColor: "rgba(59,130,246,0.3)", paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Ionicons name="create-outline" size={12} color="#3b82f6" />
                    <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Düzenle", "Edit")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 13, lineHeight: 19 }}>{request.description}</Text>
            </View>
          ) : null}

          {/* MAP */}
          <View style={{ borderRadius: 18, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg }}>
            <View style={{ height: 200 }}>
              {path.length === 2 ? (
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{ latitude: path[0].latitude, longitude: path[0].longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
                  scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
                >
                  <Marker coordinate={path[0]} pinColor={statusAccent} title={L("Yardım ekibi", "Aid team")} />
                  <Marker coordinate={path[1]} pinColor="#3b82f6" title={L("Konumunuz", "Your location")} />
                  <Polyline coordinates={path as any} strokeColor={statusAccent} strokeWidth={4} lineDashPattern={[10, 5]} />
                </MapView>
              ) : victimPoint ? (
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{ latitude: victimPoint.latitude, longitude: victimPoint.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                  scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
                >
                  <Marker coordinate={victimPoint} pinColor="#3b82f6" title={L("Konumunuz", "Your location")} />
                </MapView>
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="map-outline" size={28} color={textMuted} />
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{L("Konum bilgisi yok", "No location data")}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: cardBorder }}>
              <Ionicons name="navigate-circle-outline" size={16} color={statusAccent} />
              <Text style={{ flex: 1, color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>{routeHint}</Text>
            </View>
          </View>

          {/* AFET.AI GUIDANCE */}
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: "rgba(139,92,246,0.3)", backgroundColor: lightMode ? "rgba(139,92,246,0.05)" : "rgba(139,92,246,0.08)", padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(139,92,246,0.18)", borderWidth: 1, borderColor: "rgba(139,92,246,0.35)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="sparkles" size={18} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Yardım Gelene Kadar", "Until Help Arrives")}</Text>
                <Text style={{ color: "#8b5cf6", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.5 }}>{L("AFET.AI CANLI YÖNLENDİRME", "AFET.AI LIVE GUIDANCE")}</Text>
              </View>
            </View>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, lineHeight: 17, marginBottom: 12 }}>{aiWaitHint}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("ChatDetail", { bot: true, title: "Afet.AI", seedPrompt: `Talep durumu: ${request.status}. Yardım türü: ${request.type}. Aciliyet: ${request.urgency}. Yardım gelene kadar yapılacakları kısa anlat.` })}
              style={{ borderRadius: 12, overflow: "hidden" }}
            >
              <LinearGradient colors={["#8b5cf6", "#7c3aed"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Ionicons name="chatbubble-ellipses" size={16} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Afet.AI ile Konuş", "Chat with Afet.AI")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* SUPPORT */}
          <TouchableOpacity
            onPress={() => navigation.navigate("ChatDetail", { bot: true, title: "Afet.AI" })}
            style={{ borderRadius: 14, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(34,197,94,0.12)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="headset-outline" size={18} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Destekle İletişim", "Contact Support")}</Text>
              <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{L("Yardım için sohbet başlat", "Start a chat for help")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};
