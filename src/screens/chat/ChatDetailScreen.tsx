import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Keyboard } from "react-native";
import { maskPhone } from "../../utils/privacy";
import { l } from "../../services/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * CHAT-DETAIL DOSYA HARITASI
 * - CHAT-DETAIL-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - CHAT-DETAIL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - CHAT-DETAIL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - CHAT-DETAIL-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// Animated 3-dot typing indicator
const TypingIndicator = ({ lightMode }: { lightMode: boolean }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(600)
        ])
      );
    const a1 = makeDotAnim(dot1, 0);
    const a2 = makeDotAnim(dot2, 150);
    const a3 = makeDotAnim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (dot: Animated.Value) => ({
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: "#f87171",
    marginHorizontal: 2,
    transform: [{ translateY: dot }]
  });

  return (
    <View style={{ alignItems: "flex-start", marginBottom: 10, paddingHorizontal: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.18)", alignItems: "center", justifyContent: "center", marginRight: 6, borderWidth: 1, borderColor: "rgba(248,113,113,0.3)" }}>
          <Ionicons name="sparkles" size={12} color="#f87171" />
        </View>
        <Text style={{ color: "#f87171", fontFamily: "Inter-Bold", fontSize: 10 }}>Afet.AI</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.07)", borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.18)" }}>
        <Animated.View style={dotStyle(dot1)} />
        <Animated.View style={dotStyle(dot2)} />
        <Animated.View style={dotStyle(dot3)} />
      </View>
    </View>
  );
};

// Pulsing live badge for header
const LiveBadge = ({ label }: { label: string }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "rgba(239,68,68,0.16)", borderWidth: 1, borderColor: "rgba(248,113,113,0.28)", paddingHorizontal: 10, paddingVertical: 5, gap: 5 }}>
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#f87171", opacity: pulse }} />
      <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{label}</Text>
    </View>
  );
};

