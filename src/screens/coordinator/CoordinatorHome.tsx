import {
  React,
  useEffect,
  useMemo,
  useState,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  MapView,
  Marker,
  useNavigation,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  db,
  useStore,
  statusLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * COORD-HOME DOSYA HARITASI
 * - COORD-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - COORD-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - COORD-HOME-ACTIONS: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - COORD-HOME-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type VolunteerLite = {
  id: string;
  fullName?: string;
  name?: string;
  volunteerStatus?: string;
  availability?: string;
  city?: string;
};

type AppLite = { id: string; status?: string; volunteerId?: string; requestId?: string; createdAt?: any };
type DonationLite = { id: string; amount?: number; createdAt?: any };
type InventoryLite = { id: string; quantity?: number; criticalLevel?: number };
type AuditLite = { id: string; action?: string; note?: string; actorRole?: string; entityType?: string; entityId?: string; createdAt?: any };

type FeedItem = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  tone: keyof typeof iconColorMap;
  at: number;
};

const iconColorMap = {
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6"
} as const;

const toMs = (v: any) => (typeof v?.toMillis === "function" ? v.toMillis() : typeof v?.seconds === "number" ? v.seconds * 1000 : 0);
const isPermissionDenied = (err: any) =>
  String(err?.code || "").includes("permission-denied") ||
  String(err?.message || "").toLowerCase().includes("permission");

const statusTone = (status?: string) => {
  if (status === "open") return "danger";
  if (status === "assigned") return "warning";
  if (status === "in_progress") return "info";
  return "success";
};

