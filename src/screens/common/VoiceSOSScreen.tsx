import {
  React, useEffect, useState,
  FlatList, Text, TextInput, TouchableOpacity, View, Ionicons,
  LinearGradient, useNavigation,
  collection, onSnapshot, orderBy, query, where, db, useStore, toMillis,
  doc, updateDoc, serverTimestamp
} from "../shared/ScreenDeps";
import { Alert, Linking, Share } from "react-native";
import { Audio } from "expo-av";
import { l } from "../../services/i18n";
import { SkeletonList } from "../../components/SkeletonLoader";
import { EmptyState } from "../../components/EmptyState";

type VoiceMsg = {
  id: string;
  userId?: string;
  downloadUrl?: string;
  locationText?: string;
  label?: string;
  createdAt?: any;
  durationSec?: number;
};

// Ses kayıt çalma bileşeni
const VoicePlayer = ({ url, lightMode, L }: { url: string; lightMode: boolean; L: (tr: string, en: string) => string }) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    try {
      if (playing && sound) {
        await sound.pauseAsync();
        setPlaying(false);
        return;
      }
      if (sound) {
        await sound.playAsync();
        setPlaying(true);
        return;
      }
      setLoading(true);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => { if ((status as any).didJustFinish) { setPlaying(false); } }
      );
      setSound(s);
      setPlaying(true);
    } catch {
      // yüklenemedi
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);

  return (
    <TouchableOpacity
      onPress={toggle}
      style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: playing ? "#ef4444" : lightMode ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.16)", borderWidth: 1, borderColor: playing ? "#ef4444" : "rgba(239,68,68,0.3)", alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={loading ? "sync" : playing ? "pause" : "play"} size={18} color={playing ? "white" : "#ef4444"} />
    </TouchableOpacity>
  );
};

