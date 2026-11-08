import {
  React,
  useEffect,
  useMemo,
  useState,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  useNavigation,
  collection,
  addDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  toMillis,
  where,
  doc,
  updateDoc,
  db,
  assignVolunteerViaApi,
  publishAnnouncementViaApi,
  useStore
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { deleteDoc } from "firebase/firestore";
import { maskEmail } from "../../utils/privacy";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { l } from "../../services/i18n";

/**
 * COORD-CENTER DOSYA HARITASI
 * - COORD-CENTER-UTILS: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - COORD-CENTER-SHELL: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - COORD-CENTER-MODULES: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 *   - CoordinatorCenterScreen: modül ana menüsü
 *   - CoordinatorReportsScreen: grafik/analitik
 *   - CoordinatorAnnouncementsScreen: duyuru üretim ve yayın
 *   - CoordinatorLogsScreen: audit log filtreleme ve listeleme
 *   - CoordinatorRolesScreen: kullanıcı rol/volunteer status yönetimi
 *   - CoordinatorSettingsScreen: sistem ayarları
 *   - CoordinatorDonationsScreen: bağış kayıt/izleme
 *   - CoordinatorInventoryScreen: stok/depo yönetimi
 *   - CoordinatorAssignmentsScreen: talep-gönüllü eşleştirme ve atama
 */

const isPermissionDenied = (err: any) =>
  String(err?.code || "").includes("permission-denied") ||
  String(err?.message || "").toLowerCase().includes("permission");

const writeAuditLog = async (
  payload: {
    action: string;
    entityType?: string;
    entityId?: string;
    note?: string;
    diff?: Record<string, any>;
  },
  actorId?: string | null
) => {
  const base = {
    actorId: actorId || null,
    actorRole: "coordinator",
    action: payload.action,
    entityType: payload.entityType || "system",
    entityId: payload.entityId || "-",
    note: payload.note || "",
    diff: payload.diff || null,
    source: "coordinator_app",
    clientPlatform: Platform.OS,
    createdAt: serverTimestamp()
  };
  try {
    await addDoc(collection(db, "audit_logs"), base as any);
  } catch {
    try {
      await addDoc(collection(db, "coordinator_notes"), {
        ...base,
        action: `Audit Fallback: ${payload.action}`
      } as any);
    } catch {
      // noop
    }
  }
};

const shellStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0b0910" },
  hero: { paddingTop: 56, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  row: { flexDirection: "row", alignItems: "center" },
  heroBack: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  heroTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginLeft: 10, flex: 1 },
  heroSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 8 },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 96 },
  card: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 10 },
  cardTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 6 },
  cardText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, lineHeight: 16 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  pillText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { width: "48%", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12 },
  kpiLabel: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  kpiVal: { color: "white", fontFamily: "Inter-Bold", fontSize: 24, marginTop: 4 },
  empty: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, textAlign: "center", marginTop: 8 }
});

