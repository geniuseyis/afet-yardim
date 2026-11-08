import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Font from "expo-font";
import { onAuthStateChanged, signOut } from "firebase/auth/cordova";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { useStore } from "../store";
import type { UserRole } from "../store";
import { registerPushChannels, registerPushToken } from "../services/notifications";
import { getLocalConsentAccepted } from "../services/consentLocal";
import { initTelemetry, logClientEvent } from "../services/telemetry";
import { captureClientError, initCrashReporting } from "../services/crash";
import { normalizeRole } from "../utils/roles";
import { loadAppPrefs, saveAppPrefs } from "../services/appPrefs";
import { probeOnline } from "../services/network";
import { autoLocaleText, l, t } from "../services/i18n";
import { upsertUserPublicDoc } from "../services/userPublic";

/**
 * ROOT NAV FILE MAP
 * - ROOT-NAV-AUTH: auth hydration, consent/phone/role gates
 * - ROOT-NAV-TABS: role-aware bottom tabs
 * - ROOT-NAV-UX: global toast, redirect splash, offline banner
 * - ROOT-NAV-PREFS: load/save amoled + locale preferences
 * - ROOT-NAV-NET: periodic connectivity probe for offline mode
 */

import { CustomAlert } from "../components/CustomAlert";
import type { AlertConfig, AlertButton } from "../components/CustomAlert";

