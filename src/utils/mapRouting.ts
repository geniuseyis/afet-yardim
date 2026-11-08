/**
 * MAP ROUTING YARDIMCI MODÜLÜ
 * ─────────────────────────────────────────────────────────────────────────────
 * Gönüllü konumundan talep konumuna "güvenli rota" hesaplar.
 * Engelli bölgeler (blockedAreas) rotadan kaçınılır; kaçınılamazsa uyarı verilir.
 *
 * KULLANIM (VolunteerMapScreen veya VolunteerTaskTrackingScreen içinde):
 *   import { calculateSafeRoute, MOCK_BLOCKED_AREAS } from "../../utils/mapRouting";
 *
 *   const result = calculateSafeRoute(
 *     { lat: 41.015, lng: 28.979 },   // gönüllü konumu
 *     { lat: 41.022, lng: 28.991 },   // talep konumu
 *     MOCK_BLOCKED_AREAS
 *   );
 *   // result.waypoints → haritada çizilecek koordinat listesi
 *   // result.warnings  → geçilen engelli bölge uyarıları
 *   // result.distanceKm → toplam tahmini mesafe
 */

// ─── TİP TANIMLARI ─────────────────────────────────────────────────────────

/** GPS koordinatı */
export type LatLng = { lat: number; lng: number };

/**
 * Engelli bölge tanımı.
 * Firestore'da "blocked_areas/{id}" koleksiyonuna yazılabilir.
 *
 * Firestore şeması:
 *   id: string          → benzersiz kimlik
 *   label: string       → "Köprü kapalı", "Çökmüş bina"
 *   severity: "low" | "medium" | "high"
 *   center: LatLng      → bölgenin merkezi
 *   radiusKm: number    → etki yarıçapı (km)
 *   active: boolean     → false ise dikkate alınmaz
 */
export type BlockedArea = {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  center: LatLng;
  radiusKm: number;
  active: boolean;
};

/** Rota hesaplama sonucu */
export type RouteResult = {
  waypoints: LatLng[];    // haritada çizilecek sıralı koordinatlar
  distanceKm: number;     // toplam tahmini mesafe
  warnings: string[];     // geçilen/yaklaşılan engelli bölge uyarıları
  hasBlockedSegment: boolean; // rota üzerinde aktif engel var mı
};

// ─── MOCK VERİ: Engelli Bölgeler ───────────────────────────────────────────
/**
 * Geliştirme aşaması için örnek engelli bölgeler.
 * Üretimde bu veriler Firestore "blocked_areas" koleksiyonundan okunur.
 */
export const MOCK_BLOCKED_AREAS: BlockedArea[] = [
  {
    id: "block-001",
    label: "Çökmüş bina — Kadıköy Merkez",
    severity: "high",
    center: { lat: 40.9906, lng: 29.0280 },
    radiusKm: 0.4,
    active: true
  },
  {
    id: "block-002",
    label: "Köprü hasar — Boğaziçi Güney",
    severity: "medium",
    center: { lat: 41.0455, lng: 29.0333 },
    radiusKm: 0.6,
    active: true
  },
  {
    id: "block-003",
    label: "Sel baskını — Bakırköy",
    severity: "high",
    center: { lat: 40.9780, lng: 28.8720 },
    radiusKm: 1.0,
    active: true
  },
  {
    id: "block-004",
    label: "Gaz sızıntısı — Beşiktaş",
    severity: "medium",
    center: { lat: 41.0428, lng: 29.0050 },
    radiusKm: 0.3,
    active: false  // Aktif değil — bu bölge dikkate alınmaz
  }
];

// ─── YARDIMCI FONKSİYONLAR ─────────────────────────────────────────────────

/**
 * haversineKm — İki nokta arasındaki mesafeyi km cinsinden hesaplar.
 * (functions/src/index.ts ile aynı algoritma; frontend için kopyalanmıştır)
 */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
};

/**
 * isNearBlockedArea — Verilen nokta bir engelli bölgeye yakın mı?
 * radiusKm × 1.2 toleransı ile kontrol eder (biraz geniş tutulur).
 */
const isNearBlockedArea = (point: LatLng, areas: BlockedArea[]): BlockedArea[] =>
  areas.filter(
    (a) => a.active && haversineKm(point, a.center) <= a.radiusKm * 1.2
  );

/**
 * midpoint — İki koordinat arasındaki orta noktayı bulur.
 * Rota sapması hesaplamak için kullanılır.
 */
const midpoint = (a: LatLng, b: LatLng): LatLng => ({
  lat: (a.lat + b.lat) / 2,
  lng: (a.lng + b.lng) / 2
});

