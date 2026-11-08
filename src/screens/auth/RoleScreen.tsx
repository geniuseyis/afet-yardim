import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { claimCoordinatorRoleViaApi } from "../../services/backend";
import { BackHandler } from "react-native";
import {
  React,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  db,
  useStore,
  signOut,
  auth,
  useRef,
  useState,
  useEffect
} from "../shared/ScreenDeps";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { l } from "../../services/i18n";

export const RoleScreen = () => {
  const navigation = useNavigation<any>();
  const { user, setUserData } = useStore();
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const currentRole = useStore((s) => s.userData?.role) as string | undefined;
  const isChangeMode = Boolean(currentRole);

  const [savingRole, setSavingRole] = useState<null | "victim" | "volunteer">(null);
  const [coordExpanded, setCoordExpanded] = useState(false);
  const [coordCode, setCoordCode] = useState("");
  const [claimingCoord, setClaimingCoord] = useState(false);
  const [confirmRole, setConfirmRole] = useState<null | "victim" | "volunteer">(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const coordHeight = useRef(new Animated.Value(0)).current;
  const coordOpacity = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalSlide = useRef(new Animated.Value(60)).current;
  const signOutOpacity = useRef(new Animated.Value(0)).current;
  const signOutSlide = useRef(new Animated.Value(60)).current;

  const L = (tr: string, en: string) => l(locale, tr, en);

  const bg = lightMode
    ? ["#fdf2f4", "#f8fafc", "#eef2ff"] as const
    : amoledMode
      ? ["#0a0205", "#110308", "#080210"] as const
      : ["#4a0010", "#880e2e", "#3d0014"] as const;

  const card = lightMode ? "#ffffff" : amoledMode ? "#18080e" : "rgba(255,255,255,0.07)";
  const cardSolid = lightMode ? "#ffffff" : amoledMode ? "#1a0810" : "#5c0f1e";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const border = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.1)";

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (isChangeMode && navigation.canGoBack()) {
          navigation.goBack();
        } else if (!isChangeMode) {
          // Yeni kullanıcı için geri tuşu = çıkış onay modalı
          openSignOutModal();
        }
        return true;
      });
      return () => sub.remove();
    }, [navigation, isChangeMode])
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(coordHeight, {
        toValue: coordExpanded ? 108 : 0,
        duration: 260,
        useNativeDriver: false
      }),
      Animated.timing(coordOpacity, {
        toValue: coordExpanded ? 1 : 0,
        duration: 220,
        useNativeDriver: false
      })
    ]).start();
  }, [coordExpanded]);

  const openConfirm = (role: "victim" | "volunteer") => {
    setConfirmRole(role);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(modalSlide, { toValue: 0, duration: 220, useNativeDriver: true })
    ]).start();
  };

  const closeConfirm = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(modalSlide, { toValue: 60, duration: 180, useNativeDriver: true })
    ]).start(() => setConfirmRole(null));
  };

  const selectRole = async (role: "victim" | "volunteer"): Promise<void> => {
    if (!user || savingRole) return;
    closeConfirm();
    setSavingRole(role);
    const volunteerSeed =
      role === "volunteer"
        ? { volunteerStatus: "not_started" as const, availability: (useStore.getState().userData?.availability as any) || "offline" }
        : {};
    // Optimistic UI: önce store'u güncelle ki RootNavigator hemen yeni stack'e geçsin
    setUserData({ ...(useStore.getState().userData || {}), role, ...volunteerSeed });
    // Firestore yazımı arka planda — başarısız olsa bile kullanıcı uygulamaya girer, sonra retry edilir
    (async () => {
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { role, ...volunteerSeed, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (e: any) {
        console.warn("[role] users write failed:", e?.message);
      }
      upsertUserPublicDoc(
        user.uid,
        { ...(useStore.getState().userData || {}), role, ...volunteerSeed } as any
      ).catch(() => undefined);
    })();
    setTimeout(() => {
      try {
        if (isChangeMode && navigation.canGoBack()) {
          navigation.goBack();
        } else if (role === "victim") {
          navigation.reset({ index: 0, routes: [{ name: "MainTabs" as never }] });
        }
        // volunteer için RootNavigator volunteerNeedsOnboarding gate'i devreye girer
      } catch (err) {
        console.warn("[role] navigation failed:", err);
      }
    }, 100);
    setSavingRole(null);
  };

  const claimCoordinator = async () => {
    if (!coordCode.trim() || claimingCoord) return;
    Keyboard.dismiss();
    const wasChangeMode = isChangeMode;
    setClaimingCoord(true);
    try {
      const code = coordCode.trim();
      if (!user) {
        Alert.alert(L("Hata", "Error"), L("Oturum bulunamadı.", "Session not found."));
        return;
      }
      // kod sunucuda dogrulanir, rol de orada atanir
      await claimCoordinatorRoleViaApi({ code });
      await user.getIdToken(true).catch(() => undefined);
      setUserData({ ...(useStore.getState().userData || {}), role: "coordinator", isCoordinator: true });
      upsertUserPublicDoc(
        user.uid,
        { ...(useStore.getState().userData || {}), role: "coordinator", isCoordinator: true } as any
      ).catch(() => undefined);
      setTimeout(() => {
        try {
          if (wasChangeMode && navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({ index: 0, routes: [{ name: "MainTabs" as never }] });
          }
        } catch (err) {
          console.warn("[coord] navigation failed:", err);
        }
      }, 100);
    } catch (e: any) {
      Alert.alert(L("Hata", "Error"), e?.message || L("Bir hata oluştu.", "An error occurred."));
    } finally {
      setClaimingCoord(false);
    }
  };

  const openSignOutModal = () => {
    setShowSignOutModal(true);
    Animated.parallel([
      Animated.timing(signOutOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(signOutSlide, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const closeSignOutModal = () => {
    Animated.parallel([
      Animated.timing(signOutOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(signOutSlide, { toValue: 60, duration: 180, useNativeDriver: true }),
    ]).start(() => setShowSignOutModal(false));
  };

  const roles = [
    {
      key: "victim" as const,
      title: L("Afetzede", "Victim"),
      sub: L("Yardım talebi oluştur, durumunu takip et", "Create support requests and track status"),
      icon: "radio-outline" as const,
      accent: "#ef4444",
      accentDark: "#b91c1c",
      gradStart: lightMode ? "#fee2e2" : "rgba(239,68,68,0.22)",
      gradEnd: lightMode ? "#fecaca" : "rgba(185,28,28,0.14)"
    },
    {
      key: "volunteer" as const,
      title: L("Gönüllü", "Volunteer"),
      sub: L("Yakındaki görevleri gör, başvur ve takip et", "See nearby missions, apply and track"),
      icon: "heart-circle-outline" as const,
      accent: "#3b82f6",
      accentDark: "#1d4ed8",
      gradStart: lightMode ? "#dbeafe" : "rgba(59,130,246,0.22)",
      gradEnd: lightMode ? "#bfdbfe" : "rgba(29,78,216,0.14)"
    }
  ];

  const confirmingRole = roles.find((r) => r.key === confirmRole);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={bg as any} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 80, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top bar */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
              <View style={{
                borderRadius: 999, borderWidth: 1,
                borderColor: lightMode ? "rgba(127,29,29,0.15)" : "rgba(255,255,255,0.18)",
                backgroundColor: lightMode ? "rgba(127,29,29,0.07)" : "rgba(255,255,255,0.07)",
                paddingHorizontal: 12, paddingVertical: 5
              }}>
                <Text style={{ color: lightMode ? "#991b1b" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 1 }}>
                  {isChangeMode ? L("ROL DEĞİŞTİR", "CHANGE ROLE") : L("ROL KURULUMU", "ROLE SETUP")}
                </Text>
              </View>
              {isChangeMode ? (
                <TouchableOpacity
                  onPress={() => {
                    try {
                      if (navigation.canGoBack()) {
                        navigation.goBack();
                      } else {
                        navigation.reset({ index: 0, routes: [{ name: "MainTabs" as never }] });
                      }
                    } catch (err) {
                      console.warn("[role] back failed:", err);
                    }
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999,
                    borderWidth: 1, borderColor: border,
                    backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.05)",
                    paddingHorizontal: 12, paddingVertical: 5
                  }}
                >
                  <Ionicons name="chevron-back" size={13} color={textSec} />
                  <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.5 }}>{L("GERİ", "BACK")}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={openSignOutModal}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999,
                    borderWidth: 1, borderColor: border,
                    backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.05)",
                    paddingHorizontal: 12, paddingVertical: 5
                  }}
                >
                  <Ionicons name="log-out-outline" size={13} color={textSec} />
                  <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.5 }}>{L("ÇIKIŞ", "SIGN OUT")}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Hero */}
            <View style={{ marginBottom: 32 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 20, marginBottom: 18,
                backgroundColor: lightMode ? "#fee2e2" : "rgba(239,68,68,0.18)",
                alignItems: "center", justifyContent: "center",
                borderWidth: 1, borderColor: lightMode ? "#fecaca" : "rgba(239,68,68,0.3)"
              }}>
                <Ionicons name="person-circle-outline" size={34} color={lightMode ? "#dc2626" : "#fca5a5"} />
              </View>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 34, lineHeight: 40, marginBottom: 8 }}>
                {isChangeMode ? L("Rolünü Değiştir", "Change Your Role") : L("Nasıl kullanacaksın?", "How will you use it?")}
              </Text>
              <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 16, lineHeight: 24 }}>
                {isChangeMode
                  ? L(`Mevcut rolün: ${currentRole}. Yeni bir rol seç.`, `Current role: ${currentRole}. Pick a new role.`)
                  : L("Rolünü seç, deneyim buna göre kişiselleşsin.", "Select your role to get a tailored experience.")}
              </Text>
            </View>

            {/* Victim + Volunteer cards */}
            {roles.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => openConfirm(r.key)}
                disabled={Boolean(savingRole)}
                activeOpacity={0.82}
                style={{
                  borderRadius: 20, marginBottom: 12,
                  backgroundColor: card,
                  borderWidth: 1,
                  borderColor: savingRole === r.key ? r.accent : border,
                  overflow: "hidden",
                  shadowColor: r.accent,
                  shadowOpacity: lightMode ? 0.18 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  elevation: lightMode ? 4 : 0
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
                  <LinearGradient
                    colors={[r.gradStart, r.gradEnd] as any}
                    style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 14 }}
                  >
                    <Ionicons name={r.icon} size={26} color={r.accent} />
                  </LinearGradient>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 20, marginBottom: 3 }}>{r.title}</Text>
                    <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 14, lineHeight: 20 }}>{r.sub}</Text>
                  </View>

                  {savingRole === r.key ? (
                    <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: `${r.accent}22`, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="sync-outline" size={16} color={r.accent} />
                    </View>
                  ) : (
                    <View style={{
                      width: 32, height: 32, borderRadius: 999,
                      backgroundColor: lightMode ? `${r.accent}14` : `${r.accent}22`,
                      alignItems: "center", justifyContent: "center"
                    }}>
                      <Ionicons name="chevron-forward" size={16} color={r.accent} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* Coordinator card */}
            <View style={{ marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => setCoordExpanded((v) => !v)}
                activeOpacity={0.82}
                style={{
                  borderRadius: 20,
                  borderBottomLeftRadius: coordExpanded ? 0 : 20,
                  borderBottomRightRadius: coordExpanded ? 0 : 20,
                  backgroundColor: card,
                  borderWidth: 1, borderColor: coordExpanded ? "#d97706" : border,
                  overflow: "hidden"
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
                  <LinearGradient
                    colors={lightMode ? ["#fef3c7", "#fde68a"] as any : ["rgba(217,119,6,0.28)", "rgba(180,83,9,0.18)"] as any}
                    style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 14 }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={26} color="#d97706" />
                  </LinearGradient>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 20, marginBottom: 3 }}>{L("Yönetici", "Coordinator")}</Text>
                    <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 14, lineHeight: 20 }}>
                      {L("Davet koduyla yönetici erişimi al", "Get coordinator access with an invite code")}
                    </Text>
                  </View>

                  <View style={{
                    width: 32, height: 32, borderRadius: 999,
                    backgroundColor: coordExpanded ? "rgba(217,119,6,0.18)" : (lightMode ? "rgba(217,119,6,0.08)" : "rgba(255,255,255,0.06)"),
                    alignItems: "center", justifyContent: "center"
                  }}>
                    <Ionicons name={coordExpanded ? "chevron-up" : "key-outline"} size={16} color="#d97706" />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Invite code panel */}
              {coordExpanded && (
                <View style={{
                  backgroundColor: lightMode ? "#fffbeb" : "rgba(120,60,0,0.22)",
                  borderWidth: 1, borderTopWidth: 0,
                  borderColor: "#d97706",
                  borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
                  padding: 14, paddingTop: 12,
                  flexDirection: "row", gap: 10, alignItems: "center"
                }}>
                  <TextInput
                    value={coordCode}
                    onChangeText={(t) => setCoordCode(t)}
                    placeholder={L("Davet kodunu gir", "Enter invite code")}
                    placeholderTextColor={lightMode ? "#92400e" : "#fbbf24"}
                    autoCapitalize="none"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={claimCoordinator}
                    style={{
                      flex: 1, height: 44, borderRadius: 12,
                      backgroundColor: lightMode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.08)",
                      borderWidth: 1, borderColor: lightMode ? "#fcd34d" : "rgba(251,191,36,0.4)",
                      paddingHorizontal: 14, color: lightMode ? "#0f172a" : "#fff1f2",
                      fontFamily: "Inter-Bold", fontSize: 15, letterSpacing: 2
                    }}
                  />
                  <TouchableOpacity
                    onPress={claimCoordinator}
                    style={{
                      height: 44, paddingHorizontal: 18, borderRadius: 12,
                      backgroundColor: "#d97706",
                      alignItems: "center", justifyContent: "center"
                    }}
                  >
                    <Text style={{ color: "#fff", fontFamily: "Inter-Bold", fontSize: 14 }}>
                      {claimingCoord ? L("...", "...") : L("Onayla", "Confirm")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Footer info */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 4 }}>
              <Ionicons name="lock-closed-outline" size={13} color={textSec} style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, lineHeight: 18, flex: 1 }}>
                {L(
                  "Yönetici rolü yalnızca yetkili kişilere verilen davet koduyla alınabilir.",
                  "Coordinator role requires an invite code issued to authorized personnel only."
                )}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

      {/* Custom confirmation modal overlay */}
      {confirmRole !== null && (
        <Animated.View
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            opacity: modalOpacity,
            justifyContent: "flex-end"
          }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeConfirm}
          />
          <Animated.View
            style={{
              transform: [{ translateY: modalSlide }],
              backgroundColor: cardSolid,
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              padding: 24, paddingBottom: 36,
              borderTopWidth: 1,
              borderColor: confirmingRole ? `${confirmingRole.accent}44` : border
            }}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: lightMode ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 20 }} />

            {/* Icon */}
            <View style={{
              width: 56, height: 56, borderRadius: 18, marginBottom: 16,
              backgroundColor: confirmingRole ? `${confirmingRole.accent}22` : "rgba(255,255,255,0.08)",
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: confirmingRole ? `${confirmingRole.accent}44` : border
            }}>
              <Ionicons
                name={confirmRole === "victim" ? "radio-outline" : "heart-circle-outline"}
                size={28}
                color={confirmingRole?.accent || "#fff"}
              />
            </View>

            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 22, marginBottom: 8 }}>
              {L("Rolü Onayla", "Confirm Role")}
            </Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 15, lineHeight: 22, marginBottom: 28 }}>
              {confirmRole === "victim"
                ? L("Afetzede olarak devam etmek istediğinizden emin misiniz? Bu rolü daha sonra değiştirebilirsiniz.", "Are you sure you want to continue as Victim? You can change this role later.")
                : L("Gönüllü olarak devam etmek istediğinizden emin misiniz? Bu rolü daha sonra değiştirebilirsiniz.", "Are you sure you want to continue as Volunteer? You can change this role later.")}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={closeConfirm}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  borderWidth: 1, borderColor: border,
                  backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.06)",
                  alignItems: "center", justifyContent: "center"
                }}
              >
                <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("İptal", "Cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => confirmRole && void selectRole(confirmRole)}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  backgroundColor: confirmingRole?.accent || "#dc2626",
                  alignItems: "center", justifyContent: "center"
                }}
              >
                <Text style={{ color: "#ffffff", fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Evet, Devam Et", "Yes, Continue")}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Sign out confirmation modal */}
      {showSignOutModal && (
        <Animated.View
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            opacity: signOutOpacity,
            justifyContent: "flex-end"
          }}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSignOutModal} />
          <Animated.View
            style={{
              transform: [{ translateY: signOutSlide }],
              backgroundColor: cardSolid,
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              padding: 24, paddingBottom: 36,
              borderTopWidth: 1, borderColor: "rgba(220,38,38,0.3)"
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: lightMode ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 20 }} />
            <View style={{
              width: 56, height: 56, borderRadius: 18, marginBottom: 16,
              backgroundColor: "rgba(220,38,38,0.12)",
              alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: "rgba(220,38,38,0.3)"
            }}>
              <Ionicons name="log-out-outline" size={28} color="#dc2626" />
            </View>
            <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 22, marginBottom: 8 }}>
              {L("Çıkış Yap", "Sign Out")}
            </Text>
            <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 15, lineHeight: 22, marginBottom: 28 }}>
              {L("Hesabınızdan çıkış yapmak istediğinizden emin misiniz?", "Are you sure you want to sign out of your account?")}
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={closeSignOutModal}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  borderWidth: 1, borderColor: border,
                  backgroundColor: lightMode ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.06)",
                  alignItems: "center", justifyContent: "center"
                }}
              >
                <Text style={{ color: textSec, fontFamily: "Inter-Bold", fontSize: 15 }}>{L("İptal", "Cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { closeSignOutModal(); void signOut(auth); }}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  backgroundColor: "#dc2626",
                  alignItems: "center", justifyContent: "center"
                }}
              >
                <Text style={{ color: "#ffffff", fontFamily: "Inter-Bold", fontSize: 15 }}>{L("Çıkış Yap", "Sign Out")}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
};