import {
  ConsentScreen,
  SplashScreen,
  AuthScreen,
  VerifyEmailScreen,
  PhoneVerificationScreen,
  RoleScreen,
  VictimHome,
  VictimAlertsScreen,
  VictimRequestStatusScreen,
  VictimRequestScreen,
  VictimRequestsScreen,
  VictimToolsScreen,
  VictimFamilySafetyScreen,
  VolunteerHome,
  VolunteerMapScreen,
  VolunteerRequestDetailScreen,
  VolunteerTaskTrackingScreen,
  VolunteerTasksScreen,
  VolunteerAvailableMissionsScreen,
  VolunteerOnboardingStepperScreen,
  VolunteerPendingApprovalScreen,
  CoordinatorHome,
  CoordinatorMapScreen,
  CoordinatorRequestsScreen,
  CoordinatorVolunteerManagementScreen,
  CoordinatorCenterScreen,
  CoordinatorReportsScreen,
  CoordinatorAnnouncementsScreen,
  CoordinatorLogsScreen,
  CoordinatorRolesScreen,
  CoordinatorSettingsScreen,
  CoordinatorDonationsScreen,
  CoordinatorInventoryScreen,
  CoordinatorAssignmentsScreen,
  MapScreen,
  ChatListScreen,
  ChatDetailScreen,
  ProfileScreen
} from "../screens";
import { DisasterHistoryScreen } from "../screens/common/DisasterHistoryScreen";
import { VoiceSOSScreen } from "../screens/common/VoiceSOSScreen";

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  PhoneVerify: undefined;
  Consent: undefined;
  RoleSelection: undefined;
  MainTabs: undefined;
  VictimRequest: undefined;
  VictimTools: undefined;
  VictimFamilySafety: undefined;
  VictimRequestStatus: { requestId?: string } | undefined;
  Alerts: undefined;
  VolunteerRequestDetail: { requestId: string };
  VolunteerTaskTracking: { requestId: string };
  VolunteerTasks: undefined;
  VolunteerAvailableMissions: undefined;
  VolunteerOnboarding: undefined;
  VolunteerPendingApproval: undefined;
  CoordinatorVolunteers: undefined;
  CoordinatorCenter: undefined;
  CoordinatorReports: undefined;
  CoordinatorAnnouncements: undefined;
  CoordinatorLogs: undefined;
  CoordinatorRoles: undefined;
  CoordinatorSettings: undefined;
  CoordinatorDonations: undefined;
  CoordinatorInventory: undefined;
  CoordinatorAssignments: undefined;
  ChatDetail: { bot?: boolean; title?: string } | undefined;
  DisasterHistory: undefined;
  VoiceSOS: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const rawRole = useStore((state) => state.userData?.role);
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const unreadMsgCount = useStore((state) => state.unreadMsgCount);
  const role = (normalizeRole(rawRole) || "victim") as Exclude<UserRole, null>;
  const victimMode = role === "victim";
  const volunteerMode = role === "volunteer";
  const coordinatorMode = role === "coordinator";
  const sceneBg = lightMode ? "#f8fafc" : amoledMode ? "#040406" : "#12060a";
  const tabBg = lightMode ? "#ffffff" : amoledMode ? "#09090c" : "#19070c";

  const thirdName = victimMode ? "Requests" : volunteerMode ? "Tasks" : "Manage";
  const thirdComponent = victimMode ? VictimRequestsScreen : volunteerMode ? VolunteerTasksScreen : CoordinatorRequestsScreen;
  const thirdTitle = victimMode
    ? (locale === "en" ? "My Requests" : "Taleplerim")
    : volunteerMode
      ? (locale === "en" ? "Requests/Tasks" : "Talepler/Görevler")
      : (locale === "en" ? "Requests" : "Talepler");
  const mapComponent = coordinatorMode ? CoordinatorMapScreen : volunteerMode ? VolunteerMapScreen : MapScreen;
  const fourthName = "Messages";
  const fourthComponent = ChatListScreen;
  const fourthTitle = locale === "en" ? "Messages" : "Mesajlar";
  const fifthName = "Profile";
  const fifthComponent = ProfileScreen;
  const fifthTitle = locale === "en" ? "Profile" : "Profil";

  return (
    <Tab.Navigator
      initialRouteName="Home"
      backBehavior="history"
      sceneContainerStyle={{ backgroundColor: sceneBg }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          height: 74,
          backgroundColor: tabBg,
          borderTopColor: "transparent",
          borderTopWidth: 0,
          borderRadius: 28,
          paddingTop: 10,
          paddingBottom: 10,
          paddingHorizontal: 6,
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
          borderWidth: 1,
          borderColor: lightMode ? "rgba(15,23,42,0.08)" : "rgba(248,113,113,0.16)"
        },
        tabBarActiveTintColor: "#ef4444",
        tabBarInactiveTintColor: lightMode ? "#64748b" : "#fda4af",
        tabBarLabelStyle: { fontFamily: "Inter", fontSize: 11, marginBottom: 2 },
        tabBarItemStyle: { borderRadius: 18, marginHorizontal: 1, paddingTop: 2 },
        tabBarButton: route.name === "Home"
          ? (props) => {
              const focused = Boolean((props as any)?.accessibilityState?.selected);
              return (
                <TouchableOpacity
                  {...props}
                  activeOpacity={0.9}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: -34
                  }}
                >
                  <View
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 31,
                      backgroundColor: "#ef2b2d",
                      borderWidth: 4,
                      borderColor: "#090b14",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "#ef4444",
                      shadowOpacity: focused ? 0.42 : 0.24,
                      shadowRadius: focused ? 18 : 10,
                      shadowOffset: { width: 0, height: 8 },
                      elevation: focused ? 14 : 8
                    }}
                  >
                    <Ionicons name="home" size={28} color="white" />
                  </View>
                </TouchableOpacity>
              );
            }
          : undefined,
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: any = "home";
          if (route.name === "Map") iconName = focused ? "location" : "location-outline";
          else if (route.name === "Requests" || route.name === "Tasks" || route.name === "Manage") iconName = focused ? "clipboard" : "clipboard-outline";
          else if (route.name === "Volunteers") iconName = focused ? "people" : "people-outline";
          else if (route.name === "Messages") iconName = focused ? "chatbubbles" : "chatbubbles-outline";
          else if (route.name === "Center") iconName = focused ? "grid" : "grid-outline";
          else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
          else if (route.name === "Home") iconName = focused ? "home" : "home-outline";
          if (route.name === "Home") return null;
          const showBadge = route.name === "Messages" && unreadMsgCount > 0;
          return (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? "rgba(220, 38, 38, 0.14)" : "transparent",
                borderWidth: focused ? 1 : 0,
                borderColor: focused ? "rgba(220, 38, 38, 0.12)" : "transparent"
              }}
            >
              <Ionicons name={iconName} size={size} color={color} />
              {showBadge ? (
                <View style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#ef4444",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                  borderWidth: 1.5,
                  borderColor: tabBg
                }}>
                  <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 8 }}>
                    {unreadMsgCount > 99 ? "99+" : String(unreadMsgCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        }
      })}
    >
      <Tab.Screen name="Map" component={mapComponent} options={{ title: locale === "en" ? "Map" : "Harita" }} />
      <Tab.Screen name={thirdName} component={thirdComponent} options={{ title: thirdTitle }} />
      <Tab.Screen name="Home" component={role === "victim" ? VictimHome : role === "volunteer" ? VolunteerHome : CoordinatorHome} options={{ title: locale === "en" ? "Home" : "Ana Sayfa" }} />
      <Tab.Screen name={fourthName} component={fourthComponent} options={{ title: fourthTitle }} />
      <Tab.Screen name={fifthName} component={fifthComponent} options={{ title: fifthTitle }} />
    </Tab.Navigator>
  );
}

