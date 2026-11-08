import {
  React, ScrollView, Text, TextInput, TouchableOpacity, View,
  Ionicons, LinearGradient, useNavigation, useStore,
  collection, limit, onSnapshot, query, toMillis, where, db, statusLabel, urgencyLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l } from "../../services/i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRef } from "react";

/**
 * CHAT-LIST DOSYA HARITASI
 * - CHAT-LIST-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - CHAT-LIST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - CHAT-LIST-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - CHAT-LIST-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type ChatMeta = {
  id: string;
  title?: string;
  kind?: string;
  requestId?: string | null;
  participantIds?: string[];
  lastMessageText?: string;
  lastMessageAt?: any;
  updatedAt?: any;
};

type ChatCard = {
  key: string;
  title: string;
  sub: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  footer: string;
  onPress: () => void;
};

const requestChannelId = (requestId: string) => `request-${requestId}`;
const volunteerOpsChannelId = (volunteerUid: string) => `ops-volunteer-${volunteerUid}`;

const relativeTimeLabel = (value: any, locale: "tr" | "en"): string => {
  const ms = toMillis(value);
  if (!ms) return locale === "en" ? "just now" : "az önce";
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 1) return locale === "en" ? "just now" : "az önce";
  if (diffMin < 60) return locale === "en" ? `${diffMin} min ago` : `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return locale === "en" ? `${diffHour} h ago` : `${diffHour} sa önce`;
  return locale === "en" ? `${Math.floor(diffHour / 24)} d ago` : `${Math.floor(diffHour / 24)} g önce`;
};

const truncate = (text: string | undefined, len = 38) => {
  const clean = (text || "").trim();
  if (!clean) return "";
  return clean.length > len ? `${clean.slice(0, len)}…` : clean;
};

export const ChatListScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, userData } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const role = userData?.role || "victim";
  const volunteerApproved = isVolunteerApproved(userData as any);
  const bg = lightMode ? "#f1f5f9" : amoledMode ? "#020204" : "#13070d";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";
  const cardBg = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.03)" : "rgba(193,18,31,0.13)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.08)" : "rgba(248,113,113,0.16)";

  const [chatDocs, setChatDocs] = React.useState<ChatMeta[]>([]);
  const [volunteerTasks, setVolunteerTasks] = React.useState<Req[]>([]);
  const [victimTasks, setVictimTasks] = React.useState<Req[]>([]);
  const [search, setSearch] = React.useState("");
  const isFocusedRef = useRef(false);

  // Tab rozeti: Ekran odakta değilken yeni mesajları say, odakta iken sıfırla
  useFocusEffect(
    React.useCallback(() => {
      isFocusedRef.current = true;
      useStore.getState().setUnreadMsgCount(0);
      return () => { isFocusedRef.current = false; };
    }, [])
  );

  React.useEffect(() => {
    if (isFocusedRef.current) return;
    const threshold = Date.now() - 10 * 60 * 1000; // son 10 dakika
    const count = chatDocs.filter((c) => toMillis(c.lastMessageAt || c.updatedAt) > threshold).length;
    if (count > 0) useStore.getState().setUnreadMsgCount(count);
  }, [chatDocs]);

  // CHAT-LIST-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const openChat = (params: any) => navigation.navigate("ChatDetail", params);

  // CHAT-LIST-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  React.useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, "chats");
    const q = role === "coordinator"
      ? query(chatsRef, limit(80))
      : query(chatsRef, where("participantIds", "array-contains", user.uid), limit(80));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a: any, b: any) => toMillis(b?.updatedAt || b?.lastMessageAt) - toMillis(a?.updatedAt || a?.lastMessageAt));
        setChatDocs(list);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[chat-list] chats snapshot error:", err);
        }
        setChatDocs([]);
        if (!String(err?.code || "").includes("permission-denied")) {
          useStore.getState().showToast(L("Mesaj kanalları yüklenemedi.", "Message channels could not be loaded."), "error");
        }
      }
    );
  }, [user?.uid, role]);

  // CHAT-LIST-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  React.useEffect(() => {
    if (role !== "volunteer" || !user || !volunteerApproved) return;
    const q = query(
      collection(db, "requests"),
      where("assignedVolunteerId", "==", user.uid)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as Req))
          .filter((r) => ["assigned", "in_progress", "closed"].includes(String(r.status || "")));
        setVolunteerTasks(list);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[chat-list] volunteer tasks snapshot error:", err);
        }
        setVolunteerTasks([]);
        if (!String(err?.code || "").includes("permission-denied")) {
          useStore.getState().showToast(L("Görev kanalları yüklenemedi.", "Mission channels could not be loaded."), "error");
        }
      }
    );
  }, [role, user?.uid, volunteerApproved]);

  // CHAT-LIST-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  React.useEffect(() => {
    if (role !== "victim" || !user) return;
    const qUserId = query(collection(db, "requests"), where("userId", "==", user.uid));
    const unsub = onSnapshot(
      qUserId,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as Req))
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setVictimTasks(list);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[chat-list] victim requests(userId) snapshot error:", err);
        }
        setVictimTasks([]);
        if (!String(err?.code || "").includes("permission-denied")) {
          useStore.getState().showToast(L("Destek kanalları yüklenemedi.", "Support channels could not be loaded."), "error");
        }
      }
    );

    return () => unsub();
  }, [role, user?.uid]);

  // CHAT-LIST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const chatMetaById = React.useMemo(() => {
    const map = new Map<string, ChatMeta>();
    chatDocs.forEach((c) => map.set(c.id, c));
    return map;
  }, [chatDocs]);

  const channelFooter = (channelId: string, fallback: string) => {
    const meta = chatMetaById.get(channelId);
    if (!meta) return fallback;
    const last = truncate(meta.lastMessageText, 34);
    if (!last) return fallback;
    return `${last} • ${relativeTimeLabel(meta.lastMessageAt || meta.updatedAt, locale)}`;
  };

  const baseAiCards: ChatCard[] = [
    {
      key: "ai-main",
      title: L("Afet.AI Asistan", "Afet.AI Assistant"),
      sub: L("Yapay zeka destekli yönlendirme ve risk analizi", "AI-assisted guidance and risk analysis"),
      icon: "sparkles-outline",
      iconBg: "rgba(239,68,68,0.14)",
      iconColor: "#f87171",
      badge: "AI",
      badgeBg: "rgba(239,68,68,0.14)",
      badgeColor: "#fecaca",
      footer: L("Yardım odaklı genel sohbet", "General assistance-focused chat"),
      onPress: () => openChat({ bot: true, title: "Afet.AI" })
    },
    {
      key: "ai-triage",
      title: "Afet.AI Triage",
      sub: L("Acil durum önceliklendirme ve canlı yönlendirme", "Emergency prioritization and live guidance"),
      icon: "pulse-outline",
      iconBg: "rgba(245,158,11,0.14)",
      iconColor: "#fbbf24",
      badge: "TRIAGE",
      badgeBg: "rgba(245,158,11,0.14)",
      badgeColor: "#fde68a",
      footer: L("Talep triage ve ilk adım desteği", "Request triage and first-step support"),
      onPress: () => openChat({ bot: true, title: "Afet.AI Triage" })
    }
  ];

  const victimTaskChannels: ChatCard[] =
    role === "victim"
      ? victimTasks
          .filter((r) => !!r.assignedVolunteerId && r.status !== "closed")
          .slice(0, 6)
          .map((r) => {
            const channelId = requestChannelId(r.id);
            const ownerId = (r as any).createdBy || (r as any).userId;
            return {
              key: channelId,
              title: `${L("Destek Kanalı", "Support Channel")} • ${(r.type || L("Talep", "Request")).slice(0, 18)}`,
              sub: `${L("Afetzede", "Victim")} ↔ ${L("Gönüllü", "Volunteer")} • ${statusLabel[r.status || "assigned"] || r.status}`,
              icon: "chatbubble-ellipses-outline",
              iconBg: "rgba(59,130,246,0.14)",
              iconColor: "#93c5fd",
              badge: "CANLI",
              badgeBg: "rgba(59,130,246,0.14)",
              badgeColor: "#bfdbfe",
              footer: channelFooter(channelId, "Atanan gönüllü ile mesajlaşma"),
              onPress: () =>
                openChat({
                  bot: false,
                  title: `${L("Talep", "Request")} #${r.id.slice(0, 6)} ${L("Destek", "Support")}`,
                  channelId,
                  channelKind: "request_support",
                  requestId: r.id,
                  participants: [ownerId, (r as any).assignedVolunteerId].filter(Boolean),
                  supportInfo: {
                    requestId: r.id,
                    type: r.type || L("Talep", "Request"),
                    status: statusLabel[r.status || "assigned"] || L("Atandı", "Assigned"),
                    urgency: urgencyLabel(r.urgency),
                    counterpartId: (r as any).assignedVolunteerId || ""
                  }
                })
            };
          })
      : [];

  const volunteerOpsCard: ChatCard[] =
    role === "volunteer" && user
      ? [
          {
            key: "coord-ops",
            title: L("Koordinatör Hattı", "Coordinator Channel"),
            sub: L("Atama, rota ve operasyon iletişim kanalı", "Assignment, routing and operations communication channel"),
            icon: "radio-outline",
            iconBg: "rgba(239,68,68,0.14)",
            iconColor: "#f87171",
            badge: "CANLI",
            badgeBg: "rgba(239,68,68,0.14)",
            badgeColor: "#fecaca",
            footer: channelFooter(volunteerOpsChannelId(user.uid), L("Koordinatör ile hızlı mesajlaşma", "Quick messaging with coordinator")),
            onPress: () =>
              openChat({
                bot: false,
                title: L("Koordinatör Hattı", "Coordinator Channel"),
                channelId: volunteerOpsChannelId(user.uid),
                channelKind: "volunteer_ops",
                participants: [user.uid]
              })
          }
        ]
      : [];

  const volunteerTaskCards: ChatCard[] =
    role === "volunteer"
      ? volunteerTasks
          .filter((r) => r.status !== "closed")
          .slice(0, 8)
          .map((r) => {
            const channelId = requestChannelId(r.id);
            const ownerId = (r as any).createdBy || (r as any).userId;
            return {
              key: channelId,
              title: `${L("Görev Kanalı", "Mission Channel")} • ${(r.type || L("Talep", "Request")).slice(0, 18)}`,
              sub: `${statusLabel[r.status || "assigned"] || r.status} • #${r.id.slice(0, 6)}`,
              icon: "walk-outline",
              iconBg: "rgba(34,197,94,0.14)",
              iconColor: "#86efac",
              badge: "GÖREV",
              badgeBg: "rgba(34,197,94,0.14)",
              badgeColor: "#bbf7d0",
              footer: channelFooter(channelId, L("Afetzede ve koordinasyon notları", "Victim and coordination notes")),
              onPress: () =>
                openChat({
                  bot: false,
                  title: `${L("Görev", "Mission")} #${r.id.slice(0, 6)}`,
                  channelId,
                  channelKind: "request_support",
                  requestId: r.id,
                  participants: [ownerId, (r as any).assignedVolunteerId].filter(Boolean),
                  supportInfo: {
                    requestId: r.id,
                    type: r.type || L("Talep", "Request"),
                    status: statusLabel[r.status || "assigned"] || L("Atandı", "Assigned"),
                    urgency: urgencyLabel(r.urgency),
                    counterpartId: ownerId || ""
                  }
                })
            };
          })
      : [];

  const volunteerAiCards: ChatCard[] =
    role === "volunteer"
      ? [
          {
            key: "vol-ai",
            title: L("Afet.AI Saha Destek", "Afet.AI Field Support"),
            sub: L("Saha güvenliği, rota ve operasyon yardımı", "Field safety, routing and operations support"),
            icon: "sparkles-outline",
            iconBg: "rgba(59,130,246,0.14)",
            iconColor: "#93c5fd",
            badge: "AI",
            badgeBg: "rgba(59,130,246,0.14)",
            badgeColor: "#bfdbfe",
            footer: L("Saha destek asistanı", "Field support assistant"),
            onPress: () => openChat({ bot: true, title: L("Afet.AI Saha Destek", "Afet.AI Field Support") })
          }
        ]
      : [];

  // CHAT-LIST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const coordinatorCards: ChatCard[] = React.useMemo(() => {
    if (role !== "coordinator") return [];
    const pinnedIds = new Set(["coord-ai", "coordinator-support", "coordinator-hq"]);
    const dedupe = new Set<string>();
    let coordinatorOpsAdded = false;
    const recentOps = chatDocs
      .filter((c) => !pinnedIds.has(c.id))
      .filter((c) => c.kind === "volunteer_ops" || c.kind === "request_support")
      .sort((a, b) => toMillis((b as any).updatedAt || (b as any).lastMessageAt) - toMillis((a as any).updatedAt || (a as any).lastMessageAt))
      .filter((c) => {
        if (c.kind === "volunteer_ops") {
          if (coordinatorOpsAdded) return false;
          coordinatorOpsAdded = true;
        }
        const key = `${c.kind || "direct"}:${c.requestId || "-"}:${(c.title || "").trim().toLocaleLowerCase("tr")}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
      .slice(0, 10)
      .map((c) => ({
        key: c.id,
        title: c.title || (c.kind === "volunteer_ops" ? L("Koordinatör Hattı", "Coordinator Channel") : L("Görev Kanalı", "Mission Channel")),
        sub: c.kind === "volunteer_ops"
          ? L("Gönüllü operasyon iletişimi", "Volunteer operations communication")
          : `${L("Talep kanalı", "Request channel")}${c.requestId ? ` • #${String(c.requestId).slice(0, 6)}` : ""}`,
        icon: c.kind === "volunteer_ops" ? "radio-outline" : "walk-outline",
        iconBg: c.kind === "volunteer_ops" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)",
        iconColor: c.kind === "volunteer_ops" ? "#f87171" : "#86efac",
        badge: c.kind === "volunteer_ops" ? "KOORD" : "GÖREV",
        badgeBg: c.kind === "volunteer_ops" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)",
        badgeColor: c.kind === "volunteer_ops" ? "#fecaca" : "#bbf7d0",
        footer: channelFooter(c.id, L("Operasyon kanalı", "Operation channel")),
        onPress: () => openChat({
          bot: false,
          title: c.title || L("Operasyon Kanalı", "Operation Channel"),
          channelId: c.id,
          channelKind: c.kind || "direct",
          requestId: c.requestId || undefined,
          participants: c.participantIds || [],
          supportInfo: {
            requestId: c.requestId || "",
            type: c.kind === "volunteer_ops" ? L("Operasyon Hattı", "Operations Line") : L("Görev Kanalı", "Mission Channel"),
            status: L("Canlı", "Live"),
            urgency: L("Durum Akışı", "Status Flow"),
            counterpartId: (c.participantIds || []).find((id) => id !== user?.uid) || ""
          }
        })
      }));
    return [
      {
        key: "coordinator-hq",
        title: L("Koordinatör Kanalı", "Coordinator Channel"),
        sub: L("Yönetim içi anlık koordinasyon hattı", "Real-time internal coordination line"),
        icon: "radio-outline",
        iconBg: "rgba(239,68,68,0.14)",
        iconColor: "#f87171",
        badge: "CANLI",
        badgeBg: "rgba(239,68,68,0.14)",
        badgeColor: "#fecaca",
        footer: channelFooter("coordinator-hq", L("Koordinatör kanal sabit hattı", "Pinned coordinator channel")),
        onPress: () =>
          openChat({
            bot: false,
            title: L("Koordinatör Kanalı", "Coordinator Channel"),
            channelId: "coordinator-hq",
            channelKind: "coordinator_hq",
            participants: [user?.uid].filter(Boolean)
          })
      },
      {
        key: "coordinator-support",
        title: L("Yönetici Destek", "Admin Support"),
        sub: L("Sistem notları ve operasyon karar hattı", "System notes and operations decision line"),
        icon: "chatbox-ellipses-outline",
        iconBg: "rgba(59,130,246,0.14)",
        iconColor: "#93c5fd",
        badge: "SABİT",
        badgeBg: "rgba(59,130,246,0.14)",
        badgeColor: "#bfdbfe",
        footer: channelFooter("coordinator-support", L("Yönetici destek sabit kanalı", "Pinned admin support channel")),
        onPress: () =>
          openChat({
            bot: false,
            title: L("Yönetici Destek", "Admin Support"),
            channelId: "coordinator-support",
            channelKind: "coordinator_support",
            participants: [user?.uid].filter(Boolean)
          })
      },
      {
        key: "coord-ai",
        title: L("Afet.AI Yönetici Destek", "Afet.AI Admin Support"),
        sub: L("Önceliklendirme, özet ve operasyon yardımı", "Prioritization, summary and operation support"),
        icon: "sparkles-outline",
        iconBg: "rgba(245,158,11,0.14)",
        iconColor: "#fbbf24",
        badge: "AI",
        badgeBg: "rgba(245,158,11,0.14)",
        badgeColor: "#fde68a",
        footer: L("Yönetici için operasyon asistanı", "Operations assistant for admin"),
        onPress: () => openChat({ bot: true, title: L("Afet.AI Yönetici", "Afet.AI Admin") })
      },
      ...recentOps
    ];
  }, [role, chatDocs, user?.uid, locale]);

  // CHAT-LIST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const cards: ChatCard[] =
    role === "victim"
      ? [...baseAiCards, ...victimTaskChannels]
      : role === "volunteer"
        ? [...volunteerOpsCard, ...volunteerAiCards, ...volunteerTaskCards]
        : coordinatorCards;

  // CHAT-LIST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const filteredCards = React.useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale === "en" ? "en-US" : "tr-TR");
    if (!q) return cards;
    return cards.filter((c) => `${c.title} ${c.sub} ${c.footer}`.toLocaleLowerCase(locale === "en" ? "en-US" : "tr-TR").includes(q));
  }, [cards, search, locale]);

  const heading = role === "volunteer" ? L("Operasyon Mesajları", "Operation Messages") : role === "coordinator" ? L("Yönetim Mesajları", "Management Messages") : L("Mesajlar", "Messages");

  // Filter & KPI
  const [filter, setFilter] = React.useState<"all" | "ai" | "live">("all");
  const aiCards = cards.filter((c) => /AI|TRIAGE|Asistan|Triage/i.test(c.badge) || /Afet\.AI/i.test(c.title));
  const liveCards = cards.filter((c) => !aiCards.includes(c));
  const recentThreshold = Date.now() - 60 * 60 * 1000; // 1 saat
  const unreadCount = chatDocs.filter((c) => toMillis(c.lastMessageAt || c.updatedAt) > recentThreshold).length;
  const filteredByTab = filter === "all" ? cards : filter === "ai" ? aiCards : liveCards;
  const finalCards = React.useMemo(() => {
    const q = search.trim().toLocaleLowerCase(locale === "en" ? "en-US" : "tr-TR");
    if (!q) return filteredByTab;
    return filteredByTab.filter((c) => `${c.title} ${c.sub} ${c.footer}`.toLocaleLowerCase(locale === "en" ? "en-US" : "tr-TR").includes(q));
  }, [filteredByTab, search, locale]);

  const filterTabs: Array<{ key: "all" | "ai" | "live"; label: string; icon: any; count: number }> = [
    { key: "all", label: L("Tümü", "All"), icon: "albums-outline", count: cards.length },
    { key: "ai", label: "AI", icon: "sparkles-outline", count: aiCards.length },
    { key: "live", label: L("Canlı", "Live"), icon: "radio-outline", count: liveCards.length }
  ];

  // Karta canlı/yeni durumu çıkar
  const isLiveCard = (key: string): boolean => {
    const meta = chatMetaById.get(key);
    if (!meta) return false;
    return toMillis(meta.lastMessageAt || meta.updatedAt) > recentThreshold;
  };
  const cardTimeLabel = (key: string): string => {
    const meta = chatMetaById.get(key);
    if (!meta) return "";
    return relativeTimeLabel(meta.lastMessageAt || meta.updatedAt, locale);
  };

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* ============ HEADER (Gradient + KPI'lar + Arama) ============ */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#150407", "#0d0305"] : ["#430914", "#23070f"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            {navigation.canGoBack?.() ? (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="arrow-back" size={18} color="white" />
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım", "Afet Yardım")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, lineHeight: 28, marginTop: 2 }}>{heading}</Text>
            </View>
          </View>
          {unreadCount > 0 ? (
            <View style={{ borderRadius: 12, backgroundColor: "#ef4444", paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "white" }} />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>

        {/* KPI rozetleri (3 sütun) */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {[
            { label: L("Toplam", "Total"), value: cards.length, accent: "#ef4444", icon: "chatbubbles" as any },
            { label: "AI", value: aiCards.length, accent: "#8b5cf6", icon: "sparkles" as any },
            { label: L("Canlı", "Live"), value: unreadCount, accent: "#22c55e", icon: "radio" as any }
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

        {/* Arama */}
        <View style={{ height: 42, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.65)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={L("Sohbet ara...", "Search chats...")}
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{ flex: 1, color: "white", fontFamily: "Inter", fontSize: 13, marginLeft: 10, paddingVertical: 0 }}
          />
          {!!search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {/* ============ Filtre Chips ============ */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {filterTabs.map((f) => {
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
              <Ionicons name={f.icon} size={13} color={isActive ? "white" : textMuted} />
              <Text style={{ color: isActive ? "white" : textMuted, fontFamily: "Inter-Bold", fontSize: 11 }}>{f.label}</Text>
              {f.count > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: isActive ? "rgba(255,255,255,0.25)" : `${textMuted}20`, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 }}>
                  <Text style={{ color: isActive ? "white" : textMuted, fontFamily: "Inter-Bold", fontSize: 9 }}>{f.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom + 82, 92) }}>
        {(role === "volunteer" || role === "coordinator") ? (
          <View style={{ borderRadius: 16, backgroundColor: lightMode ? "rgba(239,68,68,0.06)" : "rgba(193,18,31,0.15)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.14)" : "rgba(248,113,113,0.2)", paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Ionicons name="radio-outline" size={17} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Operasyon Mesaj Merkezi", "Operation Message Center")}</Text>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
                  {role === "coordinator"
                    ? L("Gönüllü kanalları ve görev bazlı iletişim akışı", "Volunteer channels and mission-based communication flow")
                    : L("Atama, koordinasyon ve görev bazlı iletişim kanalları", "Assignment, coordination and mission-based channels")}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Sohbet kartları — WhatsApp/Telegram DNA + sol accent bar */}
        {finalCards.map((item) => {
          const live = isLiveCard(item.key);
          const time = cardTimeLabel(item.key);
          const accent = item.iconColor;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={item.onPress}
              activeOpacity={0.85}
              style={{ borderRadius: 18, overflow: "hidden", backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, marginBottom: 10, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}
            >
              <View style={{ flexDirection: "row" }}>
                {/* Sol accent bar */}
                <View style={{ width: 4, backgroundColor: accent }} />
                <View style={{ flex: 1, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {/* Avatar */}
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: item.iconBg, alignItems: "center", justifyContent: "center", marginRight: 11, borderWidth: 1, borderColor: `${item.iconColor}30`, position: "relative" }}>
                      <Ionicons name={item.icon as any} size={22} color={item.iconColor} />
                      {live ? (
                        <View style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22c55e", borderWidth: 2, borderColor: bg, alignItems: "center", justifyContent: "center" }} />
                      ) : null}
                    </View>
                    {/* Title + last message */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                        <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14, flex: 1 }} numberOfLines={1}>{item.title}</Text>
                        {time ? (
                          <Text style={{ color: live ? accent : textMuted, fontFamily: live ? "Inter-Bold" : "Inter", fontSize: 10 }}>{time}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ borderRadius: 999, backgroundColor: item.badgeBg, borderWidth: 1, borderColor: `${item.badgeColor}30`, paddingHorizontal: 7, paddingVertical: 1 }}>
                          <Text style={{ color: item.badgeColor, fontFamily: "Inter-Bold", fontSize: 8, letterSpacing: 0.3 }}>{item.badge}</Text>
                        </View>
                        <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, flex: 1 }} numberOfLines={1}>{item.sub}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Son mesaj önizleme + chevron */}
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.05)", flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name={live ? "chatbubble" : "chatbubble-outline"} size={11} color={live ? accent : textMuted} />
                    <Text style={{ color: live ? textSec : textMuted, fontFamily: live ? "Inter-Bold" : "Inter", fontSize: 11, flex: 1, marginLeft: 6 }} numberOfLines={1}>
                      {item.footer}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {live ? (
                        <View style={{ borderRadius: 999, backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)", paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 8, letterSpacing: 0.3 }}>{L("YENİ", "NEW")}</Text>
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={14} color={textMuted} />
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {!finalCards.length ? (
          <View style={{ borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 28, alignItems: "center", marginTop: 8 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.12)", borderWidth: 1.5, borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="chatbubbles-outline" size={32} color={lightMode ? "#be123c" : "#fda4af"} />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 16, marginBottom: 6 }}>
              {search ? L("Sonuç bulunamadı", "No results") : filter === "ai" ? L("AI sohbeti bulunamadı", "No AI chats") : filter === "live" ? L("Canlı kanal yok", "No live channels") : L("Henüz mesaj kanalı yok", "No message channels yet")}
            </Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 16 }}>
              {search
                ? L(`"${search}" araması için sonuç yok. Farklı bir terim dene.`, `No results for "${search}". Try a different term.`)
                : role === "victim"
                ? L("Talebinize gönüllü atandığında destek kanalı burada görünür. Bu arada Afet.AI ile sohbet edebilirsiniz.", "A support channel will appear here when a volunteer is assigned. Meanwhile, chat with Afet.AI.")
                : role === "volunteer"
                  ? L("Görev üstlenince görev kanalları burada listelenir.", "Mission channels will appear here after you take a mission.")
                  : L("Operasyon kanalları oluştukça burada görünür.", "Operation channels will appear here as they are created.")}
            </Text>
            {!search && role === "victim" && filter === "all" ? (
              <TouchableOpacity
                onPress={() => openChat({ bot: true, title: "Afet.AI" })}
                style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 18, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 7 }}
              >
                <Ionicons name="sparkles" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("AFET.AI İLE SOHBET", "CHAT WITH AFET.AI")}</Text>
              </TouchableOpacity>
            ) : null}
            {filter !== "all" && !search ? (
              <TouchableOpacity
                onPress={() => setFilter("all")}
                style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 18, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 7 }}
              >
                <Ionicons name="albums-outline" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("TÜMÜNÜ GÖSTER", "SHOW ALL")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};