/**
 * deflect — Bir noktayı engelli bölgeden kaçınmak için hafifçe saptırır.
 * Enlem veya boylam ekseninde küçük bir offset uygular.
 *
 * severity bazlı offset:
 *   low    → 0.005° (~550m)
 *   medium → 0.010° (~1.1km)
 *   high   → 0.018° (~2km)
 */
const deflect = (point: LatLng, area: BlockedArea): LatLng => {
  const offsetMap = { low: 0.005, medium: 0.010, high: 0.018 };
  const offset = offsetMap[area.severity];
  // Basit sapma: engelin merkezine göre enlem veya boylamdan sap
  const latDiff = point.lat - area.center.lat;
  const lngDiff = point.lng - area.center.lng;
  if (Math.abs(latDiff) >= Math.abs(lngDiff)) {
    // Kuzeye veya güneye sap
    return { lat: point.lat + (latDiff >= 0 ? offset : -offset), lng: point.lng };
  }
  // Doğuya veya batıya sap
  return { lat: point.lat, lng: point.lng + (lngDiff >= 0 ? offset : -offset) };
};

// ─── ANA FONKSİYON ─────────────────────────────────────────────────────────

/**
 * calculateSafeRoute
 * ─────────────────────────────────────────────────────────────────────────────
 * Gönüllü konumundan talep konumuna, engelli bölgelerden kaçınan bir rota üretir.
 *
 * ALGORİTMA:
 *   1. Başlangıç → Bitiş arasında 5 ara nokta üret (doğrusal interpolasyon)
 *   2. Her ara nokta için engelli bölge kontrolü yap
 *   3. Engel varsa → noktayı deflect() ile saptır, uyarı ekle
 *   4. Tüm waypoint'lerin toplam mesafesini hesapla
 *
 * NOT: Gerçek üretimde bu hesaplama Google Maps Directions API veya
 * OpenRouteService API ile yapılır. Bu implementasyon
 * geliştirme aşaması için yeterlidir.
 */
export const calculateSafeRoute = (
  origin: LatLng,
  destination: LatLng,
  blockedAreas: BlockedArea[] = MOCK_BLOCKED_AREAS
): RouteResult => {
  const STEPS = 5; // Ara nokta sayısı (artırılabilir)
  const warnings: string[] = [];
  let hasBlockedSegment = false;

  // 1. Doğrusal interpolasyon ile ara noktalar üret
  const rawPoints: LatLng[] = [origin];
  for (let i = 1; i < STEPS; i++) {
    const t = i / STEPS;
    rawPoints.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t
    });
  }
  rawPoints.push(destination);

  // 2. Her noktayı engel kontrolünden geç, gerekirse saptır
  const safePoints: LatLng[] = rawPoints.map((point, idx) => {
    // Başlangıç ve bitiş noktasını saptırma (talep ve gönüllü konumu sabit kalmalı)
    if (idx === 0 || idx === rawPoints.length - 1) return point;

    const nearBlocked = isNearBlockedArea(point, blockedAreas);
    if (nearBlocked.length === 0) return point;

    hasBlockedSegment = true;
    // En şiddetli engeli al ve saptır
    const worstBlock = nearBlocked.sort((a, b) =>
      (b.severity === "high" ? 2 : b.severity === "medium" ? 1 : 0) -
      (a.severity === "high" ? 2 : a.severity === "medium" ? 1 : 0)
    )[0];

    if (!warnings.includes(worstBlock.label)) {
      warnings.push(`⚠️ ${worstBlock.label} (${worstBlock.severity.toUpperCase()}) — rota saptırıldı`);
    }

    return deflect(point, worstBlock);
  });

  // 3. Toplam mesafeyi hesapla
  let distanceKm = 0;
  for (let i = 0; i < safePoints.length - 1; i++) {
    distanceKm += haversineKm(safePoints[i], safePoints[i + 1]);
  }

  return {
    waypoints: safePoints,
    distanceKm: Math.round(distanceKm * 100) / 100,
    warnings,
    hasBlockedSegment
  };
};

/**
 * formatRouteDistance — Mesafeyi okunabilir stringe çevirir.
 * Örnek: 0.45 → "450 m" | 3.2 → "3.2 km"
 */
export const formatRouteDistance = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

/**
 * estimateTravelMinutes — Mesafeyi tahmini sürüye çevirir.
 * Araçlı: 40 km/sa ortalama, yürüyüş: 5 km/sa
 */
export const estimateTravelMinutes = (km: number, mode: "driving" | "walking" = "driving"): number =>
  Math.ceil((km / (mode === "driving" ? 40 : 5)) * 60);
