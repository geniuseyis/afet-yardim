import {
  React, useEffect, useMemo, useState,
  ScrollView, Text, TouchableOpacity, View,
  LinearGradient,
  Ionicons, Location, collection, onSnapshot, query, where, db, useStore, useNavigation, Haptics,
  isUrgent, kmBetween, statusLabel, toMillis
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { Dimensions, RefreshControl } from "react-native";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l } from "../../services/i18n";

/**
 * VOL-HOME DOSYA HARITASI
 * - VOL-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VOL-HOME-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-HOME-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] urgencyTone: Aciliyet değerini rozet rengine dönüştürür.
const urgencyTone = (u?: string) => {
  const s = `${u || ""}`.toLowerCase();
  if (s.includes("acil") || s.includes("high")) return { bg: "rgba(239,68,68,0.18)", border: "rgba(248,113,113,0.26)", text: "#fecaca", solid: "#ef4444" };
  if (s.includes("orta") || s.includes("medium")) return { bg: "rgba(245,158,11,0.16)", border: "rgba(252,211,77,0.22)", text: "#fde68a", solid: "#f59e0b" };
  return { bg: "rgba(34,197,94,0.14)", border: "rgba(74,222,128,0.2)", text: "#bbf7d0", solid: "#22c55e" };
};

// [FONKSIYON] VolunteerHome: Gönüllü ana panelini, özet metrikleri ve hızlı aksiyonları yönetir.
export const VolunteerHome = () => {
  const nav = useNavigation<any>();
  const { user, userData, showToast } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const volunteerApproved = isVolunteerApproved(userData as any);
  const [openRequests, setOpenRequests] = useState<Req[]>([]);
  const [myTasks, setMyTasks] = useState<Req[]>([]);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dismissedNotifMap, setDismissedNotifMap] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [openLoaded, setOpenLoaded] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [urgentExpanded, setUrgentExpanded] = useState(true);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);

  // VOL-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  // Subscription her zaman kurulur; gönüllü onayı ekranda render sırasında kontrol edilir.
  useEffect(() => {
    if (!user) {
      setOpenRequests([]);
      setOpenLoaded(true);
      return;
    }
    const q = query(collection(db, "requests"), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => {
        setOpenRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req)));
        setOpenLoaded(true);
        setRefreshing(false);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[volunteer-home] open requests snapshot error:", err);
        }
        setOpenRequests([]);
        setOpenLoaded(true);
        setRefreshing(false);
        if (!String(err?.code || "").includes("permission-denied")) showToast(L("Açık talepler yüklenemedi.", "Open requests could not be loaded."), "error");
      }
    );
  }, [user, showToast, locale]);

  // VOL-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user || !volunteerApproved) {
      setMyTasks([]);
      setTasksLoaded(true);
      return;
    }
    const q = query(
      collection(db, "requests"),
      where("assignedVolunteerId", "==", user.uid)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Req))
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setMyTasks(list);
        setTasksLoaded(true);
        setRefreshing(false);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[volunteer-home] my tasks snapshot error:", err);
        }
        setMyTasks([]);
        setTasksLoaded(true);
        setRefreshing(false);
        if (volunteerApproved && !String(err?.code || "").includes("permission-denied")) showToast(L("Görevlerim yüklenemedi.", "My tasks could not be loaded."), "error");
      }
    );
  }, [user, showToast, volunteerApproved, locale]);

  // VOL-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await Location.getCurrentPositionAsync({});
      setMyLoc({ latitude: now.coords.latitude, longitude: now.coords.longitude });
    })();
  }, []);

  // VOL-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const sortedOpen = useMemo(
    () => [...openRequests].sort((a, b) => Number(kmBetween(myLoc, a.location) || 999) - Number(kmBetween(myLoc, b.location) || 999)),
    [myLoc, openRequests]
  );

  const urgentOpen = sortedOpen.filter((r) => isUrgent(r.urgency));
  const mediumOpen = sortedOpen.filter((r) => !isUrgent(r.urgency) && `${r.urgency || ""}`.toLowerCase().includes("orta"));
  const lowOpen = sortedOpen.filter((r) => !urgentOpen.includes(r) && !mediumOpen.includes(r));
  const activeTask = myTasks.find((r) => r.status !== "closed");
  const unreadCount = Math.min(urgentOpen.length + (activeTask ? 1 : 0), 99);
  const completedCount = myTasks.filter((r) => r.status === "closed").length;
  const volunteerPoints = completedCount * 10 + (activeTask ? 3 : 0) + Math.min(urgentOpen.length, 5);
  const volunteerLevel = volunteerPoints >= 120
    ? L("Kıdemli Gönüllü", "Senior Volunteer")
    : volunteerPoints >= 50
      ? L("Aktif Gönüllü", "Active Volunteer")
      : L("Aday / Yeni", "Candidate / New");
  // VOL-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const notifications = useMemo(() => {
    const list: Array<{ id: string; title: string; sub: string; tone: "urgent" | "task" | "info"; requestId?: string }> = [];
    urgentOpen.slice(0, 3).forEach((r) => {
      list.push({
        id: `urgent-${r.id}`,
        title: L("Yeni Acil Talep", "New Urgent Request"),
        sub: `${r.type || L("Talep", "Request")} | ${r.urgency || L("Acil", "Urgent")}`,
        tone: "urgent",
        requestId: r.id
      });
    });
    if (activeTask) {
      list.push({
        id: `task-${activeTask.id}`,
        title: L("Aktif Görev Durumu", "Active Mission Status"),
        sub: `${activeTask.type || L("Talep", "Request")} | ${statusLabel[activeTask.status || "assigned"] || L("Atandı", "Assigned")}`,
        tone: "task",
        requestId: activeTask.id
      });
    }
    if (!list.length) {
      list.push({
        id: "idle",
        title: L("Sistem Durumu", "System Status"),
        sub: L("Şu anda yeni öncelikli bildirim yok.", "There are no new priority notifications right now."),
        tone: "info"
      });
    }
    return list;
  }, [urgentOpen, activeTask, locale]);
  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !dismissedNotifMap[n.id]),
    [notifications, dismissedNotifMap]
  );
  // Rozette gösterilecek sayı — silinen bildirimler hariç
  const visibleNotifCount = visibleNotifications.length;
  const bootLoading = !openLoaded || (user ? !tasksLoaded : false);
  // [FONKSIYON] onRefresh: Pull-to-refresh animasyon durumunu kısa süreli tetikler.
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  // [FONKSIYON] softTap: Haptic geri bildirim verip ardından verilen aksiyonu çalıştırır.
  const softTap = async (fn: () => void) => {
    try {
      await Haptics.selectionAsync();
    } catch {}
    fn();
  };

  // [FONKSIYON] guardApproved: Onaylı gönüllü olmayan kullanıcıların görev aksiyonunu engeller.
  const guardApproved = (fn: () => void) => {
    if (!volunteerApproved) {
      showToast(L("Gönüllü başvurunuz onaylanınca bu özelliği kullanabilirsiniz.", "You can use this feature once your volunteer application is approved."), "info");
      return;
    }
    fn();
  };

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#000000" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#050507" : "#2a0d16";
  const card = lightMode ? "#ffffff" : amoledMode ? "#0a0a0d" : "#3a101c";
  const softBorder = lightMode ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.06)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";

  // [FONKSIYON] statCard: Özet sayı kartı UI'sini tek yerden üretir.
  const statCard = (label: string, value: string | number, accent: string, iconName: string) => (
    <View style={{ flex: 1, borderRadius: 18, backgroundColor: card, borderWidth: 1, borderColor: softBorder, padding: 12, shadowColor: accent, shadowOpacity: lightMode ? 0.08 : 0, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${accent}22`, alignItems: "center", justifyContent: "center", marginBottom: 8, borderWidth: 1, borderColor: `${accent}33` }}>
        <Ionicons name={iconName as any} size={16} color={accent} />
      </View>
      <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 22 }}>{value}</Text>
      <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );

  // [FONKSIYON] requestCard: Talep kartı UI'sini oluşturur ve detay ekranına yönlendirir.
  const requestCard = (r: Req) => {
    const tone = urgencyTone(r.urgency);
    const distance = kmBetween(myLoc, r.location);
    return (
      <TouchableOpacity
        key={r.id}
        onPress={() => guardApproved(() => nav.navigate("VolunteerRequestDetail", { requestId: r.id }))}
        style={{ borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: softBorder, padding: 12, marginBottom: 10, shadowColor: tone.solid, shadowOpacity: lightMode ? 0.07 : 0, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15 }} numberOfLines={1}>{r.type || L("Yardım Talebi", "Aid Request")}</Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginTop: 3 }} numberOfLines={2}>{r.description || L("Detay için talebi açın.", "Open request for details.")}</Text>
          </View>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}>
            <Text style={{ color: lightMode ? tone.solid : tone.text, fontFamily: "Inter-Bold", fontSize: 10 }}>{r.urgency || L("Düşük", "Low")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: softBorder }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="location-outline" size={12} color={textMuted} />
            <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{distance || "-"} km · {statusLabel[r.status || "open"] || L("Bekliyor", "Waiting")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: lightMode ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.14)" : softBorder, paddingHorizontal: 8, paddingVertical: 4, gap: 3 }}>
            <Text style={{ color: lightMode ? "#9f1239" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("İNCELE", "VIEW")}</Text>
            <Ionicons name="chevron-forward" size={12} color={lightMode ? "#9f1239" : "#fecdd3"} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* Sabit header — eski tasarım */}
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: shell, borderBottomWidth: 1, borderBottomColor: softBorder, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım Sistemi", "Disaster Aid System")}</Text>
          <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Gönüllü Merkezi", "Volunteer Hub")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => void softTap(() => setNotifOpen(true))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: card, borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="notifications-outline" size={18} color={textPrimary} />
            {visibleNotifCount > 0 ? (
              <View style={{ position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 3, borderWidth: 1.5, borderColor: shell }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 8 }}>{visibleNotifCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void softTap(() => nav.navigate("Messages"))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: card, borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void softTap(() => nav.navigate("Profile"))} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: card, borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="person-outline" size={18} color={textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" colors={["#ef4444"]} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 96 }}
      >
        {/* Hero gradient card — eski tasarım (AMOLED tam siyah) */}
        <LinearGradient
          colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"] as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: lightMode ? "rgba(159,18,57,0.25)" : amoledMode ? "rgba(255,255,255,0.08)" : "rgba(248,113,113,0.12)" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter", fontSize: 12 }}>{L("Hoş geldiniz", "Welcome back")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, marginTop: 2 }} numberOfLines={1}>
                {(userData as any)?.displayName || (userData as any)?.fullName || L("Gönüllü", "Volunteer")}
              </Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: volunteerApproved ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)", borderWidth: 1, borderColor: volunteerApproved ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.35)", paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: volunteerApproved ? "#bbf7d0" : "#fde68a", fontFamily: "Inter-Bold", fontSize: 11 }}>
                {volunteerApproved ? L("AKTİF", "ACTIVE") : L("BEKLEMEDE", "PENDING")}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 10 }}>{L("Tamamlanan", "Completed")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginTop: 2 }}>{completedCount}</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 10 }}>{L("Rozet", "Badge")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 4 }}>
                {completedCount >= 5 ? L("Saha Ustası", "Field Master") : completedCount >= 1 ? L("Aktif Katılım", "Active Partic.") : L("Başlangıç", "Starter")}
              </Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 10 }}>{L("Puan", "Points")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginTop: 2 }}>{volunteerPoints}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Operasyon Hedefi", "Operation Goal")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter-Bold", fontSize: 11 }}>{Math.min(100, volunteerPoints)}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
              <View style={{ width: `${Math.min(100, volunteerPoints)}%`, height: "100%", backgroundColor: "white", borderRadius: 999 }} />
            </View>
          </View>
        </LinearGradient>

        {/* YENİ: Aktif görev kartı (gradient dışında) */}
        {activeTask ? (
          <TouchableOpacity onPress={() => nav.navigate("Tasks")} style={{ borderRadius: 16, backgroundColor: lightMode ? "#fff" : "rgba(34,197,94,0.08)", borderWidth: 1.5, borderColor: "#22c55e", padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="walk-outline" size={20} color="#22c55e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.5 }}>{L("AKTİF GÖREV", "ACTIVE MISSION")}</Text>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14, marginTop: 1 }} numberOfLines={1}>{activeTask.type || L("Görev", "Mission")}</Text>
            </View>
            <View style={{ borderRadius: 10, backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Git", "Go")}</Text>
              <Ionicons name="arrow-forward" size={13} color="#22c55e" />
            </View>
          </TouchableOpacity>
        ) : null}

        {/* KPI stat row */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {statCard(L("Acil", "Urgent"), urgentOpen.length, "#ef4444", "alert-circle-outline")}
          {statCard(L("Orta", "Medium"), mediumOpen.length, "#f59e0b", "time-outline")}
          {statCard(L("Düşük", "Low"), lowOpen.length, "#22c55e", "checkmark-circle-outline")}
        </View>

        {/* Onay bekliyor banner */}
        {!volunteerApproved ? (
          <View style={{ marginBottom: 12, borderRadius: 14, backgroundColor: "rgba(245,158,11,0.10)", borderWidth: 1, borderColor: "rgba(245,158,11,0.24)", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="warning-outline" size={15} color="#f59e0b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fde68a", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Başvuru onayı bekleniyor", "Application approval pending")}</Text>
              <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 11, marginTop: 3 }}>
                {L("Mesajlar ve profil alanları açık. Görev başvurma onay sonrası aktif olur.", "Messages and profile are available. Mission apply becomes active after approval.")}
              </Text>
            </View>
          </View>
        ) : null}

        {/* YENİ: 4 büyük aksiyon kartı — Yeni Görevler | Görev Listem | Çağrılar | Mesajlar */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {([
            { icon: "map-outline", label: L("Yeni\nGörevler", "New\nMissions"), onPress: () => void softTap(() => guardApproved(() => nav.navigate("VolunteerAvailableMissions"))), disabled: !volunteerApproved, accent: "#ef4444" },
            { icon: "clipboard-outline", label: L("Görev\nListem", "My\nMissions"), onPress: () => void softTap(() => nav.navigate("Tasks")), disabled: false, accent: "#3b82f6" },
            { icon: "notifications-outline", label: L("Çağrı\nlar", "Alerts"), onPress: () => void softTap(() => setNotifOpen(true)), disabled: false, accent: "#8b5cf6", badge: visibleNotifCount },
            { icon: "chatbubbles-outline", label: L("Mesaj\nlar", "Messages"), onPress: () => void softTap(() => nav.navigate("Messages")), disabled: false, accent: "#10b981" },
          ] as Array<{ icon: string; label: string; onPress: () => void; disabled: boolean; accent: string; badge?: number }>).map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              disabled={item.disabled}
              style={{ flex: 1, borderRadius: 18, backgroundColor: lightMode ? "#fff" : `${item.accent}12`, borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : `${item.accent}25`, paddingVertical: 14, alignItems: "center", opacity: item.disabled ? 0.5 : 1, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 4, elevation: lightMode ? 1 : 0 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${item.accent}18`, borderWidth: 1, borderColor: `${item.accent}30`, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name={item.icon as any} size={20} color={item.accent} />
                {item.badge ? (
                  <View style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 7 }}>{item.badge > 9 ? "9+" : item.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 10, textAlign: "center", lineHeight: 14 }} numberOfLines={2}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Skeleton loading */}
        {bootLoading ? (
          <View style={{ borderRadius: 18, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12, marginBottom: 12 }}>
            <View style={{ height: 14, width: "45%", borderRadius: 7, backgroundColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)", marginBottom: 10 }} />
            <View style={{ height: 68, borderRadius: 14, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)", marginBottom: 8 }} />
            <View style={{ height: 68, borderRadius: 14, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
          </View>
        ) : null}

        {/* Acil Talepler — açılır/kapanır */}
        <View style={{ borderRadius: 18, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setUrgentExpanded((v) => !v)}
            activeOpacity={0.85}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Acil Talepler", "Urgent Requests")}</Text>
                {urgentOpen.length > 0 ? (
                  <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{urgentOpen.length} {L("aktif", "active")}</Text>
                ) : (
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{L("acil talep yok", "no urgent requests")}</Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {urgentOpen.length > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 8, paddingVertical: 3, minWidth: 26, alignItems: "center" }}>
                  <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 10 }}>{urgentOpen.length}</Text>
                </View>
              ) : null}
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={urgentExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>

          {urgentExpanded ? (
            <View style={{ marginTop: 10 }}>
              {urgentOpen.slice(0, 4).map(requestCard)}
              {!urgentOpen.length ? (
                <View style={{ borderRadius: 14, backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: softBorder, padding: 16, alignItems: "center" }}>
                  <Ionicons name="checkmark-circle-outline" size={28} color={textMuted} style={{ marginBottom: 6 }} />
                  <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12 }}>{L("Acil talep yok.", "No urgent requests.")}</Text>
                </View>
              ) : null}
              {urgentOpen.length > 4 ? (
                <TouchableOpacity onPress={() => guardApproved(() => nav.navigate("Tasks"))} style={{ marginTop: 4, borderRadius: 12, backgroundColor: lightMode ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 }}>
                  <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L(`+${urgentOpen.length - 4} TÜMÜNÜ GÖR`, `+${urgentOpen.length - 4} VIEW ALL`)}</Text>
                  <Ionicons name="arrow-forward" size={12} color={lightMode ? "#9f1239" : "#fecaca"} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Yakınımdaki Talepler — açılır/kapanır */}
        <View style={{ borderRadius: 18, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12 }}>
          <TouchableOpacity
            onPress={() => setNearbyExpanded((v) => !v)}
            activeOpacity={0.85}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.12)", borderWidth: 1, borderColor: "rgba(59,130,246,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="location" size={16} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Yakınımdaki Talepler", "Nearby Requests")}</Text>
                {sortedOpen.length > 0 ? (
                  <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 11 }}>{sortedOpen.length} {L("açık talep", "open requests")}</Text>
                ) : (
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{L("açık talep yok", "no open requests")}</Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {sortedOpen.length > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: "rgba(59,130,246,0.3)", paddingHorizontal: 8, paddingVertical: 3, minWidth: 26, alignItems: "center" }}>
                  <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 10 }}>{sortedOpen.length}</Text>
                </View>
              ) : null}
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={nearbyExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>

          {nearbyExpanded ? (
            <View style={{ marginTop: 10 }}>
              {sortedOpen.slice(0, 5).map(requestCard)}
              {!sortedOpen.length ? (
                <View style={{ borderRadius: 14, backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: softBorder, padding: 16, alignItems: "center" }}>
                  <Ionicons name="location-outline" size={28} color={textMuted} style={{ marginBottom: 6 }} />
                  <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12 }}>{L("Açık talep yok.", "No open requests.")}</Text>
                </View>
              ) : null}
              {sortedOpen.length > 5 ? (
                <TouchableOpacity onPress={() => guardApproved(() => nav.navigate("VolunteerAvailableMissions"))} style={{ marginTop: 4, borderRadius: 12, backgroundColor: lightMode ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.1)", borderWidth: 1, borderColor: "rgba(59,130,246,0.2)", paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 }}>
                  <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 11 }}>{L(`+${sortedOpen.length - 5} TÜMÜNÜ GÖR`, `+${sortedOpen.length - 5} VIEW ALL`)}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#3b82f6" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bildirim modalı — eski tasarım (üstten) + swipe to delete */}
      {notifOpen ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", paddingTop: 100, paddingHorizontal: 16 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setNotifOpen(false)} style={{ position: "absolute", inset: 0 }} />
          <View style={{ borderRadius: 22, backgroundColor: panel, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", padding: 14, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="notifications" size={16} color="#ef4444" />
                </View>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 16 }}>{L("Bildirim Merkezi", "Notification Center")}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                {visibleNotifications.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      const all: Record<string, boolean> = {};
                      visibleNotifications.forEach((n) => { all[n.id] = true; });
                      setDismissedNotifMap((p) => ({ ...p, ...all }));
                    }}
                    style={{ borderRadius: 10, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.2)", paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Tümünü Sil", "Clear All")}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setNotifOpen(false)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={16} color={textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {visibleNotifications.map((n) => {
                // Kartın genişliği = ekran - modal padding (16*2) - iç padding (14*2)
                const cardW = Dimensions.get("window").width - 32 - 28;
                const deleteW = 64;
                const accentColor = n.tone === "urgent" ? "#ef4444" : n.tone === "task" ? "#22c55e" : "#f59e0b";
                return (
                  <ScrollView
                    key={n.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    snapToOffsets={[0, deleteW + 8]}
                    decelerationRate="fast"
                    style={{ marginBottom: 8 }}
                    contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
                  >
                    {/* Bildirim kartı — tam genişlikte */}
                    <TouchableOpacity
                      onPress={() => {
                        setNotifOpen(false);
                        if (n.requestId) {
                          if (n.tone === "task") nav.navigate("VolunteerTaskTracking", { requestId: n.requestId });
                          else nav.navigate("VolunteerRequestDetail", { requestId: n.requestId });
                        }
                      }}
                      activeOpacity={0.8}
                      style={{
                        width: cardW,
                        borderRadius: 14,
                        backgroundColor: lightMode ? "#ffffff" : "rgba(255,255,255,0.04)",
                        borderWidth: 1,
                        borderColor: softBorder,
                        borderLeftWidth: 3,
                        borderLeftColor: accentColor,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor, flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{n.title}</Text>
                        <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginTop: 2 }} numberOfLines={1}>{n.sub}</Text>
                      </View>
                      {n.requestId ? <Ionicons name="chevron-forward" size={14} color={textMuted} /> : null}
                    </TouchableOpacity>

                    {/* Sil butonu — gizli, kaydırınca görünür */}
                    <TouchableOpacity
                      onPress={() => setDismissedNotifMap((p) => ({ ...p, [n.id]: true }))}
                      style={{
                        width: deleteW,
                        marginLeft: 8,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        backgroundColor: "#dc2626"
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="white" />
                      <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 9 }}>{L("Sil", "Del")}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                );
              })}
              {!visibleNotifications.length ? (
                <View style={{ borderRadius: 14, backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: softBorder, padding: 16, alignItems: "center" }}>
                  <Ionicons name="notifications-off-outline" size={26} color={textMuted} style={{ marginBottom: 6 }} />
                  <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12 }}>{L("Bildirim kalmadı.", "No notifications left.")}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
};
