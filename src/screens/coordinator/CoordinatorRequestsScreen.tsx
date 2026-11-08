import {
  React,
  useEffect,
  useMemo,
  useState,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  useNavigation,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  db,
  useStore,
  assignVolunteerViaApi,
  transitionRequestStatusViaApi,
  isUrgent,
  requestTypeMeta,
  statusLabel,
  urgencyLabel,
  toMillis
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";
import { Image, Modal, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { scoreRequest, fraudLevelColor, fraudLevelLabel, type FraudResult } from "../../services/fraudDetection";

/**
 * COORD-REQUESTS DOSYA HARITASI
 * - COORD-REQUESTS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - COORD-REQUESTS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - COORD-REQUESTS-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - COORD-REQUESTS-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type FilterKey = "all" | "open" | "assigned" | "in_progress" | "closed";
type PresetKey = "all" | "urgent" | "sla_risk" | "unassigned" | "field" | "fraud";
type VolunteerAppLite = { id: string; requestId?: string; volunteerId?: string; status?: string; createdAt?: any };

const FILTERS: Array<{ key: FilterKey; labelTr: string; labelEn: string }> = [
  { key: "all", labelTr: "Tümü", labelEn: "All" },
  { key: "open", labelTr: "Bekleyen", labelEn: "Pending" },
  { key: "assigned", labelTr: "Atandı", labelEn: "Assigned" },
  { key: "in_progress", labelTr: "Sahada", labelEn: "In Field" },
  { key: "closed", labelTr: "Tamamlandı", labelEn: "Completed" }
];

const PRESETS: Array<{ key: PresetKey; labelTr: string; labelEn: string }> = [
  { key: "all", labelTr: "Tüm Kayıtlar", labelEn: "All Records" },
  { key: "urgent", labelTr: "Acil Öncelik", labelEn: "Urgent Priority" },
  { key: "sla_risk", labelTr: "SLA Risk/İhlal", labelEn: "SLA Risk/Breach" },
  { key: "unassigned", labelTr: "Atama Bekleyen", labelEn: "Awaiting Assignment" },
  { key: "field", labelTr: "Sahadakiler", labelEn: "In Field" },
  { key: "fraud", labelTr: "Şüpheli (Sahte?)", labelEn: "Suspicious (Fake?)" }
];

const statusTone = (status?: string) => {
  if ((status || "open") === "open") return "#ef4444";
  if (status === "assigned") return "#f59e0b";
  if (status === "in_progress") return "#fb7185";
  return "#22c55e";
};

const minuteAge = (r: Req) => {
  const t = toMillis((r as any).updatedAt || (r as any).createdAt);
  if (!t) return 0;
  return Math.max(1, Math.floor((Date.now() - t) / 60000));
};

// AI Triage skoru: aciliyet, bekleme süresi ve atanmamış durumu hesaba katar
const triageScore = (r: Req): number => {
  const u = `${(r as any).urgency || ""}`.toLowerCase();
  const urgencyPts = u.includes("acil") || u.includes("high") ? 100 : u.includes("orta") || u.includes("medium") ? 50 : 10;
  const ageMins = minuteAge(r);
  const agePts = Math.min(ageMins * 0.8, 60); // maks 60 puan yaşlanma için
  const unassignedBonus = (r.status || "open") === "open" ? 20 : 0;
  return urgencyPts + agePts + unassignedBonus;
};

const slaTone = (mins: number, status?: string, locale?: string) => {
  const L2 = (tr: string, en: string) => locale === "en" ? en : tr;
  if ((status || "open") === "closed") return { text: L2("SLA Tamam", "SLA OK"), color: "#22c55e" };
  if (mins >= 60) return { text: L2("SLA İhlali", "SLA Breach"), color: "#ef4444" };
  if (mins >= 25) return { text: L2("SLA Risk", "SLA Risk"), color: "#f59e0b" };
  return { text: L2("SLA İyi", "SLA Good"), color: "#22c55e" };
};

export const CoordinatorRequestsScreen = ({ route }: { route?: any }) => {
  const navigation = useNavigation<any>();
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const [requests, setRequests] = useState<Req[]>([]);
  const [volunteers, setVolunteers] = useState<Array<{ id: string; fullName?: string; name?: string; availability?: string }>>([]);
  const [apps, setApps] = useState<VolunteerAppLite[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [preset, setPreset] = useState<PresetKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const detailYRef = React.useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [listExpanded, setListExpanded] = useState(true);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [inlineDetailExpanded, setInlineDetailExpanded] = useState(false);
  const routeRequestId = route?.params?.requestId as string | undefined;

  const replacePhoto = async (source: "gallery" | "camera") => {
    if (!selected?.id) return;
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") { showToast(L("İzin verilmedi.", "Permission denied."), "error"); return; }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] as any, quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.7, allowsEditing: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    setPhotoUploading(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error("blob fetch failed"));
        xhr.responseType = "blob";
        xhr.open("GET", uri, true);
        xhr.send(null);
      });
      const sRef = storageRef(storage, `request-photos/${user?.uid || "coord"}/${Date.now()}.jpg`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      await (await import("firebase/firestore")).updateDoc(
        (await import("firebase/firestore")).doc((await import("../../firebase")).db, "requests", selected.id),
        { photoUrl: url }
      );
      setRequests((prev) => prev.map((r) => r.id === selected.id ? { ...r, photoUrl: url } as any : r));
      showToast(L("Fotoğraf güncellendi.", "Photo updated."), "success");
    } catch {
      showToast(L("Fotoğraf yüklenemedi.", "Photo could not be uploaded."), "error");
    } finally {
      setPhotoUploading(false);
    }
  };

  // COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const goBackSafe = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else { try { navigation.goBack(); } catch {} }
  };

  // COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const readWithFallback = async (primary: Promise<any>, fallback: Promise<any>) => {
        try {
          return await primary;
        } catch {
          return await fallback;
        }
      };
      const [reqSnap, volSnap, appSnap] = await Promise.all([
        readWithFallback(
          getDocs(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(220))),
          getDocs(query(collection(db, "requests"), limit(220)))
        ),
        readWithFallback(
          getDocs(query(collection(db, "users_public"), limit(320))),
          getDocs(collection(db, "users_public"))
        ),
        readWithFallback(
          getDocs(query(collection(db, "volunteerApplications"), where("status", "==", "pending"), limit(420))),
          getDocs(query(collection(db, "volunteerApplications"), limit(420)))
        )
      ]);
      setRequests(reqSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })));
      setVolunteers(
        volSnap.docs
          .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
          .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
      );
      setApps(appSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })));
      setSelectedId(null);
      setRefreshTick((v) => v + 1);
      showToast(L("Talepler yenilendi.", "Requests refreshed."), "success");
    } catch (err: any) {
      if (!String(err?.code || "").includes("permission-denied")) {
        showToast(L("Yenileme sırasında hata oluştu.", "An error occurred during refresh."), "error");
      }
    } finally {
      setRefreshing(false);
    }
  };

  // COORD-REQUESTS-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  useEffect(() => {
    if (!routeRequestId) return;
    setFilter("all");
    setPreset("all");
    setSelectedId(routeRequestId);
    setDetailExpanded(true);
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, detailYRef.current - 16),
        animated: true
      });
    }, 120);
  }, [routeRequestId]);

  // COORD-REQUESTS-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const qReq = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(220));
    const qVol = query(collection(db, "users_public"), limit(320));
    const qApps = query(collection(db, "volunteerApplications"), where("status", "==", "pending"), limit(420));

    const offReq = onSnapshot(
      qReq,
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err: any) => {
        setLoading(false);
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Talepler yüklenemedi.", "Requests could not be loaded."), "error");
        }
      }
    );

    const offVol = onSnapshot(
      qVol,
      (snap) => {
        setVolunteers(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        );
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Gönüllü listesi yüklenemedi.", "Volunteer list could not be loaded."), "error");
        }
      }
    );

    const offApps = onSnapshot(
      qApps,
      (snap) => {
        setApps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      () => {
        setApps([]);
      }
    );

    return () => {
      offReq();
      offVol();
      offApps();
    };
  }, [showToast, refreshTick]);

  const fraudMap = useMemo(() => {
    const map = new Map<string, FraudResult>();
    requests.forEach((r) => {
      map.set(r.id, scoreRequest(r as any, requests as any));
    });
    return map;
  }, [requests]);

  const rows = useMemo(() => {
    const filtered = requests.filter((r) => {
      const status = r.status || "open";
      if (filter !== "all" && status !== filter) return false;
      if (preset === "urgent") return isUrgent((r as any).urgency) && status !== "closed";
      if (preset === "sla_risk") return status !== "closed" && minuteAge(r) >= 25;
      if (preset === "unassigned") return status === "open";
      if (preset === "field") return status === "assigned" || status === "in_progress";
      if (preset === "fraud") {
        const f = fraudMap.get(r.id);
        return !!f && (f.level === "high" || f.level === "medium");
      }
      return true;
    });
    // AI Triage sıralaması: en yüksek skor üstte
    return [...filtered].sort((a, b) => triageScore(b) - triageScore(a));
  }, [requests, filter, preset, fraudMap]);

  const selected = useMemo(() => (selectedId ? rows.find((r) => r.id === selectedId) || null : null), [rows, selectedId]);
  const pendingByRequest = useMemo(() => {
    const map = new Map<string, number>();
    apps.forEach((a) => {
      if (a.status !== "pending" || !a.requestId) return;
      map.set(a.requestId, (map.get(a.requestId) || 0) + 1);
    });
    return map;
  }, [apps]);

  const kpis = useMemo(() => {
    const open = requests.filter((r) => (r.status || "open") === "open");
    const assigned = requests.filter((r) => r.status === "assigned");
    const inProgress = requests.filter((r) => r.status === "in_progress");
    const urgent = open.filter((r) => isUrgent((r as any).urgency));
    const slaBreached = open.filter((r) => minuteAge(r) >= 60);
    let suspicious = 0;
    fraudMap.forEach((f) => {
      if (f.level === "high" || f.level === "medium") suspicious += 1;
    });
    return {
      totalActive: open.length + assigned.length + inProgress.length,
      urgent: urgent.length,
      pendingAssign: open.length,
      slaBreached: slaBreached.length,
      suspicious
    };
  }, [requests, fraudMap]);

  // COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const assign = async (req: Req) => {
    if (!req?.id) return;
    if ((req.status || "open") !== "open") {
      Alert.alert(L("Bilgi", "Info"), L("Talep zaten işleme alınmış.", "This request is already being processed."));
      return;
    }
    try {
      const preferredApplicant =
        apps
          .filter((a) => a.requestId === req.id && a.status === "pending" && !!a.volunteerId)
          .sort((a, b) => toMillis((b as any)?.createdAt) - toMillis((a as any)?.createdAt))[0]
          ?.volunteerId ||
        ((req as any)?.lastApplicantId as string | undefined) ||
        volunteers.find((v) => v.availability !== "offline")?.id;

      if (!preferredApplicant) {
        showToast(L("Atanabilecek gönüllü bulunamadı.", "No available volunteer found to assign."), "error");
        return;
      }

      const result = await assignVolunteerViaApi(req.id, preferredApplicant);
      const chosen = volunteers.find((v) => v.id === result.assignedVolunteerId);
      try {
        const requestId = req.id;
        const volunteerId = result.assignedVolunteerId;
        const channelId = `ops_${requestId}_${volunteerId}`;
        const participants = Array.from(
          new Set(
            [
              volunteerId,
              (req as any).createdBy,
              (req as any).userId,
              user?.uid
            ].filter(Boolean)
          )
        );
        await setDoc(
          doc(db, "chats", channelId),
          {
            title: `Talep #${requestId.slice(0, 6)} Operasyon`,
            kind: "request_support",
            requestId,
            participantIds: participants,
            updatedAt: serverTimestamp(),
            lastMessageText: "Koordinatör tarafından atama yapıldı.",
            lastMessageAt: serverTimestamp()
          } as any,
          { merge: true }
        );
        await addDoc(collection(db, "chats", channelId, "messages"), {
          senderId: user?.uid || "coordinator",
          text: `Talep ${chosen?.fullName || chosen?.name || volunteerId} kullanıcısına atandı.`,
          system: true,
          createdAt: serverTimestamp()
        } as any);
      } catch {
      }
      try {
        await addDoc(collection(db, "audit_logs"), {
          actorId: user?.uid || null,
          actorRole: "coordinator",
          action: "Gönüllü göreve atandı",
          entityType: "request",
          entityId: req.id,
          note: `${chosen?.fullName || chosen?.name || "gönüllü"} atandı`,
          diff: { assignedVolunteerId: result.assignedVolunteerId, status: "assigned" },
          source: "coordinator_app",
          clientPlatform: "mobile",
          createdAt: serverTimestamp()
        } as any);
      } catch {
      }
      setRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? ({
                ...r,
                status: "assigned",
                assignedVolunteerId: result.assignedVolunteerId,
                updatedAt: new Date()
              } as any)
            : r
        )
      );
      showToast(L(`Talep ${chosen?.fullName || chosen?.name || result.assignedVolunteerId || "gönüllü"} kullanıcısına atandı.`, `Request assigned to ${chosen?.fullName || chosen?.name || result.assignedVolunteerId || "volunteer"}.`), "success");
    } catch (e: any) {
      showToast(e?.message || L("Atama işlemi başarısız.", "Assignment operation failed."), "error");
    }
  };

  // COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const forward = async (req: Req) => {
    if (!req?.id) return;
    try {
      if ((req.status || "open") === "assigned") {
        await transitionRequestStatusViaApi(req.id, "START_ROUTE");
        try {
          await addDoc(collection(db, "audit_logs"), {
            actorId: user?.uid || null,
            actorRole: "coordinator",
            action: "Talep durumu güncellendi",
            entityType: "request",
            entityId: req.id,
            note: "Durum in_progress olarak güncellendi",
            diff: { status: "in_progress" },
            source: "coordinator_app",
            clientPlatform: "mobile",
            createdAt: serverTimestamp()
          } as any);
        } catch {}
        showToast(L("Talep durumu 'Yardım Yolda' olarak güncellendi.", "Request status updated to 'Help on the way'."), "success");
      } else if (req.status === "in_progress") {
        await transitionRequestStatusViaApi(req.id, "COMPLETE");
        try {
          await addDoc(collection(db, "audit_logs"), {
            actorId: user?.uid || null,
            actorRole: "coordinator",
            action: "Talep durumu güncellendi",
            entityType: "request",
            entityId: req.id,
            note: "Durum closed olarak güncellendi",
            diff: { status: "closed" },
            source: "coordinator_app",
            clientPlatform: "mobile",
            createdAt: serverTimestamp()
          } as any);
        } catch {}
        showToast(L("Talep tamamlandı.", "Request completed."), "success");
      }
    } catch {
      showToast(L("Durum güncellenemedi.", "Status could not be updated."), "error");
    }
  };

  // COORD-REQUESTS-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const reopen = async (req: Req) => {
    if (!req?.id) return;
    try {
      await transitionRequestStatusViaApi(req.id, "REOPEN");
      try {
        await addDoc(collection(db, "audit_logs"), {
          actorId: user?.uid || null,
          actorRole: "coordinator",
          action: "Talep yeniden açıldı",
          entityType: "request",
          entityId: req.id,
          note: "Durum open olarak güncellendi",
          diff: { status: "open" },
          source: "coordinator_app",
          clientPlatform: "mobile",
          createdAt: serverTimestamp()
        } as any);
      } catch {}
      showToast(L("Talep tekrar açıldı.", "Request reopened."), "success");
    } catch {
      showToast(L("Talep tekrar açılamadı.", "Request could not be reopened."), "error");
    }
  };

  const primaryActionLabel = (status?: string) => {
    if ((status || "open") === "open") return L("GÖNÜLLÜ ATA", "ASSIGN VOLUNTEER");
    if (status === "assigned") return L("YOLA ÇIKTI", "EN ROUTE");
    if (status === "in_progress") return L("TAMAMLA", "COMPLETE");
    return L("TEKRAR AÇ", "REOPEN");
  };

  const primaryAction = (req: Req) => {
    const status = req.status || "open";
    if (status === "open") return assign(req);
    if (status === "assigned" || status === "in_progress") return forward(req);
    return reopen(req);
  };

  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#000000" : "#12060a";
  const heroColors = lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"];

  return (
    <View style={[styles.page, { backgroundColor: shellBg }]}>
      <LinearGradient colors={heroColors as any} style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <TouchableOpacity style={[styles.heroIcon, { marginRight: 8 }]} onPress={goBackSafe}>
              <Ionicons name="arrow-back" size={18} color="#fff1f2" />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>{L("Talepler Yönetimi", "Request Management")}</Text>
          </View>
          <TouchableOpacity
            style={styles.heroIcon}
            onPress={refreshNow}
            disabled={refreshing}
          >
            <Ionicons name={refreshing ? "sync" : "refresh"} size={18} color="#fff1f2" />
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSub}>{L("SLA, atama ve durum akışlarını tek ekranda yönetin", "Manage SLA, assignment and status flows on one screen")}</Text>
        <View style={styles.kpiGrid}>
          <Kpi label={L("Aktif", "Active")} value={String(kpis.totalActive)} color="#fecaca" icon="pulse" />
          <Kpi label={L("Acil", "Urgent")} value={String(kpis.urgent)} color="#ef4444" icon="alert-circle" />
          <Kpi label={L("Bekleyen Atama", "Pending")} value={String(kpis.pendingAssign)} color="#f59e0b" icon="hourglass" />
          <Kpi label={L("SLA İhlali", "SLA Breach")} value={String(kpis.slaBreached)} color="#ef4444" icon="warning" />
          <Kpi label={L("Şüpheli", "Suspicious")} value={String(kpis.suspicious)} color="#f59e0b" icon="shield-half" />
        </View>
      </LinearGradient>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { backgroundColor: shellBg }]}>
        {/* Filtreler — açılır/kapanır */}
        <View style={styles.card}>
          <TouchableOpacity onPress={() => setFiltersExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="funnel" size={15} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{L("Filtreler", "Filters")}</Text>
                <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>
                  {FILTERS.find((f) => f.key === filter)?.labelTr || "Tümü"} • {PRESETS.find((p) => p.key === preset)?.labelTr || "Hepsi"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => navigation.navigate("Map")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.08)", paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={styles.sectionLink}>{L("HARİTA", "MAP")}</Text>
              </TouchableOpacity>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={filtersExpanded ? "chevron-up" : "chevron-down"} size={15} color={lightMode ? "#64748b" : "#fda4af"} />
              </View>
            </View>
          </TouchableOpacity>
          {filtersExpanded ? (
            <View style={{ marginTop: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 2 }}>
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{L(f.labelTr, f.labelEn)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 2, marginTop: 8 }}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.presetChip, preset === p.key && styles.presetChipActive]}
                    onPress={() => setPreset(p.key)}
                  >
                    <Text style={[styles.presetChipText, preset === p.key && styles.presetChipTextActive]}>{L(p.labelTr, p.labelEn)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.split}>
          <View style={styles.card}>
            <TouchableOpacity onPress={() => setListExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: listExpanded ? 8 : 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.14)", borderWidth: 1, borderColor: "rgba(96,165,250,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="list" size={15} color="#60a5fa" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{L("Talep Listesi", "Request List")}</Text>
                  <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>
                    {rows.length} {L("kayıt", "records")}
                  </Text>
                </View>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={listExpanded ? "chevron-up" : "chevron-down"} size={15} color={lightMode ? "#64748b" : "#fda4af"} />
              </View>
            </TouchableOpacity>
            {listExpanded ? (loading ? (
              [1, 2, 3, 4].map((i) => <View key={i} style={[styles.reqCard, { opacity: 0.45, height: 92 }]} />)
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const meta = requestTypeMeta(item.type);
                  const status = item.status || "open";
                  const mins = minuteAge(item);
                  const sla = slaTone(mins, status, locale);
                  const selectedRow = selected?.id === item.id;
                  const pendingApplicants = pendingByRequest.get(item.id) || 0;
                  const fraud = fraudMap.get(item.id);
                  const showFraudBadge = fraud && fraud.level !== "clean";
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedId(item.id);
                        setDetailExpanded(true);
                        showToast(L("Talep detayı açıldı.", "Request detail opened."), "info");
                        setTimeout(() => {
                          scrollRef.current?.scrollTo({
                            y: Math.max(0, detailYRef.current - 16),
                            animated: true
                          });
                        }, 120);
                      }}
                      style={[styles.reqCard, selectedRow && styles.reqCardActive]}
                    >
                      <View style={styles.reqTop}>
                        <View style={[styles.reqIcon, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reqTitle} numberOfLines={1}>{item.type || L("Yardım Talebi", "Aid Request")}</Text>
                          <Text style={styles.reqSub} numberOfLines={1}>{item.description || L("Açıklama girilmedi.", "No description entered.")}</Text>
                        </View>
                      </View>
                      <View style={styles.reqMetaRow}>
                        <View style={[styles.statusPill, { borderColor: `${statusTone(status)}33`, backgroundColor: `${statusTone(status)}18` }]}>
                          <Text style={[styles.statusPillText, { color: statusTone(status) }]}>{statusLabel[status as keyof typeof statusLabel] || status}</Text>
                        </View>
                        <View style={[styles.statusPill, { borderColor: "rgba(251,113,133,0.30)", backgroundColor: "rgba(251,113,133,0.15)" }]}>
                          <Text style={[styles.statusPillText, { color: "#fecdd3" }]}>{L("Başvuru", "Applications")}: {pendingApplicants}</Text>
                        </View>
                        <View style={[styles.statusPill, { borderColor: `${sla.color}30`, backgroundColor: `${sla.color}15` }]}>
                          <Text style={[styles.statusPillText, { color: sla.color }]}>{sla.text}</Text>
                        </View>
                        {showFraudBadge && fraud ? (
                          <View style={[styles.statusPill, { borderColor: `${fraudLevelColor(fraud.level)}40`, backgroundColor: `${fraudLevelColor(fraud.level)}18` }]}>
                            <Text style={[styles.statusPillText, { color: fraudLevelColor(fraud.level) }]}>⚠ {fraudLevelLabel(fraud.level, locale)}</Text>
                          </View>
                        ) : null}
                        <Text style={styles.reqAge}>{mins} dk</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyText}>{L("Bu filtrede talep bulunamadı.", "No requests found for this filter.")}</Text>}
              />
            )) : null}
          </View>

          <View
            style={styles.card}
            onLayout={(e) => {
              detailYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <TouchableOpacity onPress={() => setInlineDetailExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(34,197,94,0.14)", borderWidth: 1, borderColor: "rgba(74,222,128,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={inlineDetailExpanded ? "remove" : "add"} size={18} color="#22c55e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{L("Talep Detayı", "Request Detail")}</Text>
                  <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                    {selected ? `${selected.type || L("Yardım Talebi", "Aid Request")} • ${statusLabel[(selected.status || "open") as any] || (selected.status || "open")}` : L("Bir talep seçin", "Select a request")}
                  </Text>
                </View>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={inlineDetailExpanded ? "chevron-up" : "chevron-down"} size={15} color={lightMode ? "#64748b" : "#fda4af"} />
              </View>
            </TouchableOpacity>
            {inlineDetailExpanded ? (
              !selected ? (
                <Text style={[styles.emptyText, { marginTop: 8 }]}>{L("Detay görmek için listeden bir talep seçin.", "Select a request from the list to see details.")}</Text>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.detailText} numberOfLines={2}>{L("Açıklama", "Description")}: {selected.description || L("Açıklama girilmedi.", "No description entered.")}</Text>
                  <Text style={styles.detailText}>{L("Oluşturan", "Created by")}: {(selected as any).fullName || (selected as any).name || (selected as any).userId || "-"}</Text>
                  <Text style={styles.detailText}>{L("Bekleyen Başvuru", "Pending Applications")}: {pendingByRequest.get(selected.id) || 0}</Text>
                  <View style={styles.slaBarWrap}>
                    <View style={styles.slaBarBg}>
                      <View style={[styles.slaBarFill, { width: `${Math.min(100, (minuteAge(selected) / 60) * 100)}%`, backgroundColor: slaTone(minuteAge(selected), selected.status, locale).color }]} />
                    </View>
                    <Text style={styles.slaText}>{L("SLA Süresi", "SLA Time")}: {minuteAge(selected)} {L("dk", "min")}</Text>
                  </View>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setDetailExpanded(true)}>
                    <LinearGradient colors={["#b1121d", "#e11d48"]} style={styles.primaryBtnInner}>
                      <Text style={styles.primaryBtnText}>{L("TAM DETAY", "FULL DETAIL")}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )
            ) : null}
          </View>

          <Modal visible={!!selected && detailExpanded} transparent animationType="slide" onRequestClose={() => { setDetailExpanded(false); setInlineDetailExpanded(true); }}>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={() => { setDetailExpanded(false); setInlineDetailExpanded(true); }} />
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%", borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: lightMode ? "#ffffff" : amoledMode ? "#000000" : "#1a0810", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingTop: 8 }}>
              <View style={{ alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: lightMode ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.25)", marginBottom: 6 }} />
              {selected ? (
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 8, gap: 9 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(34,197,94,0.14)", borderWidth: 1, borderColor: "rgba(74,222,128,0.2)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text" size={15} color="#22c55e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{L("Talep Detayı", "Request Detail")}</Text>
                    <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                      {selected.type || L("Yardım Talebi", "Aid Request")} • {statusLabel[(selected.status || "open") as any] || (selected.status || "open")}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setDetailExpanded(false); setInlineDetailExpanded(true); }} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={16} color={lightMode ? "#64748b" : "#fda4af"} />
                  </TouchableOpacity>
                </View>
              ) : null}
              <ScrollView style={{ paddingHorizontal: 14 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
                {selected ? (
              <>
                {(() => {
                  const timelineRows = buildTimelineRows(selected, locale);
                  return (
                    <>
                <View style={styles.detailTypeRow}>
                  <Text style={styles.detailTitle}>{selected.type || L("Yardım Talebi", "Aid Request")}</Text>
                  <View style={[styles.urgencyBadge, isUrgent((selected as any).urgency) ? styles.urgencyDanger : styles.urgencyNormal]}>
                    <Text style={styles.urgencyBadgeText}>{urgencyLabel((selected as any).urgency)}</Text>
                  </View>
                </View>
                <Text style={styles.detailText}>{L("Durum", "Status")}: {statusLabel[(selected.status || "open") as any] || (selected.status || "open")}</Text>
                <Text style={styles.detailText}>{L("Oluşturan", "Created by")}: {(selected as any).fullName || (selected as any).name || (selected as any).userId || "-"}</Text>
                <Text style={styles.detailText} numberOfLines={5}>{L("Açıklama", "Description")}: {selected.description || L("Açıklama girilmedi.", "No description entered.")}</Text>
                {!!(selected as any).assignedVolunteerId && (
                  <Text style={styles.detailText}>{L("Atanan Gönüllü", "Assigned Volunteer")}: {(selected as any).assignedVolunteerId}</Text>
                )}
                <Text style={styles.detailText}>{L("Bekleyen Başvuru", "Pending Applications")}: {pendingByRequest.get(selected.id) || 0}</Text>
                {(() => {
                  const f = fraudMap.get(selected.id);
                  if (!f || f.level === "clean") return null;
                  const c = fraudLevelColor(f.level);
                  return (
                    <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: `${c}40`, backgroundColor: `${c}12`, padding: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Ionicons name="alert-circle" size={14} color={c} />
                        <Text style={{ color: c, fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Sahte Talep Tespiti", "Fake Request Detection")}: {fraudLevelLabel(f.level, locale)} ({f.score}/100)</Text>
                      </View>
                      {f.reasons.map((r, i) => (
                        <Text key={i} style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, lineHeight: 16 }}>
                          • {locale === "en" ? r.labelEn : r.labelTr} ({r.weight}p)
                        </Text>
                      ))}
                      <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 6, fontStyle: "italic" }}>
                        {L("Bu skor kural tabanlıdır, yöneticinin doğrulaması gerekir.", "Rule-based score; coordinator verification required.")}
                      </Text>
                    </View>
                  );
                })()}
                {(selected as any)?.photoUrl ? (
                  <View style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                    <Image source={{ uri: (selected as any).photoUrl }} style={{ width: "100%", height: 160 }} resizeMode="cover" />
                    <View style={{ flexDirection: "row", padding: 8, gap: 8, backgroundColor: "rgba(255,255,255,0.04)" }}>
                      <TouchableOpacity onPress={() => replacePhoto("camera")} disabled={photoUploading} style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                        <Ionicons name="camera-outline" size={14} color="#fecdd3" />
                        <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{photoUploading ? L("Yükleniyor...", "Uploading...") : L("Kamera", "Camera")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => replacePhoto("gallery")} disabled={photoUploading} style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                        <Ionicons name="image-outline" size={14} color="#fecdd3" />
                        <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Galeri", "Gallery")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={() => replacePhoto("camera")} disabled={photoUploading} style={{ flex: 1, height: 36, borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                      <Ionicons name="camera-outline" size={14} color="#fecdd3" />
                      <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{photoUploading ? L("Yükleniyor...", "Uploading...") : L("Fotoğraf Ekle", "Add Photo")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => replacePhoto("gallery")} disabled={photoUploading} style={{ flex: 1, height: 36, borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                      <Ionicons name="image-outline" size={14} color="#fecdd3" />
                      <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Galeriden Ekle", "Add from Gallery")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.slaBarWrap}>
                  <View style={styles.slaBarBg}>
                    <View
                      style={[
                        styles.slaBarFill,
                        {
                          width: `${Math.min(100, (minuteAge(selected) / 60) * 100)}%`,
                          backgroundColor: slaTone(minuteAge(selected), selected.status, locale).color
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.slaText}>{L("SLA Süresi", "SLA Time")}: {minuteAge(selected)} {L("dk", "min")}</Text>
                </View>
                <View style={styles.timelineWrap}>
                  <Text style={styles.timelineTitle}>{L("Operasyon Akışı", "Operation Flow")}</Text>
                  {timelineRows.map((row, idx) => (
                    <View key={`${row.key}-${idx}`} style={styles.timelineRow}>
                      <View style={styles.timelineLeft}>
                        <View style={[styles.timelineDot, row.done && styles.timelineDotDone, row.active && styles.timelineDotActive]}>
                          {row.done || row.active ? <Ionicons name="checkmark" size={10} color="white" /> : null}
                        </View>
                        {idx !== timelineRows.length - 1 ? (
                          <View style={[styles.timelineLine, row.done && styles.timelineLineDone]} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.timelineText, row.active && styles.timelineTextActive]}>{row.label}</Text>
                        <Text style={styles.timelineSub}>{row.timeText}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => primaryAction(selected)}>
                  <LinearGradient colors={["#b1121d", "#e11d48"]} style={styles.primaryBtnInner}>
                    <Text style={styles.primaryBtnText}>{primaryActionLabel(selected.status)}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate("CoordinatorAssignments")}>
                  <Text style={styles.secondaryBtnText}>{L("Akıllı Atama Önerileri", "Smart Assignment Suggestions")}</Text>
                </TouchableOpacity>
                    </>
                  );
                })()}
                </>
                ) : null}
              </ScrollView>
            </View>
          </Modal>
        </View>
      </ScrollView>
    </View>
  );
};

const Kpi = ({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: any }) => {
  const accent = color || "#fecaca";
  return (
    <View style={styles.kpiCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
        {icon ? (
          <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: `${accent}30`, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={11} color={accent} />
          </View>
        ) : null}
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0b0910" },
  hero: { paddingTop: 54, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 28 },
  heroSub: { color: "#fda4af", fontFamily: "Inter", fontSize: 12, marginTop: 6 },
  heroIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" },
  kpiGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { width: "48%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 10 },
  kpiLabel: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  kpiValue: { color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginTop: 4 },
  body: { padding: 14, paddingBottom: 96 },
  card: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 },
  sectionLink: { color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 },
  subtleCount: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  filterChipActive: { borderColor: "rgba(239,68,68,0.25)", backgroundColor: "rgba(239,68,68,0.12)" },
  filterChipText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  filterChipTextActive: { color: "#fecaca" },
  presetChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginRight: 8
  },
  presetChipActive: { borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(127,29,29,0.2)" },
  presetChipText: { color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 },
  presetChipTextActive: { color: "#fff1f2" },
  split: { flexDirection: "column", gap: 10 },
  reqCard: { borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 },
  reqCardActive: { borderColor: "rgba(248,113,113,0.25)", backgroundColor: "rgba(127,29,29,0.14)" },
  reqTop: { flexDirection: "row", alignItems: "center" },
  reqIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 8 },
  reqTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 },
  reqSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 },
  reqMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  statusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontFamily: "Inter-Bold", fontSize: 10 },
  reqAge: { color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 10, marginLeft: "auto" },
  emptyText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, textAlign: "center", paddingVertical: 8 },
  detailTypeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 16, flex: 1, marginRight: 8 },
  urgencyBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  urgencyDanger: { backgroundColor: "rgba(239,68,68,0.16)", borderColor: "rgba(248,113,113,0.2)" },
  urgencyNormal: { backgroundColor: "rgba(34,197,94,0.14)", borderColor: "rgba(74,222,128,0.2)" },
  urgencyBadgeText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 },
  detailText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, lineHeight: 17, marginTop: 8 },
  slaBarWrap: { marginTop: 10 },
  slaBarBg: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  slaBarFill: { height: "100%", borderRadius: 999 },
  slaText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 6 },
  primaryBtn: { borderRadius: 14, overflow: "hidden", marginTop: 12 },
  primaryBtnInner: { height: 44, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "white", fontFamily: "Inter-Bold", fontSize: 13 },
  secondaryBtn: { height: 40, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryBtnText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 },
  timelineWrap: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10
  },
  timelineTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, marginBottom: 8 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  timelineLeft: { width: 18, alignItems: "center", marginRight: 8 },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  timelineDotDone: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  timelineDotActive: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
  timelineLine: { width: 2, flex: 1, minHeight: 16, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 2 },
  timelineLineDone: { backgroundColor: "#22c55e" },
  timelineText: { color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 },
  timelineTextActive: { color: "#fff1f2" },
  timelineSub: { color: "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 1 }
});