function GlobalToast() {
  const toasts = useStore((state) => state.toasts);
  const hideToast = useStore((state) => state.hideToast);
  const locale = useStore((state) => state.locale);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) => setTimeout(() => hideToast(toast.id), 2500));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts, hideToast]);

  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={toastStyles.wrap}>
      {toasts.map((toast) => (
        <Pressable key={toast.id} pointerEvents="auto" onPress={() => hideToast(toast.id)} style={toastStyles.row}>
          <View style={[
            toastStyles.bar,
            toast.tone === "error"
              ? toastStyles.barError
              : toast.tone === "success"
                ? toastStyles.barSuccess
                : toastStyles.barInfo
          ]}>
            <Ionicons
              name={toast.tone === "error" ? "alert-circle" : toast.tone === "success" ? "checkmark-circle" : "information-circle"}
              size={18}
              color="white"
              style={{ marginRight: 8 }}
            />
            <Text style={toastStyles.text} numberOfLines={3}>{autoLocaleText(locale, toast.message)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function PostPhoneVerifyRedirectScreen() {
  const locale = useStore((state) => state.locale);
  const L = (tr: string, en: string) => l(locale, tr, en);
  return (
    <View style={redirectStyles.wrap}>
      <View style={redirectStyles.card}>
        <View style={redirectStyles.iconWrap}>
          <Ionicons name="checkmark-circle" size={30} color="#22c55e" />
        </View>
        <Text style={redirectStyles.title}>{L("Giriş yapıldı", "Signed in")}</Text>
        <Text style={redirectStyles.sub}>{L("Yönlendiriliyorsunuz...", "Redirecting...")}</Text>
        <View style={redirectStyles.loaderRow}>
          <ActivityIndicator size="small" color="#ef4444" />
          <Text style={redirectStyles.loaderText}>{L("Lütfen bekleyin", "Please wait")}</Text>
        </View>
      </View>
    </View>
  );
}

function OfflineBanner() {
  const offlineMode = useStore((state) => state.offlineMode);
  const locale = useStore((state) => state.locale);

  if (!offlineMode) return null;

  return (
    <View style={offlineStyles.wrap}>
      <View style={offlineStyles.bar}>
        <Ionicons name="cloud-offline-outline" size={16} color="#fff1f2" style={{ marginRight: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={offlineStyles.title}>{t(locale, "offlineBannerTitle")}</Text>
          <Text style={offlineStyles.sub}>{t(locale, "offlineBannerSub")}</Text>
        </View>
      </View>
    </View>
  );
}

export default function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig & { visible: boolean }>({
    visible: false, title: "", message: "", buttons: [], tone: "info"
  });
  const dismissAlert = () => setAlertConfig((p) => ({ ...p, visible: false }));
  const [postPhoneVerifyLoading, setPostPhoneVerifyLoading] = useState(false);
  const postVerifyTimerRef = useRef<any>(null);
  const {
    user, userData, sessionPhoneVerified, authHydrationBlocked,
    amoledMode, lightMode, themeMode, locale,
    setSessionPhoneVerified, setUser, setUserData, setThemeMode, setLocale, setOfflineMode, setLastSyncAt
  } = useStore();
  const showToast = useStore((state) => state.showToast);
  const normalizedStoreRole = normalizeRole(userData?.role);
  const volunteerStatus = normalizedStoreRole === "volunteer"
    ? (userData?.volunteerStatus || "approved")
    : null;
  const volunteerNeedsOnboarding =
    normalizedStoreRole === "volunteer" &&
    ["not_started", "draft", "rejected"].includes(String(volunteerStatus || ""));
  const volunteerPendingApproval =
    normalizedStoreRole === "volunteer" && volunteerStatus === "submitted";

  // ROOT-NAV-PREFS: load persisted locale + amoled settings on startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      const prefs = await loadAppPrefs();
      if (!mounted) return;
      setThemeMode(prefs.themeMode || (prefs.lightMode ? "light" : prefs.amoledMode ? "amoled" : "red"));
      setLocale(prefs.locale || "tr");
    })();
    return () => { mounted = false; };
  }, [setThemeMode, setLocale]);

  // ROOT-NAV-PREFS: persist locale + amoled updates
  useEffect(() => {
    void saveAppPrefs({ amoledMode, lightMode, themeMode, locale });
  }, [amoledMode, lightMode, themeMode, locale]);

  // ROOT-NAV-NET: probe connectivity periodically for offline mode
  useEffect(() => {
    let mounted = true;
    let timer: any;
    const run = async () => {
      const isOnline = await probeOnline(2200);
      if (!mounted) return;
      setOfflineMode(!isOnline);
      if (isOnline) setLastSyncAt(Date.now());
    };
    void run();
    timer = setInterval(run, 15000);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [setOfflineMode, setLastSyncAt]);

  // ROOT-NAV-AUTH: auth lifecycle + profile hydration + gate state setup
  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          Inter: require("../../assets/fonts/Inter-Regular.ttf"),
          "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf")
        });
        await initCrashReporting();
        await initTelemetry();
      } catch {
        // fallback to system fonts
      } finally {
        setReady(true);
      }
    }

    prepare();

    const nativeAlert = Alert.alert.bind(Alert);
    Alert.alert = ((title?: string, message?: string, buttons?: any, _options?: any) => {
      const titleText = typeof title === "string" ? title.trim() : "";
      const messageText = typeof message === "string" ? message.trim() : "";
      const lower = `${titleText} ${messageText}`.toLowerCase();
      const hasDestructive = Array.isArray(buttons) && buttons.some((b: any) => b?.style === "destructive");
      const tone = lower.includes("hata") || lower.includes("error")
        ? "error"
        : (lower.includes("başarılı") || lower.includes("basarili") || lower.includes("success"))
          ? "success"
          : (lower.includes("sil") || lower.includes("iptal") || lower.includes("reddet") || hasDestructive)
            ? "warning"
            : "info";

      const currentLocale = useStore.getState().locale;
      const resolvedButtons: AlertButton[] = Array.isArray(buttons) && buttons.length > 0
        ? buttons.map((b: any) => ({ text: b.text || "Tamam", onPress: b.onPress, style: b.style }))
        : [{ text: currentLocale === "en" ? "OK" : "Tamam", style: "default" }];

      setAlertConfig({
        visible: true,
        title: titleText || (currentLocale === "en" ? "Info" : "Bilgi"),
        message: messageText || undefined,
        buttons: resolvedButtons,
        tone,
      });
      return;
    }) as any;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        void logClientEvent("auth_signed_out");
        setUserData(null);
        setEmailVerified(false);
        setConsentAccepted(false);
        setPhoneVerified(false);
        setPostPhoneVerifyLoading(false);
        if (postVerifyTimerRef.current) {
          clearTimeout(postVerifyTimerRef.current);
          postVerifyTimerRef.current = null;
        }
        setSessionPhoneVerified(false);
        useStore.getState().setAuthHydrationBlocked(false);
        return;
      }
      setPhoneVerified(false);
      setSessionPhoneVerified(false);
      void logClientEvent("auth_signed_in");
      const userRef = doc(db, "users", currentUser.uid);
      const consentRef = doc(db, "consents", currentUser.uid);
      let userSnap;
      let consentSnap: any = null;
      let localConsent = false;
      let profileReadDenied = false;
      try {
        [userSnap, consentSnap] = await Promise.all([getDoc(userRef), getDoc(consentRef)]);
      } catch (e: any) {
        void captureClientError("auth_hydration", e);
        const errText = `${e?.message || ""}`.toLowerCase();
        profileReadDenied = errText.includes("permission") || errText.includes("insufficient");
        try {
          userSnap = await getDoc(userRef);
        } catch {
          userSnap = null;
        }
        try {
          localConsent = await getLocalConsentAccepted(currentUser.uid);
        } catch {
          localConsent = false;
        }
        // Firestore consent read failed; local consent fallback continues silently.
        console.warn("[consent] Firestore consent okunamadi:", e);
      }
      if (!userSnap) {
        if (profileReadDenied) {
          showToast(locale === "en" ? "Signed in, but profile data could not be loaded." : "Giriş yapıldı fakat profil bilgileri yüklenemedi.", "error");
          try {
            await signOut(auth);
          } catch {}
        }
        setUserData(null);
        setConsentAccepted(localConsent);
        return;
      }
      if (!userSnap.exists()) {
        setUserData(null);
        setConsentAccepted(localConsent);
        return;
      }
      const data = userSnap.data() as any;
      const resolvedRole = normalizeRole(data?.role) || (data?.isCoordinator ? "coordinator" : null);
      const hydrated = {
        ...data,
        role: resolvedRole as any,
        email: data?.email_masked || "",
        phone: data?.phone_masked || "",
        tcNo: data?.tcNo_masked || ""
      };
      setUserData(hydrated as any);
      upsertUserPublicDoc(currentUser.uid, hydrated as any).catch(() => undefined);
      if (data?.role && resolvedRole && data.role !== resolvedRole) {
        updateDoc(userRef, { role: resolvedRole, updatedAt: new Date() } as any).catch(() => undefined);
      }
      const hasPhoneIdentity = Boolean(data?.phone_hash || data?.phone_masked);
      setPhoneVerified(hasPhoneIdentity ? false : true);
      setSessionPhoneVerified(hasPhoneIdentity ? false : true);
      setConsentAccepted(Boolean(consentSnap?.exists?.() || localConsent));
      try {
        await registerPushChannels();
        await registerPushToken();
      } catch {
        // push registration best-effort
      }
    });

    return () => {
      if (postVerifyTimerRef.current) {
        clearTimeout(postVerifyTimerRef.current);
        postVerifyTimerRef.current = null;
      }
      Alert.alert = nativeAlert as any;
      unsub();
    };
  }, [setSessionPhoneVerified, setUser, setUserData, showToast]);

  // Tema geçiş animasyonu
  const themeAnim = useRef(new Animated.Value(1)).current;
  const prevTheme = useRef(themeMode);
  useEffect(() => {
    if (prevTheme.current === themeMode) return;
    prevTheme.current = themeMode;
    Animated.sequence([
      Animated.timing(themeAnim, { toValue: 0.4, duration: 120, useNativeDriver: true }),
      Animated.timing(themeAnim, { toValue: 1, duration: 220, useNativeDriver: true })
    ]).start();
  }, [themeMode]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#020617" }} />;

  return (
    <NavigationContainer theme={DefaultTheme}>
      <Animated.View style={{ flex: 1, opacity: themeAnim }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user || authHydrationBlocked ? (
            <>
              <Stack.Screen name="Splash" component={SplashScreen} />
              <Stack.Screen name="Auth" component={AuthScreen} />
            </>
          ) : !emailVerified ? (
            // E-posta doğrulama gate'i: kullanıcı giriş yaptı ama emailVerified false.
            // VerifyEmailScreen reload() ile doğrulandığını anlayınca onVerified() çağırır.
            <Stack.Screen name="PhoneVerify">
              {() => <VerifyEmailScreen onVerified={() => setEmailVerified(true)} />}
            </Stack.Screen>
          ) : postPhoneVerifyLoading ? (
            <Stack.Screen name="PhoneVerify">
              {() => <PostPhoneVerifyRedirectScreen />}
            </Stack.Screen>
          ) : !(phoneVerified || sessionPhoneVerified) ? (
            <Stack.Screen name="PhoneVerify">
              {() => <PhoneVerificationScreen onVerified={() => {
                showToast(locale === "en" ? "Signed in. Redirecting..." : "Giriş yapıldı. Yönlendiriliyorsunuz...", "success");
                setPostPhoneVerifyLoading(true);
                if (postVerifyTimerRef.current) clearTimeout(postVerifyTimerRef.current);
                postVerifyTimerRef.current = setTimeout(() => {
                setPhoneVerified(true);
                setSessionPhoneVerified(true);
                setPostPhoneVerifyLoading(false);
                postVerifyTimerRef.current = null;
              }, 1200);
              }} />}
            </Stack.Screen>
          ) : !consentAccepted ? (
            <Stack.Screen name="Consent">
              {() => <ConsentScreen onAccepted={() => setConsentAccepted(true)} />}
            </Stack.Screen>
          ) : volunteerNeedsOnboarding ? (
            <Stack.Screen name="VolunteerOnboarding" component={VolunteerOnboardingStepperScreen} />
          ) : volunteerPendingApproval ? (
            <Stack.Screen name="VolunteerPendingApproval" component={VolunteerPendingApprovalScreen} />
          ) : userData?.role ? (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen name="VictimRequest" component={VictimRequestScreen} />
              <Stack.Screen name="VictimTools" component={VictimToolsScreen} options={{ presentation: "modal" }} />
              <Stack.Screen name="VictimFamilySafety" component={VictimFamilySafetyScreen} />
              <Stack.Screen name="VictimRequestStatus" component={VictimRequestStatusScreen} />
              <Stack.Screen name="Alerts" component={VictimAlertsScreen} />
              <Stack.Screen name="VolunteerRequestDetail" component={VolunteerRequestDetailScreen} />
              <Stack.Screen name="VolunteerTaskTracking" component={VolunteerTaskTrackingScreen} />
              <Stack.Screen name="VolunteerTasks" component={VolunteerTasksScreen} />
              <Stack.Screen name="VolunteerAvailableMissions" component={VolunteerAvailableMissionsScreen} />
              <Stack.Screen name="CoordinatorVolunteers" component={CoordinatorVolunteerManagementScreen} />
              <Stack.Screen name="CoordinatorCenter" component={CoordinatorCenterScreen} />
              <Stack.Screen name="CoordinatorReports" component={CoordinatorReportsScreen} />
              <Stack.Screen name="CoordinatorAnnouncements" component={CoordinatorAnnouncementsScreen} />
              <Stack.Screen name="CoordinatorLogs" component={CoordinatorLogsScreen} />
              <Stack.Screen name="CoordinatorRoles" component={CoordinatorRolesScreen} />
              <Stack.Screen name="CoordinatorSettings" component={CoordinatorSettingsScreen} />
              <Stack.Screen name="CoordinatorDonations" component={CoordinatorDonationsScreen} />
              <Stack.Screen name="CoordinatorInventory" component={CoordinatorInventoryScreen} />
              <Stack.Screen name="CoordinatorAssignments" component={CoordinatorAssignmentsScreen} />
              <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
              <Stack.Screen name="DisasterHistory" component={DisasterHistoryScreen} />
              <Stack.Screen name="VoiceSOS" component={VoiceSOSScreen} />
              <Stack.Screen name="RoleSelection" component={RoleScreen} options={{ presentation: "modal", headerShown: false }} />
            </>
          ) : (
            <Stack.Screen name="RoleSelection" component={RoleScreen} />
          )}
        </Stack.Navigator>
        <GlobalToast />
        <OfflineBanner />
        <CustomAlert
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          buttons={alertConfig.buttons}
          tone={alertConfig.tone}
          onDismiss={dismissAlert}
          lightMode={lightMode}
        />
      </Animated.View>
    </NavigationContainer>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 56,
    zIndex: 999
  },
  row: {
    marginBottom: 8
  },
  bar: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    width: "100%"
  },
  barSuccess: {
    backgroundColor: "#16a34a"
  },
  barInfo: {
    backgroundColor: "#0ea5e9"
  },
  barError: {
    backgroundColor: "#dc2626"
  },
  text: {
    color: "white",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter",
    flex: 1
  }
});

const redirectStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#7a001f",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#f3d6d6",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  title: {
    color: "#111827",
    fontFamily: "Inter-Bold",
    fontSize: 22
  },
  sub: {
    color: "#4b5563",
    fontFamily: "Inter",
    fontSize: 14,
    marginTop: 4
  },
  loaderRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  loaderText: {
    marginLeft: 8,
    color: "#991b1b",
    fontFamily: "Inter-Bold",
    fontSize: 12
  }
});

const offlineStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 8,
    zIndex: 998
  },
  bar: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    backgroundColor: "rgba(153, 27, 27, 0.95)",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  title: {
    color: "#fff1f2",
    fontFamily: "Inter-Bold",
    fontSize: 12
  },
  sub: {
    color: "#fecdd3",
    fontFamily: "Inter",
    fontSize: 10,
    marginTop: 1
  }
});