export const CoordinatorHome = () => {
  const navigation = useNavigation<any>();
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const [requests, setRequests] = useState<Req[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerLite[]>([]);
  const [applications, setApplications] = useState<AppLite[]>([]);
  const [donations, setDonations] = useState<DonationLite[]>([]);
  const [inventories, setInventories] = useState<InventoryLite[]>([]);
  const [audits, setAudits] = useState<AuditLite[]>([]);
  const [crisisMode, setCrisisMode] = useState(false);
  const [healthFlags, setHealthFlags] = useState({
    firestore: true,
    audit: true,
    donations: true,
    inventory: true
  });
  const [loading, setLoading] = useState(true);
  // Açılır/kapanır bölüm state'leri
  const [quickExpanded, setQuickExpanded] = useState(true);
  const [warningsExpanded, setWarningsExpanded] = useState(true);
  const [chartsExpanded, setChartsExpanded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);

  // COORD-HOME-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const qReq = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(180));
    const qVol = query(collection(db, "users_public"), limit(320));
    const qApps = query(collection(db, "volunteerApplications"), orderBy("createdAt", "desc"), limit(180));
    const qDon = query(collection(db, "donations"), orderBy("createdAt", "desc"), limit(220));
    const qInv = query(collection(db, "inventories"), orderBy("updatedAt", "desc"), limit(220));
    const qAudit = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(80));
    const settingsRef = doc(db, "system_settings", "coordinator_app");

    const offReq = onSnapshot(
      qReq,
      (snap) => {
        setHealthFlags((h) => ({ ...h, firestore: true }));
        setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err: any) => {
        setHealthFlags((h) => ({ ...h, firestore: false }));
        setLoading(false);
        if (!isPermissionDenied(err)) {
          showToast(L("Talepler yüklenemedi.", "Requests could not be loaded."), "error");
        }
      }
    );
    const offVol = onSnapshot(
      qVol,
      (snap) =>
        setVolunteers(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        ),
      (err: any) => {
        if (!isPermissionDenied(err)) {
          showToast(L("Gönüllü verileri yüklenemedi.", "Volunteer data could not be loaded."), "error");
        }
      }
    );
    const offApps = onSnapshot(
      qApps,
      (snap) => setApplications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) {
          console.warn("[coordinator dashboard apps] snapshot:", err);
        }
        setApplications([]);
        if (!isPermissionDenied(err)) {
          showToast(L("Başvuru verileri yüklenemedi.", "Application data could not be loaded."), "error");
        }
      }
    );
    const offDon = onSnapshot(
      qDon,
      (snap) => {
        setHealthFlags((h) => ({ ...h, donations: true }));
        setDonations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        setHealthFlags((h) => ({ ...h, donations: false }));
        if (!isPermissionDenied(err)) showToast(L("Bağış verileri yüklenemedi.", "Donation data could not be loaded."), "error");
      }
    );
    const offInv = onSnapshot(
      qInv,
      (snap) => {
        setHealthFlags((h) => ({ ...h, inventory: true }));
        setInventories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        setHealthFlags((h) => ({ ...h, inventory: false }));
        if (!isPermissionDenied(err)) showToast(L("Stok verileri yüklenemedi.", "Inventory data could not be loaded."), "error");
      }
    );
    const offAudit = onSnapshot(
      qAudit,
      (snap) => {
        setHealthFlags((h) => ({ ...h, audit: true }));
        setAudits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        setHealthFlags((h) => ({ ...h, audit: false }));
        if (!isPermissionDenied(err)) {
          showToast(L("Audit log erişimi yok; panel fallback akış kullanıyor.", "Audit log access denied; panel using fallback flow."), "info");
        }
      }
    );
    const offSettings = onSnapshot(
      settingsRef,
      (snap) => {
        const v = (snap.data() as any)?.crisisMode;
        if (typeof v === "boolean") setCrisisMode(v);
      },
      () => {
        // no-op
      }
    );

    return () => {
      offReq();
      offVol();
      offApps();
      offDon();
      offInv();
      offAudit();
      offSettings();
    };
  }, [showToast]);

  // COORD-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const now = Date.now();
  const open = requests.filter((r) => (r.status || "open") === "open");
  const assigned = requests.filter((r) => r.status === "assigned");
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const urgentOpen = open.filter((r) => {
    const u = `${r.urgency || ""}`.toLowerCase();
    return u.includes("acil") || u.includes("yüksek") || u.includes("yuksek");
  });
  const activeVolunteers = volunteers.filter((v) => (v.volunteerStatus || "approved") === "approved" && v.availability !== "offline");
  const pendingVolunteers = volunteers.filter((v) => v.volunteerStatus === "submitted");
  const busyVolunteers = volunteers.filter((v) => v.availability === "busy");
  const pendingApps = applications.filter((a) => (a.status || "pending") === "pending");

  const criticalInventory = inventories.filter((x) => Number(x.quantity || 0) <= Number(x.criticalLevel || 0)).length;
  const systemHealth = [
    { name: "Firestore", ok: healthFlags.firestore, info: healthFlags.firestore ? L("Aktif", "Active") : L("Erişim sorunu", "Access issue") },
    { name: "Audit Log", ok: healthFlags.audit, info: healthFlags.audit ? L("Canlı", "Live") : L("Rules kısıtlı", "Rules restricted") },
    { name: L("Bağış Modülü", "Donation Module"), ok: healthFlags.donations, info: healthFlags.donations ? L("Canlı", "Live") : L("Veri yok/izin", "No data/permission") },
    { name: L("Stok Modülü", "Inventory Module"), ok: healthFlags.inventory, info: healthFlags.inventory ? `${criticalInventory} ${L("kritik ürün", "critical items")}` : L("Veri yok/izin", "No data/permission") },
    { name: "Push", ok: false, info: L("Expo Go sınırlı", "Expo Go limited") }
  ];

  const severityLevel = crisisMode || urgentOpen.length >= 8
    ? L("Kritik", "Critical")
    : urgentOpen.length >= 3 || pendingVolunteers.length >= 5
      ? L("Yoğun", "Busy")
      : L("Normal", "Normal");
  const severityColor = severityLevel === "Kritik" ? "#ef4444" : severityLevel === "Yoğun" ? "#f59e0b" : "#22c55e";

  // COORD-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const feed = useMemo<FeedItem[]>(() => {
    const auditFeed = audits.slice(0, 12).map((a) => {
      const action = `${a.action || ""}`.toLocaleLowerCase("tr");
      const tone: keyof typeof iconColorMap =
        action.includes("ata") ? "success" :
        action.includes("rol") ? "warning" :
        action.includes("durum") ? "danger" : "info";
      return {
        id: `audit-${a.id}`,
        icon: tone === "success" ? "person-add-outline" : tone === "warning" ? "shield-checkmark-outline" : tone === "danger" ? "flag-outline" : "document-text-outline",
        title: a.action || L("Sistem hareketi", "System event"),
        subtitle: a.note || `${a.entityType || "-"} ${a.entityId || ""}`,
        tone,
        at: toMs(a.createdAt) || now - 1000 * 60 * 5
      };
    });
    const reqFeed = requests.slice(0, 10).map((r) => ({
      id: `req-${r.id}`,
      icon: "document-text-outline" as const,
      title: `${r.type || L("Talep", "Request")} • ${statusLabel[r.status || "open"] || (r.status || "open")}`,
      subtitle: r.description || L("Talep kaydı güncellendi", "Request record updated"),
      tone: statusTone(r.status) as keyof typeof iconColorMap,
      at: toMs(r.updatedAt || r.createdAt)
    }));
    const pendingFeed = pendingVolunteers.slice(0, 8).map((v) => ({
      id: `vol-${v.id}`,
      icon: "person-add-outline" as const,
      title: L("Gönüllü başvurusu onay bekliyor", "Volunteer application awaiting approval"),
      subtitle: `${v.fullName || v.name || L("Gönüllü", "Volunteer")} • ${v.city || L("Bölge yok", "No region")}`,
      tone: "warning" as const,
      at: now - 1000 * 60 * (Math.floor(Math.random() * 90) + 5)
    }));
    const appFeed = pendingApps.slice(0, 8).map((a) => ({
      id: `app-${a.id}`,
      icon: "git-network-outline" as const,
      title: L("Yeni görev başvurusu", "New mission application"),
      subtitle: `${L("Talep", "Request")} ${a.requestId || "-"} ${L("için lider onayı bekleniyor", "awaiting leader approval")}`,
      tone: "info" as const,
      at: toMs(a.createdAt) || now - 1000 * 60 * 30
    }));
    return [...auditFeed, ...reqFeed, ...pendingFeed, ...appFeed].sort((a, b) => b.at - a.at).slice(0, 12);
  }, [audits, requests, pendingVolunteers, pendingApps, now]);

  const criticalWarnings = [
    urgentOpen.length > 0 ? `${urgentOpen.length} ${L("acil talep bekliyor", "urgent requests waiting")}` : null,
    pendingVolunteers.length > 0 ? `${pendingVolunteers.length} ${L("gönüllü başvurusu onay bekliyor", "volunteer applications awaiting approval")}` : null,
    pendingApps.length > 0 ? `${pendingApps.length} ${L("görev başvurusu lider onayı bekliyor", "mission applications awaiting leader approval")}` : null,
    busyVolunteers.length > activeVolunteers.length * 0.7 && activeVolunteers.length > 4 ? L("Gönüllülerin çoğu görevde, yük dengesi kontrol edilmeli", "Most volunteers are on duty, load balance should be checked") : null
  ].filter(Boolean) as string[];

  // COORD-HOME-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const buildDailyTrend = (values: number[]) => {
    const out = Array.from({ length: 7 }).map(() => 0);
    values.forEach((ms) => {
      const d = Math.floor((now - ms) / (1000 * 60 * 60 * 24));
      if (d >= 0 && d < 7) out[6 - d] += 1;
    });
    return out;
  };

  const requestTrend = buildDailyTrend(
    requests.map((r) => toMs((r as any).createdAt)).filter((x) => x > 0)
  );
  const donationTrend = buildDailyTrend(
    donations.map((d) => toMs(d.createdAt)).filter((x) => x > 0)
  );
  const densityTrend = (() => {
    const cityMap: Record<string, number> = {};
    requests.forEach((r) => {
      const city = `${(r as any).city || (r as any).locationLabel || "Diğer"}`;
      cityMap[city] = (cityMap[city] || 0) + 1;
    });
    const top = Object.values(cityMap).sort((a, b) => b - a).slice(0, 7);
    if (!top.length) return [0, 0, 0, 0, 0, 0, 0];
    while (top.length < 7) top.push(0);
    return top;
  })();
  const maxLine = Math.max(...requestTrend, ...donationTrend, ...densityTrend, 1);

  // COORD-HOME-ACTIONS: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const quickModules = [
    { key: "map", title: L("Operasyon Haritası", "Operation Map"), sub: L("Canlı yoğunluk ve odak görünümü", "Live density and focus view"), icon: "map-outline", route: "Map" },
    { key: "vol", title: L("Gönüllü Yönetimi", "Volunteer Management"), sub: L("Onay bekleyenleri incele", "Review pending approvals"), icon: "people-outline", route: "CoordinatorVolunteers" },
    { key: "req", title: L("Talepler Yönetimi", "Request Management"), sub: L("SLA ve atama işlemleri", "SLA and assignment operations"), icon: "clipboard-outline", route: "Manage" },
    { key: "msg", title: L("Mesajlar", "Messages"), sub: L("Gönüllü ve saha mesajlaşması", "Volunteer and field messaging"), icon: "chatbubbles-outline", route: "Messages" },
    { key: "ann", title: L("Duyuru Merkezi", "Announcement Center"), sub: L("Toplu bildirim gönder", "Send bulk notifications"), icon: "megaphone-outline", route: "CoordinatorAnnouncements" },
    { key: "center", title: L("Merkez Modüller", "Center Modules"), sub: L("Rapor, log, ayarlar", "Reports, logs, settings"), icon: "grid-outline", route: "CoordinatorCenter" },
    { key: "voicesos", title: L("Sesli SOS Kayıtları", "Voice SOS Records"), sub: L("Afetzede ses mesajlarını dinle", "Listen to victim voice SOS messages"), icon: "mic-outline", route: "VoiceSOS" }
  ];

  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#050507" : "#12060a";
  const heroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#10070a", "#090608"] : ["#430914", "#23070f", "#12060a"];
  const panelBg = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)";
  const panelBorder = lightMode ? "rgba(15,23,42,0.08)" : amoledMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.07)";
  const cardBg = lightMode ? "#f1f5f9" : amoledMode ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.03)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textMuted = lightMode ? "#64748b" : "#fda4af";
  const sectionTitleStyle = { color: textPrimary, fontFamily: "Inter-Bold" as const, fontSize: 14 };
  const sectionLinkStyle = { color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold" as const, fontSize: 11 };

  // COORD-HOME-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
  return (
    <View style={[d.page, { backgroundColor: shellBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={d.pageScroll}>
        <LinearGradient colors={heroColors as any} style={d.hero}>
          <View style={d.heroTopRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={d.heroLabel}>{L("Operasyon Komuta Merkezi", "Operations Command Center")}</Text>
              <Text style={d.heroTitle}>{L("Yönetici Dashboard", "Admin Dashboard")}</Text>
            </View>
            <View style={d.heroTopActions}>
              <View style={d.statusPillWrap}>
                <View style={[d.dot, { backgroundColor: severityColor }]} />
                <Text style={d.statusPillText}>{severityLevel}</Text>
              </View>
              <TouchableOpacity style={d.heroIconBtn} onPress={() => navigation.navigate("Messages")}>
                <Ionicons name="chatbubbles-outline" size={17} color="#fff1f2" />
              </TouchableOpacity>
              <TouchableOpacity style={d.heroIconBtn} onPress={() => navigation.navigate("CoordinatorCenter")}>
                <Ionicons name="grid-outline" size={17} color="#fff1f2" />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={d.heroSub}>{L("Kritik talepler, gönüllü onayları ve sistem sağlığı tek ekranda", "Critical requests, volunteer approvals and system health on one screen")}</Text>

          <View style={d.kpiGrid}>
            <KpiCard label={L("Aktif Talep", "Active Requests")} value={String(open.length + assigned.length + inProgress.length)} hint={L("Operasyon", "Operation")} />
            <KpiCard label={L("Acil Talep", "Urgent Requests")} value={String(urgentOpen.length)} hint={L("Yüksek öncelik", "High priority")} danger />
            <KpiCard label={L("Aktif Gönüllü", "Active Volunteers")} value={String(activeVolunteers.length)} hint={`${busyVolunteers.length} ${L("görevde", "on duty")}`} />
            <KpiCard label={L("Bekleyen Atama", "Pending Assignment")} value={String(open.length)} hint={L("Henüz atanmadı", "Not yet assigned")} />
            <KpiCard label={L("Onay Bekleyen", "Awaiting Approval")} value={String(pendingVolunteers.length)} hint={L("Gönüllü başvurusu", "Volunteer application")} />
            <KpiCard label={L("Görev Başvurusu", "Mission Application")} value={String(pendingApps.length)} hint={L("Lider onayı", "Leader approval")} />
          </View>

          <View style={d.crisisRow}>
            <View style={{ flex: 1 }}>
              <Text style={d.crisisTitle}>{L("Kriz Modu", "Crisis Mode")}</Text>
              <Text style={d.crisisSub}>{L("Acil talepleri üstte tut, komuta görünümünü sıkılaştır", "Keep urgent requests on top, tighten command view")}</Text>
            </View>
            <TouchableOpacity
              onPress={async () => {
                const next = !crisisMode;
                setCrisisMode(next);
                try {
                  await setDoc(doc(db, "system_settings", "coordinator_app"), {
                    crisisMode: next,
                    updatedAt: serverTimestamp(),
                    updatedBy: user?.uid || null
                  } as any, { merge: true });
                  showToast(L(`Kriz modu ${next ? "aktif" : "pasif"} edildi.`, `Crisis mode ${next ? "activated" : "deactivated"}.`), "success");
                } catch {
                  showToast(L("Kriz modu kaydedilemedi.", "Crisis mode could not be saved."), "error");
                }
              }}
              style={[d.crisisToggle, crisisMode && d.crisisToggleActive]}
            >
              <View style={[d.crisisKnob, crisisMode && d.crisisKnobActive]} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={[d.body, { backgroundColor: shellBg }]}>
        {/* Hızlı Komutlar — açılır/kapanır */}
        <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <TouchableOpacity onPress={() => setQuickExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="grid" size={16} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionTitleStyle}>{L("Hızlı Komutlar", "Quick Commands")}</Text>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{quickModules.length} {L("modül", "modules")}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => navigation.navigate("CoordinatorCenter")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : panelBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={sectionLinkStyle}>{L("TÜMÜ", "ALL")}</Text>
              </TouchableOpacity>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={quickExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>
          {quickExpanded ? (
            <View style={[d.quickGrid, { marginTop: 10 }]}>
              {quickModules.map((m) => (
                <TouchableOpacity key={m.key} onPress={() => navigation.navigate(m.route)} style={[d.quickCard, { backgroundColor: cardBg, borderColor: panelBorder }]}>
                  <View style={d.quickIcon}>
                    <Ionicons name={m.icon as any} size={18} color={lightMode ? "#9f1239" : "#fecaca"} />
                  </View>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>{m.title}</Text>
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 2, lineHeight: 14 }}>{m.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Kritik Uyarılar — açılır/kapanır */}
        <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <TouchableOpacity onPress={() => setWarningsExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="warning" size={16} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionTitleStyle}>{L("Kritik Uyarılar", "Critical Warnings")}</Text>
                <Text style={{ color: criticalWarnings.length > 0 ? "#ef4444" : textMuted, fontFamily: "Inter-Bold", fontSize: 11, marginTop: 1 }}>
                  {criticalWarnings.length > 0 ? L(`${criticalWarnings.length} aktif uyarı`, `${criticalWarnings.length} active`) : L("Sistem normal", "All clear")}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {criticalWarnings.length > 0 ? (
                <View style={{ borderRadius: 999, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 8, paddingVertical: 3, minWidth: 26, alignItems: "center" }}>
                  <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 10 }}>{criticalWarnings.length}</Text>
                </View>
              ) : null}
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={warningsExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>
          {warningsExpanded ? (
            <View style={{ marginTop: 10 }}>
              {criticalWarnings.length ? criticalWarnings.map((w, idx) => (
                <View key={`w-${idx}`} style={d.warningRow}>
                  <View style={[d.warnIconWrap, { backgroundColor: idx % 2 ? "rgba(249,168,37,0.14)" : "rgba(239,68,68,0.14)" }]}>
                    <Ionicons name={idx % 2 ? "warning-outline" : "alert-circle-outline"} size={16} color={idx % 2 ? "#f59e0b" : "#ef4444"} />
                  </View>
                  <Text style={{ color: textPrimary, fontFamily: "Inter", fontSize: 12, flex: 1 }}>{w}</Text>
                </View>
              )) : <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12, textAlign: "center", paddingVertical: 6 }}>{L("Kritik uyarı yok. Sistem normal durumda.", "No critical warnings. System is operating normally.")}</Text>}
            </View>
          ) : null}
        </View>

        {/* Grafikler ve Eğilimler — açılır/kapanır */}
        <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <TouchableOpacity onPress={() => setChartsExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.14)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="trending-up" size={16} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionTitleStyle}>{L("Grafikler ve Eğilimler", "Charts and Trends")}</Text>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{L("3 canlı metrik", "3 live metrics")}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => navigation.navigate("CoordinatorReports")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : panelBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={sectionLinkStyle}>{L("RAPOR", "REPORT")}</Text>
              </TouchableOpacity>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={chartsExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>
          {chartsExpanded ? (
            <View style={{ marginTop: 10 }}>
              <MiniLine title={L("Günlük Talep Artışı", "Daily Request Increase")} data={requestTrend} color="#ef4444" max={maxLine} lightMode={lightMode} textMuted={textMuted} />
              <MiniLine title={L("Bağış Trend (Canlı)", "Donation Trend (Live)")} data={donationTrend} color="#f59e0b" max={maxLine} lightMode={lightMode} textMuted={textMuted} />
              <MiniLine title={L("Bölge Yoğunluk (Canlı)", "Region Density (Live)")} data={densityTrend} color="#22c55e" max={maxLine} lightMode={lightMode} textMuted={textMuted} />
            </View>
          ) : null}
        </View>

        {/* Operasyon Haritası — açılır/kapanır */}
        <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <TouchableOpacity onPress={() => setMapExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(16,185,129,0.14)", borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="map" size={16} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionTitleStyle}>{L("Operasyon Haritası", "Operation Map")}</Text>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{requests.filter((r) => (r as any).location?.lat).length} {L("konumlu talep", "located requests")}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => navigation.navigate("Map")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : panelBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={sectionLinkStyle}>{L("AÇ", "OPEN")}</Text>
              </TouchableOpacity>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={mapExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </View>
          </TouchableOpacity>
          {mapExpanded ? (
          <View style={{ height: 200, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(248,113,113,0.14)", marginTop: 10 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{ latitude: 39.9334, longitude: 32.8597, latitudeDelta: 8, longitudeDelta: 8 }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {requests
                .filter((r) => (r as any).location?.lat && (r as any).location?.lng)
                .slice(0, 40)
                .map((r) => (
                  <Marker
                    key={r.id}
                    coordinate={{ latitude: (r as any).location.lat, longitude: (r as any).location.lng }}
                    pinColor={
                      (r.urgency || "").toLowerCase().includes("acil") ? "#ef4444" :
                      (r.urgency || "").toLowerCase().includes("orta") ? "#f59e0b" : "#22c55e"
                    }
                  />
                ))}
            </MapView>
            <View style={{ position: "absolute", bottom: 8, left: 8, flexDirection: "row", gap: 6 }}>
              {([[`#ef4444`, L("Acil", "Urgent")], [`#f59e0b`, L("Orta", "Medium")], [`#22c55e`, L("Düşük", "Low")]] as [string, string][]).map(([color, label]) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 9 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          ) : null}
        </View>

        {/* Canlı Operasyon Akışı — açılır/kapanır */}
        {feed.length > 0 && (
          <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <TouchableOpacity onPress={() => setFeedExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(34,197,94,0.14)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="pulse" size={16} color="#22c55e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitleStyle}>{L("Canlı Operasyon Akışı", "Live Operation Feed")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
                    <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 10 }}>CANLI</Text>
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>• {feed.length} {L("olay", "events")}</Text>
                  </View>
                </View>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={feedExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
              </View>
            </TouchableOpacity>
            {feedExpanded ? (
              <View style={{ marginTop: 10 }}>
                {feed.slice(0, 6).map((item) => (
                  <View key={item.id} style={[d.feedRow, { backgroundColor: lightMode ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", borderColor: lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)" }]}>
                    <View style={[d.feedIcon, { backgroundColor: `${iconColorMap[item.tone]}18`, borderColor: `${iconColorMap[item.tone]}30` }]}>
                      <Ionicons name={item.icon as any} size={15} color={iconColorMap[item.tone]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>{item.title}</Text>
                      <Text numberOfLines={1} style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{item.subtitle}</Text>
                    </View>
                    <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 10, marginLeft: 8 }}>{timeAgo(item.at)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <View style={d.rowSplit}>
          {/* Son Talepler — açılır/kapanır */}
          <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <TouchableOpacity onPress={() => setRecentExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.14)", borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="document-text" size={16} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitleStyle}>{L("Son Talepler", "Recent Requests")}</Text>
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{requests.length} {L("toplam talep", "total requests")}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity onPress={() => navigation.navigate("Manage")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : panelBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={sectionLinkStyle}>{L("YÖNET", "MANAGE")}</Text>
                </TouchableOpacity>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={recentExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
                </View>
              </View>
            </TouchableOpacity>
            {recentExpanded ? (
              <View style={{ marginTop: 10 }}>
                {loading ? (
                  [1, 2, 3].map((i) => <View key={i} style={[d.reqRow, { opacity: 0.5, backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)", borderColor: panelBorder }]} />)
                ) : requests.slice(0, 6).map((r) => {
                  const tone = statusTone(r.status);
                  return (
                    <TouchableOpacity key={r.id} onPress={() => navigation.navigate("Manage", { requestId: r.id })} style={[d.reqRow, { backgroundColor: lightMode ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)", borderColor: panelBorder }]}>
                      <View style={[d.reqDot, { backgroundColor: iconColorMap[tone] }]} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12 }}>{r.type || "Talep"}</Text>
                        <Text numberOfLines={1} style={{ color: textMuted, fontFamily: "Inter", fontSize: 10, marginTop: 2 }}>{r.description || L("Açıklama yok", "No description")}</Text>
                      </View>
                      <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 10, marginLeft: 8 }}>{statusLabel[r.status || "open"] || r.status}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Sistem Sağlığı — açılır/kapanır */}
          <View style={[d.sectionCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <TouchableOpacity onPress={() => setHealthExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.14)", borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="pulse-outline" size={16} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sectionTitleStyle}>{L("Sistem Sağlığı", "System Health")}</Text>
                  <Text style={{ color: systemHealth.every((s) => s.ok) ? "#22c55e" : "#f59e0b", fontFamily: "Inter-Bold", fontSize: 11, marginTop: 1 }}>
                    {systemHealth.every((s) => s.ok) ? L("Tüm sistemler aktif", "All systems operational") : L(`${systemHealth.filter((s) => !s.ok).length} uyarı`, `${systemHealth.filter((s) => !s.ok).length} alerts`)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity onPress={() => navigation.navigate("CoordinatorSettings")} style={{ borderRadius: 8, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.18)" : panelBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={sectionLinkStyle}>{L("AYAR", "SETTINGS")}</Text>
                </TouchableOpacity>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: panelBorder, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={healthExpanded ? "chevron-up" : "chevron-down"} size={15} color={textMuted} />
                </View>
              </View>
            </TouchableOpacity>
            {healthExpanded ? (
              <View style={{ marginTop: 10 }}>
                {systemHealth.map((sys) => (
                  <View key={sys.name} style={d.healthRow}>
                    <View style={[d.dot, { backgroundColor: sys.ok ? "#22c55e" : "#f59e0b" }]} />
                    <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12, marginLeft: 8, flex: 1 }}>{sys.name}</Text>
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{sys.info}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => Alert.alert(L("Bilgi", "Info"), L("Kriz modu system_settings koleksiyonuna kalıcı olarak kaydedilir ve modüller aynı ayarı ortak kullanır.", "Crisis mode is permanently saved to the system_settings collection and all modules share the same setting."))}
                  style={[d.crisisInfoBtn, { backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)", borderColor: panelBorder }]}
                >
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Kriz Modu Bilgisi", "Crisis Mode Info")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
        </View>
      </ScrollView>
    </View>
  );
};

const KpiCard = ({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) => (
  <View style={d.kpiCard}>
    <Text style={[d.kpiLabel, danger && { color: "#fecaca" }]}>{label}</Text>
    <Text style={[d.kpiValue, danger && { color: "#fee2e2" }]}>{value}</Text>
    <Text style={d.kpiHint}>{hint}</Text>
  </View>
);

const MiniLine = ({ title, data, color, max, lightMode, textMuted }: { title: string; data: number[]; color: string; max: number; lightMode: boolean; textMuted: string }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 12, marginBottom: 6 }}>{title}</Text>
    <View style={[d.lineWrap, { backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)", borderColor: lightMode ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.06)" }]}>
      {data.map((v, i) => (
        <View key={`${title}-${i}`} style={d.lineBarCol}>
          <View style={[d.lineBar, { backgroundColor: color, height: `${Math.max(8, (v / max) * 100)}%`, opacity: i === data.length - 1 ? 1 : 0.72 }]} />
        </View>
      ))}
    </View>
  </View>
);

const timeAgo = (ts: number) => {
  if (!ts) return "-";
  const diff = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diff < 60) return `${diff} dk`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa`;
  return `${Math.floor(h / 24)} g`;
};

const d = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#12060a" },
  pageScroll: { paddingBottom: 96 },
  hero: { paddingTop: 54, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroLabel: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12 },
  heroTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 28, marginTop: 4 },
  heroSub: { color: "#fda4af", fontFamily: "Inter", fontSize: 12, marginTop: 8, lineHeight: 17 },
  statusPillWrap: { flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11, marginLeft: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  kpiCard: { width: "48%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 10 },
  kpiLabel: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  kpiValue: { color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginTop: 4 },
  kpiHint: { color: "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 3 },
  crisisRow: { marginTop: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 10, flexDirection: "row", alignItems: "center" },
  crisisTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 },
  crisisSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 },
  crisisToggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 2 },
  crisisToggleActive: { backgroundColor: "rgba(239,68,68,0.18)", borderColor: "rgba(248,113,113,0.18)" },
  crisisKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff1f2", alignSelf: "flex-start" },
  crisisKnobActive: { alignSelf: "flex-end", backgroundColor: "#ef4444" },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 96, backgroundColor: "#12060a" },
  sectionCard: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 },
  sectionLink: { color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  quickCard: { width: "48.8%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 },
  quickIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(248,113,113,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  quickTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 },
  quickSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2, lineHeight: 14 },
  warningRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  warnIconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 8 },
  warningText: { color: "#ffe4e6", fontFamily: "Inter", fontSize: 12, flex: 1 },
  emptyText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, textAlign: "center", paddingVertical: 6 },
  cardSubtleTitle: { color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 },
  lineWrap: { height: 76, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)", flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 8, paddingVertical: 8 },
  lineBarCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  lineBar: { width: "100%", borderRadius: 8 },
  heroTopActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  rowSplit: { flexDirection: "column", gap: 10 },
  reqRow: { borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  reqDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  reqRowTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 },
  reqRowSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 },
  reqRowBadge: { color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10, marginLeft: 8, textTransform: "uppercase" as any },
  healthRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  healthName: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, marginLeft: 8, flex: 1 },
  healthState: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  crisisInfoBtn: { marginTop: 8, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  crisisInfoBtnText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  feedRow: { flexDirection: "row", alignItems: "flex-start", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 },
  feedIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 8 },
  feedTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 },
  feedSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 },
  feedTime: { color: "#fda4af", fontFamily: "Inter-Bold", fontSize: 10, marginLeft: 8 }
});



