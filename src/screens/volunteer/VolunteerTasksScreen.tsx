import {
  React, useEffect, useMemo, useState,
  Text, TouchableOpacity, View, Ionicons, FlatList,
  LinearGradient,
  collection, onSnapshot, orderBy, query, where, db, useStore,
  kmBetween, statusLabel, toMillis, requestTypeMeta, urgencyLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { Modal, RefreshControl } from "react-native";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l } from "../../services/i18n";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * VOL-TASKS DOSYA HARITASI
 * - VOL-TASKS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-TASKS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - VOL-TASKS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VOL-TASKS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] urgencyColor: Risk/aciliyet metninden kartlarda kullanılacak renk döndürür.
const urgencyColor = (u?: string) => {
  const s = `${u || ""}`.toLowerCase();
  if (s.includes("acil") || s.includes("high")) return "#ef4444";
  if (s.includes("orta") || s.includes("medium")) return "#f59e0b";
  return "#22c55e";
};

type MissionTab = "active" | "completed" | "pending";
type RiskFilter = "all" | "urgent" | "medium" | "low";
type PendingApplication = {
  id: string;
  requestId?: string;
  requestType?: string;
  riskLevel?: string;
  createdAt?: any;
  status?: string;
};

// [FONKSIYON] VolunteerTasksScreen: Gönüllünün aktif/tamamlanan/bekleyen görev listesini yönetir.
export const VolunteerTasksScreen = ({ navigation }: { navigation: any }) => {
  const { user, userData } = useStore();
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const volunteerApproved = isVolunteerApproved(userData as any);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [myRows, setMyRows] = useState<Req[]>([]);
  const [myPendingApps, setMyPendingApps] = useState<PendingApplication[]>([]);
  const [tab, setTab] = useState<MissionTab>("active");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [ratingModal, setRatingModal] = useState<{ requestId: string; volunteerName: string } | null>(null);
  const [ratingValue, setRatingValue] = useState(0);

  // VOL-TASKS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user || !volunteerApproved) {
      setMyRows([]);
      setLoadedOnce(true);
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
        setMyRows(list);
        setLoadedOnce(true);
        setRefreshing(false);
      },
      (err: any) => {
        console.warn("[volunteer-tasks] snapshot error:", err);
        setLoadedOnce(true);
        setRefreshing(false);
        if (volunteerApproved && !String(err?.code || "").includes("permission-denied")) {
          showToast(L("Görevlerim listesi yüklenemedi.", "My tasks could not be loaded."), "error");
        }
      }
    );
  }, [user, showToast, volunteerApproved, locale]);

  // VOL-TASKS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user || !volunteerApproved) {
      setMyPendingApps([]);
      return;
    }
    const q = query(collection(db, "volunteerApplications"), where("volunteerId", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as PendingApplication))
          .filter((a) => (a.status || "pending") === "pending")
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setMyPendingApps(list);
      },
      () => setMyPendingApps([])
    );
  }, [user, volunteerApproved]);

  // VOL-TASKS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const sub = (async () => {
      const L = await import("expo-location");
      const { status } = await L.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await L.getCurrentPositionAsync({});
      setMyLoc({ latitude: now.coords.latitude, longitude: now.coords.longitude });
    })();
    return () => void sub;
  }, []);

  // VOL-TASKS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const statusFiltered = useMemo(() => {
    return myRows.filter((r) => {
      if (tab === "active") return r.status === "in_progress";
      if (tab === "completed") return r.status === "closed";
      return r.status === "assigned";
    });
  }, [myRows, tab]);

  const pendingRowsFromApps = useMemo(() => {
    return myPendingApps.map((a) => ({
      id: a.requestId || a.id,
      type: a.requestType || L("Başvurulan Görev", "Applied Mission"),
      urgency: a.riskLevel || L("Orta", "Medium"),
      status: "assigned",
      createdAt: a.createdAt || new Date()
    } as Req));
  }, [myPendingApps, locale]);

  // VOL-TASKS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const rows = useMemo(() => {
    const sourceRows = tab === "pending" ? [...statusFiltered, ...pendingRowsFromApps] : statusFiltered;
    const byRisk = sourceRows.filter((r) => {
      if (riskFilter === "all") return true;
      const s = `${r.urgency || ""}`.toLowerCase();
      if (riskFilter === "urgent") return s.includes("acil") || s.includes("high");
      if (riskFilter === "medium") return s.includes("orta") || s.includes("medium");
      return !(s.includes("acil") || s.includes("high") || s.includes("orta") || s.includes("medium"));
    });
    return [...byRisk].sort((a, b) => {
      const da = Number(kmBetween(myLoc, a.location) || 999);
      const dbv = Number(kmBetween(myLoc, b.location) || 999);
      return da - dbv || toMillis(b.createdAt) - toMillis(a.createdAt);
    });
  }, [statusFiltered, pendingRowsFromApps, tab, riskFilter, myLoc]);

  const activeCount = myRows.filter((r) => r.status === "in_progress").length;
  const pendingCount = myRows.filter((r) => r.status === "assigned").length + myPendingApps.length;
  const completedCount = myRows.filter((r) => r.status === "closed").length;

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#000000" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#050507" : "#2a0d16";
  const card = lightMode ? "#ffffff" : amoledMode ? "#0a0a0d" : "#3a101c";
  const soft = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textP = lightMode ? "#0f172a" : "#fff1f2";
  const textS = lightMode ? "#475569" : "#fecdd3";
  const textM = lightMode ? "#64748b" : "#fda4af";

  // [FONKSIYON] onRefresh: Liste yenileme göstergesini tetikler.
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  // [FONKSIYON] segment: Üst sekme (aktif/tamamlanan/bekleyen) butonunu üretir.
  const segment = (key: MissionTab, label: string, count: number) => (
    <TouchableOpacity
      key={key}
      onPress={() => setTab(key)}
      style={{
        flex: 1,
        height: 42,
        borderRadius: 14,
        backgroundColor: tab === key ? "rgba(239,68,68,0.18)" : "transparent",
        borderWidth: 1,
        borderColor: tab === key ? "rgba(248,113,113,0.28)" : soft,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text style={{ color: tab === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
      <View style={{ marginLeft: 6, minWidth: 18, paddingHorizontal: 4, height: 18, borderRadius: 9, backgroundColor: tab === key ? "#ef4444" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );

  // [FONKSIYON] riskChip: Risk filtresi butonlarını tek kalıptan oluşturur.
  const riskChip = (key: RiskFilter, label: string, color: string) => (
    <TouchableOpacity
      key={key}
      onPress={() => setRiskFilter(key)}
      style={{ marginRight: 8, borderRadius: 999, paddingHorizontal: 10, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: riskFilter === key ? color : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: riskFilter === key ? color : soft }}
    >
      <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
    </TouchableOpacity>
  );

  // [FONKSIYON] riskBadgeText: Talep aciliyetinden okunur risk etiketi üretir.
  const riskBadgeText = (u?: string) => {
    const s = `${u || ""}`.toLowerCase();
    if (s.includes("acil") || s.includes("high")) return L("YÜKSEK RİSK", "HIGH RISK");
    if (s.includes("orta") || s.includes("medium")) return L("ORTA RİSK", "MEDIUM RISK");
    return L("DÜŞÜK RİSK", "LOW RISK");
  };

  // [FONKSIYON] statusBadgeLabel: Talep durumunu kart üstündeki durum metnine çevirir.
  const statusBadgeLabel = (r: Req) => {
    if (r.status === "closed") return L("Tamamlandı", "Completed");
    if (r.status === "in_progress") return L("Sahada", "In Field");
    return L("Beklemede", "Pending");
  };

  // [FONKSIYON] renderCard: FlatList içindeki her görev kartını render eder.
  const renderCard = ({ item }: { item: Req }) => {
    const dist = kmBetween(myLoc, item.location);
    const uColor = urgencyColor(item.urgency);
    const meta = requestTypeMeta(item.type);
    const isCompleted = item.status === "closed";
    const isActive = item.status === "in_progress";
    const isPendingTab = tab === "pending";
    const urgLabel = urgencyLabel(item.urgency, locale);
    const statusColor = isCompleted ? "#22c55e" : isActive ? "#3b82f6" : "#f59e0b";
    const statusBg = isCompleted ? "rgba(34,197,94,0.12)" : isActive ? "rgba(59,130,246,0.12)" : "rgba(245,158,11,0.12)";
    const createdMs = toMillis(item.createdAt);

    const progressIdx = isCompleted ? 3 : isActive ? 2 : tab === "pending" ? 1 : 0;
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate(isCompleted || isPendingTab ? "VolunteerRequestDetail" : "VolunteerTaskTracking", { requestId: item.id })}
        style={{ borderRadius: 18, overflow: "hidden", backgroundColor: card, borderWidth: 1, borderColor: soft, marginBottom: 12, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: "row" }}>
          {/* Sol accent bar (Taleplerim DNA) */}
          <View style={{ width: 4, backgroundColor: statusColor }} />
          <View style={{ flex: 1, padding: 14 }}>
            {/* Üst satır: ikon + başlık + rozet */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: meta.bg, borderWidth: 1, borderColor: `${meta.color}22`, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                <Ionicons name={meta.icon} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textP, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>{item.type || L("Yardım Görevi", "Aid Mission")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: `${uColor}15`, borderWidth: 1, borderColor: `${uColor}40` }}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: uColor }} />
                    <Text style={{ color: uColor, fontFamily: "Inter-Bold", fontSize: 9 }}>{urgLabel}</Text>
                  </View>
                  <Text style={{ color: textM, fontFamily: "Inter", fontSize: 10 }}>#{(item.id || "").slice(0, 6).toUpperCase()}</Text>
                </View>
              </View>
              <View style={{ borderRadius: 999, backgroundColor: statusBg, borderWidth: 1.5, borderColor: `${statusColor}55`, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: statusColor, fontFamily: "Inter-Bold", fontSize: 10 }}>{statusBadgeLabel(item)}</Text>
              </View>
            </View>

            {/* Süreç çubuğu (Taleplerim DNA) */}
            <View style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                {[0, 1, 2, 3].map((i) => {
                  const reached = i <= progressIdx;
                  return (
                    <React.Fragment key={i}>
                      <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: reached ? statusColor : (lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)") }} />
                      {i < 3 ? <View style={{ flex: 1, height: 2, backgroundColor: i < progressIdx ? statusColor : (lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)") }} /> : null}
                    </React.Fragment>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {[L("Açık", "Open"), L("Atandı", "Assigned"), L("Sahada", "Field"), L("Bitti", "Done")].map((label, i) => (
                  <Text key={label} style={{ color: i === progressIdx ? statusColor : textM, fontFamily: i === progressIdx ? "Inter-Bold" : "Inter", fontSize: 9, flex: 1, textAlign: i === 0 ? "left" : i === 3 ? "right" : "center" }}>{label}</Text>
                ))}
              </View>
            </View>

            {/* Alt bilgi satırı */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="time-outline" size={12} color={textM} />
                  <Text style={{ color: textM, fontFamily: "Inter", fontSize: 11 }}>
                    {createdMs ? new Date(createdMs).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit" }) : "-"}
                  </Text>
                </View>
                {dist ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name="location-outline" size={12} color={textM} />
                    <Text style={{ color: textM, fontFamily: "Inter", fontSize: 11 }}>{dist} km</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {isCompleted ? (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); setRatingValue(0); setRatingModal({ requestId: item.id, volunteerName: item.type || "Görev" }); }}
                    style={{ height: 30, borderRadius: 9, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.28)", paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 }}
                  >
                    <Ionicons name="star-outline" size={11} color="#f59e0b" />
                    <Text style={{ color: "#f59e0b", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Puan", "Rate")}</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{ height: 30, borderRadius: 9, backgroundColor: `${statusColor}15`, borderWidth: 1, borderColor: `${statusColor}40`, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}>
                  <Text style={{ color: statusColor, fontFamily: "Inter-Bold", fontSize: 11 }}>{isCompleted ? L("Detay", "Detail") : L("Göreve Git", "Go")}</Text>
                  <Ionicons name="chevron-forward" size={12} color={statusColor} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const canGoBack = navigation?.canGoBack?.() ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* Gradient header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          {canGoBack ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="arrow-back" size={18} color="white" />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü Operasyon", "Volunteer Operations")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, lineHeight: 28, marginTop: 2 }}>{L("Görevlerim", "My Missions")}</Text>
          </View>
        </View>

        {/* KPI 3-column (Taleplerim DNA) */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: L("Aktif", "Active"), value: activeCount, accent: "#3b82f6", icon: "pulse" as any },
            { label: L("Bekleyen", "Pending"), value: pendingCount, accent: "#f59e0b", icon: "hourglass" as any },
            { label: L("Tamamlanan", "Completed"), value: completedCount, accent: "#22c55e", icon: "checkmark-done" as any }
          ].map((it) => (
            <View key={it.label} style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 11 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: `${it.accent}30`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={it.icon} size={11} color={it.accent} />
                </View>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.3 }}>{it.label}</Text>
              </View>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{it.value}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Sekme + Risk filtreleri tek satır chip'ler (Taleplerim DNA) */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {([
          { key: "active" as MissionTab, label: L("Aktif", "Active"), icon: "pulse-outline" as any, count: activeCount },
          { key: "pending" as MissionTab, label: L("Bekleyen", "Pending"), icon: "hourglass-outline" as any, count: pendingCount },
          { key: "completed" as MissionTab, label: L("Bitti", "Done"), icon: "checkmark-done-outline" as any, count: completedCount }
        ]).map((t) => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                borderRadius: 10, height: 38,
                backgroundColor: isActive ? (lightMode ? "#be123c" : "#dc2626") : card,
                borderWidth: 1, borderColor: isActive ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.4)") : soft
              }}
            >
              <Ionicons name={t.icon} size={13} color={isActive ? "white" : textM} />
              <Text style={{ color: isActive ? "white" : textM, fontFamily: "Inter-Bold", fontSize: 11 }}>{t.label}</Text>
              {t.count > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: isActive ? "rgba(255,255,255,0.25)" : `${textM}20`, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 }}>
                  <Text style={{ color: isActive ? "white" : textM, fontFamily: "Inter-Bold", fontSize: 9 }}>{t.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Risk filtresi (yatay scroll, küçük) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, flexDirection: "row", gap: 6 }}>
        {([
          { key: "all" as RiskFilter, label: L("Tüm Aciliyet", "All Urgency"), color: textM },
          { key: "urgent" as RiskFilter, label: L("Yüksek", "High"), color: "#ef4444" },
          { key: "medium" as RiskFilter, label: L("Orta", "Medium"), color: "#f59e0b" },
          { key: "low" as RiskFilter, label: L("Düşük", "Low"), color: "#22c55e" }
        ]).map((r) => {
          const isActive = riskFilter === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRiskFilter(r.key)}
              style={{
                flex: 1, borderRadius: 999, height: 28, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4,
                backgroundColor: isActive ? `${r.color}15` : "transparent",
                borderWidth: 1, borderColor: isActive ? `${r.color}50` : soft
              }}
            >
              {r.key !== "all" ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: r.color }} /> : null}
              <Text style={{ color: isActive ? r.color : textM, fontFamily: "Inter-Bold", fontSize: 10 }} numberOfLines={1}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" colors={["#ef4444"]} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96 }}
        renderItem={renderCard}
        ListHeaderComponent={
          !loadedOnce ? (
            <View style={{ marginBottom: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ borderRadius: 18, backgroundColor: panel, borderWidth: 1, borderColor: soft, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)" }} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={{ height: 14, width: "55%", borderRadius: 6, backgroundColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)" }} />
                      <View style={{ height: 11, width: "75%", borderRadius: 5, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ borderRadius: 20, backgroundColor: panel, borderWidth: 1, borderColor: soft, padding: 28, alignItems: "center" }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.1)", borderWidth: 1.5, borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name={tab === "completed" ? "checkmark-circle-outline" : tab === "active" ? "walk-outline" : "hourglass-outline"} size={28} color={lightMode ? "#be123c" : "#fda4af"} />
            </View>
            <Text style={{ color: textP, fontFamily: "Inter-Bold", fontSize: 15, marginBottom: 6 }}>
              {tab === "active" ? L("Aktif görev yok", "No active missions") : tab === "completed" ? L("Tamamlanan görev yok", "No completed missions") : L("Bekleyen görev yok", "No pending missions")}
            </Text>
            <Text style={{ color: textS, fontFamily: "Inter", fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 16 }}>
              {tab === "pending" ? L("Başvurularınız onaylandığında burada görünür.", "Applications appear here when approved.")
                : tab === "active" ? L("Sahada olduğunuz görevler burada listelenir.", "In-field missions appear here.")
                  : L("Tamamlanan görevleriniz burada arşivlenir.", "Completed missions are archived here.")}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("VolunteerAvailableMissions")}
              style={{ borderRadius: 14, backgroundColor: lightMode ? "#be123c" : "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.28)", paddingHorizontal: 20, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name="search-outline" size={15} color={lightMode ? "white" : "#fecdd3"} />
              <Text style={{ color: lightMode ? "white" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Yeni Görevleri Gör", "Browse New Missions")}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Gönüllü Puanlama Modalı */}
      <Modal visible={!!ratingModal} transparent animationType="fade" onRequestClose={() => setRatingModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ width: "100%", borderRadius: 22, backgroundColor: panel, borderWidth: 1, borderColor: soft, padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.14)", borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="star" size={16} color="#f59e0b" />
              </View>
              <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 16 }}>{L("Gönüllüyü Değerlendir", "Rate Volunteer")}</Text>
            </View>
            <Text style={{ color: lightMode ? "#475569" : "#fecdd3", fontFamily: "Inter", fontSize: 13, marginBottom: 16 }}>
              {L("Bu görev için aldığınız hizmetle ilgili puanınızı seçin.", "Select your rating for the service received in this mission.")}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 18 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                  <Ionicons name={ratingValue >= star ? "star" : "star-outline"} size={36} color={ratingValue >= star ? "#f59e0b" : lightMode ? "#94a3b8" : "#475569"} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => { setRatingModal(null); setRatingValue(0); }} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.1)" : soft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: lightMode ? "#64748b" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Atla", "Skip")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!ratingModal || !ratingValue) return;
                  try {
                    await setDoc(doc(db, "volunteerRatings", `${ratingModal.requestId}_${user?.uid}`), {
                      requestId: ratingModal.requestId,
                      ratedByUid: user?.uid || null,
                      rating: ratingValue,
                      createdAt: serverTimestamp()
                    }, { merge: true });
                    showToast(L("Değerlendirmeniz kaydedildi. Teşekkürler!", "Your rating has been saved. Thank you!"), "success");
                  } catch {
                    showToast(L("Puan kaydedilemedi.", "Rating could not be saved."), "error");
                  }
                  setRatingModal(null);
                  setRatingValue(0);
                }}
                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: ratingValue ? "#f59e0b" : lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: ratingValue ? "white" : lightMode ? "#94a3b8" : "#475569", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Gönder", "Submit")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

