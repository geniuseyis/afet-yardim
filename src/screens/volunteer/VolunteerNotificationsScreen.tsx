import {
  React, useEffect, useMemo, useState,
  FlatList, ScrollView, Text, TouchableOpacity, View, Ionicons,
  LinearGradient,
  collection, onSnapshot, query, where, db, useStore, toMillis, statusLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l } from "../../services/i18n";
import { Dimensions } from "react-native";

/**
 * VOL-NOTIF DOSYA HARITASI
 * - VOL-NOTIF-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-NOTIF-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VOL-NOTIF-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-NOTIF-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type VolunteerNotice = {
  id: string;
  title: string;
  body: string;
  createdAtMs: number;
  type: "assignment" | "progress" | "urgent" | "system";
  unread: boolean;
  requestId?: string;
};

// [FONKSIYON] noticeIcon: Bildirim tipine göre ikon ve renk paletini belirler.
const noticeIcon = (t: VolunteerNotice["type"]) => {
  if (t === "assignment") return { icon: "clipboard-outline" as const, color: "#3b82f6", bg: "rgba(59,130,246,0.14)" };
  if (t === "progress") return { icon: "walk-outline" as const, color: "#22c55e", bg: "rgba(34,197,94,0.14)" };
  if (t === "urgent") return { icon: "warning-outline" as const, color: "#ef4444", bg: "rgba(239,68,68,0.14)" };
  return { icon: "notifications-outline" as const, color: "#f59e0b", bg: "rgba(245,158,11,0.14)" };
};

// [FONKSIYON] VolunteerNotificationsScreen: Gönüllü bildirimlerini üretir, filtreler ve siler.
export const VolunteerNotificationsScreen = ({ navigation }: { navigation: any }) => {
  const { user, userData } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const showToast = useStore((state) => state.showToast);
  const volunteerApproved = isVolunteerApproved(userData as any);
  const [openRows, setOpenRows] = useState<Req[]>([]);
  const [myRows, setMyRows] = useState<Req[]>([]);
  const [announcementRows, setAnnouncementRows] = useState<Array<{ id: string; title?: string; message?: string; targetRoles?: string[]; createdAt?: any }>>([]);
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});
  const [dismissedMap, setDismissedMap] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");

  // VOL-NOTIF-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!volunteerApproved) {
      setOpenRows([]);
      return;
    }
    const q = query(collection(db, "requests"), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => setOpenRows(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req))),
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[volunteer notifications open] snapshot:", err);
        }
        setOpenRows([]);
        if (!String((err as any)?.code || "").includes("permission-denied")) showToast(L("Bildirim verileri yüklenemedi.", "Notification data could not be loaded."), "error");
      }
    );
  }, [showToast, volunteerApproved, locale]);

  // VOL-NOTIF-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user || !volunteerApproved) {
      setMyRows([]);
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
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[volunteer notifications mine] snapshot:", err);
        }
        setMyRows([]);
        if (volunteerApproved && !String((err as any)?.code || "").includes("permission-denied")) showToast(L("Görev bildirimleri yüklenemedi.", "Mission notifications could not be loaded."), "error");
      }
    );
  }, [user, showToast, volunteerApproved, locale]);

  useEffect(() => {
    const q = query(collection(db, "announcements"), where("targetRoles", "array-contains", "volunteer"));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setAnnouncementRows(list);
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[volunteer notifications announcements] snapshot:", err);
        }
        setAnnouncementRows([]);
      }
    );
  }, []);

  // VOL-NOTIF-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const notices = useMemo<VolunteerNotice[]>(() => {
    const list: VolunteerNotice[] = [];
    openRows.slice(0, 8).forEach((r) => {
      const urgent = `${r.urgency || ""}`.toLowerCase().includes("acil") || `${r.urgency || ""}`.toLowerCase().includes("high");
      list.push({
        id: `open-${r.id}`,
        title: urgent ? L("Yeni Acil Talep", "New Urgent Request") : L("Yeni Talep", "New Request"),
        body: `${r.type || L("Yardım talebi", "Aid request")} | ${r.urgency || L("Düşük", "Low")}`,
        createdAtMs: toMillis(r.createdAt) || Date.now(),
        type: urgent ? "urgent" : "system",
        unread: !readMap[`open-${r.id}`],
        requestId: r.id
      });
    });
    myRows.slice(0, 12).forEach((r) => {
      list.push({
        id: `mine-${r.id}-${r.status || "assigned"}`,
        title: r.status === "closed" ? L("Görev Tamamlandı", "Mission Completed") : r.status === "in_progress" ? L("Görev Yolda", "Mission En Route") : L("Görev Ataması", "Mission Assignment"),
        body: `${r.type || L("Talep", "Request")} | ${statusLabel[r.status || "assigned"] || r.status}`,
        createdAtMs: toMillis(r.createdAt) || Date.now(),
        type: r.status === "closed" ? "progress" : "assignment",
        unread: !readMap[`mine-${r.id}-${r.status || "assigned"}`],
        requestId: r.id
      });
    });
    announcementRows.slice(0, 12).forEach((a) => {
      list.push({
        id: `ann-${a.id}`,
        title: a.title || L("Yönetici Duyurusu", "Coordinator Announcement"),
        body: a.message || L("Yeni duyuru yayınlandı.", "A new announcement has been published."),
        createdAtMs: toMillis(a.createdAt) || Date.now(),
        type: "system",
        unread: !readMap[`ann-${a.id}`]
      });
    });
    return list.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [openRows, myRows, announcementRows, readMap, locale]);

  const visible = notices.filter((n) => {
    if (dismissedMap[n.id]) return false;
    if (filter === "unread") return n.unread;
    if (filter === "urgent") return n.type === "urgent";
    return true;
  });

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#07080b" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#0a0c10" : "#2a0d16";
  const card = lightMode ? "#ffffff" : amoledMode ? "#101218" : "#3a101c";
  const soft = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";
  const swipeDeleteWidth = 88;
  const rowCardWidth = Math.max(248, Dimensions.get("window").width - 32 - 8);
  const unreadCount = notices.filter((n) => n.unread && !dismissedMap[n.id]).length;

  // [FONKSIYON] chip: Bildirim filtre butonlarını tek tipte render eder.
  const chip = (key: typeof filter, label: string) => (
    <TouchableOpacity
      key={key}
      onPress={() => setFilter(key)}
      style={{
        flex: 1,
        borderRadius: 10,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filter === key
          ? (lightMode ? "#be123c" : "rgba(239,68,68,0.16)")
          : (lightMode ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)"),
        borderWidth: 1,
        borderColor: filter === key
          ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.24)")
          : soft
      }}
    >
      <Text style={{ color: filter === key ? (lightMode ? "white" : "#fff1f2") : textMuted, fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
    </TouchableOpacity>
  );

  // [FONKSIYON] goBackSafe: Ekrandan güvenli geri dönüş yapar.
  const goBackSafe = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else { try { navigation.goBack(); } catch {} }
  };

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* Gradient header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#430914", "#23070f"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <TouchableOpacity onPress={goBackSafe} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü Operasyon", "Volunteer Operations")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22, lineHeight: 26 }}>{L("Bildirim Merkezi", "Notification Center")}</Text>
          </View>
          {unreadCount > 0 ? (
            <View style={{ borderRadius: 999, backgroundColor: "#ef4444", paddingHorizontal: 10, paddingVertical: 5, minWidth: 28, alignItems: "center" }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>

        {/* Filtre satırı */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {chip("all", L("TÜMÜ", "ALL"))}
          {chip("unread", L("OKUNMAMIŞ", "UNREAD"))}
          {chip("urgent", L("ACİL", "URGENT"))}
        </View>
      </LinearGradient>

      {/* Tümünü okundu */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, flexDirection: "row", justifyContent: "flex-end" }}>
        <TouchableOpacity
          onPress={() => {
            const next: Record<string, boolean> = {};
            notices.forEach((n) => { next[n.id] = true; });
            setReadMap(next);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: lightMode ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: soft, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Ionicons name="checkmark-done" size={13} color={lightMode ? "#9f1239" : "#fecaca"} />
          <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Tümünü oku", "Mark all read")}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        renderItem={({ item }) => {
          const meta = noticeIcon(item.type);
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              snapToOffsets={[0, swipeDeleteWidth]}
              decelerationRate="fast"
              style={{ marginBottom: 10 }}
              contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
            >
              <View style={{ width: rowCardWidth }}>
                <TouchableOpacity
                  onPress={() => {
                    setReadMap((p) => ({ ...p, [item.id]: true }));
                    if (item.requestId) {
                      navigation.navigate(item.type === "assignment" || item.type === "progress" ? "VolunteerTaskTracking" : "VolunteerRequestDetail", { requestId: item.requestId });
                    }
                  }}
                  style={{
                    borderRadius: 16,
                    backgroundColor: card,
                    borderWidth: 1,
                    borderColor: soft,
                    padding: 12,
                    borderLeftWidth: 3,
                    borderLeftColor: item.unread ? "#ef4444" : (lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)")
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: meta.bg, borderWidth: 1, borderColor: `${meta.color}30`, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{item.title}</Text>
                      <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginTop: 3, lineHeight: 16 }}>{item.body}</Text>
                    </View>
                    {!item.unread ? (
                      <Ionicons name="checkmark-done" size={15} color="#22c55e" />
                    ) : (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444", marginTop: 4 }} />
                    )}
                  </View>
                  <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: soft }}>
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>
                      {new Date(item.createdAtMs).toLocaleString(locale === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, backgroundColor: lightMode ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: soft, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: lightMode ? "#9f1239" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("DETAY", "DETAIL")}</Text>
                      <Ionicons name="chevron-forward" size={12} color={lightMode ? "#9f1239" : "#fecdd3"} />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => setDismissedMap((p) => ({ ...p, [item.id]: true }))}
                style={{ width: swipeDeleteWidth - 8, marginLeft: 8, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#dc2626", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)" }}
              >
                <Ionicons name="trash-outline" size={18} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10, marginTop: 2 }}>{L("SİL", "DELETE")}</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        }}
        ListEmptyComponent={
          <View style={{ borderRadius: 20, backgroundColor: panel, borderWidth: 1, borderColor: soft, padding: 28, alignItems: "center", marginTop: 4 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.12)", borderWidth: 1.5, borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="notifications-off-outline" size={26} color={lightMode ? "#be123c" : "#fda4af"} />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15, marginBottom: 6 }}>{L("Bildirim yok", "No notifications")}</Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 13, textAlign: "center" }}>
              {L("Yeni atama ve acil talep bildirimleri burada listelenecek.", "New assignments and urgent alerts will appear here.")}
            </Text>
          </View>
        }
      />
    </View>
  );
};







