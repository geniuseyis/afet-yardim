import {
  React, useEffect, useMemo, useState,
  ScrollView, Text, TextInput, TouchableOpacity, View, Ionicons, Haptics,
  LinearGradient,
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, db, useStore,
  kmBetween, toMillis
} from "../shared/ScreenDeps";
import type { Req } from "../shared/ScreenDeps";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l } from "../../services/i18n";

/**
 * VOL-AVAILABLE DOSYA HARITASI
 * - VOL-AVAILABLE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-AVAILABLE-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
 * - VOL-AVAILABLE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-AVAILABLE-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type RiskFilter = "all" | "urgent" | "medium" | "low";
type CategoryFilter = "all" | "health" | "food" | "shelter" | "other";

// [FONKSIYON] urgencyColor: Görev aciliyet değerini rozet rengine dönüştürür.
const urgencyColor = (urgency?: string) => {
  const s = `${urgency || ""}`.toLowerCase();
  if (s.includes("acil") || s.includes("high")) return "#ef4444";
  if (s.includes("orta") || s.includes("medium")) return "#f59e0b";
  return "#22c55e";
};

// [FONKSIYON] includesAny: Metinde anahtar kelimelerden en az biri var mı kontrol eder.
const includesAny = (value: string, keys: string[]) => keys.some((k) => value.includes(k));

// [FONKSIYON] VolunteerAvailableMissionsScreen: Yeni açık görevleri filtreleyip başvuru akışını yönetir.
export const VolunteerAvailableMissionsScreen = ({ navigation }: { navigation: any }) => {
  const { user, userData, showToast } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [rows, setRows] = useState<Req[]>([]);
  const [appliedIds, setAppliedIds] = useState<Record<string, "pending" | "approved">>({});
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("week");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const canApply = isVolunteerApproved(userData as any);

  // VOL-AVAILABLE-VERI: Her zaman açık talepler dinlenir; Apply butonu canApply'a göre devre dışı kalır.
  // canApply değişince listener'ı sıfırlamıyoruz — bu listeyi gereksiz boşaltırdı.
  useEffect(() => {
    const q = query(collection(db, "requests"), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Req))
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setRows(list);
      },
      (err: any) => {
        const code = String(err?.code || "");
        if (!code.includes("permission-denied")) {
          console.warn("[volunteer-available] requests snapshot error:", err);
          showToast(L("Görev listesi yüklenemedi.", "Mission list could not be loaded."), "error");
        }
      }
    );
  }, [showToast, locale]);

  // VOL-AVAILABLE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user || !canApply) {
      setAppliedIds({});
      return;
    }
    const q = query(collection(db, "volunteerApplications"), where("volunteerId", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const next: Record<string, "pending" | "approved"> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data?.requestId && (data?.status === "pending" || data?.status === "approved")) {
            next[data.requestId] = data.status;
          }
        });
        setAppliedIds(next);
      },
      (err: any) => {
        if (!String(err?.code || "").includes("permission-denied")) {
          console.warn("[volunteer-available] applications snapshot error:", err);
        }
        setAppliedIds({});
        if (!String(err?.code || "").includes("permission-denied")) {
          showToast(L("Başvuru geçmişi yüklenemedi.", "Application history could not be loaded."), "info");
        }
      }
    );
  }, [user, showToast, canApply, locale]);

  // VOL-AVAILABLE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    (async () => {
      const L = await import("expo-location");
      const { status } = await L.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await L.getCurrentPositionAsync({});
      setMyLoc({ latitude: now.coords.latitude, longitude: now.coords.longitude });
    })();
  }, []);

  const regionCandidates = useMemo(() => {
    const seeded = [(userData as any)?.regionId, (userData as any)?.city]
      .filter(Boolean)
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
    return ["all", ...Array.from(new Set(seeded))];
  }, [userData]);

  // VOL-AVAILABLE-FILTER: Bu bolumde filtreleme, sekme ve gorunum secim mantigi bulunur.
  const filtered = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return rows
      .filter((r) => {
        const urgencyText = `${r.urgency || ""}`.toLowerCase();
        const typeText = `${r.type || ""}`.toLowerCase();
        const created = toMillis(r.createdAt) || now;
        const regionText = `${(r as any).regionId || (r as any).city || ""}`.toLowerCase();
        const q = search.trim().toLowerCase();

        if (risk === "urgent" && !(urgencyText.includes("acil") || urgencyText.includes("high"))) return false;
        if (risk === "medium" && !(urgencyText.includes("orta") || urgencyText.includes("medium"))) return false;
        if (risk === "low" && (urgencyText.includes("acil") || urgencyText.includes("high") || urgencyText.includes("orta") || urgencyText.includes("medium"))) return false;

        if (category === "health" && !includesAny(typeText, ["sağlık", "saglik", "medikal", "ilkyardım", "ilk yardım"])) return false;
        if (category === "food" && !includesAny(typeText, ["gıda", "gida", "yiyecek", "erzak"])) return false;
        if (category === "shelter" && !includesAny(typeText, ["barınma", "barinma", "çadır", "cadir"])) return false;
        if (category === "other" && includesAny(typeText, ["sağlık", "saglik", "gıda", "gida", "barınma", "barinma"])) return false;

        if (dateFilter === "today" && now - created > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "week" && now - created > weekMs) return false;
        if (cityFilter !== "all" && !regionText.includes(cityFilter.toLowerCase())) return false;
        if (q && !(`${typeText} ${regionText}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = Number(kmBetween(myLoc, a.location) || 999);
        const dbv = Number(kmBetween(myLoc, b.location) || 999);
        return da - dbv || toMillis(b.createdAt) - toMillis(a.createdAt);
      });
  }, [rows, risk, category, dateFilter, cityFilter, myLoc, search]);

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#07080b" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#0a0c10" : "#2a0d16";
  const card = lightMode ? "#ffffff" : amoledMode ? "#11131a" : "#3a101c";
  const soft = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";

  // [FONKSIYON] chip: Filtre butonlarının tekrar kullanılabilir UI bileşenini üretir.
  const chip = (active: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active
          ? (lightMode ? "rgba(159,18,57,0.3)" : "rgba(248,113,113,0.3)")
          : soft,
        backgroundColor: active
          ? (lightMode ? "rgba(190,18,60,0.1)" : "rgba(239,68,68,0.14)")
          : (lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)"),
        paddingHorizontal: 12,
        height: 34,
        justifyContent: "center",
        marginRight: 8,
        marginBottom: 8
      }}
    >
      <Text style={{ color: active ? (lightMode ? "#9f1239" : "#fff1f2") : textMuted, fontFamily: "Inter-Bold", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );

  // [FONKSIYON] applyToMission: Seçilen göreve volunteerApplications altında pending başvuru açar.
  const applyToMission = async (req: Req) => {
    if (!user?.uid) return;
    if (!canApply) {
      showToast(L("Gönüllü başvurunuz onaylanmadan yeni görevlere başvuramazsınız.", "You cannot apply to new missions before volunteer approval."), "info");
      return;
    }
    const status = appliedIds[req.id];
    if (status === "pending") return showToast(L("Başvurunuz zaten beklemede.", "Your application is already pending."), "info");
    if (status === "approved") return showToast(L("Bu görev için başvurunuz onaylandı.", "Your application for this mission is approved."), "success");

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const ref = doc(db, "volunteerApplications", `${user.uid}_${req.id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const currentStatus = String((snap.data() as any)?.status || "").toLowerCase();
      if (currentStatus === "approved") {
        setAppliedIds((prev) => ({ ...prev, [req.id]: "approved" }));
        return showToast(L("Bu görev için başvurunuz zaten onaylandı.", "Your application for this mission is already approved."), "success");
      }
      if (currentStatus === "rejected") {
        return showToast(L("Bu görev başvurunuz reddedilmiş. Yeniden açılması için yöneticiye başvurun.", "This mission application was rejected. Ask an admin to reopen it."), "error");
      }
      await updateDoc(ref, {
        status: "pending",
        updatedAt: serverTimestamp()
      } as any);
    } else {
      await setDoc(ref, {
        volunteerId: user.uid,
        requestId: req.id,
        status: "pending",
        regionId: (userData as any)?.regionId || (userData as any)?.city || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        requestType: req.type || null,
        riskLevel: req.urgency || null
      });
    }

    setAppliedIds((prev) => ({ ...prev, [req.id]: "pending" }));
    showToast(L("Başvuru alındı. Lider onayı bekleniyor.", "Application received. Waiting for leader approval."), "success");
  };

  // [FONKSIYON] withdrawApplication: Bekleyen başvuruyu geri çekip durumu withdrawn yapar.
  const withdrawApplication = async (req: Req) => {
    if (!user?.uid) return;
    const ref = doc(db, "volunteerApplications", `${user.uid}_${req.id}`);
    try {
      try {
        await updateDoc(ref, { status: "withdrawn", updatedAt: serverTimestamp() } as any);
      } catch {
        await setDoc(ref, { status: "withdrawn", updatedAt: serverTimestamp() }, { merge: true });
      }
      setAppliedIds((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
      showToast(L("Başvuru geri çekildi.", "Application withdrawn."), "info");
    } catch (e: any) {
      showToast(L("Başvuru geri çekilemedi. İnternet bağlantınızı kontrol edin.", "Could not withdraw application. Check your connection."), "error");
    }
  };

  // [FONKSIYON] goBackSafe: Güvenli geri dönüş yapar, geri stack yoksa Home'a gider.
  const goBackSafe = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else { try { navigation.goBack(); } catch {} }
  };

  // KPI hesaplamaları
  const urgentCount = rows.filter((r) => {
    const u = `${r.urgency || ""}`.toLowerCase();
    return u.includes("acil") || u.includes("high");
  }).length;
  const nearbyCount = rows.filter((r) => {
    const d = Number(kmBetween(myLoc, r.location) || 999);
    return d <= 5;
  }).length;
  const pendingApps = Object.keys(appliedIds).length;

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* ============ HEADER (Taleplerim DNA — Slim gradient + KPI'lar) ============ */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <TouchableOpacity onPress={goBackSafe} style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü Operasyon", "Volunteer Operations")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 24, lineHeight: 28, marginTop: 2 }}>{L("Yeni Görevler", "New Missions")}</Text>
          </View>
        </View>

        {/* KPI 3-column (Taleplerim DNA) */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {[
            { label: L("Açık", "Open"), value: rows.length, accent: "#ef4444", icon: "flash" as any },
            { label: L("Acil", "Urgent"), value: urgentCount, accent: "#f59e0b", icon: "alert-circle" as any },
            { label: L("Yakın 5km", "Nearby 5km"), value: nearbyCount, accent: "#22c55e", icon: "location" as any }
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
            placeholder={L("Görev veya bölge ara...", "Search mission or region...")}
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

      {/* ============ Filtre chips (4 tab — risk bazlı) ============ */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
        {[
          { key: "all" as RiskFilter, label: L("Tümü", "All"), icon: "albums-outline" as any, count: rows.length },
          { key: "urgent" as RiskFilter, label: L("Acil", "Urgent"), icon: "alert-circle-outline" as any, count: urgentCount },
          { key: "medium" as RiskFilter, label: L("Orta", "Medium"), icon: "warning-outline" as any, count: rows.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("orta") || `${r.urgency || ""}`.toLowerCase().includes("medium")).length },
          { key: "low" as RiskFilter, label: L("Düşük", "Low"), icon: "checkmark-circle-outline" as any, count: rows.length - urgentCount - rows.filter((r) => `${r.urgency || ""}`.toLowerCase().includes("orta") || `${r.urgency || ""}`.toLowerCase().includes("medium")).length }
        ].map((f) => {
          const isActive = risk === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setRisk(f.key)}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                borderRadius: 10, height: 38,
                backgroundColor: isActive ? (lightMode ? "#be123c" : "#dc2626") : card,
                borderWidth: 1, borderColor: isActive ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.4)") : soft
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 }}>
        {/* Görev kartları — Taleplerim DNA (sol accent bar + ikon avatar + meta + apply CTA) */}
        {filtered.map((req) => {
          const dist = kmBetween(myLoc, req.location);
          const color = urgencyColor(req.urgency);
          const applyStatus = appliedIds[req.id];
          const remaining = Math.max(1, 8 - ((req.id.charCodeAt(0) + req.id.length) % 7));
          const needed = remaining + 4 + (req.id.length % 5);
          const meta = (() => {
            const t = `${req.type || ""}`.toLowerCase();
            if (t.includes("sağ") || t.includes("sag") || t.includes("medikal") || t.includes("ilk")) return { icon: "medkit", color: "#ef4444", bg: "rgba(239,68,68,0.15)" };
            if (t.includes("gıd") || t.includes("gid") || t.includes("yiy")) return { icon: "fast-food", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" };
            if (t.includes("barı") || t.includes("bari") || t.includes("çadı") || t.includes("cadi")) return { icon: "home", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" };
            if (t.includes("su") || t.includes("water")) return { icon: "water", color: "#06b6d4", bg: "rgba(6,182,212,0.15)" };
            return { icon: "construct", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" };
          })();
          const fillPct = Math.round(((needed - remaining) / needed) * 100);

          return (
            <View key={req.id} style={{ borderRadius: 18, overflow: "hidden", backgroundColor: card, borderWidth: 1, borderColor: soft, marginBottom: 12, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}>
              <View style={{ flexDirection: "row" }}>
                {/* Sol accent bar */}
                <View style={{ width: 4, backgroundColor: color }} />
                <View style={{ flex: 1, padding: 14 }}>
                  {/* Başlık satırı */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: meta.bg, borderWidth: 1, borderColor: `${meta.color}22`, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>
                        {req.type || L("Yardım Görevi", "Aid Mission")}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: `${color}15`, borderWidth: 1, borderColor: `${color}40` }}>
                          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
                          <Text style={{ color: color, fontFamily: "Inter-Bold", fontSize: 9 }}>{req.urgency || L("Düşük", "Low")}</Text>
                        </View>
                        <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 10 }}>#{(req.id || "").slice(0, 6).toUpperCase()}</Text>
                      </View>
                    </View>
                    {dist ? (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15 }}>{dist}<Text style={{ fontSize: 10, color: textMuted }}> km</Text></Text>
                        <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 9 }}>{L("uzakta", "away")}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Gönüllü doluluk çubuğu */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                      <Ionicons name="people-outline" size={12} color={textMuted} />
                      <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginLeft: 4, flex: 1 }}>
                        {L(`${needed - remaining}/${needed} gönüllü dolu`, `${needed - remaining}/${needed} volunteers`)}
                      </Text>
                      <Text style={{ color: color, fontFamily: "Inter-Bold", fontSize: 11 }}>{remaining} {L("kalan", "left")}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: lightMode ? "#e2e8f0" : "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <View style={{ height: "100%", width: `${fillPct}%`, backgroundColor: color, borderRadius: 3 }} />
                    </View>
                  </View>

                  {/* Durum çubuğu (başvuru varsa) */}
                  {applyStatus ? (
                    <View style={{ borderRadius: 10, backgroundColor: applyStatus === "approved" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: applyStatus === "approved" ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <Ionicons name={applyStatus === "approved" ? "checkmark-circle" : "hourglass-outline"} size={14} color={applyStatus === "approved" ? "#22c55e" : "#f59e0b"} />
                      <Text style={{ color: applyStatus === "approved" ? "#22c55e" : "#f59e0b", fontFamily: "Inter-Bold", fontSize: 11 }}>
                        {applyStatus === "approved" ? L("Başvuru onaylandı", "Application approved") : L("Lider onayı bekleniyor", "Waiting for leader approval")}
                      </Text>
                    </View>
                  ) : null}

                  {/* Alt aksiyon satırı */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate("VolunteerRequestDetail", { requestId: req.id })}
                      style={{ flex: 1, height: 38, borderRadius: 10, backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: soft, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}
                    >
                      <Ionicons name="eye-outline" size={13} color={textMuted} />
                      <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Detay", "Detail")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => (applyStatus === "pending" ? withdrawApplication(req) : applyToMission(req))}
                      disabled={applyStatus === "approved"}
                      style={{
                        flex: 2, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
                        backgroundColor: applyStatus === "pending" ? "rgba(245,158,11,0.12)"
                          : applyStatus === "approved" ? "rgba(34,197,94,0.12)"
                          : color,
                        borderWidth: 1,
                        borderColor: applyStatus === "pending" ? "rgba(245,158,11,0.4)"
                          : applyStatus === "approved" ? "rgba(34,197,94,0.4)"
                          : `${color}cc`
                      }}
                    >
                      <Ionicons
                        name={applyStatus === "approved" ? "checkmark-circle" : applyStatus === "pending" ? "close-circle" : "send"}
                        size={14}
                        color={applyStatus === "pending" ? "#f59e0b" : applyStatus === "approved" ? "#22c55e" : "white"}
                      />
                      <Text style={{
                        color: applyStatus === "pending" ? "#f59e0b" : applyStatus === "approved" ? "#22c55e" : "white",
                        fontFamily: "Inter-Bold",
                        fontSize: 11
                      }}>
                        {applyStatus === "pending" ? L("GERİ ÇEK", "WITHDRAW") : applyStatus === "approved" ? L("ONAYLANDI ✓", "APPROVED ✓") : L("BAŞVUR", "APPLY")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {/* Boş durum */}
        {!filtered.length ? (
          <View style={{ borderRadius: 20, backgroundColor: card, borderWidth: 1, borderColor: soft, padding: 28, alignItems: "center", marginTop: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.12)", borderWidth: 1.5, borderColor: lightMode ? "rgba(239,68,68,0.16)" : "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="search-outline" size={32} color={lightMode ? "#be123c" : "#fda4af"} />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 16, marginBottom: 6 }}>{L("Görev bulunamadı", "No missions found")}</Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 13, textAlign: "center", lineHeight: 18, marginBottom: 14 }}>
              {risk !== "all" || search ? L("Filtreyi sıfırlayıp tekrar deneyin.", "Reset the filter and try again.") : L("Şu anda aktif yeni görev yok. Yakında yeni talepler eklenecek.", "No active missions right now. New requests coming soon.")}
            </Text>
            {(risk !== "all" || search) ? (
              <TouchableOpacity
                onPress={() => { setRisk("all"); setSearch(""); }}
                style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="refresh" size={14} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("FİLTRELERİ SIFIRLA", "RESET FILTERS")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

// [FONKSIYON] Row: Görev kartlarında ikon + metin satırı gösteren yardımcı bileşendir.
const Row = ({ icon, text, lightMode, textMuted }: { icon: any; text: string; lightMode: boolean; textMuted: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
    <Ionicons name={icon} size={14} color={textMuted} />
    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12 }}>{text}</Text>
  </View>
);





