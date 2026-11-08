import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, Callout, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { readOfflineCache, saveOfflineCache } from "../../services/offlineCache";
import { l } from "../../services/i18n";

/**
 * MAP DOSYA HARITASI
 * - MAP-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - MAP-POI: Bu bolumde haritadaki yakin nokta (POI) verileri islenir.
 * - MAP-OFFLINE: Bu bolumde cevrimdisi yedekleme ve cache davranisi aciklanir.
 * - MAP-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

export const MapScreen = () => {
  const navigation = useNavigation<any>();
  const { userData, user } = useStore();
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const offlineMode = useStore((s) => s.offlineMode);
  const showToast = useStore((s) => s.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const role = userData?.role || "victim";
  const [loc, setLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "assigned" | "in_progress" | "closed">("all");
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);
  const [nearbyPoi, setNearbyPoi] = useState<Array<{
    id: string;
    kind: "hospital" | "assembly";
    title: string;
    latitude: number;
    longitude: number;
    distanceKm?: string | null;
  }>>([]);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showAssembly, setShowAssembly] = useState(true);
  const [zoomDelta, setZoomDelta] = useState(0.08);

  // Programatik yakınlaştırma / uzaklaştırma
  const zoomIn = () => {
    const next = Math.max(0.002, zoomDelta / 2);
    setZoomDelta(next);
    const center = loc || fallbackCenter;
    mapRef.current?.animateToRegion({ latitude: center.latitude, longitude: center.longitude, latitudeDelta: next, longitudeDelta: next }, 300);
  };
  const zoomOut = () => {
    const next = Math.min(8, zoomDelta * 2);
    setZoomDelta(next);
    const center = loc || fallbackCenter;
    mapRef.current?.animateToRegion({ latitude: center.latitude, longitude: center.longitude, latitudeDelta: next, longitudeDelta: next }, 300);
  };
  const recenter = () => {
    const center = loc || fallbackCenter;
    mapRef.current?.animateToRegion({ latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 350);
  };
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const cacheUid = user?.uid || "anon";
  const fallbackCenter = { latitude: 41.0082, longitude: 28.9784 };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoc(fallbackCenter);
        return;
      }
      try {
        const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const newLoc = { latitude: now.coords.latitude, longitude: now.coords.longitude };
        setLoc(newLoc);
        // Konum gelince haritayı kullanıcı konumuna animasyonla taşı
        mapRef.current?.animateToRegion(
          { ...newLoc, latitudeDelta: 0.06, longitudeDelta: 0.06 },
          600
        );
      } catch {
        // GPS alınamadıysa son bilinen konumu dene
        try {
          const last = await Location.getLastKnownPositionAsync({});
          if (last?.coords) {
            const newLoc = { latitude: last.coords.latitude, longitude: last.coords.longitude };
            setLoc(newLoc);
            mapRef.current?.animateToRegion({ ...newLoc, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 600);
          } else {
            setLoc(fallbackCenter);
          }
        } catch {
          setLoc(fallbackCenter);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (role === "coordinator") {
      const q = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(180));
      return onSnapshot(
        q,
        (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req))),
        (err: any) => {
          if (!String(err?.code || "").includes("permission-denied")) {
            showToast("Harita verileri yüklenemedi.", "error");
          }
        }
      );
    }

    if (role === "victim") {
      if (!user) {
        setRequests([]);
        return;
      }
      const q = query(collection(db, "requests"), where("createdBy", "==", user.uid));
      return onSnapshot(
        q,
        (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req))),
        (err: any) => {
          if (!String(err?.code || "").includes("permission-denied")) {
            showToast("Harita verileri yüklenemedi.", "error");
          }
        }
      );
    }

    if (role === "volunteer" && !isVolunteerApproved(userData as any)) {
      setRequests([]);
      return;
    }

    const q = query(collection(db, "requests"), where("status", "in", ["open", "assigned", "in_progress"] as any));
    return onSnapshot(
      q,
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Req))),
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast("Harita verileri yüklenemedi.", "error");
        }
      }
    );
  }, [role, showToast, user, userData]);

  useEffect(() => {
    if (role !== "victim") return;
    const baseLoc = loc || fallbackCenter;
    let cancelled = false;
    const buildFallbackPoi = () => ([
      {
        id: "fallback-hospital-1",
        kind: "hospital",
        title: L("Yakın Hastane", "Nearby Hospital"),
        latitude: baseLoc.latitude + 0.012,
        longitude: baseLoc.longitude + 0.006,
        distanceKm: kmBetween(baseLoc, { lat: baseLoc.latitude + 0.012, lng: baseLoc.longitude + 0.006 })
      },
      {
        id: "fallback-hospital-2",
        kind: "hospital",
        title: L("Acil Servis Noktası", "Emergency Service Point"),
        latitude: baseLoc.latitude - 0.011,
        longitude: baseLoc.longitude + 0.014,
        distanceKm: kmBetween(baseLoc, { lat: baseLoc.latitude - 0.011, lng: baseLoc.longitude + 0.014 })
      },
      {
        id: "fallback-assembly-1",
        kind: "assembly",
        title: L("Toplanma Alanı", "Assembly Area"),
        latitude: baseLoc.latitude - 0.008,
        longitude: baseLoc.longitude - 0.01,
        distanceKm: kmBetween(baseLoc, { lat: baseLoc.latitude - 0.008, lng: baseLoc.longitude - 0.01 })
      },
      {
        id: "fallback-assembly-2",
        kind: "assembly",
        title: L("Güvenli Toplanma Noktası", "Safe Assembly Point"),
        latitude: baseLoc.latitude + 0.015,
        longitude: baseLoc.longitude - 0.012,
        distanceKm: kmBetween(baseLoc, { lat: baseLoc.latitude + 0.015, lng: baseLoc.longitude - 0.012 })
      }
    ] as any);
    const fetchNearbyPoi = async () => {
      setPoiLoading(true);
      try {
        // hastane ve toplanma alanlari OpenStreetMap verisinden gelir, anahtar gerekmez
        const radius = 45000;
        const queryBody = `
[out:json][timeout:20];
(
  node(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"~"hospital|clinic|doctors"];
  node(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["healthcare"];
  node(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["emergency"="assembly_point"];
  node(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"="shelter"];
  node(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["name"~"Toplanma|Assembly",i];
  way(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"~"hospital|clinic|doctors"];
  way(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["healthcare"];
  way(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["emergency"="assembly_point"];
  way(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"="shelter"];
  way(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["name"~"Toplanma|Assembly",i];
  relation(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"~"hospital|clinic|doctors"];
  relation(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["healthcare"];
  relation(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["emergency"="assembly_point"];
  relation(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["amenity"="shelter"];
  relation(around:${radius},${baseLoc.latitude},${baseLoc.longitude})["name"~"Toplanma|Assembly",i];
);
out center;`;
        const endpoints = [
          "https://overpass-api.de/api/interpreter",
          "https://overpass.kumi.systems/api/interpreter"
        ];
        let json: any = null;
        for (const endpoint of endpoints) {
          try {
            // Promise.race timeout (8 sn) — harita yüklenirken takılı kalmaz
            const fetchPromise = fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=UTF-8" },
              body: queryBody
            }).then(async (res) => (res.ok ? await res.json() : null));
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
            const result = await Promise.race([fetchPromise, timeoutPromise]);
            if (result && Array.isArray(result?.elements)) {
              json = result;
              break;
            }
          } catch {
            // try next endpoint
          }
        }
        const rows = Array.isArray(json?.elements) ? json.elements : [];
        const mapped = rows.map((el: any) => {
          const latitude = el.lat ?? el.center?.lat;
          const longitude = el.lon ?? el.center?.lon;
          if (!latitude || !longitude) return null;
          const kind =
            el.tags?.amenity === "hospital" ||
            el.tags?.amenity === "clinic" ||
            el.tags?.amenity === "doctors" ||
            !!el.tags?.healthcare
              ? "hospital"
              : "assembly";
          const rawName = String(el.tags?.name || "").trim();
          const cleanName =
            rawName &&
            !["osm", "openstreetmap", "open street map"].includes(rawName.toLocaleLowerCase("tr"))
              ? rawName
              : "";
          const title =
            cleanName ||
            (kind === "hospital" ? "Hastane" : "Toplanma Alanı");
          return {
            id: `${kind}-${el.type}-${el.id}`,
            kind,
            title,
            latitude,
            longitude,
            distanceKm: kmBetween(baseLoc, { lat: latitude, lng: longitude })
          };
        }).filter(Boolean);
        let uniq = Array.from(new Map(mapped.map((m: any) => [m.id, m])).values()).slice(0, 160);
        if (!uniq.length) {
          uniq = buildFallbackPoi();
        }
        if (!cancelled) setNearbyPoi(uniq as any);
      } catch {
        if (!cancelled) {
          setNearbyPoi(buildFallbackPoi());
          showToast(L("Canlı harita verisi alınamadı. Yakın yedek noktalar gösteriliyor.", "Live map data could not be fetched. Showing nearby fallback points."), "info");
        }
      } finally {
        if (!cancelled) setPoiLoading(false);
      }
    };
    fetchNearbyPoi();
    return () => { cancelled = true; };
  }, [role, loc, locale, showToast]);

  const visibleRequests = useMemo(() => {
    if (role !== "coordinator") return requests.filter((r) => r.status !== "closed");
    return requests.filter((r) => (statusFilter === "all" ? true : (r.status || "open") === statusFilter));
  }, [requests, role, statusFilter]);

  const counts = useMemo(() => {
    const all = role === "coordinator" ? requests : visibleRequests;
    return {
      open: all.filter((r) => (r.status || "open") === "open").length,
      assigned: all.filter((r) => r.status === "assigned").length,
      inProgress: all.filter((r) => r.status === "in_progress").length,
      closed: all.filter((r) => r.status === "closed").length
    };
  }, [requests, role, visibleRequests]);

  const urgentRows = useMemo(() => {
    return visibleRequests
      .filter((r) => r.status !== "closed" && isUrgent(r.urgency))
      .slice(0, 6);
  }, [visibleRequests]);

  const focusReq = useMemo(() => {
    return visibleRequests.find((r) => r.id === focusRequestId) || urgentRows[0] || visibleRequests[0] || null;
  }, [focusRequestId, urgentRows, visibleRequests]);

  useEffect(() => {
    if (!focusReq?.location?.lat || !focusReq?.location?.lng || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: focusReq.location.lat,
      longitude: focusReq.location.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05
    }, 350);
  }, [focusReq]);

  if (role === "coordinator") {
    const initialLat = focusReq?.location?.lat || loc?.latitude || 41.01;
    const initialLng = focusReq?.location?.lng || loc?.longitude || 29.05;

    return (
      <View style={[s.coordMapPage, { backgroundColor: lightMode ? "#eef2f7" : amoledMode ? "#020205" : "#0b0910" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Home")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              marginRight: 8
            }}
          >
            <Ionicons name="arrow-back" size={18} color="#fff1f2" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.coordTitleSmall}>{L("Operasyon Haritası", "Operations Map")}</Text>
            <Text style={s.coordListSub}>{L("Canlı talepler ve saha yoğunluğu", "Live requests and field density")}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {[
            { key: "all", label: L("Tüm Talepler", "All Requests") },
            { key: "open", label: L("Bekleyen", "Open") },
            { key: "assigned", label: L("Atanan", "Assigned") },
            { key: "in_progress", label: L("Yolda", "In Progress") },
            { key: "closed", label: L("Tamamlanan", "Completed") }
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.coordFilterChip, statusFilter === f.key && s.coordFilterChipActive]}
              onPress={() => setStatusFilter(f.key as any)}
            >
              <Text style={[s.coordFilterText, statusFilter === f.key && s.coordFilterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.coordMapMainWrap}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{ latitude: initialLat, longitude: initialLng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          >
            {loc ? <Marker coordinate={loc} pinColor={C.blue} title="Merkez Konum" /> : null}
            {visibleRequests.slice(0, 100).map((r) => {
              if (!r.location?.lat || !r.location?.lng) return null;
              const pin = r.status === "assigned" ? C.blue : r.status === "in_progress" ? C.amber : r.status === "closed" ? C.green : C.red;
              return (
                <Marker
                  key={r.id}
                  coordinate={{ latitude: r.location.lat, longitude: r.location.lng }}
                  pinColor={pin}
                  title={r.type || "Talep"}
                  description={`${statusLabel[r.status || "open"]} - ${urgencyLabel(r.urgency)}`}
                />
              );
            })}
          </MapView>
        </View>

        <View style={s.coordLegendRow}>
          <View style={s.coordLegendItem}><View style={[s.coordLegendDot, { backgroundColor: C.red }]} /><Text style={s.coordLegendText}>{L("Bekleyen", "Open")}: {counts.open}</Text></View>
          <View style={s.coordLegendItem}><View style={[s.coordLegendDot, { backgroundColor: C.blue }]} /><Text style={s.coordLegendText}>{L("Atanan", "Assigned")}: {counts.assigned}</Text></View>
          <View style={s.coordLegendItem}><View style={[s.coordLegendDot, { backgroundColor: C.amber }]} /><Text style={s.coordLegendText}>{L("Yolda", "In Progress")}: {counts.inProgress}</Text></View>
          <View style={s.coordLegendItem}><View style={[s.coordLegendDot, { backgroundColor: C.green }]} /><Text style={s.coordLegendText}>{L("Tamam", "Done")}: {counts.closed}</Text></View>
        </View>

        <Text style={s.coordManageTitle}>{L("ÖNCELİKLİ TALEPLER", "PRIORITY REQUESTS")}</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {urgentRows.map((r) => (
            <TouchableOpacity key={r.id} style={s.coordMapReqCard} onPress={() => setFocusRequestId(r.id)}>
              <View style={{ flex: 1 }}>
                <Text style={s.coordMapReqTitle}>{r.type || "Acil Talep"}</Text>
                <Text style={s.coordMapReqSub}>Durum: {statusLabel[r.status || "open"]} - Aciliyet: {urgencyLabel(r.urgency)}</Text>
              </View>
              <View style={s.coordMapFocusBtn}>
                <Text style={s.coordMapFocusText}>ODAKLA</Text>
              </View>
            </TouchableOpacity>
          ))}
          {!urgentRows.length && <Text style={s.volEmpty}>{L("Filtrede acil talep bulunmuyor.", "No urgent requests in this filter.")}</Text>}
        </ScrollView>
      </View>
    );
  }

  const filteredPoi = nearbyPoi.filter((p) => (p.kind === "hospital" ? showHospitals : showAssembly));
  const selectedPoi = filteredPoi.find((p) => p.id === selectedPoiId) || filteredPoi[0] || null;

  return (
    <View style={{ flex: 1, backgroundColor: lightMode ? "#eef2f7" : amoledMode ? "#020205" : "#0b0910" }}>
      <View style={{ flex: 1 }}>
        {/* Harita her zaman render edilir; loc null iken İstanbul merkezi gösterilir.
            Konum gelince animateToRegion ile güncellenir. */}
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: loc?.latitude ?? fallbackCenter.latitude,
            longitude: loc?.longitude ?? fallbackCenter.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08
          }}
        >
          {loc && <Marker coordinate={loc} pinColor={C.blue} title={L("Konumunuz", "Your Location")} />}
          {/* POI Marker'ları: hastane (kırmızı) ve toplanma alanları (yeşil) — Callout ile isim gösterir */}
          {filteredPoi.map((p) => {
            const safeName = p.title && p.title.trim().length > 0 ? p.title : (p.kind === "hospital" ? L("Hastane", "Hospital") : L("Toplanma Alanı", "Assembly Point"));
            return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              pinColor={p.kind === "hospital" ? "#ef4444" : "#22c55e"}
              title={safeName}
              description={p.kind === "hospital" ? L("Hastane", "Hospital") : L("Toplanma Alanı", "Assembly Point")}
              onPress={() => setSelectedPoiId(p.id)}
            >
              <Callout tooltip={false}>
                <View style={{ backgroundColor: "white", borderRadius: 10, padding: 10, maxWidth: 240, minWidth: 140 }}>
                  <Text style={{ fontFamily: "Inter-Bold", fontSize: 11, color: p.kind === "hospital" ? "#dc2626" : "#16a34a", marginBottom: 4, letterSpacing: 0.5 }}>
                    {p.kind === "hospital" ? "🏥 HASTANE" : "🟢 TOPLANMA ALANI"}
                  </Text>
                  <Text style={{ fontFamily: "Inter-Bold", fontSize: 13, color: "#0f172a", marginBottom: 3 }} numberOfLines={2}>
                    {safeName}
                  </Text>
                  {(p as any).address ? (
                    <Text style={{ fontFamily: "Inter", fontSize: 10, color: "#475569", marginBottom: 4 }} numberOfLines={2}>
                      📍 {(p as any).address}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                    {p.distanceKm ? (
                      <Text style={{ fontFamily: "Inter-Bold", fontSize: 10, color: "#0f172a" }}>
                        🚶 {p.distanceKm} km
                      </Text>
                    ) : null}
                    {(p as any).rating ? (
                      <Text style={{ fontFamily: "Inter-Bold", fontSize: 10, color: "#b45309" }}>
                        ⭐ {(p as any).rating.toFixed(1)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Callout>
            </Marker>
          );
          })}
        </MapView>

        {/* Sağ kenar kontrol butonları */}
        <View pointerEvents="box-none" style={{ position: "absolute", right: 14, top: "32%", gap: 10 }}>
          <TouchableOpacity
            onPress={recenter}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.78)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
          >
            <Ionicons name="locate" size={21} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={zoomIn}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.78)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={zoomOut}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.78)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
          >
            <Ionicons name="remove" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowHospitals((v) => !v)}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: showHospitals ? "#ef4444" : "rgba(0,0,0,0.78)", borderWidth: 1.5, borderColor: showHospitals ? "#fecaca" : "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
          >
            <Ionicons name={poiLoading ? "sync" : "medical"} size={21} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAssembly((v) => !v)}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: showAssembly ? "#22c55e" : "rgba(0,0,0,0.78)", borderWidth: 1.5, borderColor: showAssembly ? "#bbf7d0" : "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, elevation: 8 }}
          >
            <Ionicons name={poiLoading ? "sync" : "people"} size={21} color="white" />
          </TouchableOpacity>
        </View>

        <LinearGradient
          pointerEvents="none"
          colors={["rgba(11,9,16,0.85)", "rgba(11,9,16,0.35)", "rgba(11,9,16,0)"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180 }}
        />

        <View style={{ position: "absolute", top: 54, left: 14, right: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <View>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 26 }}>{L("Canlı Harita", "Live Map")}</Text>
              <Text style={{ color: "#cbd5e1", fontFamily: "Inter", fontSize: 12 }}>{L("Yakın hastane ve toplanma alanları", "Nearby hospitals and assembly areas")}</Text>
            </View>
            <TouchableOpacity
              onPress={() => loc && mapRef.current?.animateToRegion({ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 350)}
              style={{ borderRadius: 999, backgroundColor: "rgba(193,18,31,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("KONUMUMA DÖN", "RETURN TO LOCATION")}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <TouchableOpacity onPress={() => setShowHospitals((v) => !v)} style={{ borderRadius: 999, backgroundColor: showHospitals ? "rgba(127,29,29,0.65)" : "rgba(15,23,42,0.72)", borderWidth: 1, borderColor: showHospitals ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.08)", paddingHorizontal: 10, height: 34, alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444", marginRight: 6 }} />
              <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{showHospitals ? L("HASTANE", "HOSPITAL") : L("HASTANE KAPALI", "HOSPITAL OFF")} ({nearbyPoi.filter((p) => p.kind === "hospital").length})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAssembly((v) => !v)} style={{ borderRadius: 999, backgroundColor: showAssembly ? "rgba(20,83,45,0.65)" : "rgba(15,23,42,0.72)", borderWidth: 1, borderColor: showAssembly ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.08)", paddingHorizontal: 10, height: 34, alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e", marginRight: 6 }} />
              <Text style={{ color: "#bbf7d0", fontFamily: "Inter-Bold", fontSize: 11 }}>{showAssembly ? L("TOPLANMA", "ASSEMBLY") : L("TOPLANMA KAPALI", "ASSEMBLY OFF")} ({nearbyPoi.filter((p) => p.kind === "assembly").length})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate("ChatDetail", { bot: true, title: "Afet.AI Harita", seedPrompt: `Konumumun yakınındaki hastane ve toplanma alanları için güvenli yol/öneriler ver. Hastane:${nearbyPoi.filter((p) => p.kind === "hospital").length}, Toplanma:${nearbyPoi.filter((p) => p.kind === "assembly").length}` })}
              style={{ borderRadius: 999, backgroundColor: "rgba(193,18,31,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 10, height: 34, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("AFET.AI ROTA", "AFET.AI ROUTE")}</Text>
            </TouchableOpacity>
            {poiLoading ? (
              <View style={{ borderRadius: 999, backgroundColor: "rgba(15,23,42,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, height: 34, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#cbd5e1", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("YÜKLENİYOR", "LOADING")}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {selectedPoi ? (
          <View style={{ position: "absolute", left: 14, right: 14, bottom: 100, borderRadius: 16, backgroundColor: "rgba(8,10,16,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: selectedPoi.kind === "hospital" ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Ionicons name={selectedPoi.kind === "hospital" ? "medical-outline" : "shield-checkmark-outline"} size={20} color={selectedPoi.kind === "hospital" ? "#f87171" : "#4ade80"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13 }} numberOfLines={1}>{selectedPoi.title}</Text>
                <Text style={{ color: "#cbd5e1", fontFamily: "Inter", fontSize: 11 }}>
                  {selectedPoi.kind === "hospital" ? L("Hastane", "Hospital") : L("Toplanma Alanı", "Assembly Area")} • {selectedPoi.distanceKm || "-"} km
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => mapRef.current?.animateToRegion({ latitude: selectedPoi.latitude, longitude: selectedPoi.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 300)}
                style={{ borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("ODAKLA", "FOCUS")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};