type TimelineRow = { key: string; label: string; done: boolean; active: boolean; timeText: string };

const buildTimelineRows = (req: Req, locale?: string): TimelineRow[] => {
  const L2 = (tr: string, en: string) => locale === "en" ? en : tr;
  const statusOrder = ["open", "assigned", "in_progress", "closed"];
  const activeStatus = req.status || "open";
  const activeIdx = statusOrder.indexOf(activeStatus);
  const labels: Record<string, string> = {
    open: L2("Talep Alındı", "Request Received"),
    assigned: L2("Gönüllü Atandı", "Volunteer Assigned"),
    in_progress: L2("Ekip Sahaya Ulaştı", "Team Reached Site"),
    closed: L2("Talep Tamamlandı", "Request Completed")
  };
  const tl = Array.isArray((req as any).timeline) ? (req as any).timeline : [];
  const firstAt = toMillis((req as any).createdAt);
  return statusOrder.map((k, idx) => {
    const found = tl.find((x: any) => (x?.step || "").toString().toLowerCase().includes(k.replace("_", "")));
    const t = toMillis(found?.at) || (idx === 0 ? firstAt : 0);
    return {
      key: k,
      label: labels[k] || k,
      done: idx < activeIdx || activeStatus === "closed",
      active: idx === activeIdx,
      timeText: t ? `${L2("Güncelleme", "Updated")}: ${Math.max(1, Math.floor((Date.now() - t) / 60000))} ${L2("dk önce", "min ago")}` : L2("Zaman bilgisi yok", "No time info")
    };
  });
};
