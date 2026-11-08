import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useStore } from "../../store";
import { setLocalConsentAccepted } from "../../services/consentLocal";
import { l } from "../../services/i18n";

const CONSENT_VERSION = "2026-02-v1";

/**
 * CONSENT DOSYA HARITASI
 * - CONSENT-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 * - CONSENT-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - CONSENT-GATE: Bu bolum ekran gecis kapilarini ve zorunlu kosullari kontrol eder.
 */
export const ConsentScreen = ({ onAccepted }: { onAccepted: () => void }) => {
  const { user, locale, amoledMode, lightMode } = useStore();
  const [kvkk, setKvkk] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const allChecked = kvkk && privacy && terms;

  // CONSENT-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const saveConsent = async (): Promise<void> => {
    const currentUser = user || auth.currentUser;
    if (!currentUser) return Alert.alert(l(locale, "Hata", "Error"), l(locale, "Oturum bulunamadı. Lütfen tekrar giriş yapın.", "Session not found. Please sign in again."));
    if (!allChecked) return Alert.alert(l(locale, "Bilgi", "Info"), l(locale, "Devam etmek için tüm onaylar gerekli.", "All consents are required to continue."));
    try {
      await setLocalConsentAccepted(currentUser.uid);
      await setDoc(
        doc(db, "consents", currentUser.uid),
        {
          uid: currentUser.uid,
          kvkkAcceptedAt: serverTimestamp(),
          privacyAcceptedAt: serverTimestamp(),
          termsAcceptedAt: serverTimestamp(),
          version: CONSENT_VERSION,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      onAccepted();
    } catch (e: any) {
      await setLocalConsentAccepted(currentUser.uid);
      onAccepted();
      Alert.alert(
        l(locale, "Bilgi", "Info"),
        l(locale, "KVKK onayı cihazda kaydedildi. Firebase izin/deploy sorunu nedeniyle buluta yazılamadı: ", "Consent was saved locally. Could not write to cloud due to Firebase permission/deploy issue: ") +
          (e?.message || "missing or insufficient permissions")
      );
    }
  };

  const Row = ({
    checked,
    onPress,
    text
  }: {
    checked: boolean;
    onPress: () => void;
    text: string;
  }) => (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <View style={[s.checkbox, checked && s.checkboxChecked]}>
        {checked ? <Ionicons name="checkmark" size={15} color="white" /> : null}
      </View>
      <Text style={s.rowText}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={
        lightMode
          ? (["#ffffff", "#f3f4f6", "#e5e7eb"] as any)
          : amoledMode
            ? (["#1a060d", "#09030a", "#020205"] as any)
            : (["#7a001f", "#9f102f", "#4d0018"] as any)
      }
      style={s.page}
    >
      <View style={[s.card, lightMode && { borderColor: "#cbd5e1" }]}>
        <Text style={s.title}>{l(locale, "KVKK ve Gizlilik Onayı", "Privacy & Consent")}</Text>
        <Text style={s.sub}>{l(locale, "Uygulamayı kullanmak için aşağıdaki metinleri onaylamanız gerekir.", "You need to accept the texts below to continue.")}</Text>

        <Row checked={kvkk} onPress={() => setKvkk((v) => !v)} text={l(locale, "KVKK aydınlatma metnini okudum ve kabul ediyorum.", "I read and accept the KVKK disclosure text.")} />
        <Row checked={privacy} onPress={() => setPrivacy((v) => !v)} text={l(locale, "Gizlilik politikasını okudum ve kabul ediyorum.", "I read and accept the privacy policy.")} />
        <Row checked={terms} onPress={() => setTerms((v) => !v)} text={l(locale, "Kullanım şartlarını okudum ve kabul ediyorum.", "I read and accept the terms of service.")} />

        <TouchableOpacity style={[s.btnWrap, !allChecked && { opacity: 0.5 }]} onPress={saveConsent} disabled={!allChecked}>
          <LinearGradient colors={["#c1121f", "#a60a16"]} style={s.btnInner}>
            <Text style={s.btnText}>{l(locale, "ONAYLA VE DEVAM ET", "ACCEPT AND CONTINUE")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const s = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 18 },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16
  },
  title: { color: "#0f172a", fontSize: 28, lineHeight: 32, fontFamily: "Inter-Bold" },
  sub: { color: "#475569", fontSize: 14, fontFamily: "Inter", marginTop: 8, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },
  checkboxChecked: { backgroundColor: "#c1121f", borderColor: "#c1121f" },
  rowText: { color: "#111827", fontFamily: "Inter", flex: 1, fontSize: 14 },
  btnWrap: { borderRadius: 999, overflow: "hidden", marginTop: 6 },
  btnInner: { height: 52, alignItems: "center", justifyContent: "center" },
  btnText: { color: "white", fontFamily: "Inter-Bold", fontSize: 16 }
});

