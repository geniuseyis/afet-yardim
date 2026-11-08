import {
  React,
  useEffect,
  useMemo,
  useState,
  Animated,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  useNavigation,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  db,
  useStore
} from "../shared/ScreenDeps";
import { maskEmail, maskPhone } from "../../utils/privacy";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { l } from "../../services/i18n";

/**
 * COORD-VOL DOSYA HARITASI
 * - COORD-VOL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - COORD-VOL-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - COORD-VOL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - COORD-VOL-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type VolunteerRow = {
  id: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  district?: string;
  regionId?: string;
  volunteerStatus?: "not_started" | "draft" | "submitted" | "approved" | "rejected";
  availability?: "available" | "busy" | "offline";
  skillLevel?: "beginner" | "intermediate" | "expert";
  skills?: string[];
  interests?: string[];
  motivation?: string;
  onboardingCompletedAt?: any;
  updatedAt?: any;
};

type ReqLite = {
  id: string;
  type?: string;
  status?: string;
  assignedVolunteerId?: string;
  createdAt?: any;
  updatedAt?: any;
};

type AppLite = {
  id: string;
  volunteerId?: string;
  requestId?: string;
  status?: string;
  createdAt?: any;
};

const V_STATUS_LABEL: Record<string, string> = {
  not_started: "Başlamadı",
  draft: "Taslak",
  submitted: "Onay Bekliyor",
  approved: "Aktif",
  rejected: "Reddedildi"
};

const AVAIL_LABEL: Record<string, string> = {
  available: "Müsait",
  busy: "Görevde",
  offline: "Pasif"
};

const skillLabel = (level?: string) =>
  level === "expert" ? "Uzman" : level === "intermediate" ? "Orta" : level === "beginner" ? "Başlangıç" : "-";

const isPermissionDenied = (err: any) =>
  String(err?.code || "").includes("permission-denied") ||
  String(err?.message || "").toLowerCase().includes("permission");

const toMs = (v: any) => (typeof v?.toMillis === "function" ? v.toMillis() : typeof v?.seconds === "number" ? v.seconds * 1000 : Number(v) || 0);

export const CoordinatorVolunteerManagementScreen = () => {
  const navigation = useNavigation<any>();
  const showToast = useStore((s) => s.showToast);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [rows, setRows] = useState<VolunteerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [segment, setSegment] = useState<"pending" | "active" | "suspended">("pending");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<ReqLite[]>([]);
  const [applications, setApplications] = useState<AppLite[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // COORD-VOL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const goBackSafe = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    try { navigation.goBack(); } catch {}
  };

  // COORD-VOL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const q = query(collection(db, "users_public"), limit(320));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        );
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        if (!isPermissionDenied(err)) {
          console.warn("[coordinator volunteers] snapshot:", err);
        }
        setLoading(false);
        setRefreshing(false);
        if (!isPermissionDenied(err)) {
          showToast(L("Gönüllü verileri yüklenemedi.", "Volunteer data could not be loaded."), "error");
        }
      }
    );
    return unsub;
  }, [showToast]);

  // COORD-VOL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const offReq = onSnapshot(
      query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(320)),
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Görev geçmişi yüklenemedi.", "Task history could not be loaded."), "error");
      }
    );
    const offApps = onSnapshot(
      query(collection(db, "volunteerApplications"), orderBy("createdAt", "desc"), limit(320)),
      (snap) => setApplications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => {
        if (!isPermissionDenied(err)) showToast(L("Başvuru geçmişi yüklenemedi.", "Application history could not be loaded."), "error");
      }
    );
    return () => {
      offReq();
      offApps();
    };
  }, [showToast]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const key = (r.city || r.regionId || "").trim();
      if (key) set.add(key);
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "tr"))];
  }, [rows]);

  // COORD-VOL-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("tr");
    return rows.filter((r) => {
      const status = (r.volunteerStatus || "approved") as string;
      const inSegment =
        segment === "pending"
          ? status === "submitted"
          : segment === "active"
            ? status === "approved"
            : status === "rejected" || r.availability === "offline";
      if (!inSegment) return false;
      if (regionFilter !== "all" && (r.city || r.regionId) !== regionFilter) return false;
      if (!normalized) return true;
      const hay = `${r.fullName || r.name || ""} ${r.city || ""} ${r.email || ""} ${(r.skills || []).join(" ")}`.toLocaleLowerCase("tr");
      return hay.includes(normalized);
    });
  }, [rows, segment, search, regionFilter]);

  // COORD-VOL-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const selected = filtered.find((x) => x.id === selectedId) || rows.find((x) => x.id === selectedId) || filtered[0] || null;
  const bulkRows = useMemo(() => filtered.filter((r) => selectedIds.includes(r.id)), [filtered, selectedIds]);
  const selectedRequests = useMemo(() => {
    if (!selected?.id) return [];
    return requests
      .filter((r) => r.assignedVolunteerId === selected.id)
      .sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));
  }, [requests, selected?.id]);
  const selectedApps = useMemo(() => {
    if (!selected?.id) return [];
    return applications
      .filter((a) => a.volunteerId === selected.id)
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  }, [applications, selected?.id]);

  useEffect(() => {
    if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  // COORD-VOL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filtered.map((x) => x.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // COORD-VOL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const setVolunteerState = async (row: VolunteerRow, nextStatus: VolunteerRow["volunteerStatus"], nextAvailability?: VolunteerRow["availability"]) => {
    try {
      await updateDoc(doc(db, "users", row.id), {
        volunteerStatus: nextStatus,
        ...(nextAvailability ? { availability: nextAvailability } : {}),
        updatedAt: serverTimestamp()
      } as any);
      await upsertUserPublicDoc(row.id, {
        ...row,
        volunteerStatus: nextStatus,
        ...(nextAvailability ? { availability: nextAvailability } : {})
      });
      showToast(
        nextStatus === "approved"
          ? "Gönüllü başvurusu onaylandı."
          : nextStatus === "rejected"
            ? "Gönüllü başvurusu reddedildi."
            : "Gönüllü durumu güncellendi.",
        "success"
      );
    } catch (e) {
      console.warn("[coordinator volunteers] update:", e);
      showToast("Gönüllü durumu güncellenemedi. Yetki/rules kontrol edin.", "error");
    }
  };

  // COORD-VOL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const bulkSetVolunteerState = async (nextStatus: VolunteerRow["volunteerStatus"], nextAvailability?: VolunteerRow["availability"]) => {
    if (!bulkRows.length) {
      showToast("Toplu işlem için en az bir gönüllü seçin.", "info");
      return;
    }
    try {
      const result = await Promise.allSettled(
        bulkRows.map(async (row) => {
          await updateDoc(doc(db, "users", row.id), {
            volunteerStatus: nextStatus,
            ...(nextAvailability ? { availability: nextAvailability } : {}),
            updatedAt: serverTimestamp()
          } as any);
          await upsertUserPublicDoc(row.id, {
            ...row,
            volunteerStatus: nextStatus,
            ...(nextAvailability ? { availability: nextAvailability } : {})
          });
        })
      );
      const ok = result.filter((r) => r.status === "fulfilled").length;
      const fail = result.length - ok;
      showToast(
        fail ? `Toplu işlem tamamlandı: ${ok} başarılı, ${fail} başarısız.` : `${ok} gönüllü için toplu işlem tamamlandı.`,
        fail ? "info" : "success"
      );
      setSelectedIds([]);
    } catch (e) {
      console.warn("[coordinator volunteers] bulk update:", e);
      showToast("Toplu işlem başarısız.", "error");
    }
  };

  // COORD-VOL-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
  const cardFor = ({ item }: { item: VolunteerRow }) => {
    const isPending = (item.volunteerStatus || "approved") === "submitted";
    const active = (item.volunteerStatus || "approved") === "approved";
    const badge = isPending
      ? { label: "Onay Bekliyor", bg: "rgba(249,168,37,0.16)", bd: "rgba(249,168,37,0.28)", tx: "#fde68a" }
      : active
        ? { label: "Aktif", bg: "rgba(34,197,94,0.16)", bd: "rgba(34,197,94,0.28)", tx: "#bbf7d0" }
        : { label: "Askıda / Red", bg: "rgba(239,68,68,0.14)", bd: "rgba(239,68,68,0.24)", tx: "#fecaca" };

    const selectedCard = item.id === selected?.id;
    const checked = selectedIds.includes(item.id);
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => setSelectedId(item.id)} style={[m.card, { backgroundColor: panelBg, borderColor: panelBorder }, selectedCard && m.cardActive]}>
        <View style={m.row}>
          <TouchableOpacity onPress={() => toggleSelected(item.id)} style={[m.selectBox, checked && m.selectBoxChecked]}>
            {checked ? <Ionicons name="checkmark" size={13} color="white" /> : null}
          </TouchableOpacity>
          <View style={m.avatar}>
            <Ionicons name="person-outline" size={22} color="#fee2e2" />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text numberOfLines={1} style={[m.cardTitle, { color: textPrimary }]}>{item.fullName || item.name || "Gönüllü"}</Text>
            <Text numberOfLines={1} style={[m.cardSub, { color: textSec }]}>
              {(item.city || item.regionId || "Bölge yok")} {item.district ? `• ${item.district}` : ""}
            </Text>
            <Text numberOfLines={1} style={[m.cardSubMuted, { color: textMuted }]}>
              {skillLabel(item.skillLevel)} • {(item.skills || []).slice(0, 2).join(", ") || "Yetkinlik girilmemiş"}
            </Text>
          </View>
          <View style={[m.badge, { backgroundColor: badge.bg, borderColor: badge.bd }]}>
            <Text style={[m.badgeText, { color: badge.tx }]}>{badge.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#040406" : "#0b0910";
  const heroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#12060a", "#0a0508"] : ["#3f0914", "#23070f", "#14070b"];
  const panelBg = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.03)";
  const panelBorder = lightMode ? "rgba(15,23,42,0.08)" : amoledMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)";
  const cardBg = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.04)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";
  const softBorder = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.06)";

  // COORD-VOL-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
  return (
    <View style={[m.page, { backgroundColor: shellBg }]}>
      <LinearGradient colors={heroColors as any} style={m.hero}>
        <View style={m.heroTop}>
          <TouchableOpacity onPress={goBackSafe} style={m.heroBack}>
            <Ionicons name="arrow-back" size={18} color="#fff1f2" />
          </TouchableOpacity>
          <Text style={m.heroLabel}>{L("Gönüllü Yönetimi", "Volunteer Management")}</Text>
          <View style={m.heroDot} />
        </View>
        <Text style={m.heroTitle}>{L("Başvurular ve Saha Ekipleri", "Applications and Field Teams")}</Text>
        <Text style={m.heroSub}>{L("Onay bekleyen gönüllüler, aktif ekipler ve askıdaki hesaplar", "Pending volunteers, active teams and suspended accounts")}</Text>
        <View style={m.kpiRow}>
          <View style={[m.kpi, { borderColor: "rgba(249,168,37,0.22)" }]}>
            <Ionicons name="hourglass-outline" size={14} color="#fde68a" style={{ marginBottom: 3 }} />
            <Text style={[m.kpiValue, { color: "#fde68a" }]}>{rows.filter((r) => (r.volunteerStatus || "approved") === "submitted").length}</Text>
            <Text style={m.kpiText}>{L("Onay Bekliyor", "Pending")}</Text>
          </View>
          <View style={[m.kpi, { borderColor: "rgba(34,197,94,0.22)" }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#86efac" style={{ marginBottom: 3 }} />
            <Text style={[m.kpiValue, { color: "#86efac" }]}>{rows.filter((r) => (r.volunteerStatus || "approved") === "approved").length}</Text>
            <Text style={m.kpiText}>{L("Aktif", "Active")}</Text>
          </View>
          <View style={[m.kpi, { borderColor: "rgba(96,165,250,0.22)" }]}>
            <Ionicons name="walk-outline" size={14} color="#93c5fd" style={{ marginBottom: 3 }} />
            <Text style={[m.kpiValue, { color: "#93c5fd" }]}>{rows.filter((r) => r.availability === "busy").length}</Text>
            <Text style={m.kpiText}>{L("Görevde", "On Duty")}</Text>
          </View>
          <View style={[m.kpi, { borderColor: "rgba(248,113,113,0.18)" }]}>
            <Ionicons name="people-outline" size={14} color="#fca5a5" style={{ marginBottom: 3 }} />
            <Text style={[m.kpiValue, { color: "#fca5a5" }]}>{rows.length}</Text>
            <Text style={m.kpiText}>{L("Toplam", "Total")}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[m.body, { backgroundColor: shellBg }]}>
        <View style={m.segmentRow}>
          {[
            ["pending", "Onay Bekleyen"],
            ["active", "Aktif"],
            ["suspended", "Askıda / Red"]
          ].map(([key, label]) => {
            const active = segment === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSegment(key as any)}
                style={[
                  m.segmentBtn,
                  active && m.segmentBtnActive,
                  !active && lightMode && { backgroundColor: "rgba(0,0,0,0.04)", borderColor: "rgba(15,23,42,0.08)" }
                ]}
              >
                <Text style={[
                  m.segmentText,
                  active && m.segmentTextActive,
                  { color: active ? (lightMode ? "white" : "#fff1f2") : textMuted }
                ]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[m.bulkBar, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <Text style={m.bulkTitle}>{L("Toplu İşlem", "Bulk Action")} • {selectedIds.length} {L("seçili", "selected")}</Text>
          <View style={m.bulkActionsRow}>
            <TouchableOpacity onPress={toggleSelectAllFiltered} style={m.bulkGhostBtn}>
              <Text style={m.bulkGhostText}>
                {filtered.length > 0 && filtered.every((x) => selectedIds.includes(x.id)) ? L("SEÇİMİ TEMİZLE", "CLEAR SELECTION") : L("TÜMÜNÜ SEÇ", "SELECT ALL")}
              </Text>
            </TouchableOpacity>
            {segment === "pending" ? (
              <>
                <TouchableOpacity onPress={() => bulkSetVolunteerState("approved", "available")} style={m.bulkPrimaryBtn}>
                  <Text style={m.bulkPrimaryText}>{L("TOPLU ONAYLA", "BULK APPROVE")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => bulkSetVolunteerState("rejected", "offline")} style={m.bulkWarnBtn}>
                  <Text style={m.bulkWarnText}>{L("TOPLU REDDET", "BULK REJECT")}</Text>
                </TouchableOpacity>
              </>
            ) : segment === "active" ? (
              <>
                <TouchableOpacity onPress={() => bulkSetVolunteerState("approved", "busy")} style={m.bulkPrimaryBtn}>
                  <Text style={m.bulkPrimaryText}>{L("TOPLU GÖREVDE", "BULK ON DUTY")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => bulkSetVolunteerState("rejected", "offline")} style={m.bulkWarnBtn}>
                  <Text style={m.bulkWarnText}>{L("TOPLU ASKIYA AL", "BULK SUSPEND")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => bulkSetVolunteerState("approved", "available")} style={m.bulkPrimaryBtn}>
                <Text style={m.bulkPrimaryText}>{L("TOPLU AKTİF ET", "BULK ACTIVATE")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={m.toolbar}>
          <View style={[m.searchWrap, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <Ionicons name="search-outline" size={16} color={textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Ad, şehir, beceri ara..."
              placeholderTextColor={textMuted}
              style={[m.searchInput, { color: textPrimary }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {regionOptions.slice(0, 10).map((region) => {
              const active = regionFilter === region;
              return (
                <TouchableOpacity key={region} onPress={() => setRegionFilter(region)} style={[m.regionChip, { backgroundColor: panelBg, borderColor: panelBorder }, active && m.regionChipActive]}>
                  <Text style={[m.regionChipText, active && m.regionChipTextActive, { color: active ? (lightMode ? "#9f1239" : "#fff1f2") : textMuted }]}>{region === "all" ? L("Tüm Bölgeler", "All Regions") : region}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map((k) => <View key={k} style={[m.card, { height: 84, opacity: 0.6 }]} />)}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={cardFor}
            contentContainerStyle={{ paddingBottom: selected ? 8 : 20 }}
            style={{ maxHeight: selected ? 280 : undefined }}
            onRefresh={() => setRefreshing(true)}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={[m.empty, { borderColor: softBorder, backgroundColor: lightMode ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)" }]}>
                <Ionicons name="people-outline" size={22} color={textMuted} />
                <Text style={[m.emptyTitle, { color: textPrimary }]}>{L("Gösterilecek gönüllü yok", "No volunteers to show")}</Text>
                <Text style={[m.emptySub, { color: textSec }]}>{L("Seçili filtre için kayıt bulunamadı.", "No records found for selected filter.")}</Text>
              </View>
            }
          />
        )}

        {selected ? (
          <View style={[m.detailCard, { backgroundColor: panelBg, borderColor: panelBorder }]}>
            <View style={m.rowBetween}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[m.detailTitle, { color: textPrimary }]}>{selected.fullName || selected.name || L("Gönüllü", "Volunteer")}</Text>
                <Text style={[m.detailSub, { color: textSec }]}>
                  {selected.city || "-"} {selected.district ? `• ${selected.district}` : ""} • {AVAIL_LABEL[selected.availability || "available"] || L("Müsait", "Available")}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedId(null)} style={m.closeBtn}>
                <Ionicons name="close" size={16} color="#fecaca" />
              </TouchableOpacity>
            </View>

            <View style={m.detailGrid}>
              {[
                [L("Durum", "Status"), V_STATUS_LABEL[selected.volunteerStatus || "approved"] || L("Aktif", "Active")],
                [L("Beceri", "Skill"), skillLabel(selected.skillLevel)],
                [L("Telefon", "Phone"), maskPhone(selected.phone)],
                [L("E-posta", "Email"), maskEmail(selected.email)]
              ].map(([k, v]) => (
                <View key={String(k)} style={m.infoPill}>
                  <Text style={m.infoPillKey}>{k}</Text>
                  <Text style={m.infoPillVal} numberOfLines={1}>{v as any}</Text>
                </View>
              ))}
            </View>

            {!!(selected.skills?.length || selected.interests?.length) && (
              <View style={{ marginTop: 10 }}>
                <Text style={m.blockTitle}>{L("Yetkinlikler ve İlgi Alanları", "Skills and Interests")}</Text>
                <View style={m.tagsWrap}>
                  {(selected.skills || []).map((x) => (
                    <View key={`s-${x}`} style={[m.tag, m.tagSkill]}><Text style={m.tagText}>{x}</Text></View>
                  ))}
                  {(selected.interests || []).map((x) => (
                    <View key={`i-${x}`} style={[m.tag, m.tagInterest]}><Text style={m.tagText}>{x}</Text></View>
                  ))}
                </View>
              </View>
            )}

            {!!selected.motivation && (
              <View style={m.noteBox}>
                <Text style={m.blockTitle}>{L("Motivasyon / Saha Notu", "Motivation / Field Note")}</Text>
                <Text style={m.noteText}>{selected.motivation}</Text>
              </View>
            )}

            <View style={m.actionRow}>
              <TouchableOpacity
                style={[m.actionBtn, m.actionGhost]}
                onPress={() => setShowHistory((v) => !v)}
              >
                <Text style={m.actionGhostText}>{showHistory ? L("DETAYI KAPAT", "CLOSE DETAIL") : L("DETAY", "DETAIL")}</Text>
              </TouchableOpacity>

              {segment === "pending" ? (
                <>
                  <TouchableOpacity
                    style={[m.actionBtn, m.actionWarn]}
                    onPress={() =>
                      Alert.alert(L("Onayı Reddet", "Reject Application"), L("Bu gönüllü başvurusunu reddetmek istiyor musunuz?", "Are you sure you want to reject this volunteer application?"), [
                        { text: L("İptal", "Cancel"), style: "cancel" },
                        { text: L("Reddet", "Reject"), style: "destructive", onPress: () => setVolunteerState(selected, "rejected", "offline") }
                      ])
                    }
                  >
                    <Text style={m.actionWarnText}>{L("REDDET", "REJECT")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[m.actionBtn, m.actionPrimary]} onPress={() => setVolunteerState(selected, "approved", "available")}>
                    <LinearGradient colors={["#b11226", "#e63946"]} style={m.fill}>
                      <Text style={m.actionPrimaryText}>{L("ONAYLA", "APPROVE")}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : segment === "active" ? (
                <>
                  <TouchableOpacity
                    style={[m.actionBtn, m.actionWarn]}
                    onPress={() => setVolunteerState(selected, "approved", "busy")}
                  >
                    <Text style={m.actionWarnText}>{L("GÖREVDE", "ON DUTY")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[m.actionBtn, m.actionPrimary]}
                    onPress={() => setVolunteerState(selected, "rejected", "offline")}
                  >
                    <LinearGradient colors={["#7f1d1d", "#dc2626"]} style={m.fill}>
                      <Text style={m.actionPrimaryText}>{L("ASKIYA AL", "SUSPEND")}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[m.actionBtn, m.actionPrimary]}
                  onPress={() => setVolunteerState(selected, "approved", "available")}
                >
                  <LinearGradient colors={["#15803d", "#22c55e"]} style={m.fill}>
                    <Text style={m.actionPrimaryText}>{L("YENİDEN AKTİF ET", "REACTIVATE")}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {showHistory ? (
              <ScrollView nestedScrollEnabled style={{ marginTop: 12, maxHeight: 300 }} contentContainerStyle={{ paddingBottom: 6 }}>
                {/* Performance bar chart */}
                <Text style={[m.blockTitle, { marginBottom: 8 }]}>{L("Performans Özeti", "Performance Summary")}</Text>
                {(() => {
                  const total = selectedRequests.length || 1;
                  const done = selectedRequests.filter((r) => r.status === "closed").length;
                  const active = selectedRequests.filter((r) => (r.status || "open") !== "closed").length;
                  const apps = selectedApps.length;
                  const metrics = [
                    { label: L("Tamamlanan Görev", "Completed Missions"), value: done, max: Math.max(total, 1), color: "#22c55e" },
                    { label: L("Aktif Görev", "Active Missions"), value: active, max: Math.max(total, 1), color: "#f59e0b" },
                    { label: L("Başvuru Sayısı", "Application Count"), value: apps, max: Math.max(apps, 1, selectedRequests.length), color: "#60a5fa" },
                  ];
                  return (
                    <View style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 10, gap: 10 }}>
                      {metrics.map((metric) => (
                        <View key={metric.label}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11 }}>{metric.label}</Text>
                            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{metric.value}</Text>
                          </View>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: metric.color, width: `${Math.min(100, Math.round((metric.value / metric.max) * 100))}%` }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                <View style={m.noteBox}>
                  <Text style={m.blockTitle}>{L("Son Görevler", "Recent Missions")}</Text>
                  {selectedRequests.slice(0, 4).map((r) => (
                    <View key={`req-${r.id}`} style={m.historyRow}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.status === "closed" ? "#22c55e" : "#f59e0b", marginRight: 8, marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={m.historyTitle}>{r.type || L("Talep", "Request")}</Text>
                        <Text style={m.historySub}>{(r.status || "open").replaceAll("_", " ")} • {new Date(toMs(r.updatedAt || r.createdAt) || Date.now()).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { timeZone: "Europe/Istanbul" })}</Text>
                      </View>
                    </View>
                  ))}
                  {!selectedRequests.length ? <Text style={m.noteText}>{L("Henüz atanmış görev kaydı bulunamadı.", "No assigned mission records found yet.")}</Text> : null}
                </View>

                <View style={m.noteBox}>
                  <Text style={m.blockTitle}>{L("Son Başvurular", "Recent Applications")}</Text>
                  {selectedApps.slice(0, 4).map((a) => (
                    <View key={`app-${a.id}`} style={[m.historyRow, { flexDirection: "row", alignItems: "center" }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a.status === "approved" ? "#22c55e" : a.status === "rejected" ? "#ef4444" : "#f59e0b", marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={m.historyTitle}>{L("Talep", "Request")}: {(a.requestId || "-").slice(0, 12)}...</Text>
                        <Text style={m.historySub}>{(a.status || "pending").replaceAll("_", " ")} • {new Date(toMs(a.createdAt) || Date.now()).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { timeZone: "Europe/Istanbul" })}</Text>
                      </View>
                    </View>
                  ))}
                  {!selectedApps.length ? <Text style={m.noteText}>Henüz başvuru kaydı bulunamadı.</Text> : null}
                </View>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const m = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0b0910" },
  hero: { paddingTop: 54, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  heroTop: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  heroBack: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  heroLabel: { flex: 1, marginLeft: 8, color: "#fecdd3", fontFamily: "Inter", fontSize: 12 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  heroTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 26, lineHeight: 30 },
  heroSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 6 },
  kpiRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  kpi: { flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", paddingVertical: 10, alignItems: "center" },
  kpiValue: { color: "white", fontFamily: "Inter-Bold", fontSize: 22 },
  kpiText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 96 },
  segmentRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  segmentBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  segmentBtnActive: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(248,113,113,0.22)" },
  segmentText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, textAlign: "center" },
  segmentTextActive: { color: "#fff1f2", fontFamily: "Inter-Bold" },
  bulkBar: { borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 9, marginBottom: 10 },
  bulkTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11, marginBottom: 8 },
  bulkActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bulkGhostBtn: {
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  bulkGhostText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 },
  bulkPrimaryBtn: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  bulkPrimaryText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 },
  bulkWarnBtn: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(249,168,37,0.12)",
    borderWidth: 1,
    borderColor: "rgba(249,168,37,0.24)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  bulkWarnText: { color: "#fde68a", fontFamily: "Inter-Bold", fontSize: 10 },
  toolbar: { marginBottom: 10, gap: 8 },
  searchWrap: { height: 42, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  searchInput: { flex: 1, marginLeft: 8, color: "white", fontFamily: "Inter", fontSize: 13 },
  regionChip: { height: 30, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  regionChipActive: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(248,113,113,0.2)" },
  regionChipText: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11 },
  regionChipTextActive: { color: "#fff1f2", fontFamily: "Inter-Bold" },
  card: { borderRadius: 16, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 },
  cardActive: { borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(239,68,68,0.06)" },
  row: { flexDirection: "row", alignItems: "center" },
  selectBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8
  },
  selectBoxChecked: { backgroundColor: "rgba(239,68,68,0.8)", borderColor: "rgba(248,113,113,0.9)" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  cardTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 15 },
  cardSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 },
  cardSubMuted: { color: "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 1 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontFamily: "Inter-Bold", fontSize: 10 },
  empty: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", paddingVertical: 18, paddingHorizontal: 12, marginTop: 6 },
  emptyTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 6 },
  emptySub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2, textAlign: "center" },
  detailCard: { marginTop: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(248,113,113,0.14)", padding: 12 },
  detailTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 18 },
  detailSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 2 },
  closeBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  infoPill: { width: "48%", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 8 },
  infoPillKey: { color: "#fda4af", fontFamily: "Inter", fontSize: 10 },
  infoPillVal: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11, marginTop: 2 },
  blockTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, marginBottom: 6 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  tagSkill: { backgroundColor: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.22)" },
  tagInterest: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.22)" },
  tagText: { color: "white", fontFamily: "Inter-Bold", fontSize: 10 },
  noteBox: { marginTop: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10 },
  noteText: { color: "#ffe4e6", fontFamily: "Inter", fontSize: 12, lineHeight: 16 },
  historyRow: { borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 8, marginBottom: 6 },
  historyTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  historySub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: { height: 42, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  actionGhost: { flex: 0.85, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
  actionWarn: { flex: 1, borderWidth: 1, borderColor: "rgba(249,168,37,0.22)", backgroundColor: "rgba(249,168,37,0.08)" },
  actionPrimary: { flex: 1.2 },
  actionGhostText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  actionWarnText: { color: "#fde68a", fontFamily: "Inter-Bold", fontSize: 11 },
  actionPrimaryText: { color: "white", fontFamily: "Inter-Bold", fontSize: 11 },
  fill: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }
});


