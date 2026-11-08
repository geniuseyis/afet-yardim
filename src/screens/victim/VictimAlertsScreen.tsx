import {
  React, useEffect, useState,
  ScrollView, Text, TouchableOpacity, View,
  LinearGradient, Ionicons, useNavigation,
  collection, limit, onSnapshot, orderBy, query, where,
  db, useStore,
  toMillis,
  s
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { Dimensions } from "react-native";
import { l } from "../../services/i18n";

/**
 * VICTIM-ALERTS DOSYA HARITASI
 * - VICTIM-ALERTS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VICTIM-ALERTS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VICTIM-ALERTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-ALERTS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimAlertsScreen: Duyuru/bildirimleri listeler ve silme/navigasyon aksiyonlarını yönetir.
export const VictimAlertsScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [active, setActive] = useState<Req | null>(null);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title?: string; message?: string }>>([]);
  const [dismissedMap, setDismissedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "requests"), where("createdBy", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Req))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setActive(list.find((r) => r.status !== "closed") || null);
      },
      (err) => {
        console.warn("[victim alerts] requests snapshot:", err);
        setActive(null);
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Talep verileri yüklenemedi.", "Request data could not be loaded."), "error");
        }
      }
    );
  }, [user, showToast, locale]);

  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(6));
    return onSnapshot(
      q,
      (snap) => {
        setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)));
      },
      (err) => {
        console.warn("[victim alerts] announcements snapshot:", err);
        setAnnouncements([]);
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Duyurular yüklenemedi.", "Announcements could not be loaded."), "error");
        }
      }
    );
  }, [showToast, locale]);

  const [filter, setFilter] = useState<"all" | "urgent" | "info" | "request">("all");
  const list = announcements.filter((a) => !dismissedMap[a.id]);

  // Duyuru tipini başlık/mesaj içeriğine göre tahmin et (acil/bilgi)
  const guessType = (a: { title?: string; message?: string }): "urgent" | "info" => {
    const t = `${a.title || ""} ${a.message || ""}`.toLocaleLowerCase("tr");
    if (t.includes("acil") || t.includes("kritik") || t.includes("uyarı") || t.includes("tehlike") || t.includes("deprem") || t.includes("yangın") || t.includes("sel")) return "urgent";
    return "info";
  };

  const filteredList = list.filter((a) => {
    if (filter === "all") return true;
    if (filter === "request") return false;
    return guessType(a) === filter;
  });
  const urgentCount = list.filter((a) => guessType(a) === "urgent").length;
  const infoCount = list.filter((a) => guessType(a) === "info").length;
  const requestCount = active ? 1 : 0;

  const swipeDeleteWidth = 88;
  const rowCardWidth = Math.max(248, Dimensions.get("window").width - 32 - 8);
  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#06070a" : "#0d0810";
  const heroColors: [string, string, string] = lightMode
    ? ["#9f1239", "#be123c", "#dc2626"]
    : amoledMode
    ? ["#120406", "#170508", "#180509"]
    : ["#3f0914", "#2a0610", "#1f060d"];
  const cardBg = lightMode ? "#ffffff" : "rgba(255,255,255,0.04)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";
  const titleColor = lightMode ? "#0f172a" : "#fff1f2";
  const subColor = lightMode ? "#475569" : "#cbd5e1";
  const mutedColor = lightMode ? "#94a3b8" : "#94a3b8";

  const filters: Array<{ key: "all" | "urgent" | "info" | "request"; label: string; icon: any; count: number }> = [
    { key: "all", label: L("Tümü", "All"), icon: "albums-outline", count: list.length + requestCount },
    { key: "urgent", label: L("Acil", "Urgent"), icon: "alert-circle-outline", count: urgentCount },
    { key: "info", label: L("Bilgi", "Info"), icon: "information-circle-outline", count: infoCount },
    { key: "request", label: L("Talep", "Request"), icon: "pulse-outline", count: requestCount }
  ];

  // Zaman damgası formatlayıcı
  const timeAgo = (createdAt: any): string => {
    const ms = toMillis(createdAt);
    if (!ms) return "";
    const mins = Math.max(1, Math.floor((Date.now() - ms) / 60000));
    if (mins < 60) return L(`${mins} dk önce`, `${mins} min ago`);
    if (mins < 1440) return L(`${Math.round(mins / 60)} sa önce`, `${Math.round(mins / 60)} h ago`);
    return L(`${Math.round(mins / 1440)} gün önce`, `${Math.round(mins / 1440)} d ago`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      {/* ============ HEADER (Gradient + KPI'lar) ============ */}
      <LinearGradient
        colors={heroColors}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Bildirim Merkezi", "Notification Center")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, lineHeight: 28, marginTop: 2 }}>{L("Uyarılar", "Alerts")}</Text>
          </View>
          {list.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                const allDismissed: Record<string, boolean> = {};
                list.forEach((a) => { allDismissed[a.id] = true; });
                setDismissedMap((prev) => ({ ...prev, ...allDismissed }));
                showToast(L("Tüm uyarılar temizlendi.", "All alerts cleared."), "success");
              }}
              style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Ionicons name="checkmark-done" size={14} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("TÜMÜ", "ALL")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* KPI rozetleri (3 sütun) */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: L("Toplam", "Total"), value: list.length + requestCount, accent: "#ef4444", icon: "notifications" as any },
            { label: L("Acil", "Urgent"), value: urgentCount, accent: "#f59e0b", icon: "alert-circle" as any },
            { label: L("Bilgi", "Info"), value: infoCount, accent: "#3b82f6", icon: "information-circle" as any }
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

      {/* ============ Filtre Chips ============ */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {filters.map((f) => {
          const isActive = filter === f.key;
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
                backgroundColor: isActive ? (lightMode ? "#be123c" : "#dc2626") : cardBg,
                borderWidth: 1,
                borderColor: isActive ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.4)") : cardBorder
              }}
            >
              <Ionicons name={f.icon} size={13} color={isActive ? "white" : mutedColor} />
              <Text style={{ color: isActive ? "white" : mutedColor, fontFamily: "Inter-Bold", fontSize: 11 }}>{f.label}</Text>
              {f.count > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: isActive ? "rgba(255,255,255,0.25)" : `${mutedColor}20`, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 }}>
                  <Text style={{ color: isActive ? "white" : mutedColor, fontFamily: "Inter-Bold", fontSize: 9 }}>{f.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 92 }}>
        {/* Aktif Talep Kartı — Sol accent bar (Taleplerim DNA) */}
        {!!active && (filter === "all" || filter === "request") && (
          <TouchableOpacity
            onPress={() => navigation.navigate("VictimRequestStatus", { requestId: active.id })}
            activeOpacity={0.85}
            style={{ borderRadius: 18, overflow: "hidden", backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, marginBottom: 12, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}
          >
            <View style={{ flexDirection: "row" }}>
              <View style={{ width: 4, backgroundColor: "#ef4444" }} />
              <View style={{ flex: 1, padding: 14, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)", alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                  <Ionicons name="pulse" size={20} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
                    <View style={{ borderRadius: 999, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)", paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 8, letterSpacing: 0.3 }}>{L("TALEP", "REQUEST")}</Text>
                    </View>
                    <Text style={{ color: mutedColor, fontFamily: "Inter", fontSize: 10 }}>#{(active.id || "").slice(0, 6).toUpperCase()}</Text>
                  </View>
                  <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Aktif Talep Takibi", "Active Request Tracking")}</Text>
                  <Text style={{ color: subColor, fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{L("Durumu görüntülemek için dokun", "Tap to view status")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ef4444" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Duyuru kartları */}
        {filteredList.map((a) => {
          const type = guessType(a);
          const accent = type === "urgent" ? "#ef4444" : "#3b82f6";
          const accentBg = type === "urgent" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)";
          const accentBorder = type === "urgent" ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)";
          const iconName = type === "urgent" ? "alert-circle" : "megaphone";
          const typeLabel = type === "urgent" ? L("ACİL", "URGENT") : L("BİLGİ", "INFO");
          return (
            <ScrollView
              key={a.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              snapToOffsets={[0, swipeDeleteWidth]}
              decelerationRate="fast"
              style={{ marginBottom: 10 }}
              contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
            >
              <View style={{ width: rowCardWidth, borderRadius: 18, overflow: "hidden", backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: 4, backgroundColor: accent }} />
                  <View style={{ flex: 1, padding: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accentBg, borderWidth: 1, borderColor: accentBorder, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                        <Ionicons name={iconName as any} size={18} color={accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <View style={{ borderRadius: 999, backgroundColor: accentBg, borderWidth: 1, borderColor: accentBorder, paddingHorizontal: 7, paddingVertical: 1 }}>
                            <Text style={{ color: accent, fontFamily: "Inter-Bold", fontSize: 8, letterSpacing: 0.3 }}>{typeLabel}</Text>
                          </View>
                          {(a as any).createdAt ? (
                            <Text style={{ color: mutedColor, fontFamily: "Inter", fontSize: 10 }}>{timeAgo((a as any).createdAt)}</Text>
                          ) : null}
                        </View>
                        <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>{a.title || L("Duyuru", "Announcement")}</Text>
                      </View>
                    </View>
                    <Text style={{ color: subColor, fontFamily: "Inter", fontSize: 12, lineHeight: 18 }} numberOfLines={3}>
                      {a.message || L("Yeni bilgilendirme", "New information")}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: cardBorder }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="information-circle-outline" size={12} color={mutedColor} />
                        <Text style={{ color: mutedColor, fontFamily: "Inter", fontSize: 10 }}>{L("Sola kaydır → sil", "Swipe left → delete")}</Text>
                      </View>
                      <View style={{ borderRadius: 8, backgroundColor: accentBg, borderWidth: 1, borderColor: accentBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                        <Text style={{ color: accent, fontFamily: "Inter-Bold", fontSize: 10 }}>{L("OKUNDU", "READ")}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setDismissedMap((prev) => ({ ...prev, [a.id]: true }))}
                style={{ width: swipeDeleteWidth - 8, marginLeft: 8, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#b91c1c", borderWidth: 1, borderColor: "rgba(248,113,113,0.3)" }}
              >
                <Ionicons name="trash-outline" size={20} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10, marginTop: 3 }}>{L("SİL", "DEL")}</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        })}

        {/* Boş durum */}
        {filteredList.length === 0 && (!active || (filter !== "all" && filter !== "request")) && (
          <View style={{ borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 28, alignItems: "center", marginTop: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: lightMode ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="checkmark-done" size={32} color={lightMode ? "#10b981" : "#6ee7b7"} />
            </View>
            <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 16, marginBottom: 6, textAlign: "center" }}>
              {filter === "all" ? L("Hepsi yolunda!", "All clear!") : L("Bu kategoride uyarı yok", "No alerts in this category")}
            </Text>
            <Text style={{ color: subColor, fontFamily: "Inter", fontSize: 12, textAlign: "center", lineHeight: 18, marginBottom: 16 }}>
              {filter === "all"
                ? L("Şu anda gösterilecek aktif uyarı yok. Sistem afet/duyuru bildirimlerini buraya iletecek.", "No active alerts to show right now. The system will deliver disaster/announcement notifications here.")
                : L("Farklı bir kategori dene veya tümünü görüntüle.", "Try a different category or view all.")}
            </Text>
            {filter !== "all" ? (
              <TouchableOpacity
                onPress={() => setFilter("all")}
                style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="albums-outline" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("TÜMÜNÜ GÖSTER", "SHOW ALL")}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate("VictimRequest")}
                style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="add-circle-outline" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("YARDIM TALEBİ OLUŞTUR", "CREATE HELP REQUEST")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};
