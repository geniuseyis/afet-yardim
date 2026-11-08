import {
  React, useEffect, useMemo, useState,
  Alert, ScrollView, Text, TouchableOpacity, View,
  Ionicons, MapView, Marker, Polyline, LinearGradient, Location, useNavigation,
  doc, onSnapshot, useStore, C, kmBetween, claimRequestViaApi, requestTypeMeta, statusLabel, urgencyLabel, toMillis,
  collection, query, where, limit
} from "../shared/ScreenDeps";
import { Image, Linking } from "react-native";
import { db, updateDoc } from "../shared/ScreenDeps";
import { deleteDoc } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import type { Req } from "../shared/ScreenDeps";
import { l } from "../../services/i18n";

/**
 * VOL-DETAIL DOSYA HARITASI
 * - VOL-DETAIL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VOL-DETAIL-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
 * - VOL-DETAIL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-DETAIL-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VolunteerRequestDetailScreen: Talep detayını gösterir ve gönüllü üstlenme başvurusunu tetikler.
export const VolunteerRequestDetailScreen = ({ route }: { route: any }) => {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const showToast = useStore((state) => state.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const requestId = route?.params?.requestId as string | undefined;
  const [request, setRequest] = useState<Req | null>(null);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [myApplication, setMyApplication] = useState<{ id: string; status?: string } | null>(null);

  // Kullanıcının bu talebe ait başvurusunu dinle
  useEffect(() => {
    if (!requestId || !user?.uid) return;
    const q = query(
      collection(db, "volunteerApplications"),
      where("requestId", "==", requestId),
      where("volunteerId", "==", user.uid),
      limit(5)
    );
    const off = onSnapshot(q, (snap) => {
      const active = snap.docs.find((d) => {
        const s = (d.data() as any)?.status;
        return s === "pending" || s === "approved";
      });
      setMyApplication(active ? { id: active.id, status: (active.data() as any)?.status } : null);
    }, () => {
      setMyApplication(null);
    });
    return () => off();
  }, [requestId, user?.uid]);

  const replacePhoto = async (source: "gallery" | "camera") => {
    if (!requestId) return;
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
      const sRef = storageRef(storage, `request-photos/${user?.uid || "vol"}/${Date.now()}.jpg`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, "requests", requestId), { photoUrl: url });
      showToast(L("Fotoğraf güncellendi.", "Photo updated."), "success");
    } catch {
      showToast(L("Fotoğraf yüklenemedi.", "Photo could not be uploaded."), "error");
    } finally {
      setPhotoUploading(false);
    }
  };

  // [FONKSIYON] goBackSafe: Ekranda geri stack yoksa Home'a dönerek güvenli geri navigasyon sağlar.
  const goBackSafe = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else { try { navigation.goBack(); } catch {} }
  };

  // VOL-DETAIL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!requestId) return;
    return onSnapshot(
      doc(db, "requests", requestId),
      (snap) => {
        if (snap.exists()) setRequest({ id: snap.id, ...snap.data() } as Req);
        else setRequest(null);
      },
      (err) => {
        console.warn("[volunteer request detail] snapshot:", err);
        setRequest(null);
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(L("Talep verisi okunamadı.", "Request data could not be loaded."), "error");
        }
      }
    );
  }, [requestId, showToast, locale]);

  // VOL-DETAIL-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const now = await Location.getCurrentPositionAsync({});
      setMyLoc({ latitude: now.coords.latitude, longitude: now.coords.longitude });
    })();
  }, []);

  const routePath = useMemo(() => {
    if (!request?.location || !myLoc) return [];
    if (typeof request.location.lat !== "number" || typeof request.location.lng !== "number") return [];
    return [myLoc, { latitude: request.location.lat, longitude: request.location.lng }];
  }, [myLoc, request?.location]);

  // VOL-DETAIL-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] accept: Talep için claimRequest akışını başlatır ve başvuruyu pending'e çeker.
  const accept = async (): Promise<void> => {
    if (!requestId || !user || submitting) return;
    if (request?.status !== "open") return Alert.alert(L("Bilgi", "Info"), L("Talep zaten atanmış.", "Request is already assigned."));
    setSubmitting(true);
    try {
      await claimRequestViaApi(requestId, myLoc ? { lat: myLoc.latitude, lng: myLoc.longitude } : null);
      showToast(L("Başvuru alındı. Yönetici ataması bekleniyor.", "Application received. Waiting for coordinator assignment."), "success");
      navigation.replace("VolunteerTasks");
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Talep üstlenilemedi.", "Request could not be claimed."));
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (): Promise<void> => {
    if (!myApplication || withdrawing) return;
    Alert.alert(
      L("Başvuruyu Geri Çek", "Withdraw Application"),
      L("Bu görev için başvurunuzu geri çekmek istediğinize emin misiniz?", "Are you sure you want to withdraw your application for this mission?"),
      [
        { text: L("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: L("Geri Çek", "Withdraw"),
          style: "destructive",
          onPress: async () => {
            setWithdrawing(true);
            try {
              await deleteDoc(doc(db, "volunteerApplications", myApplication.id));
              setMyApplication(null);
              showToast(L("Başvurunuz geri çekildi.", "Your application was withdrawn."), "success");
            } catch (e: any) {
              Alert.alert(L("Hata", "Error"), e?.message || L("Başvuru geri çekilemedi.", "Could not withdraw application."));
            } finally {
              setWithdrawing(false);
            }
          }
        }
      ]
    );
  };

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#07080b" : "#160a10";
  const panel = lightMode ? "#ffffff" : amoledMode ? "#0a0c10" : "#2a0d16";
  const softBorder = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";

  const meta = requestTypeMeta(request?.type);
  const distance = kmBetween(myLoc, request?.location);
  const urgLabel = urgencyLabel(request?.urgency, locale);
  const uc = request?.urgency
    ? (`${request.urgency}`.toLowerCase().includes("acil") || `${request.urgency}`.toLowerCase().includes("high")
      ? "#ef4444" : `${request.urgency}`.toLowerCase().includes("orta") ? "#f59e0b" : "#22c55e")
    : "#22c55e";
  const createdMs = toMillis((request as any)?.createdAt);
  const minsAgo = createdMs ? Math.max(0, Math.floor((Date.now() - createdMs) / 60000)) : null;

  const openRoute = async () => {
    if (!request?.location?.lat || !request?.location?.lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${request.location.lat},${request.location.lng}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* Gradient header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#430914", "#23070f"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity onPress={goBackSafe} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü Operasyon", "Volunteer Operations")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20 }}>{L("Talep Detayı", "Request Detail")}</Text>
          </View>
          {request ? (
            <View style={{ borderRadius: 999, backgroundColor: `${uc}28`, borderWidth: 1.5, borderColor: `${uc}60`, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: uc, fontFamily: "Inter-Bold", fontSize: 12 }}>{urgLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Tip + icon */}
        {request ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={meta.icon} size={26} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22, lineHeight: 26 }} numberOfLines={2}>{request.type || L("Yardım Talebi", "Aid Request")}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter-Bold", fontSize: 12 }}>{distance || "-"} km</Text>
                </View>
                {minsAgo !== null ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter", fontSize: 12 }}>{minsAgo} {L("dk önce", "min ago")}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}>
        {!request ? (
          <View style={{ borderRadius: 20, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 24, alignItems: "center", marginTop: 20 }}>
            <Ionicons name="hourglass-outline" size={32} color={textMuted} style={{ marginBottom: 8 }} />
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Yükleniyor...", "Loading...")}</Text>
          </View>
        ) : (
          <>
            {/* Durum + mesafe kartları */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, borderRadius: 14, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12 }}>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginBottom: 4 }}>{L("Durum", "Status")}</Text>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{statusLabel[request.status || "open"]}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12 }}>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginBottom: 4 }}>{L("Mesafe", "Distance")}</Text>
                <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{distance || "-"} km</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 12 }}>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginBottom: 4 }}>{L("Aciliyet", "Urgency")}</Text>
                <Text style={{ color: uc, fontFamily: "Inter-Bold", fontSize: 14 }}>{urgLabel}</Text>
              </View>
            </View>

            {/* Açıklama */}
            {request.description ? (
              <View style={{ borderRadius: 16, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text-outline" size={14} color="#ef4444" />
                  </View>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Açıklama", "Description")}</Text>
                </View>
                <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 14, lineHeight: 21 }}>{request.description}</Text>
              </View>
            ) : null}

            {/* Fotoğraf — görüntüle ve düzenle */}
            <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: softBorder, marginBottom: 12 }}>
              {(request as any)?.photoUrl ? (
                <Image source={{ uri: (request as any).photoUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
              ) : (
                <View style={{ height: 100, backgroundColor: panel, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="image-outline" size={28} color={textMuted} />
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{L("Fotoğraf yok", "No photo")}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", padding: 8, gap: 8, backgroundColor: panel }}>
                <TouchableOpacity onPress={() => replacePhoto("camera")} disabled={photoUploading} style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                  <Ionicons name="camera-outline" size={14} color={textSec} />
                  <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 11 }}>{photoUploading ? L("Yükleniyor...", "Uploading...") : L("Kamera", "Camera")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => replacePhoto("gallery")} disabled={photoUploading} style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: softBorder, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}>
                  <Ionicons name="image-outline" size={14} color={textSec} />
                  <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Galeri", "Gallery")}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Harita */}
            <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: softBorder, marginBottom: 12 }}>
              <View style={{ height: 200 }}>
                {routePath.length === 2 ? (
                  <MapView
                    style={{ flex: 1 }}
                    initialRegion={{ latitude: routePath[0].latitude, longitude: routePath[0].longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
                    scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
                  >
                    <Marker coordinate={routePath[1]} pinColor="#ef4444" title={L("Afetzede", "Victim")} />
                    <Marker coordinate={routePath[0]} pinColor="#2563eb" title={L("Sen", "You")} />
                    <Polyline coordinates={routePath as any} strokeColor="#ef4444" strokeWidth={3} lineDashPattern={[8, 4]} />
                  </MapView>
                ) : request.location?.lat && request.location?.lng ? (
                  <MapView
                    style={{ flex: 1 }}
                    initialRegion={{ latitude: request.location.lat, longitude: request.location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                    scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
                  >
                    <Marker coordinate={{ latitude: request.location.lat, longitude: request.location.lng }} pinColor="#ef4444" />
                  </MapView>
                ) : (
                  <View style={{ flex: 1, backgroundColor: lightMode ? "#e2e8f0" : "#1e293b", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="map-outline" size={28} color={textMuted} />
                    <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>{L("Konum bilgisi yok", "No location data")}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={openRoute}
                style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: softBorder, backgroundColor: panel, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="navigate-outline" size={15} color="#ef4444" />
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Google Maps'te Aç", "Open in Google Maps")}</Text>
                </View>
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12 }}>{distance ? `${distance} km` : "-"}</Text>
              </TouchableOpacity>
            </View>

            {/* Talep ID */}
            <View style={{ borderRadius: 12, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 12 }}>Talep ID</Text>
              <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 12 }}>#{(requestId || "").slice(0, 10).toUpperCase()}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Sabit alt buton — duruma göre 3 farklı görünüm */}
      {request ? (() => {
        const isAssignedToMe = (request as any).assignedVolunteerId === user?.uid;
        const hasPendingApp = !!myApplication && myApplication.status === "pending";
        const isOpen = request.status === "open";

        // 1) Bu görev sana atanmış → Göreve Git
        if (isAssignedToMe) {
          return (
            <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
              <TouchableOpacity
                onPress={() => navigation.navigate("VolunteerTaskTracking", { requestId })}
                style={{ borderRadius: 18, overflow: "hidden" }}
              >
                <LinearGradient
                  colors={["#16a34a", "#15803d"] as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 56, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 }}
                >
                  <Ionicons name="navigate-outline" size={20} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17 }}>
                    {L("Göreve Git", "Go to Mission")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ textAlign: "center", color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 8 }}>
                {L("Bu görev size atandı. Saha takibi başlatabilirsiniz.", "This mission is assigned to you. Start field tracking.")}
              </Text>
            </View>
          );
        }

        // 2) Başvuru beklemede → Geri Çek
        if (hasPendingApp) {
          return (
            <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.28)", alignSelf: "center" }}>
                <Ionicons name="hourglass-outline" size={14} color="#fbbf24" />
                <Text style={{ color: "#fde68a", fontFamily: "Inter-Bold", fontSize: 12 }}>
                  {L("Başvurunuz yönetici onayında", "Your application is pending approval")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={withdraw}
                disabled={withdrawing}
                style={{ borderRadius: 18, overflow: "hidden", opacity: withdrawing ? 0.7 : 1 }}
              >
                <LinearGradient
                  colors={withdrawing ? ["#64748b", "#475569"] : ["#b45309", "#92400e"] as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 56, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 }}
                >
                  <Ionicons name={withdrawing ? "hourglass-outline" : "close-circle-outline"} size={20} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17 }}>
                    {withdrawing ? L("Geri çekiliyor...", "Withdrawing...") : L("Başvuruyu Geri Çek", "Withdraw Application")}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ textAlign: "center", color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 8 }}>
                {L("Onaylanmadan önce başvurunuzu geri çekebilirsiniz.", "You can withdraw before approval.")}
              </Text>
            </View>
          );
        }

        // 3) Açık talep, henüz başvurmadı → Üstlen
        // 4) Atanmış / kapalı → disabled
        return (
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
            <TouchableOpacity
              onPress={accept}
              disabled={submitting || !isOpen}
              style={{ borderRadius: 18, overflow: "hidden", opacity: !isOpen ? 0.55 : 1 }}
            >
              <LinearGradient
                colors={submitting ? ["#64748b", "#475569"] : ["#be123c", "#9f1239"] as any}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 56, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 }}
              >
                {submitting ? (
                  <Ionicons name="hourglass-outline" size={20} color="white" />
                ) : (
                  <Ionicons name="hand-right-outline" size={20} color="white" />
                )}
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 17 }}>
                  {submitting ? L("Başvuru gönderiliyor...", "Sending application...") : L("Görevi Üstlen", "Claim Mission")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={{ textAlign: "center", color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 8 }}>
              {isOpen
                ? L("Üstlenince yönetici onayına düşer. Onay sonrası görev takibi başlar.", "Awaits coordinator approval after claiming.")
                : L("Bu talep zaten atanmış.", "This request is already assigned.")}
            </Text>
          </View>
        );
      })() : null}
    </View>
  );
};
