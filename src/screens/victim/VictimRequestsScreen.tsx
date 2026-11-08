import {
  React, useEffect, useMemo, useState,
  Alert, FlatList, Text, TouchableOpacity, View,
  LinearGradient, Ionicons, collection, db, doc, onSnapshot, query, toMillis, updateDoc, useNavigation, useStore, where,
  serverTimestamp,
  isUrgent, requestTypeMeta, statusLabel, urgencyLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * VICTIM-REQUESTS DOSYA HARITASI
 * - VICTIM-REQUESTS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VICTIM-REQUESTS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - VICTIM-REQUESTS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VICTIM-REQUESTS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimRequestsScreen: Afetzedenin taleplerini filtreleyip listeleyen ekranı yönetir.
export const VictimRequestsScreen = ({ route }: { route?: any }) => {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [rows, setRows] = useState<Req[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "closed" | "urgent">((route?.params?.filter as any) || "all");

  // VICTIM-REQUESTS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  useEffect(() => {
    const fromRoute = route?.params?.filter;
    if (fromRoute && ["all", "active", "closed", "urgent"].includes(fromRoute)) {
      setFilter(fromRoute);
    }
  }, [route?.params?.filter]);

  // VICTIM-REQUESTS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user) return;
    let userRows: Req[] = [];
    let createdRows: Req[] = [];
    let userErr = false;
    let createdErr = false;
    let userDenied = false;
    let createdDenied = false;

    const mergeRows = () => {
      const merged = [...userRows, ...createdRows];
      const uniq = Array.from(new Map(merged.map((r) => [r.id, r])).values());
      setRows(uniq);
    };

    const qUser = query(collection(db, "requests"), where("userId", "==", user.uid));
    const qCreated = query(collection(db, "requests"), where("createdBy", "==", user.uid));

    const unsubUser = onSnapshot(
      qUser,
      (snap) => {
        userErr = false;
        userDenied = false;
        userRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req));
        mergeRows();
      },
      (err) => {
        userErr = true;
        userDenied = String((err as any)?.code || "").includes("permission-denied");
        console.warn("[victim requests] userId snapshot:", err);
        if (createdErr) {
          setRows([]);
          if (!(userDenied && createdDenied)) showToast(L("Talepler yüklenemedi.", "Could not load requests."), "error");
        }
      }
    );

    const unsubCreated = onSnapshot(
      qCreated,
      (snap) => {
        createdErr = false;
        createdDenied = false;
        createdRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req));
        mergeRows();
      },
      (err) => {
        createdErr = true;
        createdDenied = String((err as any)?.code || "").includes("permission-denied");
        console.warn("[victim requests] createdBy snapshot:", err);
        if (userErr) {
          setRows([]);
          if (!(userDenied && createdDenied)) showToast(L("Talepler yüklenemedi.", "Could not load requests."), "error");
        }
      }
    );

    return () => {
      unsubUser();
      unsubCreated();
    };
  }, [user, showToast]);

  // VICTIM-REQUESTS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const filtered = useMemo(() => {
    // Silinen talepler hiçbir filtre sekmesinde görünmez
    const nonDeleted = rows.filter((r) => !(r as any).deleted);
    const sorted = [...nonDeleted].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    if (filter === "active") return sorted.filter((r) => r.status !== "closed");
    if (filter === "closed") return sorted.filter((r) => r.status === "closed");
    if (filter === "urgent") return sorted.filter((r) => r.status !== "closed" && isUrgent(r.urgency));
    return sorted;
  }, [rows, filter]);

  // KPI hesaplamaları silinen talepleri saymaz (deleted=true olanlar hariç)
  const visibleRows = useMemo(() => rows.filter((r) => !(r as any).deleted), [rows]);
  const activeCount = visibleRows.filter((r) => r.status !== "closed").length;
  const urgentCount = visibleRows.filter((r) => r.status !== "closed" && isUrgent(r.urgency)).length;
  const closedCount = visibleRows.filter((r) => r.status === "closed").length;

  // [FONKSIYON] manualRefresh: KPI'ları ve listeyi elle yeniler. onSnapshot zaten canlı dinler ama kullanıcı her zaman butonla zorlayabilir.
  const [refreshing, setRefreshing] = useState(false);
  const manualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // onSnapshot bir sonraki frame'de zaten son veriyi gönderir; UI tepkisi için kısa bir gecikme.
      await new Promise((r) => setTimeout(r, 600));
      showToast(L("Talepler güncellendi.", "Requests refreshed."), "success");
    } finally {
      setRefreshing(false);
    }
  };
  // [FONKSIYON] deleteRequest: Talebi yumuşak siler (deleted: true) — listeden kalkar, log'da kalır.
  const deleteRequest = (requestId: string) => {
    Alert.alert(
      L("Talebi Sil", "Delete Request"),
      L("Bu talebi silmek istiyor musunuz? Talep listeden kaldırılır ancak sistem kayıtlarında saklanır.", "Delete this request? It will be removed from your list but kept in system logs."),
      [
        { text: L("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: L("Sil", "Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "requests", requestId), {
                deleted: true,
                deletedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              showToast(L("Talep silindi.", "Request deleted."), "success");
            } catch {
              showToast(L("Talep silinemedi.", "Could not delete request."), "error");
            }
          }
        }
      ]
    );
  };

  // [FONKSIYON] cancelRequest: Açık talebi iptal eder (status → "closed").
  const cancelRequest = (requestId: string) => {
    Alert.alert(
      L("Talebi İptal Et", "Cancel Request"),
      L("Bu talebi iptal etmek istiyor musunuz? Bu işlem geri alınamaz.", "Are you sure you want to cancel this request? This cannot be undone."),
      [
        { text: L("Vazgeç", "No"), style: "cancel" },
        {
          text: L("İptal Et", "Cancel Request"),
          style: "destructive",
          onPress: async () => {
            try {
              // NOT: Firestore kuralları victim için status değişikliğine izin vermiyor.
              // Soft-delete (deleted=true) ile aynı sonuç — talep listeden kalkar, log'da kalır.
              await updateDoc(doc(db, "requests", requestId), {
                deleted: true,
                deletedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              showToast(L("Talep iptal edildi.", "Request cancelled."), "success");
            } catch (err: any) {
              console.warn("[CANCEL-REQUEST] error:", err?.code, err?.message, err);
              showToast(L(`Talep iptal edilemedi: ${err?.code || err?.message || "bilinmeyen hata"}`, `Could not cancel: ${err?.code || err?.message || "unknown"}`), "error");
            }
          }
        }
      ]
    );
  };

  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#060408" : "#0f0610";
  const cardBg = lightMode ? "#ffffff" : "rgba(255,255,255,0.04)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#cbd5e1";
  const textMuted = lightMode ? "#94a3b8" : "#94a3b8";

  // Talep zaman etiketi
  const ageLabel = (createdAt: any) => {
    const ms = toMillis(createdAt);
    if (!ms) return "—";
    const mins = Math.max(1, Math.floor((Date.now() - ms) / 60000));
    if (mins < 60) return L(`${mins} dk önce`, `${mins} min ago`);
    if (mins < 1440) return L(`${Math.round(mins / 60)} sa önce`, `${Math.round(mins / 60)} h ago`);
    return L(`${Math.round(mins / 1440)} gün önce`, `${Math.round(mins / 1440)} d ago`);
  };

  // Statüye göre vurgu rengi (status screen ile aynı palet)
  const accentFor = (status?: string) =>
    status === "closed" ? "#22c55e"
    : status === "in_progress" ? "#3b82f6"
    : status === "assigned" ? "#f59e0b"
    : "#ef4444";

  const filters: Array<{ key: "all" | "active" | "urgent" | "closed"; label: string; icon: any }> = [
    { key: "all", label: L("Tümü", "All"), icon: "albums-outline" },
    { key: "active", label: L("Aktif", "Active"), icon: "pulse-outline" },
    { key: "urgent", label: L("Acil", "Urgent"), icon: "alert-circle-outline" },
    { key: "closed", label: L("Bitti", "Done"), icon: "checkmark-done-outline" }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      {/* Gradient Header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#3f0914", "#1f060d"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <TouchableOpacity
              onPress={() => { try { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate("MainTabs" as never); } catch {} }}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="chevron-back" size={20} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım", "Disaster Aid")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 26, lineHeight: 30, marginTop: 2 }}>{L("Taleplerim", "My Requests")}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={manualRefresh}
            disabled={refreshing}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginRight: 8, opacity: refreshing ? 0.6 : 1 }}
          >
            <Ionicons name={refreshing ? "sync" : "refresh"} size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("VictimRequest")}
            style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Ionicons name="add" size={16} color="white" />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Yeni", "New")}</Text>
          </TouchableOpacity>
        </View>

        {/* KPI rozetleri */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: L("Aktif", "Active"), value: activeCount, accent: "#ef4444", icon: "pulse" as any },
            { label: L("Acil", "Urgent"), value: urgentCount, accent: "#f59e0b", icon: "alert-circle" as any },
            { label: L("Tamamlanan", "Completed"), value: closedCount, accent: "#22c55e", icon: "checkmark-done" as any }
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

      {/* Filtre sekmeleri — ikonlu */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 10,
                height: 38,
                backgroundColor: active ? (lightMode ? "#be123c" : "#dc2626") : cardBg,
                borderWidth: 1,
                borderColor: active ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.4)") : cardBorder
              }}
            >
              <Ionicons name={f.icon} size={13} color={active ? "white" : textMuted} />
              <Text style={{ color: active ? "white" : textMuted, fontFamily: "Inter-Bold", fontSize: 11 }}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 }}
        renderItem={({ item }) => {
          const meta = requestTypeMeta(item.type);
          const status = item.status || "open";
          const urgent = isUrgent(item.urgency);
          const accent = accentFor(status);
          const progressIdx = status === "closed" ? 3 : status === "in_progress" ? 2 : status === "assigned" ? 1 : 0;
          const urgencyLow = `${item.urgency || ""}`.toLocaleLowerCase("tr");
          const urgAccent = urgencyLow.includes("acil") || urgencyLow.includes("high") || urgencyLow.includes("yuk") ? "#ef4444"
            : urgencyLow.includes("orta") || urgencyLow.includes("med") ? "#f59e0b" : "#22c55e";

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("VictimRequestStatus", { requestId: item.id })}
              activeOpacity={0.85}
              style={{ borderRadius: 18, overflow: "hidden", marginBottom: 12, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}
            >
              {/* Sol kenarda durum vurgu çubuğu */}
              <View style={{ flexDirection: "row" }}>
                <View style={{ width: 4, backgroundColor: accent }} />
                <View style={{ flex: 1, padding: 14 }}>
                  {/* Başlık satırı */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: meta.bg, borderWidth: 1, borderColor: `${meta.color}22`, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>
                        {meta.label}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: `${urgAccent}15`, borderWidth: 1, borderColor: `${urgAccent}40` }}>
                          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: urgAccent }} />
                          <Text style={{ color: urgAccent, fontFamily: "Inter-Bold", fontSize: 9 }}>{urgencyLabel(item.urgency)}</Text>
                        </View>
                        <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 10 }}>#{(item.id || "").slice(0, 6).toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={{ borderRadius: 999, backgroundColor: `${accent}15`, borderWidth: 1.5, borderColor: `${accent}55`, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: accent, fontFamily: "Inter-Bold", fontSize: 10 }}>
                        {statusLabel[status]}
                      </Text>
                    </View>
                  </View>

                  {/* Açıklama */}
                  {item.description ? (
                    <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, lineHeight: 17, marginBottom: 12 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {/* Süreç çubuğu — sadece adımlar, fake SLA yok */}
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      {[0, 1, 2, 3].map((i) => {
                        const reached = i <= progressIdx;
                        return (
                          <React.Fragment key={i}>
                            <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: reached ? accent : (lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)") }} />
                            {i < 3 ? (
                              <View style={{ flex: 1, height: 2, backgroundColor: i < progressIdx ? accent : (lightMode ? "#e2e8f0" : "rgba(255,255,255,0.08)") }} />
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      {[L("Alındı", "Received"), L("Atandı", "Assigned"), L("Yolda", "Route"), L("Bitti", "Done")].map((label, i) => (
                        <Text key={label} style={{ color: i === progressIdx ? accent : textMuted, fontFamily: i === progressIdx ? "Inter-Bold" : "Inter", fontSize: 9, flex: 1, textAlign: i === 0 ? "left" : i === 3 ? "right" : "center" }}>{label}</Text>
                      ))}
                    </View>
                  </View>

                  {/* Alt aksiyon satırı */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color={textMuted} />
                      <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>
                        {ageLabel(item.createdAt)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      {status === "closed" ? (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); deleteRequest(item.id); }}
                          style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); cancelRequest(item.id); }}
                          style={{ height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}
                        >
                          <Ionicons name="close" size={12} color="#ef4444" />
                          <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("İptal", "Cancel")}</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ height: 32, borderRadius: 10, backgroundColor: `${accent}15`, borderWidth: 1, borderColor: `${accent}40`, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}>
                        <Text style={{ color: accent, fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Detay", "Detail")}</Text>
                        <Ionicons name="chevron-forward" size={12} color={accent} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 28, alignItems: "center", marginTop: 16 }}>
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1.5, borderColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="document-text-outline" size={28} color="#ef4444" />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 16, marginBottom: 6 }}>{L("Talep bulunamadı", "No requests found")}</Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 18 }}>
              {filter === "all"
                ? L("Henüz bir talep oluşturmadınız.", "You haven't created any requests yet.")
                : L("Bu filtreye uyan talep yok.", "No requests match this filter.")}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("VictimRequest")}
              style={{ borderRadius: 12, overflow: "hidden" }}
            >
              <LinearGradient colors={["#dc2626", "#b91c1c"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="add-circle" size={16} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("YENİ TALEP OLUŞTUR", "CREATE NEW REQUEST")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
};
