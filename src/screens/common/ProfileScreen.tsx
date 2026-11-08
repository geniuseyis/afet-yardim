import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  addDoc,
  auth, db, useStore,
  assignVolunteerViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { isVolunteerApproved } from "../shared/volunteerGate";
import { l, t } from "../../services/i18n";
import { maskEmail, maskPhone, maskTc } from "../../utils/privacy";
import { upsertUserPublicDoc } from "../../services/userPublic";

/**
 * PROFILE DOSYA HARITASI
 * - PROFILE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - PROFILE-PRIVACY: Bu bolumde maskeleme, gizlilik ve guvenlik ile ilgili islemler bulunur.
 * - PROFILE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - PROFILE-THEME: Bu bolumde tema, renk modu ve dil gecisleri yonetilir.
 * - PROFILE-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

export const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, userData, setUserData } = useStore();
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const setLocale = useStore((state) => state.setLocale);
  const offlineMode = useStore((state) => state.offlineMode);
  const lastSyncAt = useStore((state) => state.lastSyncAt);
  const roleRaw = String(userData?.role || "victim").toLocaleLowerCase("tr");
  const role =
    roleRaw === "coordinator" || roleRaw === "yonetici" || roleRaw === "yönetici" || roleRaw === "admin"
      ? "coordinator"
      : roleRaw === "volunteer" || roleRaw === "gonullu" || roleRaw === "gönüllü"
      ? "volunteer"
      : "victim";
  const volunteerApproved = isVolunteerApproved(userData as any);
  const [stats, setStats] = useState({ total: 0, active: 0, done: 0 });
  const [coordinatorStats, setCoordinatorStats] = useState({ volunteers: 0, urgent: 0 });
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title?: string; message?: string }>>([]);
  const [notice, setNotice] = useState("");
  const amoledMode = useStore((state) => state.amoledMode);
  const setAmoledMode = useStore((state) => state.setAmoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const setLightMode = useStore((state) => state.setLightMode);
  const [victimMenuOpen, setVictimMenuOpen] = useState(false);
  const [profileCardFlipped, setProfileCardFlipped] = useState(false);
  const profileFlipAnim = useRef(new Animated.Value(0)).current;
  const [volunteerTab, setVolunteerTab] = useState<"info" | "certs" | "badges" | "perf">("info");
  const [coordModulesExpanded, setCoordModulesExpanded] = useState(true);
  const [coordNoticeExpanded, setCoordNoticeExpanded] = useState(false);
  const [coordAnnouncementsExpanded, setCoordAnnouncementsExpanded] = useState(false);
  const [coordSecurityExpanded, setCoordSecurityExpanded] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState(userData?.fullName || "");
  const [editCity, setEditCity] = useState(userData?.city || "");
  const [editDistrict, setEditDistrict] = useState(userData?.district || "");
  const [blackoutMode, setBlackoutMode] = useState(false);
  const [goBagOpen, setGoBagOpen] = useState(false);
  const [goBag, setGoBag] = useState({
    water: false,
    flashlight: false,
    medicine: false,
    powerbank: false,
    docs: false,
    whistle: false
  });
  const [certLogisticsDone, setCertLogisticsDone] = useState(false);
  const [volunteerSettingsOpen, setVolunteerSettingsOpen] = useState(false);
  const [volunteerSettingsMode, setVolunteerSettingsMode] = useState<"menu" | "availability" | "skillLevel" | "skills">("menu");
  const [personalInfoExpanded, setPersonalInfoExpanded] = useState(true);
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  // PROFILE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user) return;
    if (role === "volunteer" && !volunteerApproved) {
      setStats({ total: 0, active: 0, done: 0 });
      return;
    }
    const q = role === "victim"
      ? query(collection(db, "requests"), where("createdBy", "==", user.uid))
      : role === "volunteer"
      ? query(
          collection(db, "requests"),
          where("assignedVolunteerId", "==", user.uid)
        )
      : query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(120));

    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as any);
        setStats({
          total: rows.length,
          active: rows.filter((r) => r.status !== "closed").length,
          done: rows.filter((r) => r.status === "closed").length
        });
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[profile] requests stats snapshot:", err);
        }
        setStats({ total: 0, active: 0, done: 0 });
        if (!(role === "volunteer" && !volunteerApproved) && !String((err as any)?.code || "").includes("permission-denied")) {
          showToast(l(locale, "Profil istatistikleri yüklenemedi.", "Profile statistics could not be loaded."), "error");
        }
      }
    );
  }, [role, user, showToast, volunteerApproved]);

  // PROFILE-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (role !== "coordinator") return;
    const q = query(collection(db, "users_public"), limit(500));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as any);
        const volunteerRows = rows.filter((u) =>
          ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase())
        );
        const approvedRows = volunteerRows.filter((u) =>
          u?.isApprovedVolunteer === true ||
          String(u?.volunteerStatus || "").toLowerCase() === "approved"
        );
        setCoordinatorStats((p) => ({ ...p, volunteers: approvedRows.length }));
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[profile] coordinator volunteers snapshot:", err);
        }
        setCoordinatorStats((p) => ({ ...p, volunteers: 0 }));
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(l(locale, "Gönüllü sayıları yüklenemedi.", "Volunteer counts could not be loaded."), "error");
        }
      }
    );
  }, [role, showToast]);

  useEffect(() => {
    if (role !== "coordinator") return;
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(180));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as Req);
        setCoordinatorStats((p) => ({ ...p, urgent: rows.filter((r) => r.status !== "closed" && isUrgent(r.urgency)).length }));
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[profile] coordinator urgent snapshot:", err);
        }
        setCoordinatorStats((p) => ({ ...p, urgent: 0 }));
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(l(locale, "Acil talep istatistikleri yüklenemedi.", "Urgent request stats could not be loaded."), "error");
        }
      }
    );
  }, [role, showToast]);

  useEffect(() => {
    if (role !== "coordinator") return;
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(6));
    return onSnapshot(
      q,
      (snap) => {
        setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => {
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          console.warn("[profile] announcements snapshot:", err);
        }
        setAnnouncements([]);
        if (!String((err as any)?.code || "").includes("permission-denied")) {
          showToast(l(locale, "Duyurular yüklenemedi.", "Announcements could not be loaded."), "error");
        }
      }
    );
  }, [role, showToast]);

  // PROFILE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const publishNotice = async (): Promise<void> => {
    if (role !== "coordinator") return;
    if (!notice.trim()) return Alert.alert(l(locale, "Bilgi", "Info"), l(locale, "Duyuru metni boş olamaz.", "Announcement text cannot be empty."));
    try {
      await publishAnnouncementViaApi({
        title: l(locale, "Yönetici Duyurusu", "Coordinator Announcement"),
        message: notice.trim(),
        severity: "high",
        targetRoles: ["victim", "volunteer"]
      });
      setNotice("");
      showToast(l(locale, "Duyuru yayınlandı.", "Announcement published."), "success");
      Alert.alert(l(locale, "Başarılı", "Success"), l(locale, "Duyuru yayınlandı.", "Announcement published."));
    } catch (apiErr) {
      console.warn("[profile] publishAnnouncementViaApi failed:", apiErr);
      try {
        await addDoc(collection(db, "announcements"), {
          title: l(locale, "Yönetici Duyurusu", "Coordinator Announcement"),
          message: notice.trim(),
          severity: "high",
          targetRoles: ["victim", "volunteer"],
          createdBy: user?.uid || null,
          createdByRole: "coordinator",
          createdByName: userData?.fullName || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        } as any);
        setNotice("");
        showToast(l(locale, "Duyuru yayınlandı (fallback).", "Announcement published (fallback)."), "success");
        Alert.alert(l(locale, "Başarılı", "Success"), l(locale, "Duyuru yayınlandı.", "Announcement published."));
      } catch (fallbackErr) {
        console.warn("[profile] announcements addDoc failed:", fallbackErr);
        showToast(l(locale, "Duyuru yayınlanamadı. İzinleri kontrol edin.", "Announcement publish failed. Check permissions."), "error");
        Alert.alert(l(locale, "Hata", "Error"), l(locale, "Duyuru yayınlanamadı.", "Announcement could not be published."));
      }
    }
  };

  // PROFILE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const exportMyData = async (): Promise<void> => {
    try {
      const res = await exportUserDataViaApi(user?.uid);
      Alert.alert(l(locale, "Hazır", "Ready"), l(locale, "Veri dışa aktarma dosyası oluşturuldu.", "Data export file has been prepared."), [{ text: l(locale, "Tamam", "OK") }]);
      if (res?.signedUrl) {
        Alert.alert(l(locale, "İndirme Linki", "Download Link"), l(locale, "Geçici indirme bağlantısı backend tarafında oluşturuldu.", "Temporary download link has been generated by backend."));
      }
    } catch {
      Alert.alert(l(locale, "Hata", "Error"), l(locale, "Veri dışa aktarma şu anda oluşturulamadı.", "Data export cannot be prepared right now."));
    }
  };

  // PROFILE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const askDeletion = async (): Promise<void> => {
    try {
      const res = await requestDataDeletionViaApi(user?.uid);
      Alert.alert(l(locale, "Talep Alındı", "Request Received"), `${l(locale, "Silme talebiniz kaydedildi. Takip No:", "Your deletion request was recorded. Ticket No:")} ${res.ticketId}`);
    } catch {
      Alert.alert(l(locale, "Hata", "Error"), l(locale, "Silme talebi oluşturulamadı.", "Deletion request could not be created."));
    }
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
  };

  // PROFILE-THEME: Bu bolumde tema, renk modu ve dil gecisleri yonetilir.
  const toggleLocale = () => {
    const next = locale === "tr" ? "en" : "tr";
    setLocale(next);
    showToast(next === "tr" ? "Dil Türkçe olarak ayarlandı." : "Language set to English.", "success");
  };

  const syncText = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
    : "-";
  const maskedEmail = maskEmail((userData as any)?.email_masked || userData?.email);
  const maskedPhone = maskPhone((userData as any)?.phone_masked || userData?.phone);
  const maskedTc = maskTc((userData as any)?.tcNo_masked || userData?.tcNo);
  const L = (tr: string, en: string): string => l(locale, tr, en);
  const coordShellBg = lightMode ? "#f8fafc" : amoledMode ? "#000000" : "#12060a";
  const volShellBg = lightMode ? "#f8fafc" : amoledMode ? "#000000" : "#17070d";
  const victimShellBg = lightMode ? "#f8fafc" : amoledMode ? "#000000" : "#17070d";
  const coordHeroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#12060a", "#0a0508"] : ["#3d0713", "#2a0610", "#17060b"];
  const volHeroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#11060a", "#0a0508"] : ["#2b0812", "#4b0a1b", "#681028"];
  const victimHeroColors = lightMode ? ["#7a001f", "#9f1239", "#be123c"] : amoledMode ? ["#1a070d", "#11060a", "#0a0508"] : ["#2b0812", "#4b0a1b", "#681028"];

  // PROFILE-THEME: Bu bolumde tema, renk modu ve dil gecisleri yonetilir.
  const applyThemeMode = (mode: "red" | "amoled" | "light") => {
    if (mode === "amoled") {
      setAmoledMode(true);
      setLightMode(false);
      return;
    }
    if (mode === "light") {
      setAmoledMode(false);
      setLightMode(true);
      return;
    }
    setAmoledMode(false);
    setLightMode(false);
  };

  const toggleProfileFlip = () => {
    const next = !profileCardFlipped;
    setProfileCardFlipped(next);
    Animated.timing(profileFlipAnim, {
      toValue: next ? 1 : 0,
      duration: 320,
      useNativeDriver: true
    }).start();
  };

  useEffect(() => {
    setEditFullName(userData?.fullName || "");
    setEditCity(userData?.city || "");
    setEditDistrict(userData?.district || "");
  }, [userData?.fullName, userData?.city, userData?.district]);

  // PROFILE-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const saveProfileEdits = async () => {
    if (!user) return;
    const payload: any = {
      fullName: editFullName.trim() || userData?.fullName || "",
      city: editCity.trim(),
      district: editDistrict.trim(),
      updatedAt: serverTimestamp()
    };
    try {
      await updateDoc(doc(db, "users", user.uid), payload);
      await upsertUserPublicDoc(user.uid, { ...(userData || {}), ...payload } as any);
      setUserData({ ...(userData || {}), ...payload });
      setProfileEditOpen(false);
      showToast(L("Profil bilgileri güncellendi.", "Profile information updated."), "success");
    } catch {
      showToast(L("Profil güncellenemedi.", "Profile could not be updated."), "error");
    }
  };

  const updateAvailability = async (value: "available" | "busy" | "offline") => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        availability: value,
        updatedAt: serverTimestamp()
      });
      await upsertUserPublicDoc(user.uid, { ...(userData || {}), availability: value } as any);
      setUserData({ ...(userData || {}), availability: value });
      showToast(L("Müsaitlik güncellendi.", "Availability updated."), "success");
    } catch {
      showToast(L("Müsaitlik güncellenemedi.", "Availability could not be updated."), "error");
    }
  };

  const updateSkillLevel = async (value: "beginner" | "intermediate" | "expert") => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        skillLevel: value,
        updatedAt: serverTimestamp()
      });
      await upsertUserPublicDoc(user.uid, { ...(userData || {}), skillLevel: value } as any);
      setUserData({ ...(userData || {}), skillLevel: value });
      showToast(L("Beceri seviyesi güncellendi.", "Skill level updated."), "success");
    } catch {
      showToast(L("Beceri seviyesi güncellenemedi.", "Skill level could not be updated."), "error");
    }
  };

  const openVolunteerOptions = () => {
    setVolunteerSettingsMode("menu");
    setVolunteerSettingsOpen(true);
  };

  const toggleSkill = async (label: string) => {
    if (!user) return;
    const current = Array.isArray((userData as any)?.skills) ? [...((userData as any).skills as string[])] : [];
    const next = current.includes(label) ? current.filter((s) => s !== label) : [...current, label];
    try {
      await updateDoc(doc(db, "users", user.uid), { skills: next, updatedAt: serverTimestamp() });
      await upsertUserPublicDoc(user.uid, { ...(userData || {}), skills: next } as any);
      setUserData({ ...(userData || {}), skills: next });
      showToast(L("Yetkinlik kartı güncellendi.", "Skills card updated."), "success");
    } catch {
      showToast(L("Yetkinlik güncellenemedi.", "Skills could not be updated."), "error");
    }
  };

  const openSkillEditor = () => {
    setVolunteerSettingsMode("skills");
    setVolunteerSettingsOpen(true);
  };

  const markCertificateUploaded = async () => {
    setCertLogisticsDone(true);
    await toggleSkill("Afet Lojistik Farkındalık");
  };

  const renderProfileEditor = () => {
    if (!profileEditOpen) return null;
    return (
      <View style={{ position: "absolute", inset: 0, zIndex: 25, backgroundColor: "rgba(0,0,0,0.62)", paddingHorizontal: 16, justifyContent: "center" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => setProfileEditOpen(false)} style={{ position: "absolute", inset: 0 }} />
        <View style={{ borderRadius: 20, backgroundColor: "#1f0a12", borderWidth: 1, borderColor: "rgba(248,113,113,0.26)", padding: 14 }}>
          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 17, marginBottom: 10 }}>{L("Profil Düzenle", "Edit Profile")}</Text>
          <TextInput
            value={editFullName}
            onChangeText={setEditFullName}
            placeholder={L("Ad Soyad", "Full Name")}
            placeholderTextColor="#94a3b8"
            style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", paddingHorizontal: 12, marginBottom: 8, fontFamily: "Inter-Bold" }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={editCity}
              onChangeText={setEditCity}
              placeholder={L("Şehir", "City")}
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", paddingHorizontal: 12, marginBottom: 8, fontFamily: "Inter" }}
            />
            <TextInput
              value={editDistrict}
              onChangeText={setEditDistrict}
              placeholder={L("İlçe", "District")}
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", paddingHorizontal: 12, marginBottom: 8, fontFamily: "Inter" }}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={() => setProfileEditOpen(false)} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("VAZGEÇ", "CANCEL")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveProfileEdits} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.25)", backgroundColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("KAYDET", "SAVE")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderVolunteerSettingsModal = () => {
    if (!volunteerSettingsOpen) return null;
    const currentSkills = Array.isArray((userData as any)?.skills) ? ((userData as any).skills as string[]) : [];
    const skillOptions = [
      { raw: "İlk Yardım", label: L("İlk Yardım", "First Aid") },
      { raw: "Lojistik", label: L("Lojistik", "Logistics") },
      { raw: "Psikososyal", label: L("Psikososyal", "Psychosocial") },
      { raw: "Saha Navigasyon", label: L("Saha Navigasyon", "Field Navigation") }
    ] as const;

    return (
      <View style={{ position: "absolute", inset: 0, zIndex: 31, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => setVolunteerSettingsOpen(false)} style={{ position: "absolute", inset: 0 }} />
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: "rgba(248,113,113,0.26)", backgroundColor: "#1f0a12", padding: 14 }}>
          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 17, marginBottom: 6 }}>
            {volunteerSettingsMode === "availability"
              ? L("Müsaitlik", "Availability")
              : volunteerSettingsMode === "skillLevel"
              ? L("Beceri Seviyesi", "Skill Level")
              : volunteerSettingsMode === "skills"
              ? L("Yetkinlik Düzenle", "Edit Skills")
              : L("Hızlı Ayarlar", "Quick Settings")}
          </Text>
          <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12, marginBottom: 10 }}>
            {volunteerSettingsMode === "availability"
              ? L("Durum seçin", "Select status")
              : volunteerSettingsMode === "skillLevel"
              ? L("Seviye seçin", "Select level")
              : volunteerSettingsMode === "skills"
              ? L("Kart yetkinliklerini açıp kapatın", "Toggle skills on your card")
              : L("Güncellenecek alanı seçin", "Select the field to update")}
          </Text>

          {volunteerSettingsMode === "menu" ? (
            <>
              <TouchableOpacity onPress={() => setVolunteerSettingsMode("availability")} style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)", padding: 12, marginBottom: 8 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Müsaitlik", "Availability")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setVolunteerSettingsMode("skillLevel")} style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)", padding: 12, marginBottom: 8 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Beceri Seviyesi", "Skill Level")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setVolunteerSettingsMode("skills")} style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)", padding: 12, marginBottom: 8 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Yetkinlik Kartı", "Skills Card")}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {volunteerSettingsMode === "availability" ? (
            <>
              {[
                { key: "available", tr: "Aktif", en: "Active" },
                { key: "busy", tr: "Meşgul", en: "Busy" },
                { key: "offline", tr: "Askıda", en: "Offline" }
              ].map((opt) => {
                const active = userData?.availability === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={async () => {
                      await updateAvailability(opt.key as any);
                      setVolunteerSettingsOpen(false);
                    }}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)",
                      backgroundColor: active ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.04)",
                      padding: 12,
                      marginBottom: 8
                    }}
                  >
                    <Text style={{ color: active ? "#fecaca" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L(opt.tr, opt.en)}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          {volunteerSettingsMode === "skillLevel" ? (
            <>
              {[
                { key: "beginner", tr: "Başlangıç", en: "Beginner" },
                { key: "intermediate", tr: "Orta", en: "Intermediate" },
                { key: "expert", tr: "Uzman", en: "Expert" }
              ].map((opt) => {
                const active = userData?.skillLevel === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={async () => {
                      await updateSkillLevel(opt.key as any);
                      setVolunteerSettingsOpen(false);
                    }}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)",
                      backgroundColor: active ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.04)",
                      padding: 12,
                      marginBottom: 8
                    }}
                  >
                    <Text style={{ color: active ? "#fecaca" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{L(opt.tr, opt.en)}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          {volunteerSettingsMode === "skills" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              {skillOptions.map((opt) => {
                const active = currentSkills.includes(opt.raw);
                return (
                  <TouchableOpacity
                    key={opt.raw}
                    onPress={async () => {
                      await toggleSkill(opt.raw);
                    }}
                    style={{
                      width: "48.5%",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? "rgba(34,197,94,0.36)" : "rgba(255,255,255,0.08)",
                      backgroundColor: active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                      paddingVertical: 11,
                      paddingHorizontal: 10,
                      marginBottom: 8
                    }}
                  >
                    <Text style={{ color: active ? "#bbf7d0" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            {volunteerSettingsMode === "menu" ? null : (
              <TouchableOpacity onPress={() => setVolunteerSettingsMode("menu")} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("GERİ", "BACK")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setVolunteerSettingsOpen(false)} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("KAPAT", "CLOSE")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (role === "coordinator") {
    const closed = Math.max(0, stats.total - stats.active);
    const completionRate = stats.total ? Math.round((closed / stats.total) * 100) : 0;
    const riskLevel = coordinatorStats.urgent >= 8
      ? L("Kritik", "Critical")
      : coordinatorStats.urgent >= 3
      ? L("Yoğun", "High")
      : L("Normal", "Normal");
    const riskColor = riskLevel === "Kritik" ? "#fca5a5" : riskLevel === "Yoğun" ? "#fde68a" : "#bbf7d0";
    const quickRows = [
      { key: "requests", title: L("Talepler", "Requests"), sub: L("Atama ve durum yönetimi", "Assignment and status management"), icon: "clipboard-outline", onPress: () => navigation.navigate("Manage") },
      { key: "volunteers", title: L("Gönüllüler", "Volunteers"), sub: L("Onay ve saha durumu", "Approval and field status"), icon: "people-outline", onPress: () => navigation.navigate("CoordinatorVolunteers") },
      { key: "reports", title: L("Raporlar", "Reports"), sub: L("Analitik ve performans", "Analytics and performance"), icon: "stats-chart-outline", onPress: () => navigation.navigate("CoordinatorReports") },
      { key: "messages", title: L("Mesajlar", "Messages"), sub: L("Operasyon mesaj merkezi", "Operations message center"), icon: "chatbubbles-outline", onPress: () => navigation.navigate("Messages") },
      { key: "settings", title: L("Ayarlar", "Settings"), sub: L("Sistem ve güvenlik", "System and security"), icon: "settings-outline", onPress: () => navigation.navigate("CoordinatorSettings") },
      { key: "logs", title: L("Loglar", "Logs"), sub: L("Denetim kayıtları", "Audit records"), icon: "document-text-outline", onPress: () => navigation.navigate("CoordinatorLogs") },
      {
        key: "locale",
        title: t(locale, "localeSwitchTitle"),
        sub: `${t(locale, "localeSwitchSub")} • ${locale === "tr" ? t(locale, "localeTurkish") : t(locale, "localeEnglish")}`,
        icon: "language-outline",
        onPress: toggleLocale
      },
      {
        key: "amoled",
        title: L("AMOLED Modu", "AMOLED Mode"),
        sub: amoledMode ? L("Açık", "On") : L("Kapalı", "Off"),
        icon: "moon-outline",
        onPress: () => applyThemeMode(amoledMode ? "red" : "amoled")
      },
      {
        key: "light",
        title: L("Beyaz Tema", "Light Theme"),
        sub: lightMode ? L("Açık", "On") : L("Kapalı", "Off"),
        icon: "sunny-outline",
        onPress: () => applyThemeMode(lightMode ? "red" : "light")
      }
    ] as const;
    return (
      <View style={{ flex: 1, backgroundColor: coordShellBg }}>
        <LinearGradient
          colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3d0713", "#23070f"] as any}
          style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 20 }}
        >
          {/* Üst bar */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Operasyon Komuta", "Operations Command")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Yönetici Profili", "Coordinator Profile")}</Text>
            </View>
            <View style={{ borderRadius: 10, backgroundColor: `${riskColor}25`, borderWidth: 1, borderColor: `${riskColor}50`, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: riskColor, fontFamily: "Inter-Bold", fontSize: 12 }}>{riskLevel}</Text>
            </View>
          </View>

          {/* Avatar + ad + QR */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}>
              <QRCode value={`AFET-COORD-${user?.uid || "DEMO"}`} size={68} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, lineHeight: 24 }} numberOfLines={1}>{userData?.fullName || L("Koordinatör", "Coordinator")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 12, marginTop: 3 }} numberOfLines={1}>{maskedEmail}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 7 }}>
                <View style={{ borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("YÖNETİCİ", "COORDINATOR")}</Text>
                </View>
                <View style={{ borderRadius: 8, backgroundColor: offlineMode ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: offlineMode ? "#fca5a5" : "#86efac", fontFamily: "Inter-Bold", fontSize: 10 }}>
                    {offlineMode ? L("Çevrimdışı", "Offline") : L("Çevrimiçi", "Online")}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* KPI satırı — Taleplerim DNA */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[
              { label: L("Talep", "Requests"), value: String(stats.total), color: "#fecaca", icon: "clipboard-outline" },
              { label: L("Aktif", "Active"), value: String(stats.active), color: "#fbbf24", icon: "pulse-outline" },
              { label: L("Acil", "Urgent"), value: String(coordinatorStats.urgent), color: "#f87171", icon: "alert-circle-outline" },
              { label: L("Gönüllü", "Volunteers"), value: String(coordinatorStats.volunteers), color: "#86efac", icon: "people-outline" }
            ].map((x) => (
              <View key={x.label} style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: `${x.color}30`, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={x.icon as any} size={11} color={x.color} />
                  </View>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 10 }} numberOfLines={1}>{x.label}</Text>
                </View>
                <Text style={{ color: x.color, fontFamily: "Inter-Bold", fontSize: 20 }}>{x.value}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}>
          {/* Operasyon özeti — compact */}
          <View style={{ borderRadius: 16, backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Tamamlama Oranı", "Completion Rate")}</Text>
              <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 14 }}>%{completionRate}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 6 }}>
              <View style={{ width: `${Math.max(4, completionRate)}%`, height: "100%", borderRadius: 999, backgroundColor: "#ef4444" }} />
            </View>
            <Text style={{ color: lightMode ? "#475569" : "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>
              {L("Tamamlanan", "Completed")}: {closed} / {stats.total}
            </Text>
          </View>

          <View style={{ borderRadius: 18, backgroundColor: "rgba(193,18,31,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", padding: 12, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => setCoordModulesExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: coordModulesExpanded ? 8 : 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.18)", borderWidth: 1, borderColor: "rgba(248,113,113,0.24)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="grid-outline" size={15} color="#fecaca" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Hızlı Modüller", "Quick Modules")}</Text>
                  <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{quickRows.length} {L("modül", "modules")}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity onPress={() => navigation.navigate("CoordinatorCenter")} style={{ borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("TÜMÜ", "ALL")}</Text>
                </TouchableOpacity>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={coordModulesExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
                </View>
              </View>
            </TouchableOpacity>
            {coordModulesExpanded && quickRows.map((row) => (
              <TouchableOpacity key={row.key} onPress={row.onPress} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 7, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                  <Ionicons name={row.icon as any} size={17} color="#fecaca" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{row.title}</Text>
                  <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{row.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#fecdd3" />
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ borderRadius: 18, backgroundColor: "rgba(193,18,31,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", padding: 12, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => setCoordNoticeExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: coordNoticeExpanded ? 10 : 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.18)", borderWidth: 1, borderColor: "rgba(251,191,36,0.24)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="megaphone-outline" size={15} color="#fde68a" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Hızlı Duyuru", "Quick Announcement")}</Text>
                  <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }} numberOfLines={1}>{notice ? notice.slice(0, 32) : L("Saha ekibine mesaj gönder", "Send message to field team")}</Text>
                </View>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={coordNoticeExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
              </View>
            </TouchableOpacity>
            {coordNoticeExpanded && (<>
            <TextInput
              style={{ minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", color: "white", paddingHorizontal: 10, paddingVertical: 10, textAlignVertical: "top", fontFamily: "Inter" }}
              multiline
              placeholder={L("Saha ekiplerine gönderilecek duyuruyu yazın...", "Write the announcement for field teams...")}
              placeholderTextColor="#94a3b8"
              value={notice}
              onChangeText={setNotice}
            />
            <TouchableOpacity style={{ marginTop: 9, borderRadius: 12, overflow: "hidden" }} onPress={publishNotice}>
              <LinearGradient colors={["#b1121d", "#d5363f"]} style={{ height: 42, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("DUYURU YAYINLA", "PUBLISH ANNOUNCEMENT")}</Text>
              </LinearGradient>
            </TouchableOpacity>
            </>)}
          </View>

          <View style={{ borderRadius: 18, backgroundColor: "rgba(193,18,31,0.1)", borderWidth: 1, borderColor: "rgba(248,113,113,0.16)", padding: 12, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => setCoordAnnouncementsExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: coordAnnouncementsExpanded ? 8 : 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.18)", borderWidth: 1, borderColor: "rgba(96,165,250,0.24)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="newspaper-outline" size={15} color="#93c5fd" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Son Duyurular", "Recent Announcements")}</Text>
                  <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{announcements.length} {L("kayıt", "records")}</Text>
                </View>
              </View>
              <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={coordAnnouncementsExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
              </View>
            </TouchableOpacity>
            {coordAnnouncementsExpanded && (<>
            {announcements.slice(0, 5).map((a) => (
              <View key={a.id} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 7 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{a.title || L("Duyuru", "Announcement")}</Text>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{a.message || "-"}</Text>
              </View>
            ))}
            {!announcements.length ? <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>{L("Henüz duyuru yok.", "No announcements yet.")}</Text> : null}
            </>)}
          </View>

          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(127,29,29,0.24)", padding: 10, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => setCoordSecurityExpanded((v) => !v)} activeOpacity={0.85} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(168,85,247,0.18)", borderWidth: 1, borderColor: "rgba(192,132,252,0.24)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#d8b4fe" />
                </View>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{L("Kimlik ve Güvenlik Özeti", "Identity and Security Summary")}</Text>
              </View>
              <Ionicons name={coordSecurityExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
            </TouchableOpacity>
            {coordSecurityExpanded && (<>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 8 }}>UID: {(user?.uid || "-").slice(0, 12)}...</Text>
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>{L("Erişim: Yönetici / Koordinatör Yetkileri", "Access: Coordinator privileges")}</Text>
            </>)}
          </View>

          <TouchableOpacity style={{ height: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" }} onPress={logout}>
            <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("GÜVENLİ ÇIKIŞ", "SECURE SIGN OUT")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (role === "volunteer") {
    const volunteerSkills = [
      { key: "firstaid", rawTitle: "İlk Yardım", title: L("İlk Yardım", "First Aid"), icon: "medical-outline", color: "#f87171" },
      { key: "logistics", rawTitle: "Lojistik", title: L("Lojistik", "Logistics"), icon: "cube-outline", color: "#fda4af" },
      { key: "support", rawTitle: "Psikososyal", title: L("Psikososyal", "Psychosocial"), icon: "heart-outline", color: "#fecdd3" },
      { key: "navigation", rawTitle: "Saha Navigasyon", title: L("Saha Navigasyon", "Field Navigation"), icon: "navigate-outline", color: "#f87171" }
    ] as const;
    const activeMission = stats.active;
    const tabItems = [
      { key: "info", label: L("Bilgiler", "Info"), icon: "person-circle-outline" as any },
      { key: "certs", label: L("Sertifika", "Certs"), icon: "ribbon-outline" as any },
      { key: "badges", label: L("Rozet", "Badge"), icon: "trophy-outline" as any },
      { key: "perf", label: L("Perf.", "Perf."), icon: "trending-up-outline" as any }
    ] as const;
    const perfBars = [42, 58, 49, 76, 69, 88];
    const volunteerStatusText =
      userData?.availability === "busy" ? L("Meşgul", "Busy") :
      userData?.availability === "offline" ? L("Askıda", "Offline") : L("Aktif", "Active");
    const volunteerStatusColors =
      userData?.availability === "busy"
        ? { bg: "rgba(249,168,37,0.14)", bd: "rgba(249,168,37,0.26)", tx: "#fde68a" }
        : userData?.availability === "offline"
        ? { bg: "rgba(148,163,184,0.14)", bd: "rgba(148,163,184,0.22)", tx: "#cbd5e1" }
        : { bg: "rgba(34,197,94,0.14)", bd: "rgba(34,197,94,0.24)", tx: "#bbf7d0" };
    const skillLevelLabel =
      userData?.skillLevel === "expert" ? L("Uzman", "Expert") :
      userData?.skillLevel === "intermediate" ? L("Orta", "Intermediate") :
      userData?.skillLevel === "beginner" ? L("Başlangıç", "Beginner") : L("Orta", "Intermediate");

    return (
      <View style={{ flex: 1, backgroundColor: volShellBg }}>
        <LinearGradient
          colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"] as any}
          style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 20 }}
        >
          {/* Üst bar */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü Operasyon", "Volunteer Operations")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Profilim", "My Profile")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setVictimMenuOpen((v) => !v)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openVolunteerOptions}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="settings-outline" size={17} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Avatar + ad + rozetler */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={30} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, lineHeight: 24 }} numberOfLines={1}>{userData?.fullName || L("Gönüllü", "Volunteer")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 12, marginTop: 2 }} numberOfLines={1}>{maskedEmail}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <View style={{ borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("GÖNÜLLÜ", "VOLUNTEER")}</Text>
                </View>
                <View style={{ borderRadius: 8, backgroundColor: volunteerStatusColors.bg, borderWidth: 1, borderColor: volunteerStatusColors.bd, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: volunteerStatusColors.tx, fontFamily: "Inter-Bold", fontSize: 10 }}>{volunteerStatusText}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* İstatistik kartları — Taleplerim DNA */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { label: L("Görev", "Missions"), value: stats.total, accent: "#ef4444", icon: "clipboard" as any },
              { label: L("Aktif", "Active"), value: activeMission, accent: "#3b82f6", icon: "pulse" as any },
              { label: L("Saat", "Hours"), value: 24 + stats.done * 3, accent: "#f59e0b", icon: "time" as any },
              { label: L("Puan", "Score"), value: 80 + stats.done * 2, accent: "#22c55e", icon: "star" as any }
            ].map((it) => (
              <View key={it.label} style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 9 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: `${it.accent}30`, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={it.icon} size={10} color={it.accent} />
                  </View>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter-Bold", fontSize: 9, letterSpacing: 0.3 }} numberOfLines={1}>{it.label}</Text>
                </View>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 18 }}>{it.value}</Text>
              </View>
            ))}
          </View>

          {/* Menü (açılır) */}
          {victimMenuOpen ? (
            <View style={{ marginTop: 12, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 10, gap: 8 }}>
              {[
                { icon: "time-outline", label: L("Afet Geçmişim", "My Disaster History"), onPress: () => { setVictimMenuOpen(false); navigation.navigate("DisasterHistory"); } },
                { icon: "download-outline", label: L("Verilerimi Dışa Aktar", "Export My Data"), onPress: () => { setVictimMenuOpen(false); exportMyData(); } }
              ].map((item) => (
                <TouchableOpacity key={item.icon} onPress={item.onPress} style={{ borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name={item.icon as any} size={16} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13, marginLeft: 10, flex: 1 }}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => { setVictimMenuOpen(false); askDeletion(); }} style={{ borderRadius: 10, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", padding: 11, flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="trash-outline" size={16} color="#fecaca" />
                <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 13, marginLeft: 10 }}>{L("Hesabımı Sil", "Delete Account")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 96 }}>
          {/* Sekme chip'leri — Taleplerim DNA */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
            {tabItems.map((tab) => {
              const active = volunteerTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setVolunteerTab(tab.key)}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
                    borderRadius: 10, height: 38,
                    backgroundColor: active ? (lightMode ? "#be123c" : "#dc2626") : (lightMode ? "#ffffff" : "rgba(255,255,255,0.04)"),
                    borderWidth: 1, borderColor: active ? (lightMode ? "rgba(159,18,57,0.4)" : "rgba(248,113,113,0.4)") : (lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)")
                  }}
                >
                  <Ionicons name={tab.icon} size={13} color={active ? "white" : (lightMode ? "#94a3b8" : "#fda4af")} />
                  <Text style={{ color: active ? "white" : (lightMode ? "#94a3b8" : "#fda4af"), fontFamily: "Inter-Bold", fontSize: 11 }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {volunteerTab === "info" ? (
            <>
              {/* Kişisel Bilgiler — açılır/kapanır */}
              <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setPersonalInfoExpanded((v) => !v)}
                  activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="person-circle" size={17} color="#60a5fa" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Kişisel Bilgiler", "Personal Info")}</Text>
                      <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11 }}>{L("Ad, telefon, e-posta, konum", "Name, phone, email, location")}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TouchableOpacity onPress={() => setProfileEditOpen(true)} style={{ borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)", paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("DÜZENLE", "EDIT")}</Text>
                    </TouchableOpacity>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={personalInfoExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
                    </View>
                  </View>
                </TouchableOpacity>
                {personalInfoExpanded ? (
                  <View style={{ marginTop: 10 }}>
                    {[
                      [L("Ad Soyad", "Full Name"), userData?.fullName || "-"],
                      [L("Telefon", "Phone"), maskedPhone],
                      [L("E-posta", "Email"), maskedEmail],
                      [L("Şehir / Bölge", "City / Region"), [userData?.city, userData?.district].filter(Boolean).join(" / ") || "-"],
                      [L("Beceri Seviyesi", "Skill Level"), skillLevelLabel]
                    ].map(([label, value], idx) => (
                      <View key={String(label)} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: idx === 4 ? 0 : 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                        <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 12 }}>{label}</Text>
                        <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, maxWidth: "56%", textAlign: "right" }}>{value as any}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Yetkinlik Kartı — açılır/kapanır */}
              <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setSkillsExpanded((v) => !v)}
                  activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(139,92,246,0.15)", borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="ribbon" size={17} color="#a78bfa" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Yetkinlik Kartı", "Skills Card")}</Text>
                      <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11 }}>
                        {(() => {
                          const activeSkills = Array.isArray((userData as any)?.skills) ? ((userData as any).skills as string[]).length : 0;
                          return L(`${activeSkills}/4 yetkinlik aktif`, `${activeSkills}/4 skills active`);
                        })()}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TouchableOpacity onPress={openSkillEditor} style={{ borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(248,113,113,0.25)", paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("DÜZENLE", "EDIT")}</Text>
                    </TouchableOpacity>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={skillsExpanded ? "chevron-up" : "chevron-down"} size={15} color="#fda4af" />
                    </View>
                  </View>
                </TouchableOpacity>
                {skillsExpanded ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {volunteerSkills.map((skill) => {
                      const isActive = Array.isArray((userData as any)?.skills) && ((userData as any).skills as string[]).includes(skill.rawTitle);
                      return (
                        <View key={skill.key} style={{ width: "48%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: isActive ? `${skill.color}40` : "rgba(255,255,255,0.06)", padding: 10 }}>
                          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: `${skill.color}22`, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                            <Ionicons name={skill.icon as any} size={16} color={skill.color} />
                          </View>
                          <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{skill.title}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isActive ? "#22c55e" : "#475569" }} />
                            <Text style={{ color: isActive ? "#86efac" : "#fda4af", fontFamily: "Inter-Bold", fontSize: 10 }}>
                              {isActive ? L("Aktif", "Active") : L("Pasif", "Passive")}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {volunteerTab === "certs" ? (
            <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 10 }}>{L("Sertifikalar", "Certificates")}</Text>
              {[
                { title: L("İlk Yardım Temel Eğitimi", "Basic First Aid Training"), status: L("Doğrulandı", "Verified"), color: "#22c55e" },
                { title: L("Afet Lojistik Farkındalık", "Disaster Logistics Awareness"), status: certLogisticsDone ? L("Doğrulandı", "Verified") : L("Yüklenecek", "Pending Upload"), color: certLogisticsDone ? "#22c55e" : "#f59e0b" }
              ].map((cert) => (
                <View key={cert.title} style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 11, marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12, flex: 1 }}>{cert.title}</Text>
                    <View style={{ borderRadius: 999, backgroundColor: `${cert.color}22`, borderWidth: 1, borderColor: `${cert.color}44`, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 }}>
                      <Text style={{ color: cert.color, fontFamily: "Inter-Bold", fontSize: 10 }}>{cert.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={markCertificateUploaded} style={{ height: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.24)", backgroundColor: "rgba(239,68,68,0.08)", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("SERTİFİKA YÜKLE", "UPLOAD CERTIFICATE")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {volunteerTab === "badges" ? (
            <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
              <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 10 }}>{L("Kazanılan Rozetler", "Earned Badges")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  { key: "first", title: L("İlk Görev", "First Mission"), icon: "sparkles-outline", color: "#f87171" },
                  { key: "rapid", title: L("Hızlı Müdahale", "Rapid Response"), icon: "flash-outline", color: "#fda4af" },
                  { key: "team", title: L("Takım Oyuncusu", "Team Player"), icon: "people-outline", color: "#fecdd3" },
                  { key: "steady", title: L("Saha Disiplini", "Field Discipline"), icon: "shield-checkmark-outline", color: "#f87171" }
                ].map((badge) => (
                  <View key={badge.key} style={{ width: "48%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${badge.color}22`, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      <Ionicons name={badge.icon as any} size={17} color={badge.color} />
                    </View>
                    <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{badge.title}</Text>
                    <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 2 }}>{L("Seviye 1", "Level 1")}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {volunteerTab === "perf" ? (
            <>
              <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Son 6 Ay Katılım Trendi", "Last 6 Months Participation Trend")}</Text>
                <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2, marginBottom: 10 }}>{L("Görev katılım performansı ve aktiflik oranı", "Mission participation performance and activity ratio")}</Text>
                <View style={{ height: 120, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 12, justifyContent: "flex-end" }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: "100%" }}>
                    {perfBars.map((v, idx) => (
                      <View key={`${v}-${idx}`} style={{ width: "13%", alignItems: "center" }}>
                        <View style={{ width: "100%", height: `${v}%`, borderRadius: 10, backgroundColor: idx === perfBars.length - 1 ? "rgba(239,68,68,0.9)" : "rgba(248,113,113,0.45)" }} />
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 8 }}>{L("Katılım İstatistikleri", "Participation Metrics")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    [L("Toplam Saat", "Total Hours"), String(24 + stats.done * 3)],
                    [L("Katılım Oranı", "Participation Rate"), `${Math.min(99, 70 + stats.done * 3)}%`],
                    [L("Ortalama Puan", "Average Rating"), (4.3 + Math.min(0.6, stats.done * 0.05)).toFixed(1)],
                    [L("Rozet", "Badge"), String(3 + Math.floor(stats.done / 2))]
                  ].map(([label, value]) => (
                    <View key={String(label)} style={{ width: "48%", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", paddingVertical: 12, alignItems: "center" }}>
                      <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{value as any}</Text>
                      <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 2 }}>{label as any}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TouchableOpacity onPress={() => setProfileEditOpen(true)} style={{ flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("BİLGİLERİ DÜZENLE", "EDIT INFO")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openVolunteerOptions} style={{ flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.22)", backgroundColor: "rgba(239,68,68,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("UYGUNLUK TAKVİMİ", "AVAILABILITY CALENDAR")}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 12, marginBottom: 12 }}>
            <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14, marginBottom: 8 }}>{L("Hızlı Aksiyonlar", "Quick Actions")}</Text>
            {[
              { key: "map", title: L("Harita Operasyonu", "Map Operations"), sub: L("Aktif talepleri renk filtreleriyle görüntüle", "View active requests with color filters"), icon: "map-outline", onPress: () => navigation.navigate("Map") },
              { key: "tasks", title: L("Talepler & Görevler", "Requests & Missions"), sub: L("Gelen talepler ve atanan görevlerin", "Incoming requests and assigned missions"), icon: "clipboard-outline", onPress: () => navigation.navigate("Tasks") },
              { key: "messages", title: L("Mesajlar", "Messages"), sub: L("Koordinatör ve Afet.AI saha hattı", "Coordinator and Afet.AI field channel"), icon: "chatbubbles-outline", onPress: () => navigation.navigate("Messages") },
              { key: "amoled", title: L("AMOLED Modu", "AMOLED Mode"), sub: amoledMode ? L("Açık", "On") : L("Kapalı", "Off"), icon: "moon-outline", onPress: () => applyThemeMode(amoledMode ? "red" : "amoled") },
              { key: "light", title: L("Beyaz Tema", "Light Theme"), sub: lightMode ? L("Açık", "On") : L("Kapalı", "Off"), icon: "sunny-outline", onPress: () => applyThemeMode(lightMode ? "red" : "light") },
              {
                key: "locale",
                title: t(locale, "localeSwitchTitle"),
                sub: `${t(locale, "localeSwitchSub")} • ${locale === "tr" ? t(locale, "localeTurkish") : t(locale, "localeEnglish")}`,
                icon: "language-outline",
                onPress: toggleLocale
              },
              {
                key: "offline",
                title: L("Çevrimdışı Durum", "Offline Status"),
                sub: offlineMode ? L("Çevrimdışı • son veri kullanılıyor", "Offline • using latest cached data") : `${L("Çevrimiçi", "Online")} • ${L("son senkron", "last sync")} ${syncText}`,
                icon: "cloud-offline-outline",
                onPress: () => showToast(offlineMode ? L("Cihaz şu an çevrimdışı.", "Device is currently offline.") : L("Bağlantı aktif.", "Connection is active."), "info")
              }
            ].map((row) => (
              <TouchableOpacity key={row.key} onPress={row.onPress} style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                  <Ionicons name={row.icon as any} size={17} color="#fecaca" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }}>{row.title}</Text>
                  <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{row.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#fecdd3" />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={logout} style={{ height: 50, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(248,113,113,0.24)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("GÜVENLİ ÇIKIŞ", "SECURE SIGN OUT")}</Text>
          </TouchableOpacity>
        </ScrollView>
        {renderVolunteerSettingsModal()}
        {renderProfileEditor()}
      </View>
    );
  }

  if (role === "victim") {
    const frontRotate = profileFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
    const backRotate = profileFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
    const frontOpacity = profileFlipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
    const backOpacity = profileFlipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });
    const victimTools = [
      {
        key: "family",
        title: L("Yakınlarım Ağı", "Family Safety Network"),
        sub: L("Güvendeyim ve acil paylaşım listesi", "I'm Safe and emergency contact list"),
        icon: "people-outline",
        iconBg: "rgba(239,68,68,0.16)",
        iconColor: "#fecaca",
        onPress: () => navigation.navigate("VictimFamilySafety")
      },
      {
        key: "voice_records",
        title: L("Ses Kayıtlarım", "My Voice Recordings"),
        sub: L("Sesli SOS kayıtlarını dinle ve paylaş", "Listen and share voice SOS records"),
        icon: "mic-outline",
        iconBg: "rgba(239,68,68,0.16)",
        iconColor: "#fecaca",
        onPress: () => navigation.navigate("VoiceSOS")
      },
      {
        key: "bag",
        title: L("Afet Çantam", "Emergency Kit"),
        sub: L("Hazırlık kontrol listesi", "Preparedness checklist"),
        icon: "briefcase-outline",
        iconBg: "rgba(251,113,133,0.16)",
        iconColor: "#fecdd3",
        onPress: () => setGoBagOpen((v) => !v)
      },
      {
        key: "amoled",
        title: L("AMOLED Modu", "AMOLED Mode"),
        sub: L("Koyu tema güçlendir", "Enhance dark theme"),
        icon: "moon-outline",
        iconBg: "rgba(255,255,255,0.08)",
        iconColor: "#f8fafc",
        onPress: () => applyThemeMode(amoledMode ? "red" : "amoled")
      },
      {
        key: "light",
        title: L("Beyaz Tema", "Light Theme"),
        sub: L("Açık arayüzü etkinleştir", "Enable bright interface"),
        icon: "sunny-outline",
        iconBg: "rgba(239,68,68,0.14)",
        iconColor: "#fecdd3",
        onPress: () => applyThemeMode(lightMode ? "red" : "light")
      },
      {
        key: "black",
        title: L("Gizli Mod (Siyah Ekran)", "Stealth Mode (Black Screen)"),
        sub: L("Karanlık ortamda ekran gizleme", "Hide screen in dark environment"),
        icon: "eye-off-outline",
        iconBg: "rgba(239,68,68,0.14)",
        iconColor: "#fecdd3",
        onPress: () => setBlackoutMode(true)
      },
      {
        key: "locale",
        title: t(locale, "localeSwitchTitle"),
        sub: `${t(locale, "localeSwitchSub")} • ${locale === "tr" ? t(locale, "localeTurkish") : t(locale, "localeEnglish")}`,
        icon: "language-outline",
        iconBg: "rgba(239,68,68,0.14)",
        iconColor: "#fecdd3",
        onPress: toggleLocale
      },
      {
        key: "offline",
        title: L("Ağ Durumu", "Network Status"),
        sub: offlineMode ? L("Çevrimdışı • son veri kullanılıyor", "Offline • using last synced data") : `${L("Çevrimiçi", "Online")} • ${L("son senkron", "last sync")} ${syncText}`,
        icon: "cloud-outline",
        iconBg: "rgba(239,68,68,0.14)",
        iconColor: "#fecdd3",
        onPress: () => showToast(offlineMode ? L("Cihaz çevrimdışı modda.", "Device is offline.") : L("Bağlantı aktif.", "Connection is active."), "info")
      }
    ] as const;

    return (
      <View style={{ flex: 1, backgroundColor: victimShellBg }}>
        {/* Sabit header */}
        <LinearGradient
          colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#000000", "#000000"] : ["#3f0914", "#1f060d"] as any}
          style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 20 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım", "Afet Yardım")}</Text>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Profilim", "My Profile")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setVictimMenuOpen((v) => !v)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="white" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setProfileEditOpen(true)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="create-outline" size={17} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Kullanıcı kimlik kartı — kompakt */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {/* Avatar */}
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={30} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 20, lineHeight: 24 }} numberOfLines={1}>{userData?.fullName || L("Kullanıcı", "User")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
                <View style={{ borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 10 }}>{L("AFETZEDE", "VICTIM")}</Text>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.55)", fontFamily: "Inter", fontSize: 11 }}>
                  ID: TR-{(user?.uid || "DEMO").slice(0, 4).toUpperCase()}-{(user?.uid || "0000").slice(-4).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Menü (açılır) */}
          {victimMenuOpen ? (
            <View style={{ marginTop: 12, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 10, gap: 8 }}>
              <TouchableOpacity onPress={() => { setVictimMenuOpen(false); navigation.navigate("DisasterHistory"); }} style={{ borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="time-outline" size={16} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13, marginLeft: 10, flex: 1 }}>{L("Afet Geçmişim", "My Disaster History")}</Text>
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setVictimMenuOpen(false); exportMyData(); }} style={{ borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="download-outline" size={16} color="white" />
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13, marginLeft: 10, flex: 1 }}>{L("Verilerimi Dışa Aktar", "Export My Data")}</Text>
                <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setVictimMenuOpen(false); askDeletion(); }} style={{ borderRadius: 10, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(248,113,113,0.2)", padding: 11, flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="trash-outline" size={16} color="#fecaca" />
                <Text style={{ color: "#fecaca", fontFamily: "Inter-Bold", fontSize: 13, marginLeft: 10 }}>{L("Hesabımı Sil", "Delete Account")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 96 }}>
          {/* İstatistik kartları */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            {[
              { label: L("Toplam", "Total"), value: stats.total, filter: "all", color: lightMode ? "#0f172a" : "#fff1f2" },
              { label: L("Aktif", "Active"), value: stats.active, filter: "active", color: "#f59e0b" },
              { label: L("Tamamlanan", "Done"), value: stats.done, filter: "closed", color: "#22c55e" }
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => navigation.navigate("Requests", { filter: item.filter })}
                style={{ flex: 1, borderRadius: 16, backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", paddingVertical: 14, alignItems: "center", shadowColor: "#000", shadowOpacity: lightMode ? 0.05 : 0, shadowRadius: 6, elevation: lightMode ? 1 : 0 }}
              >
                <Text style={{ color: item.color, fontFamily: "Inter-Bold", fontSize: 26 }}>{item.value}</Text>
                <Text style={{ color: lightMode ? "#64748b" : "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 3 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* QR Kod kartı */}
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={toggleProfileFlip}
            style={{ borderRadius: 18, backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", padding: 16, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 16 }}
          >
            <View style={{ backgroundColor: "white", borderRadius: 12, padding: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }}>
              <QRCode value={`AFET-${user?.uid || "DEMO"}`} size={80} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 15, marginBottom: 4 }}>{L("Kimlik QR Kodu", "Identity QR Code")}</Text>
              <Text style={{ color: lightMode ? "#64748b" : "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>
                {L("Gönüllü ve yöneticilerin sizi doğrulaması için kullanın.", "Use for volunteer & coordinator verification.")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                <Ionicons name="sync-outline" size={12} color={lightMode ? "#9f1239" : "#fecaca"} />
                <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Hesap bilgilerini görmek için dokunun", "Tap to see account details")}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Hesap bilgileri (flip açıldıysa) */}
          {profileCardFlipped ? (
            <View style={{ borderRadius: 16, backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", padding: 14, marginBottom: 14 }}>
              <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.5, marginBottom: 12 }}>{L("HESAP BİLGİLERİ", "ACCOUNT DETAILS")}</Text>
              {[
                { icon: "mail-outline", label: L("E-posta", "Email"), value: maskedEmail },
                { icon: "call-outline", label: L("Telefon", "Phone"), value: maskedPhone },
                { icon: "card-outline", label: L("TC Kimlik", "National ID"), value: maskedTc }
              ].map((row, idx) => (
                <View key={row.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: idx === 2 ? 0 : 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: lightMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Ionicons name={row.icon as any} size={16} color={lightMode ? "#be123c" : "#fecaca"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 11 }}>{row.label}</Text>
                    <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 1 }} numberOfLines={1}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Araçlar */}
          <View style={{ marginBottom: 12, gap: 8 }}>
            {victimTools.map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={item.onPress}
                style={{ backgroundColor: lightMode ? "#fff" : "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)", padding: 13, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 4, elevation: lightMode ? 1 : 0 }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.iconBg, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{item.title}</Text>
                  <Text style={{ color: lightMode ? "#64748b" : "#fecdd3", fontFamily: "Inter", fontSize: 12, marginTop: 1 }}>
                    {item.key === "amoled"
                      ? `${item.sub} • ${amoledMode ? L("Açık", "On") : L("Kapalı", "Off")}`
                      : item.key === "light"
                      ? `${item.sub} • ${lightMode ? L("Açık", "On") : L("Kapalı", "Off")}`
                      : item.sub}
                  </Text>
                </View>
                {item.key === "amoled" || item.key === "light" ? (
                  <View style={{ width: 42, height: 25, borderRadius: 12.5, backgroundColor: (item.key === "amoled" ? amoledMode : lightMode) ? "rgba(239,68,68,0.25)" : lightMode ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)", padding: 2.5, justifyContent: "center" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: (item.key === "amoled" ? amoledMode : lightMode) ? "#ef4444" : "#fff", alignSelf: (item.key === "amoled" ? amoledMode : lightMode) ? "flex-end" : "flex-start" }} />
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={lightMode ? "#94a3b8" : "#fecdd3"} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={logout}
            style={{ marginTop: 4, borderRadius: 16, borderWidth: 1, borderColor: lightMode ? "rgba(239,68,68,0.2)" : "rgba(248,113,113,0.22)", backgroundColor: lightMode ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", height: 52, flexDirection: "row", gap: 8 }}
          >
            <Ionicons name="log-out-outline" size={18} color={lightMode ? "#be123c" : "#fecaca"} />
            <Text style={{ color: lightMode ? "#be123c" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Güvenli Çıkış", "Sign Out")}</Text>
          </TouchableOpacity>
        </ScrollView>
        {goBagOpen ? (
          <View style={{ position: "absolute", inset: 0, zIndex: 28, justifyContent: "center", paddingHorizontal: 16 }}>
            <TouchableOpacity activeOpacity={1} onPress={() => setGoBagOpen(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.6)" }} />
            <View style={{ borderRadius: 18, backgroundColor: "#2b0b15", borderWidth: 1, borderColor: "rgba(248,113,113,0.26)", padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Afet Çantam Kontrol Listesi", "Emergency Kit Checklist")}</Text>
                <TouchableOpacity onPress={() => setGoBagOpen(false)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={16} color="#fecaca" />
                </TouchableOpacity>
              </View>
              {[
                { key: "water", label: L("Su ve gıda (72 saat)", "Water and food (72h)") },
                { key: "flashlight", label: L("Fener + pil", "Flashlight + battery") },
                { key: "medicine", label: L("Kişisel ilaçlar", "Personal medicines") },
                { key: "powerbank", label: L("Powerbank / şarj kablosu", "Power bank / charging cable") },
                { key: "docs", label: L("Kimlik / önemli belgeler", "ID / important documents") },
                { key: "whistle", label: L("Düdük / acil sinyal", "Whistle / emergency signal") }
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setGoBag((prev: any) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)", padding: 10, marginBottom: 7 }}
                >
                  <Ionicons
                    name={(goBag as any)[item.key] ? "checkbox-outline" : "square-outline"}
                    size={18}
                    color={(goBag as any)[item.key] ? "#22c55e" : "#fecdd3"}
                  />
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter", fontSize: 12, marginLeft: 8, flex: 1 }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2 }}>
                {L("Tamamlanan", "Completed")}: {Object.values(goBag).filter(Boolean).length}/6
              </Text>
            </View>
          </View>
        ) : null}
        {renderProfileEditor()}
        {blackoutMode ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setBlackoutMode(false)}
            style={{ position: "absolute", inset: 0, zIndex: 30, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#d1d5db", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Gizli Mod Aktif", "Stealth Mode Active")}</Text>
            <Text style={{ color: "#9ca3af", fontFamily: "Inter", fontSize: 11, marginTop: 6 }}>{L("Çıkmak için ekrana dokun", "Tap screen to exit")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.page}>
      <Text style={s.title}>{L("Profil", "Profile")}</Text>
      <View style={[s.card, { alignItems: "center" }]}>
        <QRCode value={`AFET-${user?.uid || "DEMO"}`} size={100} />
        <Text style={[s.cardTitle, { marginTop: 8 }]}>{userData?.fullName || L("Kullanıcı", "User")}</Text>
        <Text style={s.cardSub}>{L("Rol", "Role")}: {role}</Text>
      </View>
      <View style={s.row3}>
        <View style={s.stat}><Text style={s.statValue}>{stats.total}</Text><Text style={s.statLabel}>{L("Toplam", "Total")}</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{stats.active}</Text><Text style={s.statLabel}>{L("Aktif", "Active")}</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{stats.done}</Text><Text style={s.statLabel}>{L("Tamam", "Done")}</Text></View>
      </View>
      {role === "volunteer" && <TouchableOpacity style={s.darkBtn} onPress={() => navigation.navigate("VolunteerTasks")}><Text style={s.darkBtnText}>{L("GÖREVLERİM", "MY TASKS")}</Text></TouchableOpacity>}
      <TouchableOpacity style={s.grayBtn} onPress={exportMyData}><Text style={s.grayBtnText}>{L("VERİLERİMİ DIŞA AKTAR", "EXPORT MY DATA")}</Text></TouchableOpacity>
      <TouchableOpacity style={s.grayBtn} onPress={askDeletion}><Text style={s.grayBtnText}>{L("HESABIMI SİLME TALEBİ", "REQUEST ACCOUNT DELETION")}</Text></TouchableOpacity>
      <TouchableOpacity style={s.redBtn} onPress={logout}><Text style={s.redBtnText}>{L("GÜVENLİ ÇIKIŞ", "SECURE SIGN OUT")}</Text></TouchableOpacity>
    </View>
  );
};






