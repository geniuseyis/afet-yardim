import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { auth, db } from "../firebase";

type EventPayload = Record<string, any>;

const appVersion =
  (Constants as any)?.expoConfig?.version ||
  (Constants as any)?.manifest2?.extra?.expoClient?.version ||
  "unknown";

export const logClientEvent = async (event: string, payload: EventPayload = {}) => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await addDoc(collection(db, "client_events"), {
      event,
      payload,
      userId: uid,
      platform: Platform.OS,
      appVersion,
      createdAt: serverTimestamp()
    });
  } catch {
    // telemetry must never break app flow
  }
};

export const initTelemetry = async () => {
  await logClientEvent("app_opened");
};

export const logScreenView = async (screenName: string, payload: EventPayload = {}) => {
  await logClientEvent("screen_view", { screenName, ...payload });
};

export const logClientError = async (where: string, error: unknown, extra: EventPayload = {}) => {
  const message = error instanceof Error ? error.message : String(error);
  await logClientEvent("client_error", { where, message, ...extra });
};