export const VoiceSOSScreen = () => {
  const navigation = useNavigation<any>();
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const showToast = useStore((s) => s.showToast);
  const { user, userData } = useStore();
  const L = (tr: string, en: string) => l(locale, tr, en);

  const [messages, setMessages] = useState<VoiceMsg[]>([]);
  const [loading, setLoading] = useState(true);
  // Kullanıcı rolü: koordinatör ve gönüllü tüm kayıtları, afetzede yalnızca kendini görür
  const role = userData?.role || "victim";

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#050507" : "#12060a";
  const panel = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.04)";
  const softBorder = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }

    // Afetzede: yalnızca kendi kayıtları | Koordinatör/Gönüllü: tüm kayıtlar
    const q = (role === "victim")
      ? query(collection(db, "sosVoiceMessages"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"))
      : query(collection(db, "sosVoiceMessages"), orderBy("createdAt", "desc"));

    return onSnapshot(q, (snap) => {
      // deleted:true olanları filtrele
      setMessages(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((m: any) => !m.deleted)
      );
      setLoading(false);
    }, () => setLoading(false));
  }, [user?.uid, role]);

  const formatTime = (ms: number) =>
    ms ? new Date(ms).toLocaleString(locale === "en" ? "en-US" : "tr-TR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul"
    }) : "-";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const shareMsg = async (msg: VoiceMsg) => {
    if (!msg.downloadUrl) return;
    const time = formatTime(toMillis(msg.createdAt));
    const locPart = msg.locationText ? `\n📍 ${msg.locationText}` : "";
    const labelPart = msg.label ? `\n🏷 ${msg.label}` : "";
    const text = locale === "en"
      ? `🆘 SOS Voice Message${labelPart}\nTime: ${time}${locPart}\nListen: ${msg.downloadUrl}`
      : `🆘 Sesli SOS Mesajı${labelPart}\nSaat: ${time}${locPart}\nDinle: ${msg.downloadUrl}`;
    await Share.share({ message: text });
  };

  // [FONKSIYON] downloadMsg: Ses dosyasını tarayıcıda açar (download linki).
  const downloadMsg = async (msg: VoiceMsg) => {
    if (!msg.downloadUrl) return;
    try {
      await Linking.openURL(msg.downloadUrl);
    } catch {
      await Share.share({ message: msg.downloadUrl || "" });
    }
  };

  // [FONKSIYON] saveLabel: Kayıt etiketi/notunu Firestore'a kaydeder.
  const saveLabel = async (id: string, label: string) => {
    try {
      await updateDoc(doc(db, "sosVoiceMessages", id), {
        label: label.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingId(null);
      showToast(L("Not kaydedildi.", "Note saved."), "success");
    } catch {
      showToast(L("Kaydedilemedi.", "Could not save."), "error");
    }
  };

  // [FONKSIYON] deleteMsg: Ses mesajını Firestore'dan siler (Storage'da kalır).
  const deleteMsg = async (id: string) => {
    Alert.alert(
      L("Kaydı Sil", "Delete Record"),
      L("Bu sesli SOS kaydını listeden kaldırmak istiyor musunuz?", "Remove this voice SOS record from the list?"),
      [
        { text: L("İptal", "Cancel"), style: "cancel" },
        {
          text: L("Sil", "Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "sosVoiceMessages", id), { deleted: true });
              showToast(L("Kayıt silindi.", "Record deleted."), "success");
            } catch {
              showToast(L("Silinemedi.", "Could not delete."), "error");
            }
          }
        }
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#430914", "#23070f"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 11 }}>
              {role === "victim" ? L("Sesli SOS Kayıtlarım", "My Voice SOS Records") : L("Acil Kayıtlar", "Emergency Records")}
            </Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Sesli SOS Mesajları", "Voice SOS Messages")}</Text>
          </View>
          <View style={{ borderRadius: 999, backgroundColor: "rgba(239,68,68,0.25)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)", paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 12 }}>{messages.length}</Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList count={4} lightMode={lightMode} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ borderRadius: 16, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 14, marginBottom: 10 }}>
              {/* Üst satır: ikon + başlık + süre + oynat */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="mic" size={18} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }}>
                    {item.label || L("Sesli SOS", "Voice SOS")} {item.durationSec ? `• ${item.durationSec}s` : ""}
                  </Text>
                  <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>
                    {formatTime(toMillis(item.createdAt))}
                  </Text>
                </View>
                {item.downloadUrl ? <VoicePlayer url={item.downloadUrl} lightMode={lightMode} L={L} /> : null}
              </View>

              {/* Konum */}
              {item.locationText ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10 }}>
                  <Ionicons name="location-outline" size={12} color={textMuted} />
                  <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12 }} numberOfLines={1}>{item.locationText}</Text>
                </View>
              ) : null}

              {/* Not/etiket düzenleme */}
              {editingId === item.id ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  <TextInput
                    value={editLabel}
                    onChangeText={setEditLabel}
                    placeholder={L("Not ekle (örn: Mahalle adı, kişi bilgisi...)", "Add note...")}
                    placeholderTextColor={textMuted}
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: softBorder, backgroundColor: lightMode ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)", color: textPrimary, fontFamily: "Inter", fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 }}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => saveLabel(item.id, editLabel)} style={{ borderRadius: 10, backgroundColor: "#22c55e", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="checkmark" size={18} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingId(null)} style={{ borderRadius: 10, backgroundColor: lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={16} color={textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Aksiyon butonları */}
              <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: softBorder, paddingTop: 10 }}>
                {/* Not Ekle / Düzenle */}
                <TouchableOpacity
                  onPress={() => { setEditingId(item.id); setEditLabel(item.label || ""); }}
                  style={{ flex: 1, borderRadius: 10, backgroundColor: lightMode ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", height: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}
                >
                  <Ionicons name="create-outline" size={14} color="#f59e0b" />
                  <Text style={{ color: "#f59e0b", fontFamily: "Inter-Bold", fontSize: 11 }}>{item.label ? L("Notu Düzenle", "Edit Note") : L("Not Ekle", "Add Note")}</Text>
                </TouchableOpacity>

                {/* İndir */}
                {item.downloadUrl ? (
                  <TouchableOpacity
                    onPress={() => downloadMsg(item)}
                    style={{ flex: 1, borderRadius: 10, backgroundColor: lightMode ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.1)", borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", height: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}
                  >
                    <Ionicons name="download-outline" size={14} color="#3b82f6" />
                    <Text style={{ color: "#3b82f6", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("İndir", "Download")}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Paylaş */}
                {item.downloadUrl ? (
                  <TouchableOpacity
                    onPress={() => shareMsg(item)}
                    style={{ flex: 1, borderRadius: 10, backgroundColor: lightMode ? "rgba(239,68,68,0.07)" : "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.22)", height: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}
                  >
                    <Ionicons name="share-outline" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontFamily: "Inter-Bold", fontSize: 11 }}>{L("Paylaş", "Share")}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Sil */}
                <TouchableOpacity
                  onPress={() => deleteMsg(item.id)}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: lightMode ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.18)", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="trash-outline" size={15} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="mic-off-outline"
              title={L("Sesli SOS mesajı yok", "No voice SOS messages")}
              sub={L("Afetzede sesli SOS gönderdiğinde burada görünür.", "Voice SOS messages from victims appear here.")}
              lightMode={lightMode}
            />
          }
        />
      )}
    </View>
  );
};
