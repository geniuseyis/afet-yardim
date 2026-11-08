import Constants from "expo-constants";
import { logClientError, logClientEvent } from "./telemetry";

let crashInitDone = false;

export const initCrashReporting = async () => {
  if (crashInitDone) return;
  crashInitDone = true;

  try {
    // Optional runtime integration. Works only if Sentry package is installed.
    const req = (0, eval)("require");
    const maybeSentry = req ? req("@sentry/react-native") : null;
    const dsn =
      (Constants as any)?.expoConfig?.extra?.sentryDsn ||
      (Constants as any)?.manifest2?.extra?.sentryDsn ||
      "";

    if (maybeSentry?.init && dsn) {
      maybeSentry.init({ dsn, tracesSampleRate: 0.2 });
      await logClientEvent("crash_provider_ready", { provider: "sentry" });
      return;
    }
  } catch {
    // fallback to telemetry-only mode
  }

  await logClientEvent("crash_provider_fallback", { provider: "telemetry" });
};

export const captureClientError = async (where: string, error: unknown, extra: Record<string, any> = {}) => {
  try {
    const req = (0, eval)("require");
    const maybeSentry = req ? req("@sentry/react-native") : null;
    maybeSentry?.captureException?.(error, { extra: { where, ...extra } });
  } catch {
    // no-op
  }

  await logClientError(where, error, extra);
};
