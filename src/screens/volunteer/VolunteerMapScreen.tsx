import {
  React, useEffect, useMemo, useState,
  ScrollView, Text, TouchableOpacity, View,
  Ionicons, Location, MapView, Marker, Callout, collection, onSnapshot, query, where, db, useStore, kmBetween, statusLabel
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { Linking } from "react-native";
import { l } from "../../services/i18n";

/**
 * VOL-MAP DOSYA HARITASI
 * - VOL-MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-MAP-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - VOL-MAP-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-MAP-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] urgencyColor: Harita marker aciliyetine göre renk seçer.
const urgencyColor = (urgency?: string) => {
  const s = `${urgency || ""}`.toLowerCase();
  if (s.includes("acil") || s.includes("high")) return "#ef4444";
  if (s.includes("orta") || s.includes("medium")) return "#f59e0b";
  return "#22c55e";
};

// [FONKSIYON] VolunteerMapScreen: Haritada aktif talepleri gösterir, filtreler ve rota açar.
export const VolunteerMapScreen = ({ navigation }: { navigation: any }) => {
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [rows, setRows] = useState<Req[]>([]);
  const [filter, setFilter] = useState<"all" | "urgent" | "medium" | "low">("all");
  const [selected, setSelected] = useState<Req | null>(null);
  const [poiLayer, setPoiLayer] = useState<"none" | "hospitals" | "assembly">("none");
  const [pois, setPois] = useState<Array<{ id: string; lat: number; lng: number; name: string; type: "hospital" | "assembly" }>>([]);
  const [zoomDelta, setZoomDelta] = useState(0.1);
  // Haritanın şu an görünen merkezini takip et — POI sorgusu için kullanılır
  const mapCenter = React.useRef<{ latitude: number; longitude: number }>(
    { latitude: 41.0082, longitude: 28.9784 }
  );

  // VOL-MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    const q = query(collection(db, "requests"), where("status", "in", ["open", "assigned", "in_progress"] as any));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Req))
          .filter((r) => r.location?.lat && r.location?.lng);
        setRows(list);
      },
      (err: any) => {
        console.warn("[volunteer-map] snapshot error:", err);
        setRows([]);
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Harita talepleri yüklenemedi.", "Map requests could not be loaded."), "error");
        }
      }
    );
  }, [showToast, locale]);

  // VOL-MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  // [FONKSIYON] locate: Gönüllünün anlık konumunu alıp harita merkezine yazar.
  const mapRef = React.useRef<any>(null);
  const FALLBACK = { latitude: 41.0082, longitude: 28.9784 };

  const locate = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      showToast(L("Konum izni verilmedi.", "Location permission denied."), "info");
      setMyLoc(FALLBACK);
      return;
    }
    try {
      const now = await Location.getCurrentPositionAsync({ accuracy: (Location as any).Accuracy?.Balanced ?? 3 });
      const newLoc = { latitude: now.coords.latitude, longitude: now.coords.longitude };
      setMyLoc(newLoc);
      mapRef.current?.animateToRegion({ ...newLoc, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 600);
    } catch {
      const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
      if (last?.coords) {
        setMyLoc({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      } else {
        setMyLoc(FALLBACK);
      }
    }
  };


  const [poiLoading, setPoiLoading] = useState(false);

  // [FONKSIYON] zoomIn / zoomOut: Haritayı programatik yakınlaştırır/uzaklaştırır.
  const zoomIn = () => {
    const next = Math.max(0.002, zoomDelta / 2);
    setZoomDelta(next);
    const center = myLoc || FALLBACK;
    mapRef.current?.animateToRegion({
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: next,
      longitudeDelta: next
    }, 300);
  };

  const zoomOut = () => {
    const next = Math.min(8, zoomDelta * 2);
    setZoomDelta(next);
    const center = myLoc || FALLBACK;
    mapRef.current?.animateToRegion({
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: next,
      longitudeDelta: next
    }, 300);
  };

  // [FONKSIYON] textSearch: Places Text Search API ile arama yapar — H logolu hastaneleri döndürür.
  // [FONKSIYON] fetchPOIs: Haritanin merkezine gore OpenStreetMap verisi ceker, anahtar gerekmez.
  const fetchPOIs = async (lat: number, lng: number, type: "hospitals" | "assembly") => {
    setPoiLoading(true);
    try {
      await fetchOverpassFallback(lat, lng, type);
    } finally {
      setPoiLoading(false);
    }
  };

  // [FONKSIYON] fetchOverpassFallback: Overpass uzerinden OSM verisi alir.
  const fetchOverpassFallback = async (lat: number, lng: number, type: "hospitals" | "assembly") => {
    const oql = type === "hospitals"
      ? `[out:json][timeout:25];(node["amenity"="hospital"](around:15000,${lat},${lng});way["amenity"="hospital"](around:15000,${lat},${lng});node["amenity"="clinic"](around:15000,${lat},${lng}););out center;`
      : `[out:json][timeout:25];(node["emergency"="assembly_point"](around:15000,${lat},${lng});node["leisure"="park"](around:8000,${lat},${lng});node["amenity"="school"](around:5000,${lat},${lng}););out center;`;
    const body = `data=${encodeURIComponent(oql)}`;
    const mirrors = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter"
    ];
    for (const url of mirrors) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.elements?.length) continue;
        setPois((json.elements as any[])
          .filter((e: any) => (e.lat && e.lon) || (e.center?.lat && e.center?.lon))
          .slice(0, 80)
          .map((e: any) => ({
            id: String(e.id),
            lat: e.lat ?? e.center?.lat,
            lng: e.lon ?? e.center?.lon,
            name: e.tags?.["name:tr"] || e.tags?.name || (type === "hospitals" ? L("Hastane/Klinik", "Hospital/Clinic") : L("Toplanma Alanı", "Assembly Point")),
            type: type === "hospitals" ? "hospital" as const : "assembly" as const
          })));
        return;
      } catch { continue; }
    }
    // Her iki kaynak da başarısız
    setPois([]);
    showToast(L("Konum verisi alınamadı.", "Location data unavailable."), "info");
  };

  const togglePOILayer = (type: "hospitals" | "assembly") => {
    if (poiLayer === type) {
      setPoiLayer("none");
      setPois([]);
      return;
    }
    setPoiLayer(type);
    // Haritanın GÖRÜNEN MERKEZİNİ kullan (GPS değil)
    // Önce GPS konumu, sonra haritanın son bilinen merkezi, son olarak fallback
    const center = myLoc || mapCenter.current || FALLBACK;
    void fetchPOIs(center.latitude, center.longitude, type);
  };

  // VOL-MAP-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const u = `${r.urgency || ""}`.toLowerCase();
      if (filter === "urgent") return u.includes("acil") || u.includes("high");
      if (filter === "medium") return u.includes("orta") || u.includes("medium");
      if (filter === "low") return !(u.includes("acil") || u.includes("high") || u.includes("orta") || u.includes("medium"));
      return true;
    });
  }, [rows, filter]);

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#07080b" : "#2b0912";
  const panel = lightMode ? "rgba(255,255,255,0.96)" : amoledMode ? "rgba(17,19,26,0.96)" : "rgba(107,18,34,0.96)";
  const soft = "rgba(255,255,255,0.08)";

  // [FONKSIYON] goBackSafe: Güvenli geri dönüş; geri stack yoksa Home'a yönlendirir.
  const goBackSafe = () => {
    try {
      if (typeof navigation?.canGoBack === "function" && navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
    } catch {}
    try { navigation.goBack(); } catch {}
  };

  // [FONKSIYON] openExternalRoute: Seçili talep için Google Maps yol tarifi açar.
  const openExternalRoute = async () => {
    if (!selected?.location?.lat || !selected?.location?.lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selected.location.lat},${selected.location.lng}`;
    const can = await Linking.canOpenURL(url);
    if (!can) return showToast(L("Harici harita uygulaması açılamadı.", "External map app could not be opened."), "error");
    await Linking.openURL(url);
  };

  // [FONKSIYON] chip: Harita filtre çipi UI'sini üretir.
  const chip = (key: typeof filter, label: string, color: string) => (
    <TouchableOpacity
      key={key}
      onPress={() => setFilter(key)}
      style={{
        borderRadius: 999,
        height: 34,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filter === key ? color : "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: filter === key ? color : "rgba(255,255,255,0.1)",
        marginRight: 8
      }}
    >
      <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
    </TouchableOpacity>
  );

  const selectedDistance = selected ? kmBetween(myLoc, selected.location) : null;
  const urgColor = selected ? urgencyColor(selected.urgency) : "#ef4444";

  return (
    <View style={{ flex: 1 }}>
      {/* TAM EKRAN HARİTA */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{ latitude: 41.0082, longitude: 28.9784, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
        onMapReady={() => void locate()}
        onRegionChangeComplete={(region) => {
          mapCenter.current = { latitude: region.latitude, longitude: region.longitude };
          setZoomDelta(region.latitudeDelta);
        }}
      >
        {visibleRows.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.location!.lat as number, longitude: r.location!.lng as number }}
            pinColor={urgencyColor(r.urgency)}
            title={r.type || L("Talep", "Request")}
            description={r.urgency || ""}
            onPress={() => setSelected(r)}
          />
        ))}
        {pois.map((p) => {
          const safeName = p.name && p.name.trim().length > 0
            ? p.name
            : (p.type === "hospital" ? L("Hastane", "Hospital") : L("Toplanma Alanı", "Assembly Point"));
          const kindLabel = p.type === "hospital" ? L("Hastane", "Hospital") : L("Toplanma Alanı", "Assembly Point");
          return (
            <Marker
              key={`poi-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={p.type === "hospital" ? "#0ea5e9" : "#22c55e"}
              title={safeName}
              description={kindLabel}
            >
              <Callout tooltip={false}>
                <View style={{ backgroundColor: "white", borderRadius: 10, padding: 10, maxWidth: 240, minWidth: 140 }}>
                  <Text style={{ fontFamily: "Inter-Bold", fontSize: 11, color: p.type === "hospital" ? "#0284c7" : "#16a34a", marginBottom: 4, letterSpacing: 0.5 }}>
                    {p.type === "hospital" ? "🏥 HASTANE" : "🟢 TOPLANMA ALANI"}
                  </Text>
                  <Text style={{ fontFamily: "Inter-Bold", fontSize: 13, color: "#0f172a" }} numberOfLines={3}>
                    {safeName}
                  </Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Floating üst bar */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: 54, paddingHorizontal: 14, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={goBackSafe}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={19} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Aktif Talepler", "Active Requests")}</Text>
            <View style={{ marginLeft: "auto", borderRadius: 999, backgroundColor: "rgba(239,68,68,0.35)", paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{visibleRows.length}</Text>
            </View>
          </View>
        </View>

        {/* Filtre pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          {([
            { key: "all" as const, label: L("Tümü", "All"), color: "#6b7280" },
            { key: "urgent" as const, label: L("🔴 Acil", "🔴 Urgent"), color: "#ef4444" },
            { key: "medium" as const, label: L("🟡 Orta", "🟡 Medium"), color: "#f59e0b" },
            { key: "low" as const, label: L("🟢 Düşük", "🟢 Low"), color: "#22c55e" }
          ]).map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: filter === f.key ? f.color : "rgba(0,0,0,0.6)", borderWidth: 1.5, borderColor: filter === f.key ? f.color : "rgba(255,255,255,0.18)" }}
            >
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sağ kenar butonlar */}
      <View style={{ position: "absolute", right: 14, top: "38%", gap: 10 }}>
        {/* Konumum */}
        <TouchableOpacity
          onPress={() => void locate()}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
        >
          <Ionicons name="locate" size={21} color="white" />
        </TouchableOpacity>

        {/* Yakınlaştır */}
        <TouchableOpacity
          onPress={zoomIn}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>

        {/* Uzaklaştır */}
        <TouchableOpacity
          onPress={zoomOut}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
        >
          <Ionicons name="remove" size={24} color="white" />
        </TouchableOpacity>

        {/* Hastaneler */}
        <TouchableOpacity
          onPress={() => !poiLoading && togglePOILayer("hospitals")}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: poiLayer === "hospitals" ? "#0ea5e9" : "rgba(0,0,0,0.75)", borderWidth: 1.5, borderColor: poiLayer === "hospitals" ? "#7dd3fc" : "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
        >
          <Ionicons name={poiLoading && poiLayer === "hospitals" ? "sync" : "medical"} size={21} color="white" />
        </TouchableOpacity>

        {/* Toplanma alanları */}
        <TouchableOpacity
          onPress={() => !poiLoading && togglePOILayer("assembly")}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: poiLayer === "assembly" ? "#22c55e" : "rgba(0,0,0,0.75)", borderWidth: 1.5, borderColor: poiLayer === "assembly" ? "#86efac" : "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
        >
          <Ionicons name={poiLoading && poiLayer === "assembly" ? "sync" : "people"} size={21} color="white" />
        </TouchableOpacity>
      </View>

      {/* Sol alt lejant */}
      <View style={{ position: "absolute", left: 14, bottom: selected ? 260 : 160, gap: 6 }}>
        {([["#ef4444", L("Acil", "Urgent")], ["#f59e0b", L("Orta", "Medium")], ["#22c55e", L("Düşük", "Low")]] as [string, string][]).map(([color, label]) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{label}</Text>
          </View>
        ))}
        {poiLayer !== "none" && pois.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: poiLayer === "hospitals" ? "rgba(14,165,233,0.8)" : "rgba(34,197,94,0.8)", paddingHorizontal: 10, paddingVertical: 5 }}>
            <Ionicons name={poiLayer === "hospitals" ? "medical" : "people"} size={11} color="white" />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>
              {poiLayer === "hospitals" ? L("Hastane", "Hospital") : L("Toplanma", "Assembly")} ({pois.length})
            </Text>
          </View>
        ) : null}
      </View>

      {/* Alt kart — seçili talep */}
      {selected ? (
        <View style={{ position: "absolute", left: 14, right: 14, bottom: 96 }}>
          <View style={{ borderRadius: 24, backgroundColor: "rgba(8,4,12,0.97)", borderWidth: 1.5, borderColor: `${urgColor}50`, padding: 16, shadowColor: urgColor, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17, lineHeight: 22 }} numberOfLines={1}>{selected.type || L("Yardım Talebi", "Aid Request")}</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Inter", fontSize: 12, marginTop: 3 }} numberOfLines={1}>{selected.description || L("Detay için talebi açın.", "Open request for details.")}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <View style={{ borderRadius: 999, backgroundColor: `${urgColor}28`, borderWidth: 1.5, borderColor: `${urgColor}60`, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ color: urgColor, fontFamily: "Inter-Bold", fontSize: 12 }}>{selected.urgency || L("Düşük", "Low")}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={15} color="rgba(255,255,255,0.65)" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", padding: 10 }}>
                <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Inter", fontSize: 10, marginBottom: 2 }}>{L("Mesafe", "Distance")}</Text>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 18 }}>{selectedDistance || "-"} km</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", padding: 10 }}>
                <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Inter", fontSize: 10, marginBottom: 2 }}>{L("Durum", "Status")}</Text>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14, marginTop: 1 }}>{statusLabel[selected.status || "open"]}</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => navigation.navigate("VolunteerRequestDetail", { requestId: selected.id })}
                style={{ flex: 1, height: 50, borderRadius: 15, backgroundColor: "#be123c", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, shadowColor: "#ef4444", shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}
              >
                <Ionicons name="document-text-outline" size={17} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Talebi İncele", "View Request")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void openExternalRoute()}
                style={{ flex: 1, height: 50, borderRadius: 15, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1.5, borderColor: "rgba(96,165,250,0.4)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }}
              >
                <Ionicons name="navigate-outline" size={17} color="#60a5fa" />
                <Text style={{ color: "#60a5fa", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Rota Aç", "Navigate")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ position: "absolute", left: 14, right: 14, bottom: 106 }}>
          <View style={{ borderRadius: 16, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.55)" />
            <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter", fontSize: 13, flex: 1 }}>
              {L("Bir marker'a dokunarak talep detayını görün.", "Tap a marker to see request details.")}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

// [FONKSIYON] MetricBox: Alt bilgi panelindeki metrik kutusunu üretir.
const MetricBox = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 10 }}>
    <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{label}</Text>
    <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14, marginTop: 2 }}>{value}</Text>
  </View>
);