export const ChatDetailScreen = ({ navigation, route }: { navigation: any; route: any }) => {
  const insets = useSafeAreaInsets();
  const bot = !!route?.params?.bot;
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const { user, userData } = useStore();
  const title = (route?.params?.title as string | undefined) || (bot ? "Afet.AI" : L("Mesaj", "Message"));
  const seedPrompt = route?.params?.seedPrompt as string | undefined;
  const channelId = route?.params?.channelId as string | undefined;
  const requestId = route?.params?.requestId as string | undefined;
  const supportInfo = (route?.params?.supportInfo || {}) as {
    requestId?: string;
    type?: string;
    status?: string;
    urgency?: string;
    counterpartId?: string;
  };
  const channelKind = (route?.params?.channelKind as string | undefined) || (bot ? "ai" : "direct");
  const channelParticipants = (route?.params?.participants as string[] | undefined) || [];
  const [messages, setMessages] = useState<Array<{ id: string; text: string; me: boolean; senderId?: string; senderName?: string; senderRole?: string; createdAtMs: number }>>([
    {
      id: "1",
      text: bot ? L("Merhaba. Durumunuzu yazın.", "Hello. Describe your situation.") : L("Mesaj hattı aktif.", "Message channel active."),
      me: false,
      senderId: "system",
      senderName: L("Sistem", "System"),
      senderRole: "system",
      createdAtMs: Date.now()
    }
  ]);
  const [input, setInput] = useState("");
  const [chatState, setChatState] = useState<"idle" | "typing" | "escalated">("idle");
  const [aiProvider, setAiProvider] = useState<"auto" | "openai" | "gemini">("auto");
  const [providerUsed, setProviderUsed] = useState<"openai" | "gemini" | "fallback" | "">("");
  const [receiptRows, setReceiptRows] = useState<Array<{ uid: string; lastReadAtMs: number }>>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<string[]>([]);
  const inputRef = useRef<any>(null);
  const flatRef = useRef<any>(null);
  const QUEUE_KEY = `msg_queue_${channelId || "bot"}`;

  // Çevrimdışı kuyruk: uygulama açıldığında bekleyen mesajları yükle ve gönder
  useEffect(() => {
    const drainQueue = async () => {
      try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        if (!raw) return;
        const queued: string[] = JSON.parse(raw);
        if (!queued.length) return;
        setOfflineQueue(queued);
        // İnternet varsa hepsini gönder
        for (const text of queued) {
          await send(text);
        }
        await AsyncStorage.removeItem(QUEUE_KEY);
        setOfflineQueue([]);
      } catch { /* sessiz geç */ }
    };
    void drainQueue();
  }, [channelId]);

  const roleLabel = (role?: string) => {
    const key = String(role || "").toLowerCase();
    if (key === "victim") return L("Afetzede", "Victim");
    if (key === "volunteer") return L("Gönüllü", "Volunteer");
    if (key === "coordinator") return L("Yönetici", "Coordinator");
    if (key === "system") return L("Sistem", "System");
    if (key === "ai") return "AI";
    return role ? role.toUpperCase() : "";
  };

  const timeLabel = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale === "en" ? "en-US" : "tr-TR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul"
    });

  // CHAT-DETAIL-ISLEM
  const localAiFallback = (text: string): string => {
    const q = text.toLocaleLowerCase("tr");
    if (q.includes("kanama")) return L("Kanamada önce güvenliği sağlayın, temiz bası uygulayın ve mümkünse uzvu yukarıda tutun. Acilse 112 arayın.", "For bleeding, secure safety first, apply clean pressure, and keep the limb elevated if possible. Call emergency services if critical.");
    if (q.includes("deprem")) return L("Deprem sonrası önce güvenli alana geçin, gaz/elektrik riskini kontrol edin ve yakınlarınızla konum paylaşın.", "After an earthquake, move to a safe area, check gas/electric risks, and share your location.");
    if (q.includes("nefes") || q.includes("yaralı")) return L("Yaralının bilinci ve solunumunu kontrol edin. Kritik durum varsa 112'yi arayıp temel ilk yardım adımlarını uygulayın.", "Check consciousness and breathing. If critical, call emergency services and apply basic first aid.");
    if (q.includes("konum")) return L("Konum paylaşımı için harita ekranından canlı konumu açın ve talep ekranındaki destek kanalına koordinat yazın.", "Enable live location in map screen and share coordinates in support channel.");
    return L("Mesajınızı aldım. Durumu kısa maddelerle yazarsanız daha doğru yönlendirme yapabilirim: olay türü, yaralı sayısı, konum, aciliyet.", "Got your message. Share short details for better guidance: incident type, injured count, location, urgency.");
  };

  // CHAT-DETAIL-VERI
  useEffect(() => {
    if (bot || !channelId || !user) return;
    const chatRef = doc(db, "chats", channelId);
    const messagesRef = collection(db, "chats", channelId, "messages");

    setDoc(
      chatRef,
      {
        id: channelId,
        title,
        kind: channelKind,
        requestId: requestId || null,
        participantIds: Array.from(new Set([user.uid, ...channelParticipants].filter(Boolean))),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    ).catch((err) => {
      const code = String((err as any)?.code || "");
      if (!code.includes("permission-denied")) {
        console.warn("[chat-detail] ensure channel failed:", err);
        showToast(L("Sohbet kanalı oluşturulamadı. Mesajlar gönderilmeyebilir.", "Could not open chat channel. Messages may not deliver."), "error");
      }
    });

    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as any;
          const createdAtMs = toMillis(data?.createdAt) || Date.now();
          return {
            id: d.id,
            text: data?.text || "",
            me: data?.senderId === user.uid,
            senderId: data?.senderId || "",
            senderName: data?.senderName || "",
            senderRole: data?.senderRole || "",
            createdAtMs
          };
        }).filter((m) => !!m.text);
        setMessages(
          rows.length
            ? rows
            : [{ id: "seed", text: L("Mesaj hattı aktif.", "Message channel active."), me: false, senderId: "system", senderName: L("Sistem", "System"), senderRole: "system", createdAtMs: Date.now() }]
        );
      },
      (err: any) => {
        console.warn("[chat-detail] messages snapshot error:", err);
        const msg = String(err?.code || "");
        if (!msg.includes("permission-denied")) {
          useStore.getState().showToast(L("Mesajlar yüklenemedi.", "Messages could not be loaded."), "error");
        }
      }
    );
  }, [bot, channelId, user?.uid, title, channelKind, requestId, JSON.stringify(channelParticipants), locale]);

  // CHAT-DETAIL-ISLEM
  const send = async (presetText?: string): Promise<void> => {
    const text = (presetText ?? input).trim();
    if (!text) return;
    if (bot) {
      setMessages((p) => [...p, { id: `${Date.now()}`, text, me: true, senderId: user?.uid || "me", senderName: userData?.fullName || L("Kullanıcı", "User"), senderRole: userData?.role || "user", createdAtMs: Date.now() }]);
    }
    setInput("");
    setChatState("typing");
    setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: true }), 80);
    try {
      if (bot) {
        const chatId = `${user?.uid || "anon"}-${title}`;
        const res = await chatWithAiViaApi({
          chatId,
          message: text,
          context: `role:${userData?.role || "guest"}`,
          provider: aiProvider,
          requireRealProvider: aiProvider !== "auto"
        });
        setMessages((p) => [...p, { id: `${Date.now()}r`, text: res.aiMessage, me: false, senderId: "ai", senderName: "Afet.AI", senderRole: "ai", createdAtMs: Date.now() }]);
        setChatState(res.escalationFlag ? "escalated" : "idle");
        setProviderUsed(res.providerUsed || "fallback");
      } else if (channelId && user) {
        const chatRef = doc(db, "chats", channelId);
        await addDoc(collection(db, "chats", channelId, "messages"), {
          text,
          senderId: user.uid,
          senderRole: userData?.role || "user",
          senderName: userData?.fullName || L("Kullanıcı", "User"),
          createdAt: serverTimestamp()
        });
        await setDoc(
          chatRef,
          {
            id: channelId,
            title,
            kind: channelKind,
            requestId: requestId || null,
            participantIds: Array.from(new Set([user.uid, ...channelParticipants].filter(Boolean))),
            lastMessageText: text,
            lastMessageAt: serverTimestamp(),
            lastSenderId: user.uid,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
        setChatState("idle");
      } else {
        setMessages((p) => [
          ...p,
          {
            id: `${Date.now()}r`,
            text: L("Mesajınız alındı, saha ekibine iletildi.", "Your message has been received and forwarded to field team."),
            me: false,
            senderId: "system",
            senderName: L("Sistem", "System"),
            senderRole: "system",
            createdAtMs: Date.now()
          }
        ]);
        setChatState("idle");
      }
    } catch {
      if (bot) {
        if (aiProvider !== "auto") {
          useStore.getState().showToast(
            L(
              `${aiProvider === "openai" ? "ChatGPT" : "Gemini"} servisine erişilemedi. API anahtarını ve Functions deploy durumunu kontrol edin.`,
              `Could not reach ${aiProvider === "openai" ? "ChatGPT" : "Gemini"} provider. Check API key and Functions deployment.`
            ),
            "error"
          );
        } else {
          setProviderUsed("fallback");
          setMessages((p) => [
            ...p,
            {
              id: `${Date.now()}local`,
              text: localAiFallback(text),
              me: false,
              senderId: "ai",
              senderName: "Afet.AI",
              senderRole: "ai",
              createdAtMs: Date.now()
            }
          ]);
        }
      } else {
        // Çevrimdışı kuyruk: mesajı AsyncStorage'a kaydet
        try {
          const raw = await AsyncStorage.getItem(QUEUE_KEY);
          const queued: string[] = raw ? JSON.parse(raw) : [];
          queued.push(text);
          await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queued));
          setOfflineQueue(queued);
          setMessages((p) => [
            ...p,
            {
              id: `${Date.now()}q`,
              text: `⏳ ${text}`,
              me: true,
              senderId: user?.uid || "me",
              senderName: userData?.fullName || L("Kullanıcı", "User"),
              senderRole: userData?.role || "user",
              createdAtMs: Date.now()
            }
          ]);
          useStore.getState().showToast(L("Çevrimdışısınız — mesaj bağlantı gelince gönderilecek.", "Offline — message will be sent when connected."), "info");
        } catch {
          setMessages((p) => [
            ...p,
            {
              id: `${Date.now()}e`,
              text: L("Mesaj gönderilemedi. Lütfen tekrar deneyin.", "Message could not be sent. Please try again."),
              me: false,
              senderId: "system",
              senderName: L("Sistem", "System"),
              senderRole: "system",
              createdAtMs: Date.now()
            }
          ]);
        }
      }
      setChatState("idle");
    }
  };

  const sendBtnScale = useRef(new Animated.Value(1)).current;

  const animateSend = () => {
    Animated.sequence([
      Animated.spring(sendBtnScale, { toValue: 0.78, useNativeDriver: true, speed: 50, bounciness: 0 }),
      Animated.spring(sendBtnScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 14 })
    ]).start();
  };

  const sendCurrent = () => {
    if (!input.trim()) return;
    animateSend();
    Keyboard.dismiss();
    void send();
  };

  useEffect(() => {
    if (!bot || !seedPrompt) return;
    setInput(seedPrompt);
  }, [bot, seedPrompt]);

  const quickReplies = useMemo(() => {
    if (bot) {
      return [
        L("Konum paylaşımı nasıl yaparım?", "How do I share my location?"),
        L("Deprem sonrası ilk 3 adım nedir?", "What are the first 3 steps after an earthquake?"),
        L("Yaralı için hızlı triage önerisi ver", "Give quick triage advice for an injured person"),
        L("Toplanma alanı kontrol listesi", "Assembly area checklist")
      ];
    }
    if (channelKind === "request_support") {
      return [
        L("Konum güncellendi", "Location updated"),
        L("Yoldayım, ETA 15 dk", "I'm on the way, ETA 15 min"),
        L("Ek destek gerekiyor", "Additional support is needed"),
        L("Görev tamamlandı", "Mission completed")
      ];
    }
    if (channelKind === "volunteer_ops") {
      return [
        L("Atamayı aldım", "I received the assignment"),
        L("Sahaya çıkıyorum", "I'm heading to the field"),
        L("Durum raporu paylaşıldı", "Status report shared"),
        L("Görev kapatıldı", "Mission closed")
      ];
    }
    return [L("Mesaj alındı", "Message received"), L("Konum paylaşıldı", "Location shared"), L("Detay gönderiyorum", "Sending details")];
  }, [bot, channelKind, locale]);

  const lastMyMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].me) return messages[i];
    }
    return null;
  }, [messages]);

  const myLastSeenByOther = useMemo(() => {
    if (!lastMyMessage || !user?.uid) return false;
    return receiptRows.some((r) => r.uid !== user.uid && r.lastReadAtMs >= lastMyMessage.createdAtMs);
  }, [lastMyMessage, receiptRows, user?.uid]);

  // [FONKSIYON] msgReadStatus: Her mesaj için okunma durumu (none | sent | read)
  const msgReadStatus = (msg: { id: string; me: boolean; createdAtMs: number }): "sent" | "read" | "none" => {
    if (!msg.me || bot) return "none";
    const seenByOther = receiptRows.some((r) => r.uid !== user?.uid && r.lastReadAtMs >= msg.createdAtMs);
    return seenByOther ? "read" : "sent";
  };

  useEffect(() => {
    if (bot || !channelId || !user?.uid) {
      setReceiptRows([]);
      return;
    }
    const receiptsRef = collection(db, "chats", channelId, "read_receipts");
    return onSnapshot(
      receiptsRef,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as any;
          return { uid: data?.uid || d.id, lastReadAtMs: toMillis(data?.lastReadAt) || 0 };
        });
        setReceiptRows(rows);
      },
      (err: any) => {
        console.warn("[chat-detail] receipts snapshot error:", err);
        setReceiptRows([]);
      }
    );
  }, [bot, channelId, user?.uid]);

  useEffect(() => {
    if (bot || !channelId || !user?.uid || !messages.length) return;
    const last = messages[messages.length - 1];
    const ref = doc(db, "chats", channelId, "read_receipts", user.uid);
    setDoc(ref, { uid: user.uid, lastReadAt: serverTimestamp(), lastReadMessageId: last.id }, { merge: true }).catch((e) => {
      console.warn("[chat-detail] update read receipt failed:", e);
    });
  }, [bot, channelId, user?.uid, messages]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // CHAT-DETAIL-ARAYUZ
  const bgColor = lightMode ? "#f1f5f9" : amoledMode ? "#010103" : "#0d0810";
  const isSystem = (m: { senderId?: string }) => m.senderId === "system";
  const isAi = (m: { senderId?: string }) => m.senderId === "ai";

  const renderMessage = ({ item }: { item: typeof messages[0] }) => {
    // System pill
    if (isSystem(item)) {
      return (
        <View style={{ alignItems: "center", marginVertical: 8 }}>
          <View style={{ borderRadius: 999, backgroundColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)", paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ color: lightMode ? "#64748b" : "#94a3b8", fontFamily: "Inter", fontSize: 11 }}>{item.text}</Text>
          </View>
        </View>
      );
    }

    // AI message
    if (!item.me && (bot || isAi(item))) {
      return (
        <View style={{ alignItems: "flex-start", marginBottom: 12, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
            <LinearGradient
              colors={["#7f1d1d", "#b91c1c"]}
              style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 7, shadowColor: "#ef4444", shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}
            >
              <Ionicons name="sparkles" size={13} color="white" />
            </LinearGradient>
            <Text style={{ color: "#f87171", fontFamily: "Inter-Bold", fontSize: 11 }}>Afet.AI</Text>
            {providerUsed && isAi(item) ? (
              <View style={{ marginLeft: 6, borderRadius: 999, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: "#fca5a5", fontFamily: "Inter-Bold", fontSize: 9 }}>
                  {providerUsed === "openai" ? "ChatGPT" : providerUsed === "gemini" ? "Gemini" : "Local"}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ maxWidth: "82%", backgroundColor: lightMode ? "#ffffff" : "rgba(255,255,255,0.07)", borderRadius: 18, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.14)" : "rgba(248,113,113,0.14)", shadowColor: "#ef4444", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Text style={{ color: lightMode ? "#0f172a" : "#f1f5f9", fontFamily: "Inter", fontSize: 14, lineHeight: 21 }}>{item.text}</Text>
            <Text style={{ color: lightMode ? "#94a3b8" : "#64748b", fontFamily: "Inter", fontSize: 10, marginTop: 5, alignSelf: "flex-end" }}>{timeLabel(item.createdAtMs)}</Text>
          </View>
        </View>
      );
    }

    // Other user message (non-bot channel)
    if (!item.me && !bot) {
      return (
        <View style={{ alignItems: "flex-start", marginBottom: 12, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(148,163,184,0.18)", alignItems: "center", justifyContent: "center", marginRight: 6, borderWidth: 1, borderColor: "rgba(148,163,184,0.2)" }}>
              <Ionicons name="person" size={12} color="#94a3b8" />
            </View>
            <Text style={{ color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 11 }}>
              {item.senderName || L("Kullanıcı", "User")}
              {item.senderRole && item.senderRole !== "system" && item.senderRole !== "ai" ? ` · ${roleLabel(item.senderRole)}` : ""}
            </Text>
          </View>
          <View style={{ maxWidth: "82%", backgroundColor: lightMode ? "#ffffff" : "rgba(255,255,255,0.07)", borderRadius: 18, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: lightMode ? "rgba(148,163,184,0.2)" : "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: lightMode ? "#0f172a" : "#f1f5f9", fontFamily: "Inter", fontSize: 14, lineHeight: 21 }}>{item.text}</Text>
            <Text style={{ color: lightMode ? "#94a3b8" : "#64748b", fontFamily: "Inter", fontSize: 10, marginTop: 5, alignSelf: "flex-end" }}>{timeLabel(item.createdAtMs)}</Text>
          </View>
        </View>
      );
    }

    // My message
    return (
      <View style={{ alignItems: "flex-end", marginBottom: 12, paddingHorizontal: 14 }}>
        <LinearGradient
          colors={["#9f1239", "#be123c", "#c1121f"]}
          style={{ maxWidth: "78%", borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 11, shadowColor: "#ef4444", shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
        >
          <Text style={{ color: "white", fontFamily: "Inter", fontSize: 14, lineHeight: 21 }}>{item.text}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 5, gap: 4 }}>
            <Text style={{ color: "rgba(255,255,255,0.55)", fontFamily: "Inter", fontSize: 10 }}>{timeLabel(item.createdAtMs)}</Text>
            {(() => {
              const status = msgReadStatus(item);
              if (status === "none") return null;
              return (
                <Ionicons
                  name={status === "read" ? "checkmark-done" : "checkmark"}
                  size={14}
                  color={status === "read" ? "#4ade80" : "rgba(255,255,255,0.6)"}
                />
              );
            })()}
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bgColor }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        {/* Header */}
        <LinearGradient
          colors={lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#120406", "#160507", "#150507"] : ["#16070c", "#290b14", "#34101a"]}
          style={{ paddingTop: insets.top + 10, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginRight: 10 }}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </TouchableOpacity>
            {bot ? (
              <LinearGradient colors={["#7f1d1d", "#b91c1c"]} style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 10, shadowColor: "#ef4444", shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 }}>
                <Ionicons name="sparkles" size={18} color="white" />
              </LinearGradient>
            ) : (
              <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginRight: 10 }}>
                <Ionicons name="chatbubbles" size={18} color="#fecdd3" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 16 }}>{title}</Text>
              <Text style={{ color: bot ? "#fecdd3" : "#cbd5e1", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>
                {bot
                  ? L("AI destekli güvenli yardım sohbeti", "AI-assisted emergency support chat")
                  : L("Operasyon mesajlaşma hattı", "Operational messaging channel")}
              </Text>
            </View>
            <LiveBadge label={bot ? "AI" : L("CANLI", "LIVE")} />
          </View>
        </LinearGradient>

        {/* Bot panel */}
        {bot ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ borderRadius: 16, backgroundColor: lightMode ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.14)" : "rgba(248,113,113,0.14)", padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: "#f87171", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("AI TRİAJ & CANLI YÖNLENDİRME", "AI TRIAGE & LIVE GUIDANCE")}</Text>
                <View style={{ borderRadius: 999, backgroundColor: chatState === "escalated" ? "rgba(239,68,68,0.22)" : chatState === "typing" ? "rgba(251,191,36,0.18)" : "rgba(34,197,94,0.14)", borderWidth: 1, borderColor: chatState === "escalated" ? "rgba(239,68,68,0.4)" : chatState === "typing" ? "rgba(251,191,36,0.3)" : "rgba(34,197,94,0.3)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: chatState === "escalated" ? "#fca5a5" : chatState === "typing" ? "#fde68a" : "#86efac", fontFamily: "Inter-Bold", fontSize: 9 }}>
                    {chatState === "typing" ? L("ANALİZ", "ANALYZING") : chatState === "escalated" ? L("ESKALE", "ESCALATED") : L("HAZIR", "READY")}
                  </Text>
                </View>
              </View>
              {/* Provider selector */}
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {([
                  { key: "auto" as const, label: "AUTO" },
                  { key: "openai" as const, label: "ChatGPT" },
                  { key: "gemini" as const, label: "Gemini" }
                ]).map((p) => {
                  const active = aiProvider === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setAiProvider(p.key)}
                      style={{ borderRadius: 999, borderWidth: 1, borderColor: active ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.12)", backgroundColor: active ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ color: active ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 }}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                {providerUsed ? (
                  <View style={{ marginLeft: "auto", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 9 }}>
                      {providerUsed === "openai" ? "✓ ChatGPT" : providerUsed === "gemini" ? "✓ Gemini" : "✓ Local"}
                    </Text>
                  </View>
                ) : null}
              </View>
              {seedPrompt ? (
                <TouchableOpacity
                  onPress={sendCurrent}
                  style={{ marginTop: 8, borderRadius: 10, backgroundColor: "rgba(193,18,31,0.14)", borderWidth: 1, borderColor: "rgba(193,18,31,0.24)", height: 34, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}
                >
                  <Ionicons name="send" size={11} color="#fecaca" />
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("TRİAJ ÖZETİNİ GÖNDER", "SEND TRIAGE SUMMARY")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Support channel info */}
        {!bot ? (
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ borderRadius: 14, backgroundColor: lightMode ? "rgba(239,68,68,0.05)" : "rgba(193,18,31,0.14)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.12)" : "rgba(248,113,113,0.2)", paddingHorizontal: 12, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Ionicons name="radio" size={12} color="#f87171" />
                <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("DESTEK KANALI", "SUPPORT CHANNEL")}</Text>
              </View>
              <Text style={{ color: lightMode ? "#1e293b" : "#fff1f2", fontFamily: "Inter", fontSize: 12, marginTop: 2 }}>
                {supportInfo.requestId ? `${L("Talep", "Request")} #${supportInfo.requestId.slice(0, 6)}` : L("Genel destek hattı", "General support line")} · {supportInfo.type || L("Operasyon", "Operation")}
              </Text>
              <Text style={{ color: lightMode ? "#64748b" : "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
                {L("Durum", "Status")}: {supportInfo.status || L("Canlı", "Live")} · {L("Öncelik", "Priority")}: {supportInfo.urgency || L("Standart", "Standard")}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Messages */}
        <FlatList
          ref={flatRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom + 10, 22), flexGrow: 1, justifyContent: "flex-end" }}
          data={messages}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatRef.current?.scrollToEnd?.({ animated: false })}
          renderItem={renderMessage}
        />

        {/* Typing indicator */}
        {chatState === "typing" ? <TypingIndicator lightMode={lightMode} /> : null}

        {/* Escalation banner */}
        {chatState === "escalated" ? (
          <View style={{ marginHorizontal: 14, marginBottom: 6, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.28)", padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Ionicons name="warning" size={15} color="#f87171" style={{ marginTop: 1 }} />
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12, lineHeight: 17, flex: 1 }}>
              {L("Bu görüşme riskli olarak işaretlendi, operatör aktarımı başlatıldı. Canlı yönlendirme önceliklendirildi.", "This conversation was flagged as risky. Operator handoff started and live routing prioritized.")}
            </Text>
          </View>
        ) : null}

        {/* Quick replies */}
        {!keyboardVisible ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ borderTopWidth: 1, borderTopColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)", backgroundColor: lightMode ? "#f8fafc" : amoledMode ? "#05050a" : "#0d0810", maxHeight: 50 }}
            contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 }}
          >
            {quickReplies.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => { void send(item); }}
                style={{ borderRadius: 999, borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.22)" : "rgba(248,113,113,0.26)", backgroundColor: lightMode ? "rgba(239,68,68,0.07)" : "rgba(193,18,31,0.16)", paddingHorizontal: 13, height: 30, alignItems: "center", justifyContent: "center", marginRight: 8 }}
              >
                <Text style={{ color: lightMode ? "#9f1239" : "#fee2e2", fontFamily: "Inter-Bold", fontSize: 11 }}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {/* Input area */}
        <View style={{ backgroundColor: lightMode ? "#ffffff" : amoledMode ? "#05050a" : "#0d0810", borderTopWidth: 1, borderTopColor: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)", paddingBottom: insets.bottom > 0 ? insets.bottom : 8, paddingTop: 8, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              ref={inputRef}
              style={{ flex: 1, backgroundColor: lightMode ? "#f1f5f9" : "rgba(255,255,255,0.05)", borderColor: lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: lightMode ? "#0f172a" : "#f1f5f9", fontFamily: "Inter", fontSize: 14, minHeight: 44, maxHeight: 110 }}
              placeholder={L("Mesaj yaz...", "Type a message...")}
              placeholderTextColor={lightMode ? "#94a3b8" : "#475569"}
              value={input}
              onChangeText={setInput}
              returnKeyType="send"
              blurOnSubmit={true}
              multiline
              onSubmitEditing={sendCurrent}
            />
            <Animated.View style={{ transform: [{ scale: sendBtnScale }] }}>
              <TouchableOpacity
                onPress={sendCurrent}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: input.trim() ? "#c1121f" : lightMode ? "#e2e8f0" : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", shadowColor: input.trim() ? "#ef4444" : "transparent", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: input.trim() ? 5 : 0 }}
              >
                <Ionicons name="send" size={18} color={input.trim() ? "white" : lightMode ? "#94a3b8" : "#475569"} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};
