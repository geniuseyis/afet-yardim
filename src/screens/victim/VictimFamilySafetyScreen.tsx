import {
  React, useEffect, useMemo, useState,
  Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Ionicons, Location, useStore
} from "../shared/ScreenDeps";
import { loadSafeContacts, saveSafeContacts, type SafeContact } from "../../services/familySafetyLocal";
import { maskPhone } from "../../utils/privacy";
import { l } from "../../services/i18n";
import { Share } from "react-native";
import { Audio } from "expo-av";
import * as Sharing from "expo-sharing";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { storage, db } from "../../firebase";

/**
 * VICTIM-FAMILY DOSYA HARITASI
 * - VICTIM-FAMILY-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
 * - VICTIM-FAMILY-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VICTIM-FAMILY-VALIDATE: Bu bolumde form alanlari icin dogrulama ve temizleme kurallari vardir.
 * - VICTIM-FAMILY-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

// [FONKSIYON] VictimFamilySafetyScreen: Yakın ekleme, güvendeyim paylaşımı ve acil sinyal yönetimini sağlar.
export const VictimFamilySafetyScreen = ({ navigation }: { navigation: any }) => {
  const { user } = useStore();
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const [contacts, setContacts] = useState<SafeContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [locationText, setLocationText] = useState<string>("");
  const [voiceRecording, setVoiceRecording] = useState<Audio.Recording | null>(null);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceRecordDuration, setVoiceRecordDuration] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const voiceTimerRef = React.useRef<any>(null);
  const [lastVoice, setLastVoice] = useState<{ localUri: string; durationSec: number; ts: number; downloadUrl?: string | null; label?: string; firestoreId?: string } | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const voiceSoundRef = React.useRef<Audio.Sound | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    return () => {
      // ekran kapanırken oynatılan sesi bırak
      voiceSoundRef.current?.unloadAsync().catch(() => {});
      voiceSoundRef.current = null;
    };
  }, []);
  const L = (tr: string, en: string) => l(locale, tr, en);

  // [FONKSIYON] sanitizeTextNoNumbers: Metin alanından rakamları temizler.
  const sanitizeTextNoNumbers = (value: string) => value.replace(/[0-9]/g, "");
  // [FONKSIYON] sanitizeHumanText: Ad/ilişki alanları için yalnızca geçerli karakterleri bırakır.
  const sanitizeHumanText = (value: string) =>
    sanitizeTextNoNumbers(value)
      .replace(/[^A-Za-zÇĞİIÖŞÜçğıöşü\s'-.]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  // [FONKSIYON] toTitleCaseTr: Metni Türkçe başlık formatına dönüştürür.
  const toTitleCaseTr = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase("tr-TR")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
      .join(" ");

  // VICTIM-FAMILY-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    if (!user?.uid) return;
    loadSafeContacts(user.uid).then(setContacts);
  }, [user?.uid]);


  // VICTIM-FAMILY-VERI: Bu bolumde veri okuma, anlik dinleme ve kaynak baglantilari tanimlanir.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationText(l(locale, "Konum izni verilmedi", "Location permission denied"));
          return;
        }
        const now = await Location.getCurrentPositionAsync({});
        setLocationText(`${now.coords.latitude.toFixed(4)}, ${now.coords.longitude.toFixed(4)}`);
      } catch {
          setLocationText(l(locale, "Konum alınamadı", "Location unavailable"));
      }
    })();
  }, []);

  // [FONKSIYON] saveAll: Yakın listesini state'e ve lokal depolamaya birlikte kaydeder.
  const saveAll = async (next: SafeContact[]) => {
    setContacts(next);
    if (user?.uid) await saveSafeContacts(user.uid, next);
  };

  // VICTIM-FAMILY-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  // [FONKSIYON] addContact: Formdan yeni yakın ekleyip doğrulama sonrası listeye kaydeder.
  const addContact = async () => {
    const normalizedPhone = phone.replace(/\D/g, "").slice(0, 11);
    if (!name.trim() || normalizedPhone.length < 10) {
      Alert.alert(L("Hata", "Error"), L("Ad ve geçerli telefon girin.", "Enter name and valid phone."));
      return;
    }
    if (contacts.some((c) => c.phone === normalizedPhone)) {
      Alert.alert(L("Bilgi", "Info"), L("Bu telefon zaten kayıtlı.", "This phone is already registered."));
      return;
    }
    const next: SafeContact[] = [
      {
        id: `${Date.now()}`,
        name: toTitleCaseTr(sanitizeHumanText(name)),
        phone: normalizedPhone,
        relation: toTitleCaseTr(sanitizeHumanText(relation)) || undefined,
        lastStatus: "unknown",
        lastSharedAt: null
      },
      ...contacts
    ];
    await saveAll(next);
    setName("");
    setPhone("");
    setRelation("");
    Alert.alert(L("Başarılı", "Success"), L("Yakın eklendi.", "Contact added."));
  };

  // [FONKSIYON] shareSafeStatus: Seçilen yakın(lar) için "güvendeyim" durumunu oluşturur ve paylaşım diyaloğunu açar.
  const shareSafeStatus = async (contactId?: string) => {
    const now = Date.now();
    const next = contacts.map((c) =>
      !contactId || c.id === contactId
        ? { ...c, lastSharedAt: now, lastStatus: "safe" as const, note: `${L("Güvendeyim", "I'm Safe")} • ${locationText}` }
        : c
    );
    await saveAll(next);
    const locPart = locationText ? `\n📍 ${locationText}` : "";
    const time = new Date().toLocaleTimeString(locale === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
    const shareText = locale === "en"
      ? `✅ I'M SAFE\nTime: ${time}${locPart}\n\nSent via Afet Yardım Emergency App`
      : `✅ GÜVENDEYİM\nSaat: ${time}${locPart}\n\nAfet Yardım Acil Uygulaması üzerinden gönderildi`;
    try {
      await Share.share({ message: shareText, title: L("Güvenlik Durumum", "My Safety Status") });
    } catch {
      // Paylaşım iptal edildi
    }
  };

  // [FONKSIYON] requestHelpSignal: Seçilen yakına "acil yardım gerekiyor" durum taslağı yazar.
  const requestHelpSignal = async (contactId: string) => {
    const now = Date.now();
    const next = contacts.map((c) =>
      c.id === contactId
        ? { ...c, lastSharedAt: now, lastStatus: "need_help" as const, note: `${L("Acil yardım gerekiyor", "Emergency help needed")} • ${locationText}` }
        : c
    );
    await saveAll(next);
    Alert.alert(L("Bilgi", "Info"), L("Acil durum paylaşımı taslağı oluşturuldu.", "Emergency share draft created."));
  };

  // [FONKSIYON] startVoiceSOS: Mikrofon izni alır ve 30 saniyelik SOS ses kaydını başlatır.
  const startVoiceSOS = async () => {
    try {
      // Önce mevcut ses modunu sıfırla
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(L("İzin Gerekli", "Permission Required"), L("Mikrofon izni verilmedi. Ayarlar > Uygulama > İzinler bölümünden mikrofon iznini açın.", "Microphone permission denied. Enable it in Settings > App > Permissions."));
        return;
      }

      // Yeni kayıt oluştur — daha uyumlu preset
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000
        }
      });

      setVoiceRecording(recording);
      setVoiceRecordingActive(true);
      setVoiceRecordDuration(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordDuration((d) => {
          if (d >= 29) { void stopVoiceSOS(); return 30; }
          return d + 1;
        });
      }, 1000);
    } catch (err: any) {
      Alert.alert(
        L("Hata", "Error"),
        L(
          `Ses kaydı başlatılamadı: ${err?.message || "Bilinmeyen hata"}. Mikrofon izinlerini kontrol edin.`,
          `Could not start recording: ${err?.message || "Unknown error"}. Check microphone permissions.`
        )
      );
    }
  };

  // [FONKSIYON] stopVoiceSOS: Kaydı durdurur, dosyayı paylaşır, Storage+Firestore'a kaydeder.
  const stopVoiceSOS = async () => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    if (!voiceRecording) return;

    const durationSec = voiceRecordDuration;
    const ts = Date.now();
    let localUri: string | null = null;

    try {
      // Önce URI'yi al, sonra durdur
      localUri = voiceRecording.getURI();
      await voiceRecording.stopAndUnloadAsync();
    } catch (stopErr: any) {
      Alert.alert(L("Hata", "Error"), L(`Kayıt durdurulamadı: ${stopErr?.message || ""}`, `Could not stop: ${stopErr?.message || ""}`));
      setVoiceRecording(null);
      setVoiceRecordingActive(false);
      return;
    }

    setVoiceRecording(null);
    setVoiceRecordingActive(false);
    setVoiceRecordDuration(0);

    if (!localUri) return;

    // 1) Kayıt anında inline kart için lastVoice state'ini set et
    setLastVoice({ localUri, durationSec, ts, downloadUrl: null });
    showToast(L("Kayıt tamamlandı. Aşağıdan dinleyip paylaşabilirsiniz.", "Recording done. Play and share below."), "success");

    // 2) Firebase Storage'a arka planda yükle
    setVoiceUploading(true);
    let downloadUrl: string | null = null;

    if (user?.uid) {
      try {
        const blob: Blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response as Blob);
          xhr.onerror = (e) => reject(new Error(String(e)));
          xhr.responseType = "blob";
          xhr.open("GET", localUri as string);
          xhr.send();
        });
        const path = `sos-voice/${user.uid}/${ts}.m4a`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, blob);
        downloadUrl = await getDownloadURL(sRef);
      } catch (storageErr: any) {
        console.warn("[SOS] Storage:", storageErr?.message || storageErr);
      }
    }

    // 3) Firestore'a kaydet
    let firestoreId: string | undefined;
    try {
      const docRef = await addDoc(collection(db, "sosVoiceMessages"), {
        userId: user?.uid || null,
        downloadUrl: downloadUrl || null,
        locationText: locationText || null,
        createdAt: serverTimestamp(),
        durationSec,
        hasAudio: !!downloadUrl
      });
      firestoreId = docRef.id;
    } catch (fsErr: any) {
      console.warn("[SOS] Firestore:", fsErr?.message || fsErr);
    }

    // 4) lastVoice'u güncelle (yüklenmiş url + firestore id)
    setLastVoice((prev) => prev ? { ...prev, downloadUrl, firestoreId } : prev);
    setVoiceUploading(false);
  };

  // Son kayıt: oynat/duraklat
  const togglePlayLastVoice = async () => {
    if (!lastVoice?.localUri) return;
    try {
      if (voicePlaying && voiceSoundRef.current) {
        await voiceSoundRef.current.pauseAsync();
        setVoicePlaying(false);
        return;
      }
      if (voiceSoundRef.current) {
        await voiceSoundRef.current.playAsync();
        setVoicePlaying(true);
        return;
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: lastVoice.downloadUrl || lastVoice.localUri },
        { shouldPlay: true },
        (st: any) => { if (st?.didJustFinish) setVoicePlaying(false); }
      );
      voiceSoundRef.current = sound;
      setVoicePlaying(true);
    } catch {
      showToast(L("Ses oynatılamadı.", "Could not play audio."), "error");
    }
  };

  // Son kayıt: paylaş (Sharing dialog'u kullanıcı isteyince açılır)
  const shareLastVoice = async () => {
    if (!lastVoice?.localUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(lastVoice.localUri, {
          mimeType: "audio/mp4",
          dialogTitle: L("Sesli SOS Paylaş", "Share Voice SOS"),
          UTI: "public.mpeg-4-audio"
        });
      } else if (lastVoice.downloadUrl) {
        await Share.share({ message: `🆘 ${L("Sesli SOS", "Voice SOS")}: ${lastVoice.downloadUrl}` });
      } else {
        await Share.share({ message: L("🆘 Sesli SOS kaydedildi.", "🆘 Voice SOS recorded.") });
      }
    } catch { /* iptal */ }
  };

  // Son kayıt: etiket düzenleme başlat
  const startEditLabel = () => {
    setLabelDraft(lastVoice?.label || "");
    setEditingLabel(true);
  };

  // Son kayıt: etiketi kaydet
  const saveLastVoiceLabel = async () => {
    if (!lastVoice) return;
    const trimmed = labelDraft.trim();
    setLastVoice({ ...lastVoice, label: trimmed });
    setEditingLabel(false);
    if (lastVoice.firestoreId) {
      try {
        const { doc, updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "sosVoiceMessages", lastVoice.firestoreId), {
          label: trimmed,
          updatedAt: serverTimestamp()
        });
        showToast(L("Etiket kaydedildi.", "Label saved."), "success");
      } catch {
        showToast(L("Etiket kaydedilemedi.", "Could not save label."), "error");
      }
    }
  };

  // Son kayıt: sil
  const deleteLastVoice = async () => {
    if (!lastVoice) return;
    Alert.alert(
      L("Kaydı Sil", "Delete Recording"),
      L("Son sesli SOS kaydı silinsin mi?", "Delete the last voice SOS recording?"),
      [
        { text: L("İptal", "Cancel"), style: "cancel" },
        {
          text: L("Sil", "Delete"),
          style: "destructive",
          onPress: async () => {
            try { await voiceSoundRef.current?.unloadAsync(); } catch {}
            voiceSoundRef.current = null;
            if (lastVoice.firestoreId) {
              try {
                const { doc, updateDoc } = await import("firebase/firestore");
                await updateDoc(doc(db, "sosVoiceMessages", lastVoice.firestoreId), { deleted: true });
              } catch {}
            }
            setLastVoice(null);
            setVoicePlaying(false);
            showToast(L("Kayıt silindi.", "Recording deleted."), "success");
          }
        }
      ]
    );
  };

  // [FONKSIYON] removeContact: Yakını listeden kaldırır ve depolamayı günceller.
  const removeContact = async (contactId: string) => {
    await saveAll(contacts.filter((c) => c.id !== contactId));
    Alert.alert(L("Bilgi", "Info"), L("Yakın kaldırıldı.", "Contact removed."));
  };

  const lastSafeCount = useMemo(
    () => contacts.filter((c) => c.lastStatus === "safe").length,
    [contacts]
  );

  const shellBg = lightMode ? "#f8fafc" : amoledMode ? "#060408" : "#0f0610";
  const cardBg = lightMode ? "#ffffff" : "rgba(255,255,255,0.04)";
  const cardBorder = lightMode ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#cbd5e1";
  const textMuted = lightMode ? "#94a3b8" : "#94a3b8";
  const heroColors: [string, string] = lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#3f0914", "#1f060d"];

  return (
    <View style={{ flex: 1, backgroundColor: shellBg }}>
      <LinearGradient
        colors={heroColors}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter", fontSize: 11 }}>{L("Afet Yardım", "Disaster Aid")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22, lineHeight: 26 }}>{L("Yakınlarım Ağı", "Safety Network")}</Text>
          </View>
          <View style={{ borderRadius: 999, backgroundColor: locationText ? "rgba(34,197,94,0.22)" : "rgba(245,158,11,0.22)", borderWidth: 1.5, borderColor: locationText ? "rgba(34,197,94,0.55)" : "rgba(245,158,11,0.55)", paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: locationText ? "#22c55e" : "#f59e0b" }} />
            <Text style={{ color: locationText ? "#86efac" : "#fcd34d", fontFamily: "Inter-Bold", fontSize: 10 }}>{locationText ? L("GPS AKTİF", "GPS LIVE") : L("GPS BEKLENIYOR", "GPS WAITING")}</Text>
          </View>
        </View>

        {/* KPI rozetleri */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {[
            { label: L("Toplam Yakın", "Total Contacts"), value: contacts.length, accent: "#3b82f6", icon: "people" as any },
            { label: L("Güvende", "Safe"), value: lastSafeCount, accent: "#22c55e", icon: "shield-checkmark" as any },
            { label: L("Bekleyen", "Pending"), value: Math.max(0, contacts.length - lastSafeCount), accent: "#f59e0b", icon: "time" as any }
          ].map((it) => (
            <View key={it.label} style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 11 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: `${it.accent}30`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={it.icon} size={11} color={it.accent} />
                </View>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.3 }} numberOfLines={1}>{it.label}</Text>
              </View>
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{it.value}</Text>
            </View>
          ))}
        </View>

        {/* Güvendeyim — tek aksiyon, büyük yeşil */}
        <TouchableOpacity
          onPress={() => shareSafeStatus()}
          style={{ borderRadius: 14, overflow: "hidden" }}
        >
          <LinearGradient colors={["#16a34a", "#15803d"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Ionicons name="checkmark-circle" size={20} color="white" />
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 14, letterSpacing: 0.3 }}>{L("GÜVENDEYİM — TÜMÜNE BİLDİR", "I'M SAFE — NOTIFY ALL")}</Text>
          </LinearGradient>
        </TouchableOpacity>
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
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
      >
        {locationText ? (
          <View style={{ borderRadius: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(59,130,246,0.12)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="location" size={16} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 9, letterSpacing: 0.6 }}>{L("KONUM", "LOCATION")}</Text>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 12, marginTop: 2 }} numberOfLines={2}>{locationText}</Text>
            </View>
          </View>
        ) : null}

        {/* Sesli SOS */}
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: voiceRecordingActive ? "rgba(239,68,68,0.45)" : cardBorder, backgroundColor: voiceRecordingActive ? "rgba(239,68,68,0.06)" : cardBg, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.14)", borderWidth: 1, borderColor: "rgba(239,68,68,0.28)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="mic" size={16} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Sesli SOS", "Voice SOS")}</Text>
              <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 10, marginTop: 1 }}>{L("Maks 30 sn", "Max 30s")}</Text>
            </View>
          </View>
          <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginBottom: 12, lineHeight: 17 }}>
            {L("Mikrofona kısa bir mesaj kaydedin. Kaydı dinleyip etiketleyip ardından paylaşabilirsiniz.", "Record a short voice message. You can play, label and then share it.")}
          </Text>
          {voiceRecordingActive ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
              <Text style={{ color: lightMode ? "#0f172a" : "white", fontFamily: "Inter-Bold", fontSize: 13, flex: 1 }}>
                {L("Kaydediliyor", "Recording")} — {voiceRecordDuration}s / 30s
              </Text>
              <TouchableOpacity onPress={stopVoiceSOS} disabled={voiceUploading} style={{ borderRadius: 10, backgroundColor: voiceUploading ? "#6b7280" : "#dc2626", paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>
                  {voiceUploading ? L("Yükleniyor...", "Uploading...") : L("Durdur", "Stop")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={startVoiceSOS} style={{ borderRadius: 12, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.22)", height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Ionicons name="mic" size={18} color="#ef4444" />
              <Text style={{ color: lightMode ? "#9f1239" : "#fecaca", fontFamily: "Inter-Bold", fontSize: 13 }}>{L("Sesli SOS Kaydet", "Record Voice SOS")}</Text>
            </TouchableOpacity>
          )}

          {/* Son Kayıt kartı */}
          {lastVoice ? (
            <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,0.28)", backgroundColor: lightMode ? "rgba(254,226,226,0.6)" : "rgba(239,68,68,0.08)", padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
                  <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>
                    {L("Son Kayıt", "Last Recording")}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: voiceUploading ? "rgba(245,158,11,0.15)" : lastVoice.downloadUrl ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)", borderWidth: 1, borderColor: voiceUploading ? "rgba(245,158,11,0.3)" : lastVoice.downloadUrl ? "rgba(34,197,94,0.3)" : "rgba(148,163,184,0.3)" }}>
                  <Ionicons name={voiceUploading ? "cloud-upload-outline" : lastVoice.downloadUrl ? "cloud-done-outline" : "cloud-offline-outline"} size={11} color={voiceUploading ? "#f59e0b" : lastVoice.downloadUrl ? "#22c55e" : "#94a3b8"} />
                  <Text style={{ color: voiceUploading ? "#f59e0b" : lastVoice.downloadUrl ? "#22c55e" : "#94a3b8", fontFamily: "Inter-Bold", fontSize: 9 }}>
                    {voiceUploading ? L("Yükleniyor", "Uploading") : lastVoice.downloadUrl ? L("Buluta yüklendi", "Uploaded") : L("Sadece cihazda", "Local only")}
                  </Text>
                </View>
              </View>

              {/* Oynat barı */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <TouchableOpacity onPress={togglePlayLastVoice} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: voicePlaying ? "#ef4444" : "rgba(239,68,68,0.18)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={voicePlaying ? "pause" : "play"} size={18} color={voicePlaying ? "white" : "#ef4444"} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  {editingLabel ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <TextInput
                        value={labelDraft}
                        onChangeText={setLabelDraft}
                        placeholder={L("Etiket / not (örn: 'Apartman 3. kat')", "Label / note (e.g. '3rd floor')")}
                        placeholderTextColor={lightMode ? "#9ca3af" : "#6b7280"}
                        autoFocus
                        maxLength={60}
                        style={{ flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", backgroundColor: lightMode ? "white" : "rgba(255,255,255,0.05)", color: lightMode ? "#0f172a" : "white", paddingHorizontal: 10, fontFamily: "Inter", fontSize: 12 }}
                      />
                      <TouchableOpacity onPress={saveLastVoiceLabel} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="checkmark" size={16} color="white" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13 }} numberOfLines={1}>
                          {lastVoice.label || L("Etiketsiz kayıt", "Untitled recording")}
                        </Text>
                        <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 10, marginTop: 2 }}>
                          {new Date(lastVoice.ts).toLocaleTimeString(locale === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          {locationText ? ` • 📍 ${locationText.slice(0, 30)}` : ""}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)" }}>
                        <Ionicons name="time-outline" size={11} color="#ef4444" />
                        <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>
                          {lastVoice.durationSec} {locale === "en" ? "sec" : "sn"}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Aksiyonlar */}
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity onPress={shareLastVoice} style={{ flex: 2, height: 38, borderRadius: 10, backgroundColor: "#22c55e", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Ionicons name="paper-plane" size={14} color="white" />
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Paylaş", "Share")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={startEditLabel} style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: "rgba(59,130,246,0.4)", backgroundColor: "rgba(59,130,246,0.1)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ionicons name="pencil" size={13} color="#3b82f6" />
                  <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Etiketle", "Label")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteLastVoice} style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.1)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ionicons name="trash" size={13} color="#ef4444" />
                  <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Sil", "Delete")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ borderRadius: 18, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(59,130,246,0.12)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person-add" size={16} color="#3b82f6" />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>{L("Yakın Ekle", "Add Contact")}</Text>
          </View>
          <TextInput
            value={name}
            onChangeText={(v) => setName(sanitizeHumanText(v))}
            onBlur={() => setName((v) => toTitleCaseTr(sanitizeHumanText(v)))}
            placeholder={L("Ad Soyad", "Full Name")}
            placeholderTextColor={textMuted}
            style={{ borderRadius: 11, backgroundColor: lightMode ? "#f1f5f9" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: cardBorder, color: textPrimary, paddingHorizontal: 12, height: 44, marginBottom: 8, fontFamily: "Inter", fontSize: 13 }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 11))}
              keyboardType="number-pad"
              placeholder={L("Telefon (11 hane)", "Phone (11 digits)")}
              placeholderTextColor={textMuted}
              style={{ flex: 1, borderRadius: 11, backgroundColor: lightMode ? "#f1f5f9" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: cardBorder, color: textPrimary, paddingHorizontal: 12, height: 44, fontFamily: "Inter", fontSize: 13 }}
            />
            <TextInput
              value={relation}
              onChangeText={(v) => setRelation(sanitizeHumanText(v))}
              onBlur={() => setRelation((v) => toTitleCaseTr(sanitizeHumanText(v)))}
              placeholder={L("Yakınlık", "Relation")}
              placeholderTextColor={textMuted}
              style={{ flex: 1, borderRadius: 11, backgroundColor: lightMode ? "#f1f5f9" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: cardBorder, color: textPrimary, paddingHorizontal: 12, height: 44, fontFamily: "Inter", fontSize: 13 }}
            />
          </View>
          <TouchableOpacity onPress={addContact} style={{ marginTop: 12, borderRadius: 12, overflow: "hidden" }}>
            <LinearGradient colors={["#dc2626", "#b91c1c"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 46, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
              <Ionicons name="add-circle" size={16} color="white" />
              <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13, letterSpacing: 0.3 }}>{L("YAKIN EKLE", "ADD CONTACT")}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Yakınlar başlık */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
          <Text style={{ color: textMuted, fontFamily: "Inter-Bold", fontSize: 11, letterSpacing: 0.8 }}>{L("KAYITLI YAKINLAR", "SAVED CONTACTS")}</Text>
          <View style={{ borderRadius: 999, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 10 }}>{contacts.length}</Text>
          </View>
        </View>

        {contacts.length === 0 ? (
          <View style={{ borderRadius: 18, borderWidth: 1.5, borderColor: cardBorder, borderStyle: "dashed", backgroundColor: cardBg, padding: 28, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(59,130,246,0.1)", borderWidth: 1.5, borderColor: "rgba(59,130,246,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="people-outline" size={26} color="#3b82f6" />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 15, marginBottom: 6 }}>{L("Henüz yakın yok", "No contacts yet")}</Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, textAlign: "center", lineHeight: 17 }}>{L("Yukarıdan yakınlarınızı ekleyin. Acil durumda tek tuşla bilgilendirilecekler.", "Add your contacts above. They will be notified with one tap in emergencies.")}</Text>
          </View>
        ) : contacts.map((c) => {
          const isSafe = c.lastStatus === "safe";
          const isHelp = c.lastStatus === "need_help";
          const statusAccent = isSafe ? "#22c55e" : isHelp ? "#ef4444" : "#94a3b8";
          const statusText = isSafe ? L("Güvende", "Safe") : isHelp ? L("Acil", "Help") : L("Bekliyor", "Pending");
          const statusIcon: any = isSafe ? "shield-checkmark" : isHelp ? "warning" : "time";
          const initials = c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

          return (
            <View key={c.id} style={{ borderRadius: 18, overflow: "hidden", marginBottom: 12, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, shadowColor: "#000", shadowOpacity: lightMode ? 0.04 : 0, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: lightMode ? 1 : 0 }}>
              <View style={{ flexDirection: "row" }}>
                {/* Sol kenar durum şeridi */}
                <View style={{ width: 4, backgroundColor: statusAccent }} />
                <View style={{ flex: 1, padding: 14 }}>
                  {/* Kişi bilgisi satırı */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${statusAccent}15`, borderWidth: 1.5, borderColor: `${statusAccent}40`, alignItems: "center", justifyContent: "center", marginRight: 11 }}>
                      <Text style={{ color: statusAccent, fontFamily: "Inter-Bold", fontSize: 14 }}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>{c.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <Ionicons name="call-outline" size={10} color={textMuted} />
                        <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 11 }}>{maskPhone(c.phone)}</Text>
                        {c.relation ? (
                          <>
                            <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 10 }}>•</Text>
                            <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{c.relation}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ borderRadius: 999, backgroundColor: `${statusAccent}15`, borderWidth: 1.5, borderColor: `${statusAccent}50`, paddingHorizontal: 9, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name={statusIcon} size={10} color={statusAccent} />
                      <Text style={{ color: statusAccent, fontFamily: "Inter-Bold", fontSize: 10 }}>{statusText}</Text>
                    </View>
                  </View>

                  {c.lastSharedAt ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: cardBorder }}>
                      <Ionicons name="time-outline" size={11} color={textMuted} />
                      <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>
                        {L("Son bildirim", "Last notified")}: {new Date(c.lastSharedAt).toLocaleTimeString(locale === "en" ? "en-US" : "tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => shareSafeStatus(c.id)}
                      style={{ flex: 1, borderRadius: 11, backgroundColor: "rgba(34,197,94,0.12)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)", height: 40, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}
                    >
                      <Ionicons name="checkmark-circle" size={13} color="#22c55e" />
                      <Text style={{ color: "#22c55e", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Güvendeyim", "I'm Safe")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => requestHelpSignal(c.id)}
                      style={{ flex: 1, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)", height: 40, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }}
                    >
                      <Ionicons name="warning" size={13} color="#ef4444" />
                      <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Yardım İste", "Need Help")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeContact(c.id)}
                      style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: cardBorder, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="trash-outline" size={14} color={textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      </KeyboardAvoidingView>

    </View>
  );
};









