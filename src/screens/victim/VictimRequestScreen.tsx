import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  analyzeRequestWithAiViaApi, assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";
import * as ImagePicker from "expo-image-picker";
import { Image } from "react-native";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";

type LocationSource = "gps" | "last_known" | "demo" | "none";
const DEMO_FALLBACK_LOCATION = { latitude: 41.0082, longitude: 28.9784 }; // Istanbul merkez

/**
 * VICTIM-REQUEST DOSYA HARITASI
 * - VICTIM-REQUEST-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - VICTIM-REQUEST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VICTIM-REQUEST-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-REQUEST-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimRequestScreen: Yardım talebi oluşturma formunu ve gönderim akışını yönetir.
export const VictimRequestScreen = ({ navigation }: { navigation: any }) => {
  const { user } = useStore();
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [typeKey, setTypeKey] = useState<(typeof aidTypes)[number]["key"]>("health");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("high");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>("none");
  const [locationLoading, setLocationLoading] = useState(false);
  const [peopleCount, setPeopleCount] = useState("");
  const [injuredCount, setInjuredCount] = useState("");
  const [hasChild, setHasChild] = useState(false);
  const [hasElderly, setHasElderly] = useState(false);
  const [hasDisabled, setHasDisabled] = useState(false);
  const [needsMedication, setNeedsMedication] = useState(false);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{ category: string; urgency: string; description?: string; reason?: string; confidence?: number; source: "photo" | "text" } | null>(null);

  // [FONKSIYON] pickPhoto: Galeriden veya kameradan fotoğraf seçer ve Firebase Storage'a yükler.
  const pickPhoto = async (source: "gallery" | "camera") => {
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast(L("İzin verilmedi.", "Permission denied."), "info");
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] as any, quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.7, allowsEditing: true });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      setPhotoUploading(true);

      // Firebase Storage'a yükle
      const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = reject;
        xhr.responseType = "blob";
        xhr.open("GET", uri);
        xhr.send();
      });
      const sRef = storageRef(storage, `request-photos/${user?.uid || "anon"}/${Date.now()}.jpg`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      setPhotoUrl(url);
      showToast(L("Fotoğraf yüklendi.", "Photo uploaded."), "success");

      // AI ile kategori tahmin et
      void aiAnalyzePhoto(uri);
    } catch {
      showToast(L("Fotoğraf yüklenemedi.", "Photo could not be uploaded."), "error");
    } finally {
      setPhotoUploading(false);
    }
  };

  // Yerel kural tabanlı kategori tahmini (AI kotada/offline iken kullanılır)
  const localCategorizeFromDescription = (desc: string): { key: string; label: string; urgency: "high" | "medium" | "low" } | null => {
    const t = (desc || "").toLowerCase();
    if (t.trim().length < 5) return null;
    const has = (...keys: string[]) => keys.some((k) => t.includes(k));
    let key = "other"; let urg: "high" | "medium" | "low" = "medium";
    if (has("kaza", "çarpış", "araba çarp", "trafik")) { key = "accident"; urg = "high"; }
    else if (has("yangın", "alev", "duman", "yanıyor")) { key = "fire"; urg = "high"; }
    else if (has("enkaz", "çökt", "yıkıl", "kurtar")) { key = "debris"; urg = "high"; }
    else if (has("sel", "su bast", "taşkın")) { key = "flood"; urg = "high"; }
    else if (has("çatlak", "hasar", "eğil")) { key = "structural"; urg = "medium"; }
    else if (has("gaz", "kimyasal", "sızıntı")) { key = "gas_leak"; urg = "high"; }
    else if (has("kayıp", "bulamıyor")) { key = "missing"; urg = "high"; }
    else if (has("hayvan", "kedi", "köpek")) { key = "animal"; urg = "medium"; }
    else if (has("ilaç", "yaral", "hasta", "kan")) { key = "health"; urg = "high"; }
    else if (has("gıda", "yiyecek", "aç")) { key = "food"; urg = "medium"; }
    else if (has("çadır", "barınma")) { key = "shelter"; urg = "medium"; }
    else if (has("bebek", "çocuk")) { key = "baby"; urg = "high"; }
    else if (has("su", "elektrik")) { key = "water"; urg = "low"; }
    else return null;
    const label = aidTypes.find((a) => a.key === key)?.label || key;
    return { key, label, urgency: urg };
  };

  // Fotoğraf analizi sonucu: AI servisi cevap veremezse bile plausible bir analiz döndürür.
  // Açıklama varsa açıklamadan, yoksa kategori bazlı varyasyonlu gerçekçi açıklama üretir.
  // `seed` parametresi: aynı fotoğrafın hep aynı sonucu vermesini sağlar (URI hash'i ile).

  // [FONKSIYON] aiAnalyzePhoto: Fotoğrafı Gemini Vision ile analiz edip afet türü, aciliyet ve açıklama önerir.
  const aiAnalyzePhoto = async (uri: string) => {
    setAiResult(null);
    setAiAnalyzing(true);
    showToast(L("AI fotoğrafı inceliyor...", "AI is analyzing photo..."), "info");

    try {
      // Local file URI'yi güvenli yolla blob'a çevir (XHR — fetch file:// her zaman çalışmıyor)
      const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error("blob fetch failed"));
        xhr.responseType = "blob";
        xhr.open("GET", uri, true);
        xhr.send(null);
      });
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("base64 encode failed"));
        reader.readAsDataURL(blob);
      });

      const rawText = await analyzeRequestWithAiViaApi({ kind: "photo", imageBase64: base64 });
      if (!rawText) {
        // analiz yapilamadiysa kategori uydurulmaz, kullanici kendi secer
        showToast(L("AI analizi şu an yapılamadı. Kategoriyi kendin seç.", "AI analysis unavailable. Please pick a category."), "error");
        return;
      }
      // Sağlam JSON çıkarma: önce code-fence temizle, sonra ilk {..} bloğunu yakala
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.warn("[AI-PHOTO] JSON yok, raw:", rawText.slice(0, 300));
        showToast(L("AI yanıtı çözümlenemedi.", "AI response could not be parsed."), "error");
        return;
      }
      const parsed = JSON.parse(match[0]);

      const validKey = aidTypes.find((a) => a.key === parsed.category)?.key;
      if (validKey) setTypeKey(validKey as any);
      if (parsed.urgency) setUrgency(parsed.urgency as "high" | "medium" | "low");
      if (parsed.description && !description.trim()) setDescription(parsed.description);

      setAiResult({
        category: validKey || parsed.category || "other",
        urgency: parsed.urgency || "medium",
        description: parsed.description,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
        source: "photo"
      });
      const catLabel = aidTypes.find((a) => a.key === validKey)?.label || parsed.category;
      showToast(L(`AI tespit: ${catLabel}`, `AI detected: ${catLabel}`), "success");
    } catch (err: any) {
      console.warn("[AI-PHOTO] hata:", err?.message || err);
      showToast(L("AI fotoğraf analizi başarısız.", "AI photo analysis failed."), "error");
    } finally {
      setAiAnalyzing(false);
    }
  };

  // [FONKSIYON] aiCategorize: Açıklama metnini Gemini API ile analiz edip kategori ve aciliyet önerir.
  const aiCategorize = async () => {
    if (!description.trim() || description.trim().length < 10) {
      showToast(L("Kategori tahmini için açıklama girin (min 10 karakter).", "Enter description for AI categorization (min 10 chars)."), "info");
      return;
    }
    setAiCategorizing(true);
    try {
      const rawText = await analyzeRequestWithAiViaApi({ kind: "text", description: description.trim() });
      if (!rawText) throw new Error("no-ai");
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      const validKey = aidTypes.find((a) => a.key === parsed.category)?.key;
      if (validKey) setTypeKey(validKey as any);
      if (parsed.urgency) setUrgency(parsed.urgency as "high" | "medium" | "low");
      setAiResult({
        category: validKey || parsed.category || "other",
        urgency: parsed.urgency || "medium",
        reason: parsed.reason,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
        source: "text"
      });
    } catch {
      // Kural tabanlı fallback (genişletilmiş)
      const text = description.toLowerCase();
      let key: any = "other"; let urg: "high" | "medium" | "low" = "medium"; let reason = "";
      if (text.includes("kaza") || text.includes("çarpış") || text.includes("araba çarp") || text.includes("trafik")) { key = "accident"; urg = "high"; reason = "Trafik/araç kazası anahtar kelimeleri"; }
      else if (text.includes("yangın") || text.includes("alev") || text.includes("duman") || text.includes("yanıyor")) { key = "fire"; urg = "high"; reason = "Yangın kelimeleri"; }
      else if (text.includes("enkaz") || text.includes("çökt") || text.includes("yıkıl") || text.includes("kurtar")) { key = "debris"; urg = "high"; reason = "Enkaz/çökme"; }
      else if (text.includes("sel") || text.includes("su bast") || text.includes("taşkın")) { key = "flood"; urg = "high"; reason = "Sel"; }
      else if (text.includes("çatlak") || text.includes("hasar") || text.includes("eğil")) { key = "structural"; urg = "medium"; reason = "Yapısal hasar"; }
      else if (text.includes("gaz") || text.includes("kimyasal") || text.includes("sızıntı")) { key = "gas_leak"; urg = "high"; reason = "Gaz/kimyasal"; }
      else if (text.includes("kayıp") || text.includes("bulamıyor")) { key = "missing"; urg = "high"; reason = "Kayıp kişi"; }
      else if (text.includes("hayvan") || text.includes("kedi") || text.includes("köpek")) { key = "animal"; urg = "medium"; reason = "Hayvan"; }
      else if (text.includes("ilaç") || text.includes("yaral") || text.includes("hasta") || text.includes("kan")) { key = "health"; urg = "high"; reason = "Sağlık"; }
      else if (text.includes("gıda") || text.includes("yiyecek") || text.includes("aç")) { key = "food"; urg = "medium"; reason = "Gıda"; }
      else if (text.includes("çadır") || text.includes("barınma")) { key = "shelter"; urg = "medium"; reason = "Barınma"; }
      else if (text.includes("bebek") || text.includes("çocuk")) { key = "baby"; urg = "high"; reason = "Bebek/çocuk"; }
      else if (text.includes("su") || text.includes("elektrik")) { key = "water"; urg = "low"; reason = "Altyapı"; }
      setTypeKey(key); setUrgency(urg);
      setAiResult({ category: key, urgency: urg, reason: `${reason} (offline kural)`, source: "text" });
      showToast(L("AI bağlantısı yok, metin analizi ile kategori önerildi.", "No AI connection, category suggested by text analysis."), "info");
    } finally {
      setAiCategorizing(false);
    }
  };

  // [FONKSIYON] resolveBestLocation: GPS -> son bilinen -> (opsiyonel) demo konumu sırasıyla konum üretir.
  const resolveBestLocation = async (allowDemoFallback: boolean): Promise<{ coords: { latitude: number; longitude: number }; source: LocationSource } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (allowDemoFallback) return { coords: DEMO_FALLBACK_LOCATION, source: "demo" };
        return null;
      }

      // 1. Önce hızlı bir lastKnown almayı dene (anında dönmesi muhtemel)
      const lastKnownEarly = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
      const hasFreshLastKnown = !!(lastKnownEarly?.coords?.latitude && lastKnownEarly?.coords?.longitude);

      // 2. Paralel olarak yüksek doğruluk GPS dene, 12 sn timeout
      const current: any = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((resolve) => setTimeout(() => resolve(null), 12000))
      ]).catch(() => null);

      if (current?.coords?.latitude && current?.coords?.longitude) {
        return {
          coords: { latitude: current.coords.latitude, longitude: current.coords.longitude },
          source: "gps"
        };
      }

      // 3. GPS başarısızsa lastKnown'a düş
      if (hasFreshLastKnown && lastKnownEarly?.coords) {
        return {
          coords: { latitude: lastKnownEarly.coords.latitude, longitude: lastKnownEarly.coords.longitude },
          source: "last_known"
        };
      }
      const lastKnown = await Location.getLastKnownPositionAsync({}).catch(() => null);
      if (lastKnown?.coords?.latitude && lastKnown?.coords?.longitude) {
        return {
          coords: { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude },
          source: "last_known"
        };
      }

      if (allowDemoFallback) return { coords: DEMO_FALLBACK_LOCATION, source: "demo" };
      return null;
    } catch {
      if (allowDemoFallback) return { coords: DEMO_FALLBACK_LOCATION, source: "demo" };
      return null;
    }
  };

  // [FONKSIYON] refreshLocation: Konumu alır, ekrandaki durum bilgisini günceller ve gerektiğinde fallback kullanır.
  const refreshLocation = async (allowDemoFallback: boolean): Promise<{ latitude: number; longitude: number } | null> => {
    setLocationLoading(true);
    const resolved = await resolveBestLocation(allowDemoFallback);
    setLocationLoading(false);

    if (!resolved) {
      setLocation(null);
      setLocationSource("none");
      return null;
    }

    setLocation(resolved.coords);
    setLocationSource(resolved.source);
    if (resolved.source === "last_known") showToast(L("Canlı GPS alınamadı, son bilinen konum kullanıldı.", "Live GPS unavailable, last known location used."), "info");
    if (resolved.source === "demo") showToast(L("GPS yanıt vermedi, demo konum ile devam ediliyor.", "GPS did not respond, continuing with demo location."), "info");
    return resolved.coords;
  };

  // VICTIM-REQUEST-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    void refreshLocation(false);
  }, []);

  // VICTIM-REQUEST-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] submit: Form doğrulaması sonrası talebi backend'e gönderir ve durum ekranına yönlendirir.
  const submit = async (): Promise<void> => {
    if (!user) {
      showToast(L("Oturum bilgisi bulunamadı. Tekrar giriş yapın.", "Session not found. Please log in again."), "error");
      return;
    }
    const ensuredLocation = location || (await refreshLocation(true));
    if (!ensuredLocation) {
      showToast(L("Konum alınamadı. Konumu yenileyip tekrar deneyin.", "Location unavailable. Refresh and try again."), "error");
      return;
    }
    if (!description.trim()) {
      showToast(L("Açıklama girin.", "Please enter a description."), "error");
      return;
    }
    const found = aidTypes.find((a) => a.key === typeKey);
    const typeLabel = (locale === "en" ? (found as any)?.labelEn : found?.label) || found?.label || "Sağlık";
    const pc = Math.max(1, Number(peopleCount || "1"));
    const ic = Math.max(0, Number(injuredCount || "0"));
    const triageScore =
      (urgency === "high" ? 40 : urgency === "medium" ? 22 : 8) +
      Math.min(pc, 12) * 3 +
      Math.min(ic, 8) * 8 +
      (hasChild ? 8 : 0) +
      (hasElderly ? 8 : 0) +
      (hasDisabled ? 10 : 0) +
      (needsMedication ? 9 : 0);
    const riskTags = [
      ic > 0 ? "yarali" : null,
      hasChild ? "cocuk" : null,
      hasElderly ? "yasli" : null,
      hasDisabled ? "engelli" : null,
      needsMedication ? "ilac" : null
    ].filter(Boolean) as string[];
    try {
      const created = await createRequestViaApi({
        type: typeLabel,
        urgency: urgency === "high" ? "Acil" : urgency === "medium" ? "Orta" : "Düşük",
        description: description.trim(),
        location: { lat: ensuredLocation.latitude, lng: ensuredLocation.longitude },
        triage: {
          peopleCount: pc,
          injuredCount: ic,
          hasChild,
          hasElderly,
          hasDisabled,
          needsMedication,
          riskTags,
          score: triageScore
        }
      });
      // Fotoğraf varsa Firestore'a ayrıca kaydet (API type kısıtı nedeniyle)
      if (photoUrl && created.requestId) {
        updateDoc(doc(db, "requests", created.requestId), { photoUrl }).catch(() => null);
      }
      navigation.replace("VictimRequestStatus", { requestId: created.requestId });
    } catch (e: any) {
      const msg = `${e?.message || ""}`.toLowerCase();
      if (msg.includes("permission") || msg.includes("insufficient")) {
        showToast(L("Talep kaydı için yetki doğrulanamadı.", "Authorization failed for saving the request."), "error");
      } else {
        showToast(L("Talep gönderilemedi. Bağlantıyı kontrol edin.", "Request could not be sent. Check your connection."), "error");
      }
    }
  };

  // VICTIM-REQUEST-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const triageScore = useMemo(() => {
    const pc = Math.max(1, Number(peopleCount || "1"));
    const ic = Math.max(0, Number(injuredCount || "0"));
    return (
      (urgency === "high" ? 40 : urgency === "medium" ? 22 : 8) +
      Math.min(pc, 12) * 3 +
      Math.min(ic, 8) * 8 +
      (hasChild ? 8 : 0) +
      (hasElderly ? 8 : 0) +
      (hasDisabled ? 10 : 0) +
      (needsMedication ? 9 : 0)
    );
  }, [peopleCount, injuredCount, urgency, hasChild, hasElderly, hasDisabled, needsMedication]);

  const triageLevel = triageScore >= 78 ? L("Kritik", "Critical") : triageScore >= 52 ? L("Yüksek", "High") : triageScore >= 28 ? L("Orta", "Medium") : L("Düşük", "Low");
  const triageAiHint =
    triageScore >= 78
      ? L("112 ve resmi yardım önceliklidir. Güvenli alanda kalın, yaralıları hareket ettirmeden temel ilk yardım uygulayın.", "Call 112 and official aid first. Stay in a safe area, apply basic first aid without moving the injured.")
      : triageScore >= 52
      ? L("Afet.AI ile ilk yardım ve bekleme adımlarını açın. Konumunuzu sabit tutun ve telefon bataryasını koruyun.", "Open first aid and waiting steps with Afet.AI. Keep your location fixed and conserve phone battery.")
      : L("Talep kaydınız oluşturulduğunda durumu izleyin. Gerekirse Afet.AI ile ek bilgi alın.", "Monitor the situation when your request is created. Get additional guidance from Afet.AI if needed.");

  const triageColor = triageScore >= 78 ? "#ef4444" : triageScore >= 52 ? "#f59e0b" : triageScore >= 28 ? "#22c55e" : "#60a5fa";
  const triagePrompt = useMemo(() => {
    const found = aidTypes.find((a) => a.key === typeKey);
    const typeLabel = (locale === "en" ? (found as any)?.labelEn : found?.label) || found?.label || "Sağlık";
    return [
      `Talep Türü: ${typeLabel}`,
      `Aciliyet: ${urgency === "high" ? "Acil" : urgency === "medium" ? "Orta" : "Düşük"}`,
      `Kişi sayısı: ${peopleCount || "1"}`,
      `Yaralı sayısı: ${injuredCount || "0"}`,
      `Çocuk: ${hasChild ? "Var" : "Yok"}`,
      `Yaşlı: ${hasElderly ? "Var" : "Yok"}`,
      `Engelli birey: ${hasDisabled ? "Var" : "Yok"}`,
      `İlaç ihtiyacı: ${needsMedication ? "Var" : "Yok"}`,
      `Durum: ${description || "Açıklama girilmedi"}`,
      "Türkçe, kısa ve uygulanabilir acil yönlendirme ver."
    ].join("\n");
  }, [typeKey, urgency, peopleCount, injuredCount, hasChild, hasElderly, hasDisabled, needsMedication, description]);

  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#07070a" : "#2d0a12";
  const cardBg = lightMode ? "#ffffff" : amoledMode ? "rgba(18,18,24,0.95)" : "rgba(60, 10, 20, 0.95)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.08)" : amoledMode ? "rgba(255,255,255,0.07)" : "rgba(248,113,113,0.16)";
  const mutedText = "#fecdd3";
  const bodyText = "#fff1f2";
  const isReady = description.trim().length >= 8 && !!location;
  const locationStatusText =
    locationLoading
      ? L("Konum alınıyor...", "Getting location...")
      : locationSource === "gps"
        ? L("Konumunuz GPS ile alındı", "Location obtained via GPS")
        : locationSource === "last_known"
          ? L("Son bilinen konum kullanılıyor", "Using last known location")
          : locationSource === "demo"
            ? L("Demo konum kullanılıyor", "Using demo location")
            : L("Konum henüz alınamadı", "Location not yet available");

  const urgencyOptions = [
    { key: "low", label: L("Düşük", "Low"), icon: "checkmark-circle-outline" as const, bg: "#15803d", border: "#4ade80", text: "#dcfce7", dimBg: "rgba(21,128,61,0.12)" },
    { key: "medium", label: L("Orta", "Medium"), icon: "alert-circle-outline" as const, bg: "#ca8a04", border: "#facc15", text: "#fef9c3", dimBg: "rgba(202,138,4,0.12)" },
    { key: "high", label: L("ACİL", "URGENT"), icon: "warning-outline" as const, bg: "#c1121f", border: "#fb7185", text: "#fff1f2", dimBg: "rgba(193,18,31,0.12)" },
  ];

  const inputBg = lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.05)";
  const inputBorder = lightMode ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.1)";

  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      {/* Custom header — no TopBar, tighter control */}
      <LinearGradient
        colors={lightMode ? ["#fff", "#f8fafc"] : amoledMode ? ["#0d0205", "#110307"] : ["#1f0509", "#3d0c15"]}
        style={{ paddingTop: 52, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(248,113,113,0.12)" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => { try { if (navigation.canGoBack()) { navigation.goBack(); return; } } catch {} navigation.navigate("Home"); }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)", marginRight: 10 }}
          >
            <Ionicons name="arrow-back" size={18} color={lightMode ? "#c1121f" : "#fecdd3"} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: lightMode ? "#c1121f" : "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>{L("Afet Yardım Sistemi", "Disaster Aid System")}</Text>
            <Text style={{ color: lightMode ? "#0f172a" : "white", fontFamily: "Inter-Bold", fontSize: 22, lineHeight: 26 }}>{L("Yardım Talebi", "Aid Request")}</Text>
          </View>
          <View style={{ alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 26, backgroundColor: urgency === "high" ? "rgba(193,18,31,0.15)" : urgency === "medium" ? "rgba(202,138,4,0.15)" : "rgba(21,128,61,0.15)", borderWidth: 2, borderColor: urgency === "high" ? "#ef4444" : urgency === "medium" ? "#f59e0b" : "#4ade80" }}>
            <Ionicons name={urgency === "high" ? "warning" : urgency === "medium" ? "alert-circle" : "checkmark-circle"} size={26} color={urgency === "high" ? "#ef4444" : urgency === "medium" ? "#f59e0b" : "#4ade80"} />
          </View>
        </View>
        {/* Dynamic step progress */}
        <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
          {[
            { label: L("Tür", "Type"), done: true },
            { label: L("Aciliyet", "Urgency"), done: true },
            { label: "Triage", done: Number(peopleCount || 1) > 0 },
            { label: L("Açıklama", "Description"), done: description.trim().length >= 8 },
            { label: L("Konum", "Location"), done: !!location },
          ].map((step) => (
            <View key={step.label} style={{ flex: 1, alignItems: "center", gap: 3 }}>
              <View style={{ height: 3, width: "100%", borderRadius: 2, backgroundColor: step.done ? "#c1121f" : "rgba(255,255,255,0.12)" }} />
              <Text style={{ color: step.done ? "#fca5a5" : "rgba(255,255,255,0.3)", fontFamily: "Inter-Bold", fontSize: 8 }}>{step.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 12}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ backgroundColor: shellBg }}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}
      >

        {/* STEP 1 — Yardım Türü */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#c1121f", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>1</Text>
            </View>
            <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Yardım Türü", "Aid Type")}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {aidTypes.map((t) => {
            const active = typeKey === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTypeKey(t.key)}
                style={{
                  width: 86, alignItems: "center", borderRadius: 16, padding: 10,
                  backgroundColor: active ? "rgba(193,18,31,0.18)" : "rgba(255,255,255,0.03)",
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? "#ef4444" : "rgba(255,255,255,0.07)"
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? "rgba(193,18,31,0.22)" : t.bg, marginBottom: 6 }}>
                  <Ionicons name={t.icon as any} size={22} color={active ? "#ef4444" : t.color} />
                </View>
                <Text style={{ color: active ? "#fecdd3" : bodyText, fontFamily: active ? "Inter-Bold" : "Inter", fontSize: 11, textAlign: "center" }}>{locale === "en" ? (t as any).labelEn || t.label : t.label}</Text>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </View>

        {/* STEP 2 — Aciliyet */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#c1121f", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>2</Text>
            </View>
            <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Aciliyet Seviyesi", "Urgency Level")}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
          {urgencyOptions.map((u) => {
            const active = urgency === u.key;
            return (
              <TouchableOpacity
                key={u.key}
                onPress={() => setUrgency(u.key as any)}
                style={{
                  flex: 1, borderRadius: 14, padding: 12, alignItems: "center",
                  backgroundColor: active ? u.dimBg : "rgba(255,255,255,0.03)",
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? u.border : "rgba(255,255,255,0.07)"
                }}
              >
                <Ionicons name={u.icon} size={20} color={active ? u.border : "#9ca3af"} />
                <Text style={{ color: active ? u.border : "#9ca3af", fontFamily: active ? "Inter-Bold" : "Inter", fontSize: 12, marginTop: 5 }}>{u.label}</Text>
              </TouchableOpacity>
            );
          })}
          </View>
        </View>

        {/* STEP 3 — Triage */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#c1121f", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>3</Text>
              </View>
              <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Triage Formu", "Triage Form")}</Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: "rgba(193,18,31,0.1)", borderWidth: 1, borderColor: "rgba(193,18,31,0.22)", paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 9 }}>{L("AI DESTEKLI", "AI POWERED")}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: mutedText, fontFamily: "Inter-Bold", fontSize: 10, marginBottom: 5, letterSpacing: 0.4 }}>{L("KİŞİ SAYISI", "PERSON COUNT")}</Text>
              <TextInput
                value={peopleCount}
                onChangeText={(v) => setPeopleCount(v.replace(/\D/g, "").slice(0, 2))}
                keyboardType="number-pad"
                style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: inputBorder, backgroundColor: inputBg, paddingHorizontal: 14, fontFamily: "Inter-Bold", fontSize: 18, color: bodyText }}
                placeholder="1"
                placeholderTextColor="#6b7280"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: mutedText, fontFamily: "Inter-Bold", fontSize: 10, marginBottom: 5, letterSpacing: 0.4 }}>{L("YARALI SAYISI", "INJURED COUNT")}</Text>
              <TextInput
                value={injuredCount}
                onChangeText={(v) => setInjuredCount(v.replace(/\D/g, "").slice(0, 2))}
                keyboardType="number-pad"
                style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: inputBorder, backgroundColor: inputBg, paddingHorizontal: 14, fontFamily: "Inter-Bold", fontSize: 18, color: bodyText }}
                placeholder="0"
                placeholderTextColor="#6b7280"
              />
            </View>
          </View>

          <Text style={{ color: mutedText, fontFamily: "Inter-Bold", fontSize: 10, marginBottom: 8, letterSpacing: 0.4 }}>{L("ÖZEL DURUM", "SPECIAL CONDITION")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {[
              { key: "child", label: L("Çocuk", "Child"), active: hasChild, set: setHasChild, icon: "happy-outline" as const, activeColor: "#db2777", activeBg: "rgba(219,39,119,0.15)" },
              { key: "elderly", label: L("Yaşlı", "Elderly"), active: hasElderly, set: setHasElderly, icon: "person-outline" as const, activeColor: "#16a34a", activeBg: "rgba(22,163,74,0.15)" },
              { key: "disabled", label: L("Engelli", "Disabled"), active: hasDisabled, set: setHasDisabled, icon: "accessibility-outline" as const, activeColor: "#2563eb", activeBg: "rgba(37,99,235,0.15)" },
              { key: "med", label: L("İlaç", "Medicine"), active: needsMedication, set: setNeedsMedication, icon: "medical-outline" as const, activeColor: "#dc2626", activeBg: "rgba(220,38,38,0.15)" },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => item.set(!item.active)}
                style={{
                  flex: 1, alignItems: "center", borderRadius: 12, paddingVertical: 10,
                  backgroundColor: item.active ? item.activeBg : "rgba(255,255,255,0.03)",
                  borderWidth: item.active ? 1.5 : 1,
                  borderColor: item.active ? item.activeColor : "rgba(255,255,255,0.08)"
                }}
              >
                <Ionicons name={item.icon} size={18} color={item.active ? item.activeColor : "#6b7280"} />
                <Text style={{ color: item.active ? item.activeColor : "#9ca3af", fontFamily: item.active ? "Inter-Bold" : "Inter", fontSize: 10, marginTop: 4 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* AI Score Panel */}
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${triageColor}30`, backgroundColor: `${triageColor}0d`, padding: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="analytics-outline" size={16} color={triageColor} />
                <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Afet.AI Triage", "Afet.AI Triage")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: triageColor }} />
                <Text style={{ color: triageColor, fontFamily: "Inter-Bold", fontSize: 13 }}>{triageLevel}</Text>
                <Text style={{ color: mutedText, fontFamily: "Inter", fontSize: 11 }}>• {triageScore} {L("puan", "pts")}</Text>
              </View>
            </View>
            <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12, lineHeight: 18 }}>{triageAiHint}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("ChatDetail", { bot: true, title: "Afet.AI Triage", seedPrompt: triagePrompt })}
              style={{ marginTop: 10, borderRadius: 12, backgroundColor: `${triageColor}20`, borderWidth: 1, borderColor: `${triageColor}40`, height: 40, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color="#fecdd3" />
              <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("AFET.AI İLE DETAYLI YÖNLENDIRME AL", "GET DETAILED GUIDANCE WITH AFET.AI")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* STEP 4 — Açıklama */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#c1121f", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>4</Text>
              </View>
              <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Açıklama", "Description")}</Text>
            </View>
            <Text style={{ color: description.trim().length > 200 ? "#f59e0b" : "#6b7280", fontFamily: "Inter-Bold", fontSize: 12 }}>{description.trim().length}/240</Text>
          </View>
          <TextInput
            style={{ minHeight: 110, borderRadius: 14, borderWidth: 1, borderColor: inputBorder, backgroundColor: inputBg, padding: 14, fontFamily: "Inter", fontSize: 14, color: bodyText, textAlignVertical: "top", lineHeight: 22 }}
            multiline
            maxLength={240}
            placeholder={L("Bulunduğunuz yeri, ihtiyacınızı ve durumunuzu kısaca açıklayın...", "Briefly describe your location, needs, and situation...")}
            placeholderTextColor="#6b7280"
            value={description}
            onChangeText={setDescription}
          />
          {/* AI kategori tahmini butonu */}
          <TouchableOpacity
            onPress={aiCategorize}
            disabled={aiCategorizing || description.trim().length < 10}
            style={{ marginTop: 10, borderRadius: 12, backgroundColor: aiCategorizing ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.12)", borderWidth: 1, borderColor: "rgba(139,92,246,0.28)", height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, opacity: description.trim().length < 10 ? 0.5 : 1 }}
          >
            <Ionicons name="sparkles-outline" size={16} color="#8b5cf6" />
            <Text style={{ color: "#8b5cf6", fontFamily: "Inter-Bold", fontSize: 13 }}>
              {aiCategorizing ? L("AI analiz ediyor...", "AI analyzing...") : L("AI ile Kategori Tahmin Et", "AI Auto-Categorize")}
            </Text>
          </TouchableOpacity>

          {/* AI Sonuç Kartı (foto veya metin) */}
          {(aiAnalyzing || aiResult) ? (() => {
            const m = aiResult ? requestTypeMeta(aiResult.category) : null;
            const conf = aiResult?.confidence;
            const confPct = typeof conf === "number" ? Math.round(conf * 100) : null;
            return (
              <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(139,92,246,0.28)", backgroundColor: "rgba(139,92,246,0.06)", padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={14} color="#8b5cf6" />
                  <Text style={{ color: "#8b5cf6", fontFamily: "Inter-Bold", fontSize: 12 }}>
                    {aiAnalyzing
                      ? L("AI analiz ediyor...", "AI analyzing...")
                      : L(`AI Tespiti (${aiResult?.source === "photo" ? "fotoğraf" : "metin"})`, `AI Detection (${aiResult?.source === "photo" ? "photo" : "text"})`)}
                  </Text>
                  {confPct !== null ? (
                    <View style={{ marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: confPct >= 70 ? "rgba(34,197,94,0.18)" : confPct >= 40 ? "rgba(245,158,11,0.18)" : "rgba(239,68,68,0.18)", borderWidth: 1, borderColor: confPct >= 70 ? "#22c55e55" : confPct >= 40 ? "#f59e0b55" : "#ef444455" }}>
                      <Text style={{ color: confPct >= 70 ? "#22c55e" : confPct >= 40 ? "#f59e0b" : "#ef4444", fontFamily: "Inter-Bold", fontSize: 10 }}>%{confPct} {L("güven", "conf")}</Text>
                    </View>
                  ) : null}
                </View>
                {m && aiResult ? (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: m.bg, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={m.icon as any} size={18} color={m.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 14 }}>{m.label}</Text>
                        <Text style={{ color: aiResult.urgency === "high" ? "#ef4444" : aiResult.urgency === "medium" ? "#f59e0b" : "#22c55e", fontFamily: "Inter-Bold", fontSize: 11, marginTop: 2 }}>
                          {aiResult.urgency === "high" ? L("ACİL", "URGENT") : aiResult.urgency === "medium" ? L("ORTA", "MEDIUM") : L("DÜŞÜK", "LOW")}
                        </Text>
                      </View>
                    </View>
                    {aiResult.description ? (
                      <Text style={{ color: "#6b7280", fontFamily: "Inter", fontSize: 12, marginBottom: 6, lineHeight: 17 }}>
                        “{aiResult.description}”
                      </Text>
                    ) : null}
                    {aiResult.reason ? (
                      <Text style={{ color: "#6b7280", fontFamily: "Inter", fontSize: 11, fontStyle: "italic", marginBottom: 6 }}>
                        {L("Gerekçe", "Reason")}: {aiResult.reason}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                      <TouchableOpacity onPress={() => setAiResult(null)} style={{ flex: 1, height: 32, borderRadius: 8, borderWidth: 1, borderColor: "rgba(34,197,94,0.4)", backgroundColor: "rgba(34,197,94,0.1)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}>
                        <Ionicons name="checkmark" size={12} color="#22c55e" />
                        <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Onayla", "Approve")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setAiResult(null); showToast(L("Manuel olarak değiştirebilirsiniz.", "You can change manually."), "info"); }}
                        style={{ flex: 1, height: 32, borderRadius: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}
                      >
                        <Ionicons name="close" size={12} color="#ef4444" />
                        <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Yanlış / Düzelt", "Wrong / Fix")}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </View>
            );
          })() : null}
        </View>

        {/* STEP 4.5 — Fotoğraf Ekleme */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#0ea5e9", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
              <Ionicons name="camera-outline" size={13} color="white" />
            </View>
            <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Fotoğraf Ekle", "Add Photo")}</Text>
            <Text style={{ color: "#6b7280", fontFamily: "Inter", fontSize: 11, marginLeft: 8 }}>{L("(Opsiyonel — AI analiz eder)", "(Optional — AI analyzes)")}</Text>
          </View>

          {photoUri ? (
            <View style={{ marginBottom: 10 }}>
              <Image source={{ uri: photoUri }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="cover" />
              {photoUploading ? (
                <View style={{ position: "absolute", inset: 0, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Yükleniyor...", "Uploading...")}</Text>
                </View>
              ) : photoUrl ? (
                <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 8, backgroundColor: "rgba(16,185,129,0.85)", paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={13} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("Yüklendi", "Uploaded")}</Text>
                </View>
              ) : null}
              <TouchableOpacity onPress={() => { setPhotoUri(null); setPhotoUrl(null); }} style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Fotoğrafı Kaldır", "Remove Photo")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => pickPhoto("camera")}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(14,165,233,0.3)", borderStyle: "dashed", backgroundColor: "rgba(14,165,233,0.06)", height: 80, alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <Ionicons name="camera-outline" size={22} color="#0ea5e9" />
                <Text style={{ color: "#0ea5e9", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Kamera", "Camera")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => pickPhoto("gallery")}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(14,165,233,0.3)", borderStyle: "dashed", backgroundColor: "rgba(14,165,233,0.06)", height: 80, alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <Ionicons name="image-outline" size={22} color="#0ea5e9" />
                <Text style={{ color: "#0ea5e9", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Galeri", "Gallery")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* STEP 5 — Konum */}
        <View style={[s.victimRequestSectionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#c1121f", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 11 }}>5</Text>
              </View>
              <Text style={{ color: bodyText, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Konumunuz", "Your Location")}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { void refreshLocation(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Ionicons name={locationLoading ? "hourglass-outline" : "refresh-outline"} size={13} color="#fecdd3" />
              <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 11 }}>{locationLoading ? L("YENİLENİYOR", "REFRESHING") : L("YENİLE", "REFRESH")}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 180, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: cardBorder, backgroundColor: "rgba(0,0,0,0.2)", marginBottom: 10 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{ latitude: location?.latitude ?? 41.0082, longitude: location?.longitude ?? 28.9784, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {location && <Marker coordinate={location} pinColor={C.blue} />}
            </MapView>
            {!location && (
              <View style={{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" }}>
                <Ionicons name="location-outline" size={32} color="#fecdd3" />
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{L("Konum alınıyor...", "Getting location...")}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: "rgba(193,18,31,0.08)", borderWidth: 1, borderColor: "rgba(248,113,113,0.14)", padding: 10 }}>
            <Ionicons name={locationSource === "gps" ? "navigate" : locationSource === "none" ? "location-outline" : "location"} size={16} color={locationSource === "gps" ? "#4ade80" : locationSource === "none" ? "#9ca3af" : "#f59e0b"} />
            <Text style={{ color: locationSource === "gps" ? "#4ade80" : locationSource === "none" ? "#9ca3af" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{locationStatusText}</Text>
            {location && (
              <Text style={{ color: "#6b7280", fontFamily: "Inter", fontSize: 10 }}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>
            )}
          </View>
        </View>

        {/* Summary pill before submit */}
        {isReady ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.22)", padding: 10 }}>
            <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
            <Text style={{ color: "#86efac", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{L("Tüm bilgiler hazır. Talebi gönderebilirsiniz.", "All information ready. You can submit the request.")}</Text>
            <View style={{ borderRadius: 999, backgroundColor: `${triageColor}22`, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: triageColor, fontFamily: "Inter-Bold", fontSize: 10 }}>{triageLevel}</Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 10 }}>
            <Ionicons name="information-circle-outline" size={18} color="#9ca3af" />
            <Text style={{ color: "#9ca3af", fontFamily: "Inter", fontSize: 12, flex: 1 }}>{L("Açıklama ve konum bilgisini girerek devam edin.", "Enter description and location to continue.")}</Text>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity onPress={submit} activeOpacity={0.88} style={{ borderRadius: 18, overflow: "hidden", marginTop: 2, shadowColor: isReady ? "#22c55e" : "#c1121f", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
          <LinearGradient
            colors={isReady ? ["#16a34a", "#15803d", "#166534"] : ["#e02428", "#b00f17", "#8b0c14"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <Ionicons name={isReady ? "checkmark-circle-outline" : "paper-plane-outline"} size={22} color="white" />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17, letterSpacing: 0.5 }}>{L("TALEBİ GÖNDER", "SUBMIT REQUEST")}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Emergency number hint */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <Ionicons name="call-outline" size={13} color="#9ca3af" />
          <Text style={{ color: "#9ca3af", fontFamily: "Inter", fontSize: 11 }}>{L("Hayati tehlike durumunda önce", "In life-threatening situations call")} <Text style={{ fontFamily: "Inter-Bold", color: "#ef4444" }}>112</Text>{L("'yi arayın", " first")}</Text>
        </View>

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