// COORD-CENTER-SHELL: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
const ModuleShell = ({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => {
  const navigation = useNavigation<any>();
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#040406" : "#0b0910";
  const heroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#12060a", "#0a0508"] : ["#3f0914", "#23070f", "#14070b"];
  return (
    <View style={[shellStyles.page, { backgroundColor: shellBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        <LinearGradient colors={heroColors as any} style={shellStyles.hero}>
          <View style={shellStyles.row}>
            <TouchableOpacity onPress={() => (navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate("CoordinatorCenter"))} style={shellStyles.heroBack}>
              <Ionicons name="arrow-back" size={18} color="#fff1f2" />
            </TouchableOpacity>
            <Text style={shellStyles.heroTitle}>{title}</Text>
          </View>
          <Text style={shellStyles.heroSub}>{subtitle}</Text>
        </LinearGradient>
        <View style={shellStyles.body}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorCenterScreen = () => {
  const navigation = useNavigation<any>();
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#040406" : "#0b0910";
  const heroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#12060a", "#0a0508"] : ["#3f0914", "#23070f", "#14070b"];
  const moduleGroups = [
    {
      title: L("Operasyon Modülleri", "Operations Modules"),
      items: [
        { route: "CoordinatorAssignments", icon: "git-network-outline", title: L("Görev Atama Motoru", "Task Assignment Engine"), sub: L("Manuel atama, öneri, yük dengesi", "Manual assignment, suggestions, load balancing") },
        { route: "CoordinatorAnnouncements", icon: "megaphone-outline", title: L("Duyuru Merkezi", "Announcement Center"), sub: L("Push / SMS / e-posta duyuruları", "Push / SMS / e-mail announcements") },
        { route: "Messages", icon: "chatbubbles-outline", title: L("Mesajlar", "Messages"), sub: L("Gönüllü ve saha iletişim ekranı", "Volunteer and field communication screen") },
        { route: "CoordinatorLogs", icon: "document-text-outline", title: L("Sistem Hareket Kayıtları", "System Activity Logs"), sub: L("Denetim ve işlem geçmişi", "Audit and operation history") }
      ]
    },
    {
      title: L("Analitik ve Yönetim", "Analytics & Management"),
      items: [
        { route: "CoordinatorReports", icon: "stats-chart-outline", title: L("Raporlar & Analitik", "Reports & Analytics"), sub: L("Trendler, dağılım ve performans", "Trends, distribution and performance") },
        { route: "CoordinatorRoles", icon: "people-circle-outline", title: L("Kullanıcı & Rol Yönetimi", "User & Role Management"), sub: L("RBAC görünümü ve rol dağılımı", "RBAC view and role distribution") },
        { route: "CoordinatorSettings", icon: "settings-outline", title: L("Sistem Ayarları", "System Settings"), sub: L("Tema, servisler, yedekleme", "Theme, services, backup") }
      ]
    },
    {
      title: L("Kurumsal Modüller (Faz 3)", "Enterprise Modules (Phase 3)"),
      items: [
        { route: "CoordinatorDonations", icon: "cash-outline", title: L("Bağış Yönetimi", "Donation Management"), sub: L("Para + ayni bağış akışı", "Cash + in-kind donation flow") },
        { route: "CoordinatorInventory", icon: "cube-outline", title: L("Stok & Depo", "Stock & Warehouse"), sub: L("Depolar, stok, kritik seviyeler", "Warehouses, stock, critical levels") }
      ]
    }
  ];

  return (
    <View style={[shellStyles.page, { backgroundColor: shellBg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        <LinearGradient colors={heroColors as any} style={shellStyles.hero}>
          <View style={[shellStyles.row, { justifyContent: "space-between" }]}>
            <View style={[shellStyles.row, { flex: 1, marginRight: 8 }]}>
              <TouchableOpacity onPress={() => navigation.navigate("Home")} style={shellStyles.heroBack}>
                <Ionicons name="arrow-back" size={18} color="#fff1f2" />
              </TouchableOpacity>
              <Text style={shellStyles.heroTitle}>{L("Merkez", "Center")}</Text>
            </View>
            <View style={[shellStyles.pill, { marginRight: 0, marginBottom: 0, backgroundColor: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.24)" }]}>
              <Text style={[shellStyles.pillText, { color: "#bbf7d0" }]}>{L("Sistem Aktif", "System Active")}</Text>
            </View>
          </View>
          <Text style={shellStyles.heroSub}>{L("Yönetici modülleri, raporlar, loglar ve sistem araçları", "Admin modules, reports, logs and system tools")}</Text>
        </LinearGradient>

        <View style={shellStyles.body}>
          {moduleGroups.map((group) => (
            <View key={group.title} style={shellStyles.card}>
              <Text style={[shellStyles.cardTitle, { fontSize: 15, marginBottom: 8 }]}>{group.title}</Text>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => navigation.navigate(item.route)}
                  style={{
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.03)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.06)",
                    padding: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(248,113,113,0.12)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Ionicons name={item.icon as any} size={17} color="#fecaca" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{item.title}</Text>
                    <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#fecdd3" />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorReportsScreen = () => {
  const [requests, setRequests] = useState<Req[]>([]);
  const [volCount, setVolCount] = useState(0);
  const [applications, setApplications] = useState<Array<{ id: string; createdAt?: any; status?: string }>>([]);
  const [csvPreview, setCsvPreview] = useState("");
  const [showCsv, setShowCsv] = useState(false);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  useEffect(() => {
    const unsubReq = onSnapshot(
      query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(180)),
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Rapor verileri okunamadı.", "Could not load report data."), "error");
      }
    );
    const unsubVol = onSnapshot(
      query(collection(db, "users_public"), limit(240)),
      (snap) =>
        setVolCount(
          snap.docs.filter((d) =>
            ["volunteer", "gonullu", "gönüllü"].includes(String((d.data() as any)?.role || "").toLowerCase())
          ).length
        ),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Gönüllü sayısı okunamadı.", "Could not load volunteer count."), "error");
      }
    );
    const unsubApps = onSnapshot(
      query(collection(db, "volunteerApplications"), orderBy("createdAt", "desc"), limit(220)),
      (snap) => setApplications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Başvuru verileri okunamadı.", "Could not load application data."), "error");
      }
    );
    return () => { unsubReq(); unsubVol(); unsubApps(); };
  }, [showToast]);

  const monthlyBuckets = useMemo(() => {
    const monthShort = locale === "en"
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      : ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const now = new Date();
    const base = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      return { key, label: monthShort[d.getMonth()], requestCount: 0, completedCount: 0, appCount: 0 };
    });
    const map = new Map(base.map((b) => [b.key, { ...b }]));

    requests.forEach((r) => {
      const created = toMillis((r as any).createdAt);
      if (!created) return;
      const d = new Date(created);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = map.get(k);
      if (!bucket) return;
      bucket.requestCount += 1;
      if ((r.status || "open") === "closed") bucket.completedCount += 1;
    });

    applications.forEach((a) => {
      const created = toMillis(a.createdAt);
      if (!created) return;
      const d = new Date(created);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = map.get(k);
      if (!bucket) return;
      bucket.appCount += 1;
    });

    return base.map((b) => map.get(b.key) || b);
  }, [requests, applications]);

  const monthly = monthlyBuckets.map((b) => b.requestCount);
  const max = Math.max(...monthly, 1);
  const urgent = requests.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("acil")).length;
  const closed = requests.filter((r) => r.status === "closed").length;
  const active = requests.filter((r) => r.status !== "closed").length;
  const pendingApps = applications.filter((a) => (a.status || "pending") === "pending").length;

  const buildCsv = () => {
    const lines: string[] = [];
    lines.push("Ay,Talep,Tamamlanan,GönüllüBaşvurusu");
    monthlyBuckets.forEach((b) => {
      lines.push(`${b.label},${b.requestCount},${b.completedCount},${b.appCount}`);
    });
    lines.push("");
    lines.push("KPI,Deger");
    lines.push(`AktifTalep,${active}`);
    lines.push(`Tamamlanan,${closed}`);
    lines.push(`AcilTalep,${urgent}`);
    lines.push(`AktifGönüllü,${volCount}`);
    lines.push(`BekleyenBasvuru,${pendingApps}`);
    return lines.join("\n");
  };

  const onExportCsv = () => {
    const csv = buildCsv();
    setCsvPreview(csv);
    setShowCsv(true);
    showToast(L("CSV hazırlandı. Önizleme alanından kopyalayabilirsiniz.", "CSV ready. You can copy it from the preview area."), "success");
  };

  return (
    <ModuleShell title={L("Raporlar ve Analizler", "Reports & Analytics")} subtitle={L("Operasyon trendleri, yoğunluk ve performans özeti", "Operation trends, intensity and performance summary")}>
      <View style={[shellStyles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={shellStyles.cardTitle}>{L("Rapor Dışa Aktarma", "Export Report")}</Text>
          <Text style={shellStyles.cardText}>{L("Aylık rapor özeti CSV formatında hazırlanır.", "Monthly report summary is prepared in CSV format.")}</Text>
        </View>
        <TouchableOpacity onPress={onExportCsv} style={{ borderRadius: 10, overflow: "hidden" }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("CSV OLUŞTUR", "CREATE CSV")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      {showCsv ? (
        <View style={shellStyles.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={shellStyles.cardTitle}>{L("CSV Önizleme", "CSV Preview")}</Text>
            <TouchableOpacity onPress={() => setShowCsv(false)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("KAPAT", "CLOSE")}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={csvPreview}
            editable={false}
            multiline
            style={{
              minHeight: 160,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "#fff1f2",
              fontFamily: "Inter",
              paddingHorizontal: 10,
              paddingVertical: 10
            }}
          />
        </View>
      ) : null}
      <View style={shellStyles.kpiGrid}>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Aktif Talep", "Active Requests")}</Text><Text style={shellStyles.kpiVal}>{active}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Tamamlanan", "Completed")}</Text><Text style={shellStyles.kpiVal}>{closed}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Acil Talep", "Urgent Requests")}</Text><Text style={shellStyles.kpiVal}>{urgent}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Aktif Gönüllü", "Active Volunteers")}</Text><Text style={shellStyles.kpiVal}>{volCount}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Aylık Başvuru", "Monthly Applications")}</Text><Text style={shellStyles.kpiVal}>{monthlyBuckets[monthlyBuckets.length - 1]?.appCount || 0}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Bekleyen Başvuru", "Pending Applications")}</Text><Text style={shellStyles.kpiVal}>{pendingApps}</Text></View>
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Aylık Operasyon Grafiği (Gerçek Veri)", "Monthly Operation Chart (Real Data)")}</Text>
        <View style={{ height: 120, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
          {monthlyBuckets.map((b, idx) => (
            <View key={`bar-${idx}`} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: "100%", height: `${Math.max(8, (b.requestCount / max) * 100)}%`, borderRadius: 10, backgroundColor: idx % 2 ? "rgba(239,68,68,0.55)" : "rgba(220,38,38,0.85)" }} />
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 6 }}>{b.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[shellStyles.cardText, { marginTop: 8 }]}>{L("Grafik son 6 ayda oluşturulan gerçek talep kayıtlarını gösterir.", "Chart shows real request records created in the last 6 months.")}</Text>
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Aylık Tamamlanma ve Başvuru Karşılaştırması", "Monthly Completion & Application Comparison")}</Text>
        {monthlyBuckets.map((b) => (
          <View key={`mx-${b.key}`} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{b.label}</Text>
            <Text style={shellStyles.cardText}>
              {L("Talep", "Requests")}: {b.requestCount} • {L("Tamamlanan", "Completed")}: {b.completedCount} • {L("Gönüllü Başvurusu", "Volunteer Applications")}: {b.appCount}
            </Text>
          </View>
        ))}
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Risk Seviyesi Analizi", "Risk Level Analysis")}</Text>
        {[
          { k: L("Düşük", "Low"), color: "#22c55e", val: requests.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("düşük") || `${r.urgency || ""}`.toLowerCase().includes("dusuk")).length },
          { k: L("Orta", "Medium"), color: "#f59e0b", val: requests.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("orta")).length },
          { k: L("Acil/Yüksek", "Urgent/High"), color: "#ef4444", val: requests.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("acil") || `${r.urgency || ""}`.toLowerCase().includes("yüksek") || `${r.urgency || ""}`.toLowerCase().includes("yuksek")).length }
        ].map((row) => {
          const total = Math.max(requests.length, 1);
          const pct = Math.min(100, Math.round((row.val / total) * 100));
          return (
            <View key={row.k} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{row.k}</Text>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>%{pct}</Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" }}>
                <View style={{ width: `${pct}%`, height: "100%", borderRadius: 999, backgroundColor: row.color }} />
              </View>
            </View>
          );
        })}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorAnnouncementsScreen = () => {
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("Yönetici Duyurusu");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("high");
  const [targetRoles, setTargetRoles] = useState<string[]>(["victim", "volunteer"]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title?: string; message?: string; severity?: string; createdAt?: any }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);

  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(20));
    return onSnapshot(q, (snap) => setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), (err) => {
      if (!isPermissionDenied(err)) showToast(L("Duyurular okunamadı.", "Could not load announcements."), "error");
    });
  }, [showToast]);

  const templates: Array<{ key: string; label: string; title: string; message: string; severity: "low" | "medium" | "high"; roles: string[] }> = [
    {
      key: "critical_aftershock",
      label: L("Artçı Risk", "Aftershock Risk"),
      title: "Acil Güvenlik Uyarısı",
      message: "Artçı sarsıntı riski devam ediyor. Açık alanda kalın ve toplanma noktalarını kontrol edin.",
      severity: "high",
      roles: ["victim", "volunteer"]
    },
    {
      key: "volunteer_shift",
      label: L("Vardiya Çağrısı", "Shift Call"),
      title: "Gönüllü Vardiya Çağrısı",
      message: "Yeni saha vardiyası açıldı. Müsait gönüllüler görev ekranından başvuru yapabilir.",
      severity: "medium",
      roles: ["volunteer"]
    },
    {
      key: "service_info",
      label: L("Bilgilendirme", "Information"),
      title: "Sistem Bilgilendirmesi",
      message: "Operasyon akışında planlı bakım tamamlandı. Tüm modüller tekrar aktif.",
      severity: "low",
      roles: ["victim", "volunteer", "coordinator"]
    }
  ];

  const toggleRole = (role: string) => {
    setTargetRoles((prev) => (prev.includes(role) ? prev.filter((x) => x !== role) : [...prev, role]));
  };

  const publish = async () => {
    if (!message.trim()) return showToast(L("Duyuru metni boş olamaz.", "Announcement text cannot be empty."), "error");
    if (!targetRoles.length) return showToast(L("En az bir hedef rol seçin.", "Select at least one target role."), "error");
    try {
      const payload = {
        title: title.trim() || "Yönetici Duyurusu",
        message: message.trim(),
        severity,
        targetRoles
      };
      const result = await publishAnnouncementViaApi(payload);
      await writeAuditLog(
        {
          action: "Duyuru yayınlandı",
          entityType: "announcement",
          entityId: (result as any)?.announcementId || "-",
          note: `${payload.title} • hedef: ${payload.targetRoles.join(", ")}`
        },
        user?.uid
      );
      setMessage("");
      showToast(L("Duyuru yayınlandı.", "Announcement published."), "success");
    } catch {
      try {
        const payload = {
          title: title.trim() || "Yönetici Duyurusu",
          message: message.trim(),
          severity,
          targetRoles,
          createdBy: user?.uid || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        const ref = await addDoc(collection(db, "announcements"), payload as any);
        await writeAuditLog(
          {
            action: "Duyuru yayınlandı",
            entityType: "announcement",
            entityId: ref.id,
            note: `${payload.title} • hedef: ${targetRoles.join(", ")}`
          },
          user?.uid
        );
        setMessage("");
        showToast(L("Duyuru function fallback ile yayınlandı.", "Announcement published via fallback."), "success");
      } catch {
        showToast(L("Duyuru yayınlanamadı. Functions/rules kontrol edin.", "Could not publish announcement. Check Functions/rules."), "error");
      }
    }
  };

  const startEdit = (row: { id: string; title?: string; message?: string; severity?: string }) => {
    setEditingId(row.id);
    setTitle(row.title || "Yönetici Duyurusu");
    setMessage(row.message || "");
    setSeverity((row.severity as any) || "high");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!message.trim()) return showToast(L("Duyuru metni boş olamaz.", "Announcement text cannot be empty."), "error");
    try {
      await updateDoc(doc(db, "announcements", editingId), {
        title: title.trim() || "Yönetici Duyurusu",
        message: message.trim(),
        severity,
        targetRoles,
        updatedAt: serverTimestamp()
      } as any);
      await writeAuditLog(
        {
          action: "Duyuru güncellendi",
          entityType: "announcement",
          entityId: editingId,
          note: `${title.trim()} düzenlendi`
        },
        user?.uid
      );
      setEditingId(null);
      setMessage("");
      setTitle("Yönetici Duyurusu");
      setSeverity("high");
      setTargetRoles(["victim", "volunteer"]);
      showToast(L("Duyuru güncellendi.", "Announcement updated."), "success");
    } catch {
      showToast(L("Duyuru güncellenemedi.", "Could not update announcement."), "error");
    }
  };

  const removeAnnouncement = async (row: { id: string; title?: string }) => {
    Alert.alert(L("Duyuru Sil", "Delete Announcement"), `"${row.title || L("Duyuru", "Announcement")}" ${L("silinsin mi?", "will be deleted?")}`, [
      { text: L("Vazgeç", "Cancel"), style: "cancel" },
      {
        text: L("Sil", "Delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "announcements", row.id));
            await writeAuditLog(
              {
                action: "Duyuru silindi",
                entityType: "announcement",
                entityId: row.id,
                note: row.title || "Duyuru"
              },
              user?.uid
            );
            if (editingId === row.id) setEditingId(null);
            showToast(L("Duyuru silindi.", "Announcement deleted."), "success");
          } catch {
            showToast(L("Duyuru silinemedi.", "Could not delete announcement."), "error");
          }
        }
      }
    ]);
  };

  return (
    <ModuleShell title={L("Bildirim & Duyuru Merkezi", "Notification & Announcement Center")} subtitle={L("Toplu duyurular, acil bilgilendirmeler ve yayın geçmişi", "Mass announcements, emergency notifications and broadcast history")}>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{editingId ? L("Duyuru Düzenle", "Edit Announcement") : L("Yeni Duyuru Oluştur", "Create New Announcement")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {templates.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => {
                setTitle(t.title);
                setMessage(t.message);
                setSeverity(t.severity);
                setTargetRoles(t.roles);
              }}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={title} onChangeText={setTitle} placeholder={L("Başlık", "Title")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <TextInput value={message} onChangeText={setMessage} multiline placeholder={L("Duyuru içeriği...", "Announcement content...")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, paddingVertical: 10, textAlignVertical: "top" }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 8 }}>
          {[
            ["low", L("Düşük", "Low"), "#22c55e"],
            ["medium", L("Orta", "Medium"), "#f59e0b"],
            ["high", L("Acil", "Urgent"), "#ef4444"]
          ].map(([key, label, color]) => (
            <TouchableOpacity key={key} onPress={() => setSeverity(key as any)} style={{ flex: 1, height: 34, borderRadius: 10, borderWidth: 1, borderColor: severity === key ? `${color}` : "rgba(255,255,255,0.08)", backgroundColor: severity === key ? `${color}22` : "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: severity === key ? color : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {[
            ["victim", L("Afetzede", "Victim")],
            ["volunteer", L("Gönüllü", "Volunteer")],
            ["coordinator", L("Yönetici", "Coordinator")]
          ].map(([role, label]) => (
            <TouchableOpacity
              key={role}
              onPress={() => toggleRole(role)}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: targetRoles.includes(role) ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)",
                backgroundColor: targetRoles.includes(role) ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ color: targetRoles.includes(role) ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[shellStyles.cardText, { marginBottom: 8 }]}>
          {L("Hedef", "Target")}: {targetRoles.length ? targetRoles.join(", ") : L("seçilmedi", "none selected")}
        </Text>
        <TouchableOpacity onPress={editingId ? saveEdit : publish} style={{ borderRadius: 12, overflow: "hidden" }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{editingId ? L("DUYURUYU GÜNCELLE", "UPDATE ANNOUNCEMENT") : L("DUYURU YAYINLA", "PUBLISH ANNOUNCEMENT")}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {editingId ? (
          <TouchableOpacity
            onPress={() => {
              setEditingId(null);
              setTitle("Yönetici Duyurusu");
              setMessage("");
              setSeverity("high");
              setTargetRoles(["victim", "volunteer"]);
            }}
            style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("DÜZENLEMEYİ İPTAL ET", "CANCEL EDIT")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Yayın Geçmişi", "Broadcast History")}</Text>
        {announcements.map((a) => (
          <ScrollView
            key={a.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            snapToOffsets={[0, 88]}
            decelerationRate="fast"
            style={{ marginBottom: 8 }}
            contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
          >
            <View style={{ width: 320, maxWidth: 520 }}>
              <View style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, flex: 1, paddingRight: 8 }} numberOfLines={1}>
                    {a.title || "Duyuru"}
                  </Text>
                  <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10 }}>{a.severity || "high"}</Text>
                  </View>
                </View>
                <Text style={shellStyles.cardText}>{a.message || "-"}</Text>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                  <TouchableOpacity onPress={() => startEdit(a)} style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", backgroundColor: "rgba(59,130,246,0.14)", paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: "#bfdbfe", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("DÜZENLE", "EDIT")}</Text>
                  </TouchableOpacity>
                  <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: "#e5e7eb", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("SOLA KAYDIR • SİL", "SWIPE LEFT • DELETE")}</Text>
                  </View>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => removeAnnouncement(a)}
              style={{ width: 80, marginLeft: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#dc2626", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)" }}
            >
              <Ionicons name="trash-outline" size={18} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10, marginTop: 2 }}>{L("SİL", "DELETE")}</Text>
            </TouchableOpacity>
          </ScrollView>
        ))}
        {!announcements.length && <Text style={shellStyles.empty}>{L("Henüz duyuru yok.", "No announcements yet.")}</Text>}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorLogsScreen = () => {
  const [logs, setLogs] = useState<Array<{ id: string; action?: string; actorId?: string; actorRole?: string; source?: string; clientPlatform?: string; createdAt?: any; entityType?: string; entityId?: string; note?: string; diff?: any }>>([]);
  const [notes, setNotes] = useState<Array<{ id: string; action?: string; actorId?: string; actorRole?: string; source?: string; clientPlatform?: string; createdAt?: any; entityType?: string; entityId?: string; note?: string; diff?: any }>>([]);
  const [fallback, setFallback] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "coordinator" | "volunteer" | "victim">("all");
  const [dayFilter, setDayFilter] = useState<"all" | "1" | "7" | "30">("all");
  const [actionFilter, setActionFilter] = useState<"all" | "assignment" | "role" | "status" | "announcement" | "other">("all");
  const [entityFilter, setEntityFilter] = useState<"all" | "request" | "user" | "announcement" | "note" | "system" | "donation" | "inventory">("all");
  const [search, setSearch] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);

  useEffect(() => {
    const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        setFallback(false);
        setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        setFallback(true);
        setLogs([]);
        if (!isPermissionDenied(err)) showToast(L("Audit log erişimi yok. Demo kayıtlar gösteriliyor.", "No audit log access. Showing available records."), "info");
      }
    );
  }, [showToast]);

  useEffect(() => {
    const q = query(collection(db, "coordinator_notes"), orderBy("createdAt", "desc"), limit(80));
    return onSnapshot(
      q,
      (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Operasyon notları okunamadı.", "Could not load operation notes."), "error");
      }
    );
  }, [showToast]);

  const addCoordinatorNote = async () => {
    if (!noteDraft.trim()) return showToast(L("Not metni boş olamaz.", "Note text cannot be empty."), "error");
    try {
      setSavingNote(true);
      await addDoc(collection(db, "coordinator_notes"), {
        action: "Operasyon Notu",
        actorRole: "coordinator",
        actorId: user?.uid || null,
        entityType: "note",
        entityId: "-",
        note: noteDraft.trim(),
        source: "coordinator_app",
        clientPlatform: Platform.OS,
        createdBy: user?.uid || null,
        createdAt: serverTimestamp()
      } as any);
      setNoteDraft("");
      showToast(L("Operasyon notu eklendi.", "Operation note added."), "success");
    } catch {
      showToast(L("Not eklenemedi. Firebase izinlerini kontrol edin.", "Could not add note. Check Firebase permissions."), "error");
    } finally {
      setSavingNote(false);
    }
  };

  const mergedLogs = useMemo(
    () => [...logs, ...notes].sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0)),
    [logs, notes]
  );

  const getActionType = (log: { action?: string; entityType?: string }) => {
    const action = `${log.action || ""}`.toLocaleLowerCase("tr");
    const entity = `${log.entityType || ""}`.toLocaleLowerCase("tr");
    if (action.includes("ata") || action.includes("assign")) return "assignment";
    if (action.includes("rol")) return "role";
    if (action.includes("durum") || action.includes("status")) return "status";
    if (action.includes("duyuru") || action.includes("announcement") || entity === "announcement") return "announcement";
    return "other";
  };

  const filteredLogs = useMemo(() => {
    const searchNorm = search.trim().toLocaleLowerCase("tr");
    return mergedLogs.filter((log) => {
      if (roleFilter !== "all" && (log.actorRole || "") !== roleFilter) return false;
      if (actionFilter !== "all" && getActionType(log) !== actionFilter) return false;
      if (entityFilter !== "all" && (log.entityType || "") !== entityFilter) return false;
      if (dayFilter !== "all") {
        const ms = toMillis(log.createdAt);
        if (ms) {
          const diffDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
          if (diffDays > Number(dayFilter)) return false;
        }
      }
      if (!searchNorm) return true;
      const hay = `${log.action || ""} ${log.note || ""} ${log.entityType || ""} ${log.entityId || ""}`.toLocaleLowerCase("tr");
      return hay.includes(searchNorm);
    });
  }, [mergedLogs, roleFilter, actionFilter, entityFilter, dayFilter, search]);

  const auditStats = useMemo(() => {
    const counts = { assignment: 0, role: 0, status: 0, announcement: 0, other: 0 };
    let highRisk = 0;
    const last24hMs = Date.now() - 24 * 60 * 60 * 1000;
    let last24h = 0;
    mergedLogs.forEach((log) => {
      const t = getActionType(log);
      counts[t as keyof typeof counts] = (counts[t as keyof typeof counts] || 0) + 1;
      const a = `${log.action || ""}`.toLocaleLowerCase("tr");
      // Yüksek risk: rol değişikliği, talep silme, manuel durum geri alma, audit fallback
      if (a.includes("rol") || a.includes("sil") || a.includes("reopen") || a.includes("fallback")) highRisk += 1;
      const ms = toMillis(log.createdAt);
      if (ms && ms >= last24hMs) last24h += 1;
    });
    return { ...counts, highRisk, last24h, total: mergedLogs.length };
  }, [mergedLogs]);

  const isHighRiskLog = (log: { action?: string }) => {
    const a = `${log.action || ""}`.toLocaleLowerCase("tr");
    return a.includes("rol") || a.includes("sil") || a.includes("reopen") || a.includes("fallback");
  };

  const exportJsonPreview = () => {
    const payload = filteredLogs.slice(0, 50).map((x) => ({
      id: x.id,
      action: x.action || "-",
      actorId: x.actorId || null,
      actorRole: x.actorRole || null,
      entityType: x.entityType || null,
      entityId: x.entityId || null,
      note: x.note || "",
      source: x.source || null,
      clientPlatform: x.clientPlatform || null,
      createdAtMs: toMillis(x.createdAt) || null
    }));
    Alert.alert(
      "Log JSON Önizleme",
      JSON.stringify(payload, null, 2).slice(0, 1800) + (payload.length ? "\n..." : ""),
      [{ text: "Tamam" }]
    );
  };

  return (
    <ModuleShell title={L("Sistem Hareket Kayıtları", "System Activity Logs")} subtitle={L("Kim neyi değiştirdi, ne zaman ve hangi kayıt üzerinde işlem yaptı", "Who changed what, when and on which record")}>
      {fallback ? (
        <View style={[shellStyles.card, { borderColor: "rgba(249,168,37,0.22)", backgroundColor: "rgba(249,168,37,0.06)" }]}>
          <Text style={[shellStyles.cardText, { color: "#fde68a" }]}>{L("Audit log yetkisi/rules sınırlı. Sadece erişilebilen gerçek kayıtlar gösteriliyor.", "Audit log access/rules are limited. Showing only accessible real records.")}</Text>
        </View>
      ) : null}
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Denetim Özeti", "Audit Summary")}</Text>
        <View style={shellStyles.kpiGrid}>
          <View style={shellStyles.kpiCard}>
            <Text style={shellStyles.kpiLabel}>{L("Toplam Kayıt", "Total Records")}</Text>
            <Text style={shellStyles.kpiVal}>{auditStats.total}</Text>
          </View>
          <View style={shellStyles.kpiCard}>
            <Text style={shellStyles.kpiLabel}>{L("Son 24 Saat", "Last 24h")}</Text>
            <Text style={[shellStyles.kpiVal, { color: "#38bdf8" }]}>{auditStats.last24h}</Text>
          </View>
          <View style={shellStyles.kpiCard}>
            <Text style={shellStyles.kpiLabel}>{L("Yüksek Risk", "High Risk")}</Text>
            <Text style={[shellStyles.kpiVal, { color: "#ef4444" }]}>{auditStats.highRisk}</Text>
          </View>
          <View style={shellStyles.kpiCard}>
            <Text style={shellStyles.kpiLabel}>{L("Atama", "Assignment")}</Text>
            <Text style={[shellStyles.kpiVal, { color: "#22c55e" }]}>{auditStats.assignment}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Text style={shellStyles.cardText}>{L("Rol", "Role")}: {auditStats.role} • {L("Durum", "Status")}: {auditStats.status} • {L("Duyuru", "Announcement")}: {auditStats.announcement} • {L("Diğer", "Other")}: {auditStats.other}</Text>
        </View>
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Operasyon Notu Ekle", "Add Operation Note")}</Text>
        <TextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder={L("Saha notu, karar özeti veya vardiya bilgisi...", "Field note, decision summary or shift info...")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, paddingVertical: 10, textAlignVertical: "top", marginBottom: 8 }}
          multiline
        />
        <TouchableOpacity onPress={addCoordinatorNote} disabled={savingNote} style={{ borderRadius: 12, overflow: "hidden", opacity: savingNote ? 0.7 : 1 }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{savingNote ? L("EKLENİYOR...", "ADDING...") : L("NOT EKLE", "ADD NOTE")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Filtreler", "Filters")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["all", L("Tüm Roller", "All Roles")],
            ["coordinator", L("Yönetici", "Coordinator")],
            ["volunteer", L("Gönüllü", "Volunteer")],
            ["victim", L("Afetzede", "Victim")]
          ].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setRoleFilter(key as any)} style={{ borderRadius: 999, borderWidth: 1, borderColor: roleFilter === key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: roleFilter === key ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: roleFilter === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["all", L("Tüm Aksiyonlar", "All Actions")],
            ["assignment", L("Atama", "Assignment")],
            ["role", L("Rol", "Role")],
            ["status", L("Durum", "Status")],
            ["announcement", L("Duyuru", "Announcement")],
            ["other", L("Diğer", "Other")]
          ].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setActionFilter(key as any)} style={{ borderRadius: 999, borderWidth: 1, borderColor: actionFilter === key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: actionFilter === key ? "rgba(220,38,38,0.18)" : "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: actionFilter === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["all", L("Tüm Kayıtlar", "All Records")],
            ["request", L("Talep", "Request")],
            ["user", L("Kullanıcı", "User")],
            ["announcement", L("Duyuru", "Announcement")],
            ["donation", L("Bağış", "Donation")],
            ["inventory", L("Stok", "Stock")],
            ["note", L("Not", "Note")],
            ["system", L("Sistem", "System")]
          ].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setEntityFilter(key as any)} style={{ borderRadius: 999, borderWidth: 1, borderColor: entityFilter === key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: entityFilter === key ? "rgba(153,27,27,0.22)" : "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: entityFilter === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["all", L("Tüm Tarihler", "All Dates")],
            ["1", L("Son 24 Saat", "Last 24 Hours")],
            ["7", L("Son 7 Gün", "Last 7 Days")],
            ["30", L("Son 30 Gün", "Last 30 Days")]
          ].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setDayFilter(key as any)} style={{ borderRadius: 999, borderWidth: 1, borderColor: dayFilter === key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: dayFilter === key ? "rgba(127,29,29,0.22)" : "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: dayFilter === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={L("Aksiyon, kayıt tipi veya not ara...", "Search action, record type or note...")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10 }}
        />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => {
              setRoleFilter("all");
              setActionFilter("all");
              setEntityFilter("all");
              setDayFilter("all");
              setSearch("");
            }}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", height: 34, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("FİLTRELERİ TEMİZLE", "CLEAR FILTERS")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={exportJsonPreview}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(127,29,29,0.22)", height: 34, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("JSON ÖNİZLEME", "JSON PREVIEW")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[shellStyles.cardText, { marginTop: 8 }]}>{L("Toplam sonuç", "Total results")}: {filteredLogs.length}</Text>
      </View>

      {filteredLogs.map((log, idx) => {
        const t = getActionType(log);
        const color = t === "assignment" ? "#22c55e" : t === "role" ? "#fbbf24" : t === "status" ? "#ef4444" : t === "announcement" ? "#38bdf8" : "#94a3b8";
        const icon = t === "assignment" ? "person-add-outline" : t === "role" ? "shield-checkmark-outline" : t === "status" ? "flag-outline" : t === "announcement" ? "megaphone-outline" : "document-text-outline";
        const highRisk = isHighRiskLog(log);
        return (
          <View key={log.id} style={[shellStyles.card, highRisk && { borderColor: "rgba(239,68,68,0.45)", backgroundColor: "rgba(127,29,29,0.18)" }]}>
            {highRisk ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <Ionicons name="warning" size={12} color="#ef4444" />
                <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("YÜKSEK RİSK AKSİYON", "HIGH RISK ACTION")}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}33`, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Ionicons name={icon as any} size={16} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[shellStyles.cardTitle, { marginBottom: 2 }]}>{log.action || "İşlem"}</Text>
                <Text style={shellStyles.cardText}>{L("Rol", "Role")}: {log.actorRole || "-"} • UID: {log.actorId || "-"} • {L("Kayıt", "Record")}: {log.entityType || "-"} {log.entityId || ""}</Text>
                {!!log.note && <Text style={[shellStyles.cardText, { marginTop: 4 }]}>{log.note}</Text>}
                {!!log.diff && <Text style={[shellStyles.cardText, { marginTop: 4 }]}>Diff: {JSON.stringify(log.diff)}</Text>}
                {!!log.source && <Text style={[shellStyles.cardText, { marginTop: 4 }]}>{L("Kaynak", "Source")}: {log.source}{log.clientPlatform ? ` • ${log.clientPlatform}` : ""}</Text>}
                {!!log.createdAt && <Text style={[shellStyles.cardText, { marginTop: 4 }]}>{L("Zaman", "Time")}: {new Date(toMillis(log.createdAt)).toLocaleString(locale === "en" ? "en-US" : "tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>}
              </View>
            </View>
          </View>
        );
      })}
      {!filteredLogs.length ? <Text style={shellStyles.empty}>{L("Filtreye uygun hareket kaydı yok.", "No activity records match the filter.")}</Text> : null}
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorRolesScreen = () => {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<Array<{ id: string; fullName?: string; email?: string; role?: string; city?: string; volunteerStatus?: string; availability?: string }>>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "victim" | "volunteer" | "coordinator">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  useEffect(() => {
    const q = query(collection(db, "users_public"), orderBy("updatedAt", "desc"), limit(120));
    return onSnapshot(q, (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), (err) => {
      if (!isPermissionDenied(err)) showToast(L("Kullanıcı rolleri okunamadı.", "Could not load user roles."), "error");
    });
  }, [showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      const hay = `${u.fullName || ""} ${u.email || ""} ${u.city || ""} ${u.role || ""}`.toLocaleLowerCase("tr");
      return hay.includes(q);
    });
  }, [users, search, roleFilter]);

  const selected = filtered.find((u) => u.id === selectedId) || users.find((u) => u.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const updateUser = async (uid: string, patch: Record<string, any>, successMsg: string) => {
    try {
      setBusy(true);
      await updateDoc(doc(db, "users", uid), {
        ...patch,
        updatedAt: serverTimestamp()
      } as any);
      await upsertUserPublicDoc(uid, patch as any);
      await writeAuditLog(
        {
          action: "Rol güncellendi",
          entityType: "user",
          entityId: uid,
          note: "Kullanıcı rol/durum güncellemesi",
          diff: patch
        },
        user?.uid
      );
      showToast(successMsg, "success");
    } catch {
      showToast(L("Kullanıcı güncellenemedi. Firebase izinlerini kontrol edin.", "Could not update user. Check Firebase permissions."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModuleShell title={L("Kullanıcı & Rol Yönetimi", "User & Role Management")} subtitle={L("RBAC görünümü, rol atama ve gönüllü durum yönetimi", "RBAC view, role assignment and volunteer status management")}>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Rol Dağılımı", "Role Distribution")}</Text>
        <View style={shellStyles.kpiGrid}>
          {[
            [L("Afetzede", "Victim"), users.filter((u) => u.role === "victim").length],
            [L("Gönüllü", "Volunteer"), users.filter((u) => u.role === "volunteer").length],
            [L("Koordinatör", "Coordinator"), users.filter((u) => u.role === "coordinator").length],
            [L("Onay Bekleyen", "Pending Approval"), users.filter((u) => u.volunteerStatus === "submitted").length]
          ].map(([label, value]) => (
            <View key={String(label)} style={shellStyles.kpiCard}>
              <Text style={shellStyles.kpiLabel}>{label as any}</Text>
              <Text style={shellStyles.kpiVal}>{value as any}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Filtre ve Arama", "Filter & Search")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["all", L("Tümü", "All")],
            ["victim", L("Afetzede", "Victim")],
            ["volunteer", L("Gönüllü", "Volunteer")],
            ["coordinator", L("Koordinatör", "Coordinator")]
          ].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setRoleFilter(key as any)} style={{ borderRadius: 999, borderWidth: 1, borderColor: roleFilter === key ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: roleFilter === key ? "rgba(220,38,38,0.18)" : "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: roleFilter === key ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={L("Ad, e-posta veya şehir ara...", "Search name, email or city...")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10 }}
        />
      </View>
      {selected ? (
        <View style={shellStyles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Ionicons name="person-circle-outline" size={20} color="#fecaca" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{selected.fullName || L("Kullanıcı", "User")}</Text>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11 }}>{maskEmail(selected.email)} {selected.city ? `• ${selected.city}` : ""}</Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{selected.role || "-"}</Text>
            </View>
          </View>
          <Text style={[shellStyles.cardTitle, { fontSize: 12 }]}>{L("Rol Güncelle", "Update Role")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {[
              ["victim", L("Afetzede", "Victim")],
              ["volunteer", L("Gönüllü", "Volunteer")],
              ["coordinator", L("Koordinatör", "Coordinator")]
            ].map(([role, label]) => (
              <TouchableOpacity
                key={role}
                disabled={busy || selected.role === role}
                onPress={() => updateUser(selected.id, { role, isCoordinator: role === "coordinator" }, L(`Rol ${label} olarak güncellendi.`, `Role updated to ${label}.`))}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selected.role === role ? "rgba(34,197,94,0.28)" : "rgba(255,255,255,0.08)",
                  backgroundColor: selected.role === role ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.03)",
                  height: 34,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: busy ? 0.7 : 1
                }}
              >
                <Text style={{ color: selected.role === role ? "#bbf7d0" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {selected.role === "volunteer" ? (
            <>
              <Text style={[shellStyles.cardTitle, { fontSize: 12 }]}>{L("Gönüllü Durumu", "Volunteer Status")}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <TouchableOpacity disabled={busy} onPress={() => updateUser(selected.id, { volunteerStatus: "submitted" }, L("Gönüllü durumu onay bekleyen olarak güncellendi.", "Volunteer status updated to pending approval."))} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(249,168,37,0.24)", backgroundColor: "rgba(249,168,37,0.14)", height: 34, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fde68a", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("BEKLİYOR", "PENDING")}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => updateUser(selected.id, { volunteerStatus: "approved", isApprovedVolunteer: true, availability: "available" }, L("Gönüllü onaylandı ve aktif edildi.", "Volunteer approved and activated."))} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.24)", backgroundColor: "rgba(34,197,94,0.14)", height: 34, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#bbf7d0", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("ONAYLA", "APPROVE")}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => updateUser(selected.id, { volunteerStatus: "rejected", isApprovedVolunteer: false, availability: "offline" }, L("Gönüllü askıya alındı/reddedildi.", "Volunteer suspended/rejected."))} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.24)", backgroundColor: "rgba(239,68,68,0.14)", height: 34, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("ASKIYA AL", "SUSPEND")}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate("CoordinatorVolunteers")} style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", height: 36, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("DETAYLI GÖNÜLLÜ YÖNETİMİNE GİT", "GO TO DETAILED VOLUNTEER MANAGEMENT")}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ) : null}
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Kullanıcı Listesi", "User List")}</Text>
        {filtered.slice(0, 20).map((u) => (
          <TouchableOpacity key={u.id} onPress={() => setSelectedId(u.id)} style={{ borderRadius: 12, backgroundColor: selected?.id === u.id ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: selected?.id === u.id ? "rgba(248,113,113,0.24)" : "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Ionicons name="person-outline" size={16} color="#fecaca" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{u.fullName || L("Kullanıcı", "User")}</Text>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11 }}>{maskEmail(u.email)} {u.city ? `• ${u.city}` : ""} {u.role === "volunteer" && u.volunteerStatus ? `• ${u.volunteerStatus}` : ""}</Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{u.role || "-"}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {!filtered.length ? <Text style={shellStyles.empty}>{L("Filtreye uygun kullanıcı bulunamadı.", "No users found matching the filter.")}</Text> : null}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorSettingsScreen = () => {
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const settingsRef = doc(db, "system_settings", "coordinator_app");
  const [crisisMode, setCrisisMode] = useState(false);
  const [darkShell, setDarkShell] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [auditRetentionDays, setAuditRetentionDays] = useState("180");
  const [chatRetentionDays, setChatRetentionDays] = useState("90");
  const [maintenanceWindow, setMaintenanceWindow] = useState("Pazar 03:00 - 04:00");
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [opStats, setOpStats] = useState({
    requests: 0,
    users: 0,
    donations: 0,
    inventories: 0,
    announcements: 0
  });
  const [lastBackup, setLastBackup] = useState<{
    id: string;
    createdAt?: any;
    createdBy?: string | null;
    stats?: {
      requests?: number;
      users?: number;
      donations?: number;
      inventories?: number;
      announcements?: number;
    };
  } | null>(null);

  useEffect(() => {
    const off = onSnapshot(
      settingsRef,
      (snap) => {
        const data = (snap.data() || {}) as any;
        if (typeof data.crisisMode === "boolean") setCrisisMode(data.crisisMode);
        if (typeof data.darkShell === "boolean") setDarkShell(data.darkShell);
        if (typeof data.aiEnabled === "boolean") setAiEnabled(data.aiEnabled);
        if (typeof data.pushEnabled === "boolean") setPushEnabled(data.pushEnabled);
        if (typeof data.auditRetentionDays === "number") setAuditRetentionDays(String(data.auditRetentionDays));
        if (typeof data.chatRetentionDays === "number") setChatRetentionDays(String(data.chatRetentionDays));
        if (typeof data.maintenanceWindow === "string") setMaintenanceWindow(data.maintenanceWindow);
      },
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Sistem ayarları okunamadı.", "Could not load system settings."), "error");
      }
    );
    return off;
  }, [settingsRef, showToast]);

  useEffect(() => {
    const off = onSnapshot(
      query(collection(db, "system_backups"), orderBy("createdAt", "desc"), limit(1)),
      (snap) => {
        if (snap.empty) {
          setLastBackup(null);
          return;
        }
        const d = snap.docs[0];
        setLastBackup({ id: d.id, ...(d.data() as any) });
      },
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Yedek bilgisi okunamadı.", "Could not load backup info."), "error");
      }
    );
    return off;
  }, [showToast]);

  const persistToggle = async (key: "crisisMode" | "darkShell" | "aiEnabled" | "pushEnabled", value: boolean) => {
    try {
      await setDoc(settingsRef, {
        [key]: value,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null
      } as any, { merge: true });
      await writeAuditLog(
        {
          action: "Sistem ayarı güncellendi",
          entityType: "system",
          entityId: "coordinator_app",
          note: `${key} => ${String(value)}`,
          diff: { [key]: value }
        },
        user?.uid
      );
    } catch {
      showToast(L("Ayar kaydedilemedi. Firebase izinlerini kontrol edin.", "Could not save setting. Check Firebase permissions."), "error");
    }
  };

  const parsePositiveInt = (text: string, fallback: number) => {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  const saveAdvancedSettings = async () => {
    try {
      setSavingAdvanced(true);
      await setDoc(
        settingsRef,
        {
          auditRetentionDays: parsePositiveInt(auditRetentionDays, 180),
          chatRetentionDays: parsePositiveInt(chatRetentionDays, 90),
          maintenanceWindow: maintenanceWindow?.trim() || "Belirlenmedi",
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null
        } as any,
        { merge: true }
      );
      await writeAuditLog(
        {
          action: "Gelişmiş sistem ayarları güncellendi",
          entityType: "system",
          entityId: "coordinator_app",
          note: "Retention ve bakım penceresi güncellendi",
          diff: {
            auditRetentionDays: parsePositiveInt(auditRetentionDays, 180),
            chatRetentionDays: parsePositiveInt(chatRetentionDays, 90),
            maintenanceWindow: maintenanceWindow?.trim() || "Belirlenmedi"
          }
        },
        user?.uid
      );
      showToast(L("Gelişmiş ayarlar kaydedildi.", "Advanced settings saved."), "success");
    } catch {
      showToast(L("Gelişmiş ayarlar kaydedilemedi.", "Could not save advanced settings."), "error");
    } finally {
      setSavingAdvanced(false);
    }
  };

  const refreshOperationStats = async () => {
    try {
      setSnapshotRefreshing(true);
      const [reqSnap, userSnap, donationSnap, inventorySnap, annSnap] = await Promise.all([
        getDocs(query(collection(db, "requests"), limit(500))),
        getDocs(query(collection(db, "users_public"), limit(500))),
        getDocs(query(collection(db, "donations"), limit(500))),
        getDocs(query(collection(db, "inventories"), limit(500))),
        getDocs(query(collection(db, "announcements"), limit(500)))
      ]);
      setOpStats({
        requests: reqSnap.size,
        users: userSnap.size,
        donations: donationSnap.size,
        inventories: inventorySnap.size,
        announcements: annSnap.size
      });
    } catch {
      showToast(L("Operasyon özeti alınamadı. Firebase izinlerini kontrol edin.", "Could not load operation summary. Check Firebase permissions."), "error");
    } finally {
      setSnapshotRefreshing(false);
    }
  };

  useEffect(() => {
    refreshOperationStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBackupSnapshot = async () => {
    try {
      setBackupSaving(true);
      await addDoc(collection(db, "system_backups"), {
        stats: opStats,
        settings: {
          crisisMode,
          darkShell,
          aiEnabled,
          pushEnabled,
          auditRetentionDays: parsePositiveInt(auditRetentionDays, 180),
          chatRetentionDays: parsePositiveInt(chatRetentionDays, 90),
          maintenanceWindow: maintenanceWindow?.trim() || "Belirlenmedi"
        },
        createdBy: user?.uid || null,
        createdAt: serverTimestamp()
      } as any);
      await writeAuditLog(
        {
          action: "Sistem yedek snapshot oluşturuldu",
          entityType: "system",
          entityId: "backup",
          note: `Snapshot metrikleri: talepler ${opStats.requests}, kullanıcılar ${opStats.users}`,
          diff: { stats: opStats }
        },
        user?.uid
      );
      showToast(L("Anlık yedek snapshot oluşturuldu.", "Instant backup snapshot created."), "success");
    } catch {
      showToast(L("Yedek snapshot oluşturulamadı.", "Could not create backup snapshot."), "error");
    } finally {
      setBackupSaving(false);
    }
  };

  const rows = [
    [L("Kriz Modu Varsayılanı", "Crisis Mode Default"), crisisMode, (v: boolean) => { setCrisisMode(v); persistToggle("crisisMode", v); }],
    [L("Koyu Kırmızı Tema", "Dark Red Theme"), darkShell, (v: boolean) => { setDarkShell(v); persistToggle("darkShell", v); }],
    [L("AI Yardımcı Servisi", "AI Assistant Service"), aiEnabled, (v: boolean) => { setAiEnabled(v); persistToggle("aiEnabled", v); }],
    [L("Push Bildirimleri", "Push Notifications"), pushEnabled, (v: boolean) => { setPushEnabled(v); persistToggle("pushEnabled", v); }]
  ] as const;

  return (
    <ModuleShell title={L("Sistem Ayarları", "System Settings")} subtitle={L("Tema, servis bağlantıları ve operasyon davranışları (kalıcı kayıt aktif)", "Theme, service connections and operation behaviors (persistent save active)")}>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Genel Ayarlar", "General Settings")}</Text>
        {rows.map(([label, value, setter]) => (
          <TouchableOpacity key={label} onPress={() => setter(!value)} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{label}</Text>
            <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: value ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.09)", borderWidth: 1, borderColor: value ? "rgba(248,113,113,0.24)" : "rgba(255,255,255,0.08)", padding: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: value ? "#ef4444" : "#f8fafc", alignSelf: value ? "flex-end" : "flex-start" }} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Veri Saklama ve Bakım", "Data Retention & Maintenance")}</Text>
        <TextInput
          value={auditRetentionDays}
          onChangeText={setAuditRetentionDays}
          keyboardType="number-pad"
          placeholder={L("Audit saklama (gün)", "Audit retention (days)")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }}
        />
        <TextInput
          value={chatRetentionDays}
          onChangeText={setChatRetentionDays}
          keyboardType="number-pad"
          placeholder={L("Chat saklama (gün)", "Chat retention (days)")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }}
        />
        <TextInput
          value={maintenanceWindow}
          onChangeText={setMaintenanceWindow}
          placeholder={L("Bakım penceresi (örn: Pazar 03:00 - 04:00)", "Maintenance window (e.g. Sunday 03:00 - 04:00)")}
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }}
        />
        <TouchableOpacity onPress={saveAdvancedSettings} disabled={savingAdvanced} style={{ borderRadius: 12, overflow: "hidden", opacity: savingAdvanced ? 0.75 : 1 }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{savingAdvanced ? L("KAYDEDİLİYOR...", "SAVING...") : L("GELİŞMİŞ AYARLARI KAYDET", "SAVE ADVANCED SETTINGS")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={shellStyles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={shellStyles.cardTitle}>{L("Operasyon Özeti (Canlı Snapshot)", "Operation Summary (Live Snapshot)")}</Text>
          <TouchableOpacity
            onPress={refreshOperationStats}
            disabled={snapshotRefreshing}
            style={{ borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{snapshotRefreshing ? L("YENİLENİYOR...", "REFRESHING...") : L("YENİLE", "REFRESH")}</Text>
          </TouchableOpacity>
        </View>
        <View style={shellStyles.kpiGrid}>
          <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Talepler", "Requests")}</Text><Text style={shellStyles.kpiVal}>{opStats.requests}</Text></View>
          <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Kullanıcılar", "Users")}</Text><Text style={shellStyles.kpiVal}>{opStats.users}</Text></View>
          <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Bağışlar", "Donations")}</Text><Text style={shellStyles.kpiVal}>{opStats.donations}</Text></View>
          <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Stok Kayıtları", "Stock Records")}</Text><Text style={shellStyles.kpiVal}>{opStats.inventories}</Text></View>
        </View>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 10, marginTop: 8 }}>
          <Text style={shellStyles.cardText}>{L("Duyurular", "Announcements")}: {opStats.announcements}</Text>
          <Text style={shellStyles.cardText}>{L("Son yedek", "Last backup")}: {lastBackup ? new Date(toMillis(lastBackup.createdAt) || Date.now()).toLocaleString(locale === "en" ? "en-US" : "tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : L("Henüz yok", "None yet")}</Text>
          <Text style={shellStyles.cardText}>{L("Yedekleyen UID", "Backup UID")}: {lastBackup?.createdBy || "-"}</Text>
        </View>
        <TouchableOpacity onPress={createBackupSnapshot} disabled={backupSaving} style={{ borderRadius: 12, overflow: "hidden", opacity: backupSaving ? 0.75 : 1, marginTop: 10 }}>
          <LinearGradient colors={["#7f1d1d", "#ef4444"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{backupSaving ? L("OLUŞTURULUYOR...", "CREATING...") : L("ANLIK YEDEK SNAPSHOT OLUŞTUR", "CREATE INSTANT BACKUP SNAPSHOT")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Servis Sağlık Durumu", "Service Health Status")}</Text>
        {[
          ["Firebase", L("Aktif", "Active"), "#22c55e"],
          [L("Push Servisi", "Push Service"), pushEnabled ? L("Açık", "On") : L("Kapalı", "Off"), pushEnabled ? "#22c55e" : "#94a3b8"],
          [L("SMS Servisi", "SMS Service"), crisisMode ? L("Kriz modunda öncelikli", "Priority in crisis mode") : L("Pasif", "Passive"), crisisMode ? "#f59e0b" : "#94a3b8"],
          [L("AI Servisi", "AI Service"), aiEnabled ? L("Açık", "On") : L("Kapalı", "Off"), aiEnabled ? "#3b82f6" : "#94a3b8"]
        ].map(([name, state, color]) => (
          <View key={String(name)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color as string, marginRight: 8 }} />
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{name as any}</Text>
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>{state as any}</Text>
          </View>
        ))}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorDonationsScreen = () => {
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [rows, setRows] = useState<Array<{ id: string; donorName?: string; type?: "cash" | "in_kind"; amount?: number; quantity?: number; status?: string; note?: string; createdAt?: any }>>([]);
  const [donorName, setDonorName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [type, setType] = useState<"cash" | "in_kind">("cash");
  const [status, setStatus] = useState<"success" | "pending" | "suspicious">("success");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const off = onSnapshot(
      query(collection(db, "donations"), orderBy("createdAt", "desc"), limit(160)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Bağış verileri okunamadı.", "Could not load donation data."), "error");
      }
    );
    return off;
  }, [showToast]);

  const isSameDay = (ms: number) => {
    const d1 = new Date(ms);
    const d2 = new Date();
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  };

  const todayCash = rows
    .filter((r) => (r.type || "cash") === "cash" && toMillis(r.createdAt) && isSameDay(toMillis(r.createdAt)))
    .reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const inKindCount = rows.filter((r) => (r.type || "cash") === "in_kind").length;
  const suspicious = rows.filter((r) => (r.status || "") === "suspicious").length;
  const bigDonations = rows.filter((r) => Number(r.amount || 0) >= 10000).length;

  const saveDonation = async () => {
    const amount = Number(amountText || 0);
    if (!donorName.trim()) {
      showToast(L("Bağışçı adı girin.", "Enter donor name."), "error");
      return;
    }
    if (type === "cash" && (!amount || amount <= 0)) {
      showToast(L("Nakit bağış için geçerli tutar girin.", "Enter a valid amount for cash donation."), "error");
      return;
    }
    try {
      setSaving(true);
      await addDoc(collection(db, "donations"), {
        donorName: donorName.trim(),
        type,
        amount: type === "cash" ? amount : 0,
        quantity: type === "in_kind" ? Math.max(1, amount || 1) : 0,
        status,
        note: type === "in_kind" ? "Ayni bağış" : "Nakit bağış",
        createdBy: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      } as any);
      await writeAuditLog(
        {
          action: "Bağış kaydı oluşturuldu",
          entityType: "donation",
          entityId: donorName.trim(),
          note: `${type === "cash" ? "Nakit" : "Ayni"} • durum: ${status}`,
          diff: {
            donorName: donorName.trim(),
            type,
            amount: type === "cash" ? amount : 0,
            quantity: type === "in_kind" ? Math.max(1, amount || 1) : 0,
            status
          }
        },
        user?.uid
      );
      setDonorName("");
      setAmountText("");
      showToast(L("Bağış kaydı eklendi.", "Donation record added."), "success");
    } catch {
      showToast(L("Bağış kaydı eklenemedi. Firebase izinlerini kontrol edin.", "Could not add donation record. Check Firebase permissions."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleShell title={L("Bağış Yönetimi", "Donation Management")} subtitle={L("Para ve ayni bağışlar için canlı kayıt ve operasyon takibi", "Live recording and operation tracking for cash and in-kind donations")}>
      <View style={shellStyles.kpiGrid}>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Bugünkü Bağış", "Today's Donations")}</Text><Text style={shellStyles.kpiVal}>₺ {todayCash.toLocaleString(locale === "en" ? "en-US" : "tr-TR")}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Ayni Bağış", "In-Kind Donations")}</Text><Text style={shellStyles.kpiVal}>{inKindCount}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Şüpheli İşlem", "Suspicious Transaction")}</Text><Text style={shellStyles.kpiVal}>{suspicious}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Büyük Bağış", "Large Donation")}</Text><Text style={shellStyles.kpiVal}>{bigDonations}</Text></View>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Yeni Bağış Kaydı", "New Donation Record")}</Text>
        <TextInput value={donorName} onChangeText={setDonorName} placeholder={L("Bağışçı adı", "Donor name")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <TextInput value={amountText} onChangeText={setAmountText} keyboardType="number-pad" placeholder={type === "cash" ? L("Tutar (TL)", "Amount (TL)") : L("Miktar", "Quantity")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {[
            ["cash", L("Nakit", "Cash")],
            ["in_kind", L("Ayni", "In-Kind")]
          ].map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setType(k as any)} style={{ flex: 1, height: 34, borderRadius: 10, borderWidth: 1, borderColor: type === k ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: type === k ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: type === k ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {[
            ["success", L("Başarılı", "Successful")],
            ["pending", L("Beklemede", "Pending")],
            ["suspicious", L("Şüpheli", "Suspicious")]
          ].map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setStatus(k as any)} style={{ flex: 1, height: 34, borderRadius: 10, borderWidth: 1, borderColor: status === k ? "rgba(248,113,113,0.22)" : "rgba(255,255,255,0.08)", backgroundColor: status === k ? "rgba(127,29,29,0.22)" : "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: status === k ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={saveDonation} disabled={saving} style={{ borderRadius: 12, overflow: "hidden", opacity: saving ? 0.7 : 1 }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{saving ? L("KAYDEDİLİYOR...", "SAVING...") : L("BAĞIŞ KAYDET", "SAVE DONATION")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Bağış Listesi (Canlı)", "Donation List (Live)")}</Text>
        {rows.map((row) => (
          <View key={row.id} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{row.donorName || L("Bağışçı", "Donor")}</Text>
            <Text style={shellStyles.cardText}>
              {(row.type || "cash") === "cash" ? `${L("Nakit", "Cash")} • ₺ ${Number(row.amount || 0).toLocaleString(locale === "en" ? "en-US" : "tr-TR")}` : `${L("Ayni", "In-Kind")} • ${Number(row.quantity || 0)} ${L("adet", "units")}`}
              {" • "}
              {L("Durum", "Status")}: {row.status || "success"}
            </Text>
          </View>
        ))}
        {!rows.length ? <Text style={shellStyles.empty}>{L("Henüz bağış kaydı yok.", "No donation records yet.")}</Text> : null}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorInventoryScreen = () => {
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [rows, setRows] = useState<Array<{ id: string; name?: string; category?: string; quantity?: number; criticalLevel?: number; depotName?: string; location?: string; updatedAt?: any }>>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [criticalText, setCriticalText] = useState("");
  const [depotName, setDepotName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const off = onSnapshot(
      query(collection(db, "inventories"), orderBy("updatedAt", "desc"), limit(200)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Stok verileri okunamadı.", "Could not load stock data."), "error");
      }
    );
    return off;
  }, [showToast]);

  const depots = Array.from(new Set(rows.map((r) => r.depotName || L("Depo Yok", "No Depot"))));
  const criticalCount = rows.filter((r) => Number(r.quantity || 0) <= Number(r.criticalLevel || 0)).length;

  const saveStock = async () => {
    const quantity = Number(quantityText || 0);
    const criticalLevel = Number(criticalText || 0);
    if (!name.trim()) return showToast(L("Ürün adı girin.", "Enter product name."), "error");
    if (quantity < 0 || criticalLevel < 0) return showToast(L("Miktar alanları 0 veya daha büyük olmalı.", "Quantity fields must be 0 or greater."), "error");
    try {
      setSaving(true);
      await addDoc(collection(db, "inventories"), {
        name: name.trim(),
        category: category.trim() || "Genel",
        quantity,
        criticalLevel,
        depotName: depotName.trim() || "Merkez Depo",
        location: depotName.trim() || "Merkez",
        updatedBy: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      } as any);
      await writeAuditLog(
        {
          action: "Stok kaydı oluşturuldu",
          entityType: "inventory",
          entityId: name.trim(),
          note: `${depotName.trim() || "Merkez Depo"} deposuna stok eklendi`,
          diff: {
            name: name.trim(),
            category: category.trim() || "Genel",
            quantity,
            criticalLevel,
            depotName: depotName.trim() || "Merkez Depo"
          }
        },
        user?.uid
      );
      setName("");
      setCategory("");
      setQuantityText("");
      setCriticalText("");
      setDepotName("");
      showToast(L("Stok kaydı eklendi.", "Stock record added."), "success");
    } catch {
      showToast(L("Stok kaydı eklenemedi. Firebase izinlerini kontrol edin.", "Could not add stock record. Check Firebase permissions."), "error");
    } finally {
      setSaving(false);
    }
  };

  const adjustQty = async (id: string, current: number, delta: number) => {
    try {
      const next = Math.max(0, current + delta);
      await updateDoc(doc(db, "inventories", id), {
        quantity: next,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null
      } as any);
      await writeAuditLog(
        {
          action: "Stok miktarı güncellendi",
          entityType: "inventory",
          entityId: id,
          note: `Stok ${delta > 0 ? "artırıldı" : "azaltıldı"}`,
          diff: { previous: current, next, delta }
        },
        user?.uid
      );
    } catch {
      showToast(L("Stok güncellenemedi.", "Could not update stock."), "error");
    }
  };

  return (
    <ModuleShell title={L("Stok & Depo Yönetimi", "Stock & Warehouse Management")} subtitle={L("Depo kapasitesi, kritik stok ve canlı ürün akışı", "Warehouse capacity, critical stock and live product flow")}>
      <View style={shellStyles.kpiGrid}>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Toplam Ürün", "Total Products")}</Text><Text style={shellStyles.kpiVal}>{rows.length}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Depo Sayısı", "Warehouses")}</Text><Text style={shellStyles.kpiVal}>{depots.length}</Text></View>
        <View style={shellStyles.kpiCard}><Text style={shellStyles.kpiLabel}>{L("Kritik Ürün", "Critical Products")}</Text><Text style={shellStyles.kpiVal}>{criticalCount}</Text></View>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Yeni Stok Kaydı", "New Stock Record")}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={L("Ürün adı", "Product name")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <TextInput value={category} onChangeText={setCategory} placeholder={L("Kategori (örn: Gıda)", "Category (e.g. Food)")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TextInput value={quantityText} onChangeText={setQuantityText} keyboardType="number-pad" placeholder={L("Miktar", "Quantity")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10 }} />
          <TextInput value={criticalText} onChangeText={setCriticalText} keyboardType="number-pad" placeholder={L("Kritik seviye", "Critical level")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10 }} />
        </View>
        <TextInput value={depotName} onChangeText={setDepotName} placeholder={L("Depo adı", "Warehouse name")} placeholderTextColor="rgba(255,255,255,0.45)" style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", fontFamily: "Inter", paddingHorizontal: 10, marginBottom: 8 }} />
        <TouchableOpacity onPress={saveStock} disabled={saving} style={{ borderRadius: 12, overflow: "hidden", opacity: saving ? 0.7 : 1 }}>
          <LinearGradient colors={["#b11226", "#e63946"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{saving ? L("KAYDEDİLİYOR...", "SAVING...") : L("STOK KAYDET", "SAVE STOCK")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Depolar ve Stoklar (Canlı)", "Warehouses & Stock (Live)")}</Text>
        {rows.map((x) => {
          const isCritical = Number(x.quantity || 0) <= Number(x.criticalLevel || 0);
          return (
            <View key={x.id} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: isCritical ? "rgba(248,113,113,0.24)" : "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{x.name || L("Ürün", "Product")}</Text>
                <View style={{ borderRadius: 999, borderWidth: 1, borderColor: isCritical ? "rgba(248,113,113,0.28)" : "rgba(34,197,94,0.24)", backgroundColor: isCritical ? "rgba(239,68,68,0.16)" : "rgba(34,197,94,0.14)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: isCritical ? "#fecaca" : "#bbf7d0", fontFamily: "Inter-Bold", fontSize: 10 }}>{isCritical ? L("KRİTİK", "CRITICAL") : L("NORMAL", "NORMAL")}</Text>
                </View>
              </View>
              <Text style={shellStyles.cardText}>{x.category || L("Genel", "General")} • {x.depotName || L("Depo Yok", "No Depot")} • {L("Miktar", "Qty")}: {Number(x.quantity || 0)} • {L("Kritik", "Critical")}: {Number(x.criticalLevel || 0)}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => adjustQty(x.id, Number(x.quantity || 0), -10)} style={{ flex: 1, height: 32, borderRadius: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(127,29,29,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>-10</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => adjustQty(x.id, Number(x.quantity || 0), 10)} style={{ flex: 1, height: 32, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", backgroundColor: "rgba(20,83,45,0.28)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#bbf7d0", fontFamily: "Inter-Bold", fontSize: 11 }}>+10</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        {!rows.length ? <Text style={shellStyles.empty}>{L("Henüz stok kaydı yok.", "No stock records yet.")}</Text> : null}
      </View>
    </ModuleShell>
  );
};

// COORD-CENTER-MODULE: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
export const CoordinatorAssignmentsScreen = () => {
  const [requests, setRequests] = useState<Req[]>([]);
  const [vols, setVols] = useState<Array<{ id: string; fullName?: string; city?: string; availability?: string; skills?: string[] }>>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  useEffect(() => {
    const unsubReq = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }, (err) => {
      if (!isPermissionDenied(err)) showToast(L("Görev atama verileri okunamadı.", "Could not load assignment data."), "error");
    });
    const unsubVol = onSnapshot(
      query(collection(db, "users_public"), limit(180)),
      (snap) => {
        setVols(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        );
      },
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Gönüllü verileri okunamadı.", "Could not load volunteer data."), "error");
      }
    );
    return () => { unsubReq(); unsubVol(); };
  }, [showToast]);
  const openReqs = requests.filter((r) => (r.status || "open") === "open").slice(0, 8);
  const available = vols.filter((v) => v.availability !== "offline");
  const loadMap = useMemo(() => {
    const out: Record<string, number> = {};
    requests.forEach((r) => {
      const status = `${r.status || "open"}`.toLowerCase();
      if (!["assigned", "in_progress", "open"].includes(status)) return;
      const assigned = (r as any).assignedVolunteerId as string | undefined;
      if (!assigned) return;
      out[assigned] = (out[assigned] || 0) + 1;
    });
    return out;
  }, [requests]);

  const norm = (v?: string) => `${v || ""}`.toLocaleLowerCase("tr");
  const urgencyScore = (urgency?: string) => {
    const u = norm(urgency);
    if (u.includes("acil") || u.includes("yüksek") || u.includes("yuksek")) return 30;
    if (u.includes("orta")) return 18;
    return 10;
  };
  const scoreVolunteer = (v: { id: string; city?: string; availability?: string; skills?: string[] }, r: Req) => {
    let score = urgencyScore((r as any).urgency);
    const details: string[] = [];

    const av = norm(v.availability || "available");
    if (av === "available") {
      score += 35;
      details.push("müsait");
    } else if (av === "busy") {
      score += 12;
      details.push("kısmi müsait");
    } else {
      score -= 100;
      details.push("offline");
    }

    const reqCity = norm((r as any).city || (r as any).locationLabel);
    const volCity = norm(v.city);
    if (reqCity && volCity && reqCity.includes(volCity)) {
      score += 24;
      details.push("şehir eşleşmesi");
    }

    const demandText = `${norm((r as any).type)} ${norm((r as any).description)}`;
    const skillHits = (v.skills || []).filter((s) => demandText.includes(norm(s))).length;
    if (skillHits > 0) {
      const plus = Math.min(28, skillHits * 10);
      score += plus;
      details.push(`yetkinlik +${plus}`);
    }

    const currentLoad = loadMap[v.id] || 0;
    if (currentLoad > 0) {
      const penalty = Math.min(30, currentLoad * 8);
      score -= penalty;
      details.push(`yük -${penalty}`);
    }

    return { score: Math.max(0, Math.round(score)), details: details.join(" • "), currentLoad };
  };

  const assignManual = async (
    req: Req,
    v: { id: string; fullName?: string },
    score: number
  ) => {
    if (!req?.id) return;
    const busy = `${req.id}:${v.id}`;
    try {
      setBusyKey(busy);
      const existingTimeline = Array.isArray((req as any).timeline) ? ((req as any).timeline as any[]) : [];
      const timeline = [
        ...existingTimeline,
        {
          step: "coordinator_assigned",
          at: Date.now(),
          by: "coordinator",
          volunteerId: v.id,
          note: `Skor ${score} ile atama`
        }
      ];
      await assignVolunteerViaApi(req.id, v.id);
      await updateDoc(doc(db, "requests", req.id), {
        updatedAt: serverTimestamp(),
        timeline
      } as any);

      // Paket 10: atama sonrası otomatik operasyon sohbet kanalı
      try {
        const requestId = req.id;
        const volunteerId = v.id;
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
          senderRole: "coordinator",
          text: `Talep ${v.fullName || volunteerId} kullanıcısına atandı.`,
          system: true,
          createdAt: serverTimestamp()
        } as any);
      } catch {
        // sohbet kanalı açılamasa da atama başarısı etkilenmez
      }

      await writeAuditLog(
        {
          action: "Gönüllü göreve atandı",
          entityType: "request",
          entityId: req.id,
          note: `${v.fullName || v.id} • skor ${score}`,
          diff: { assignedVolunteerId: v.id, status: "assigned", score }
        },
        user?.uid
      );

      showToast(`${L("Talep", "Request")} ${v.fullName || L("gönüllü", "volunteer")} ${L("kullanıcısına atandı.", "has been assigned.")}`, "success");
    } catch (e: any) {
      showToast(e?.message || L("Atama yazılamadı. Firebase izinlerini kontrol edin.", "Could not write assignment. Check Firebase permissions."), "error");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ModuleShell title={L("Görev Atama Motoru", "Task Assignment Engine")} subtitle={L("Yakınlık, uzmanlık ve yük dengesine göre öneri listesi (V1 öneri + manuel override)", "Suggestion list by proximity, expertise and load balance (V1 suggestion + manual override)")}>
      <View style={shellStyles.card}>
        <Text style={shellStyles.cardTitle}>{L("Skorlama Modeli", "Scoring Model")}</Text>
        <Text style={shellStyles.cardText}>{L("Skor = Aciliyet + Müsaitlik + Şehir Eşleşmesi + Yetkinlik Eşleşmesi - Mevcut Yük", "Score = Urgency + Availability + City Match + Skills Match - Current Load")}</Text>
      </View>
      {openReqs.map((r) => {
        const recs = available
          .map((v) => ({ volunteer: v, rec: scoreVolunteer(v, r) }))
          .sort((a, b) => b.rec.score - a.rec.score)
          .slice(0, 3);
        return (
          <View key={r.id} style={shellStyles.card}>
            <Text style={shellStyles.cardTitle}>{r.type || L("Talep", "Request")} • {(r.urgency || L("Normal", "Normal"))}</Text>
            <Text style={shellStyles.cardText}>{r.description || L("Açıklama yok.", "No description.")}</Text>
            <Text style={[shellStyles.cardTitle, { marginTop: 10, fontSize: 12 }]}>{L("Önerilen Gönüllüler", "Suggested Volunteers")}</Text>
            {recs.map(({ volunteer: v, rec }, idx) => (
              <View key={`${r.id}-${v.id}`} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 9, marginTop: 6, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.14)", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                  <Text style={{ color: "#bfdbfe", fontFamily: "Inter-Bold", fontSize: 11 }}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{v.fullName || L("Gönüllü", "Volunteer")}</Text>
                  <Text style={shellStyles.cardText}>{v.city || "-"} • {(v.skills || []).slice(0, 2).join(", ") || L("Genel", "General")} • {v.availability || "available"}</Text>
                  <Text style={[shellStyles.cardText, { marginTop: 2 }]}>{L("Skor", "Score")}: {rec.score} • {rec.details || L("standart uygunluk", "standard match")}</Text>
                </View>
                <View style={{ alignItems: "flex-end", marginRight: 8 }}>
                  <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", backgroundColor: "rgba(34,197,94,0.14)", paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: "#bbf7d0", fontFamily: "Inter-Bold", fontSize: 10 }}>{rec.score}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  disabled={busyKey === `${r.id}:${v.id}`}
                  onPress={() => assignManual(r, v, rec.score)}
                  style={{ borderRadius: 10, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.18)", paddingHorizontal: 10, paddingVertical: 6, opacity: busyKey === `${r.id}:${v.id}` ? 0.65 : 1 }}
                >
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>
                    {busyKey === `${r.id}:${v.id}` ? L("ATANIYOR...", "ASSIGNING...") : L("ATA", "ASSIGN")}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      })}
      {!openReqs.length && <View style={shellStyles.card}><Text style={shellStyles.empty}>{L("Atama bekleyen açık talep yok.", "No open requests awaiting assignment.")}</Text></View>}
    </ModuleShell>
  );
};
