import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerDeviceTokenViaApi } from "./backend";

let NotificationsMod: any | null = null;
let handlerReady = false;

const isExpoGo = () => {
  const env = (Constants as any)?.executionEnvironment;
  return env === "storeClient" || (Constants as any)?.appOwnership === "expo";
};

const getNotifications = async () => {
  if (isExpoGo()) return null;
  if (NotificationsMod) return NotificationsMod;
  try {
    NotificationsMod = await import("expo-notifications");
    return NotificationsMod;
  } catch {
    return null;
  }
};

const ensureNotificationHandler = async () => {
  if (handlerReady) return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
  handlerReady = true;
};

export const registerPushChannels = async (): Promise<void> => {
  try {
    if (isExpoGo()) return;
    if (Platform.OS !== "android") return;
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await ensureNotificationHandler();
    await Notifications.setNotificationChannelAsync("critical", {
      name: "Kritik Uyarilar",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 300, 250, 300]
    });
    await Notifications.setNotificationChannelAsync("operations", {
      name: "Operasyon",
      importance: Notifications.AndroidImportance.HIGH
    });
    await Notifications.setNotificationChannelAsync("chat", {
      name: "Sohbet",
      importance: Notifications.AndroidImportance.DEFAULT
    });
  } catch (e) {
    console.warn("[push] Bildirim kanallari ayarlanamadi:", e);
  }
};

export const registerPushToken = async (): Promise<void> => {
  try {
    if (isExpoGo()) return;
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await ensureNotificationHandler();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    const finalStatus = existingStatus === "granted"
      ? existingStatus
      : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== "granted") return;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;
    if (!projectId || projectId === "REPLACE_WITH_EAS_PROJECT_ID") {
      console.warn("[push] EAS projectId eksik/placeholder. app.json -> expo.extra.eas.projectId alanini guncelle.");
      return;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerDeviceTokenViaApi({ token: tokenResult.data, platform: Platform.OS });
  } catch (e) {
    console.warn("[push] Push token kaydi atlandi:", e);
  }
};
