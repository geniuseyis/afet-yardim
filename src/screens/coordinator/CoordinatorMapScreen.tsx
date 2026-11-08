import {
  React,
  useEffect,
  useMemo,
  useRef,
  useState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  MapView,
  Marker,
  Callout,
  useNavigation,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  db,
  useStore,
  isUrgent,
  statusLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * COORD-MAP DOSYA HARITASI
 * - COORD-MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - COORD-MAP-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - COORD-MAP-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - COORD-MAP-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#141019" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d1d5db" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b0910" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] }
] as any;

const markerColor = (status?: string) => {
  if ((status || "open") === "open") return "#ef4444";
  if (status === "assigned") return "#f59e0b";
  if (status === "in_progress") return "#fb7185";
  return "#22c55e";
};

export const CoordinatorMapScreen = () => {
  const navigation = useNavigation<any>();
  const showToast = useStore((s) => s.showToast);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const locale = useStore((s) => s.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [requests, setRequests] = useState<Req[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "assigned" | "in_progress" | "closed">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);
  const [activeVolunteers, setActiveVolunteers] = useState<Array<{ id: string; city?: string }>>([]);
  const [poiLayer, setPoiLayer] = useState<"none" | "hospitals" | "assembly">("none"); // Varsayılan: kapalı
  const [pois, setPois] = useState<Array<{ id: string; lat: number; lng: number; name: string; type: "hospital" | "assembly" }>>([]);
  const mapRef = useRef<MapView | null>(null);

  // COORD-MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const qReq = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(260));
    const qVol = query(collection(db, "users_public"), limit(260));

    const offReq = onSnapshot(
      qReq,
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Operasyon haritası verileri yüklenemedi.", "Operations map data could not be loaded."), "error");
        }
      }
    );
    const offVol = onSnapshot(
      qVol,
      (snap) =>
        setActiveVolunteers(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        ),
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Gönüllü verileri yüklenemedi.", "Volunteer data could not be loaded."), "error");
        }
      }
    );

    return () => {
      offReq();
      offVol();
    };
  }, [showToast]);

  const CENTER = { latitude: 39.9334, longitude: 32.8597 };

  // [FONKSIYON] fetchPOIs: Hastane ve toplanma alanlarini OpenStreetMap'ten ceker, anahtar gerekmez.
  const fetchPOIs = async (lat: number, lng: number, type: "hospitals" | "assembly") => {
    const oql = type === "hospitals"
      ? `[out:json][timeout:25];(node["amenity"="hospital"](around:20000,${lat},${lng});way["amenity"="hospital"](around:20000,${lat},${lng});node["amenity"="clinic"](around:20000,${lat},${lng}););out center;`
      : `[out:json][timeout:25];(node["emergency"="assembly_point"](around:20000,${lat},${lng});node["leisure"="park"](around:8000,${lat},${lng});node["amenity"="school"](around:5000,${lat},${lng}););out center;`;
    const body = `data=${encodeURIComponent(oql)}`;
    for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.elements?.length) continue;
        setPois((json.elements as any[]).filter((e: any) => (e.lat && e.lon) || (e.center?.lat && e.center?.lon)).slice(0, 80)
          .map((e: any) => ({
            id: String(e.id), lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
            name: e.tags?.["name:tr"] || e.tags?.name || (type === "hospitals" ? L("Hastane/Klinik", "Hospital/Clinic") : L("Toplanma Alanı", "Assembly Point")),
            type: type === "hospitals" ? "hospital" as const : "assembly" as const
          })));
        return;
      } catch { continue; }
    }
    setPois([]);
  };

  const togglePOI = (type: "hospitals" | "assembly") => {
    if (poiLayer === type) { setPoiLayer("none"); setPois([]); return; }
    setPoiLayer(type);
    void fetchPOIs(CENTER.latitude, CENTER.longitude, type);
  };

  // COORD-MAP-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r: any) => {
      const city = String(r.city || r.regionId || "").trim();
      if (city) set.add(city);
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "tr"))].slice(0, 12);
  }, [requests]);

  // COORD-MAP-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const visibleRequests = useMemo(() => {
    return requests.filter((r: any) => {
      if (!r.location?.lat || !r.location?.lng) return false;
      if (statusFilter !== "all" && (r.status || "open") !== statusFilter) return false;
      if (cityFilter !== "all" && (r.city || r.regionId) !== cityFilter) return false;
      return true;
    });
  }, [requests, statusFilter, cityFilter]);

  // COORD-MAP-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const focusReq = useMemo(
    () =>
      visibleRequests.find((r) => r.id === focusRequestId) ||
      visibleRequests.find((r) => isUrgent((r as any).urgency)) ||
      visibleRequests[0] ||
      null,
    [focusRequestId, visibleRequests]
  );

  // COORD-MAP-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
  useEffect(() => {
    if (!focusReq?.location?.lat || !focusReq?.location?.lng || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: focusReq.location.lat,
        longitude: focusReq.location.lng,
        latitudeDelta: 0.16,
        longitudeDelta: 0.16
      },
      350
    );
  }, [focusReq]);

  // COORD-MAP-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const kpis = useMemo(() => {
    const open = requests.filter((r) => (r.status || "open") === "open").length;
    const assigned = requests.filter((r) => r.status === "assigned").length;
    const inProgress = requests.filter((r) => r.status === "in_progress").length;
    const urgent = requests.filter((r) => isUrgent((r as any).urgency) && (r.status || "open") !== "closed").length;
    return { open, assigned, inProgress, urgent };
  }, [requests]);

  const initialLat = focusReq?.location?.lat || 39.0;
  const initialLng = focusReq?.location?.lng || 35.0;
  const shellBg = lightMode ? "#f1f5f9" : amoledMode ? "#040406" : "#12060a";
  const heroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#12060a", "#0a0508"] : ["#430914", "#23070f", "#12060a"];

  // COORD-MAP-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
  return (
    <View style={[m.page, { backgroundColor: shellBg }]}>
      <LinearGradient colors={heroColors as any} style={m.hero}>
        <View style={m.heroRow}>
          <TouchableOpacity onPress={() => navigation.navigate("Home")} style={m.heroIcon}>
            <Ionicons name="arrow-back" size={18} color="#fff1f2" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={m.heroTitle}>{L("Operasyon Haritası", "Operations Map")}</Text>
            <Text style={m.heroSub}>{L("Canlı talep yoğunluğu ve saha odak görünümü", "Live request density and field focus view")}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Manage")} style={m.heroIcon}>
            <Ionicons name="list-outline" size={18} color="#fff1f2" />
          </TouchableOpacity>
        </View>
        <View style={m.kpiRow}>
          <KpiCard label={L("Açık", "Open")} value={kpis.open} color="#ef4444" />
          <KpiCard label={L("Atanan", "Assigned")} value={kpis.assigned} color="#f59e0b" />
          <KpiCard label={L("Sahada", "In Field")} value={kpis.inProgress} color="#fb7185" />
          <KpiCard label={L("Acil", "Urgent")} value={kpis.urgent} color="#22c55e" />
        </View>
      </LinearGradient>

      <View style={m.mapWrap}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          customMapStyle={DARK_MAP_STYLE}
          initialRegion={{ latitude: initialLat, longitude: initialLng, latitudeDelta: 0.8, longitudeDelta: 0.8 }}
        >
          {visibleRequests.slice(0, 160).map((r) => (
            <Marker
              key={r.id}
              coordinate={{ latitude: r.location!.lat!, longitude: r.location!.lng! }}
              pinColor={markerColor(r.status)}
              title={r.type || "Yardım Talebi"}
              description={`${statusLabel[(r.status || "open") as any] || r.status || "open"} • ${String((r as any).urgency || "normal")}`}
              onPress={() => setFocusRequestId(r.id)}
            />
          ))}
          {/* POI katmanı */}
          {pois.map((p) => (
            <Marker
              key={`poi-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={p.type === "hospital" ? "#0ea5e9" : "#22c55e"}
            >
              <Callout tooltip={false}>
                <View style={{ backgroundColor: "white", borderRadius: 8, padding: 8, maxWidth: 180 }}>
                  <Text style={{ fontFamily: "Inter-Bold", fontSize: 12, color: p.type === "hospital" ? "#0284c7" : "#16a34a" }}>
                    {p.type === "hospital" ? "🏥 Hastane" : "🟢 Toplanma Alanı"}
                  </Text>
                  <Text style={{ fontFamily: "Inter", fontSize: 11, color: "#374151", marginTop: 2 }} numberOfLines={2}>{p.name}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>

        {/* POI katman butonları */}
        <View style={{ position: "absolute", top: 10, right: 10, gap: 8 }}>
          <TouchableOpacity onPress={() => togglePOI("hospitals")} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: poiLayer === "hospitals" ? "#0ea5e9" : "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: poiLayer === "hospitals" ? "#0ea5e9" : "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="medical-outline" size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => togglePOI("assembly")} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: poiLayer === "assembly" ? "#22c55e" : "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: poiLayer === "assembly" ? "#22c55e" : "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="people-outline" size={18} color="white" />
          </TouchableOpacity>
        </View>

        {/* POI sayı göstergesi */}
        {poiLayer !== "none" && pois.length > 0 ? (
          <View style={{ position: "absolute", bottom: 10, left: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: poiLayer === "hospitals" ? "#0ea5e9" : "#22c55e" }} />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>
                {poiLayer === "hospitals" ? L("Hastane/Klinik", "Hospital/Clinic") : L("Toplanma Alanı", "Assembly Point")} ({pois.length})
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={m.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
          {[
            { key: "all", label: L("Tümü", "All") },
            { key: "open", label: L("Bekleyen", "Pending") },
            { key: "assigned", label: L("Atanan", "Assigned") },
            { key: "in_progress", label: L("Sahada", "In Field") },
            { key: "closed", label: L("Tamamlanan", "Completed") }
          ].map((f) => (
            <TouchableOpacity key={f.key} onPress={() => setStatusFilter(f.key as any)} style={[m.filterChip, statusFilter === f.key && m.filterChipActive]}>
              <Text style={[m.filterText, statusFilter === f.key && m.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
          {cityOptions.map((city) => (
            <TouchableOpacity key={city} onPress={() => setCityFilter(city)} style={[m.filterChip, cityFilter === city && m.filterChipActive]}>
              <Text style={[m.filterText, cityFilter === city && m.filterTextActive]}>{city === "all" ? L("Tüm Bölgeler", "All Regions") : city}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={m.focusCard}>
          <View style={m.focusTop}>
            <Text style={m.focusTitle}>{L("Odaktaki Talep", "Focused Request")}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Manage")}>
              <Text style={m.link}>{L("Taleplere Git", "Go to Requests")}</Text>
            </TouchableOpacity>
          </View>
          {!focusReq ? (
            <Text style={m.empty}>{L("Filtrede talep bulunamadı.", "No request found in selected filter.")}</Text>
          ) : (
            <>
              <Text style={m.focusMain}>{focusReq.type || L("Yardım Talebi", "Aid Request")}</Text>
              <Text style={m.focusSub}>
                {L("Durum", "Status")}: {statusLabel[(focusReq.status || "open") as any] || focusReq.status || "open"} • {L("Öncelik", "Priority")}: {String((focusReq as any).urgency || "normal")}
              </Text>
              <Text style={m.focusSub} numberOfLines={2}>{focusReq.description || L("Açıklama yok", "No description")}</Text>
              <View style={m.focusActions}>
                <TouchableOpacity style={m.actionBtn} onPress={() => navigation.navigate("Manage")}>
                  <Text style={m.actionBtnText}>{L("YÖNET", "MANAGE")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={m.actionBtn} onPress={() => navigation.navigate("Messages")}>
                  <Text style={m.actionBtnText}>{L("MESAJLAR", "MESSAGES")}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={m.feedCard}>
          <Text style={m.feedTitle}>{L("Canlı Özet", "Live Summary")}</Text>
          <Text style={m.feedLine}>• {L("Görünen talep", "Visible requests")}: {visibleRequests.length}</Text>
          <Text style={m.feedLine}>• {L("Aktif gönüllü", "Active volunteers")}: {activeVolunteers.length}</Text>
          <Text style={m.feedLine}>• {L("Acil odak talep", "Urgent focused requests")}: {visibleRequests.filter((r) => isUrgent((r as any).urgency)).length}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const KpiCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={m.kpiCard}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginBottom: 6 }} />
    <Text style={m.kpiValue}>{value}</Text>
    <Text style={m.kpiLabel}>{label}</Text>
  </View>
);

const m = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#12060a" },
  hero: {
    paddingTop: 54,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)"
  },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  heroTitle: { color: "white", fontFamily: "Inter-Bold", fontSize: 22 },
  heroSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 },
  kpiRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 9
  },
  kpiValue: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 18 },
  kpiLabel: { color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 },
  mapWrap: { height: 280, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 96 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8
  },
  filterChipActive: { borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(239,68,68,0.14)" },
  filterText: { color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 },
  filterTextActive: { color: "#fff1f2" },
  focusCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 12,
    marginTop: 8
  },
  focusTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  focusTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 },
  link: { color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 },
  focusMain: { color: "white", fontFamily: "Inter-Bold", fontSize: 16 },
  focusSub: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 4 },
  focusActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center"
  },
  actionBtnText: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 11 },
  feedCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 12,
    marginTop: 10
  },
  feedTitle: { color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 6 },
  feedLine: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginBottom: 4 },
  empty: { color: "#fecdd3", fontFamily: "Inter", fontSize: 12, textAlign: "center", paddingVertical: 6 }
});


