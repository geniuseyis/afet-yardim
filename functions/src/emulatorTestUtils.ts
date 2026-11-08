export const hasFirestoreEmulator = (): boolean => Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export const hasAuthEmulator = (): boolean => Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

export const hasFunctionsEmulator = (): boolean =>
  Boolean(process.env.FUNCTIONS_EMULATOR_HOST) || hasFirestoreEmulator();

export const emulatorProjectId = (): string => {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
      if (parsed?.projectId) return parsed.projectId;
    } catch {
      // ignore; fallback below
    }
  }
  return "demo-afetyardim";
};

export const emulatorReady = (): boolean => hasFirestoreEmulator();

export const emulatorSkipReason = (): string =>
  "Firestore emulator env yok. `firebase emulators:start --only firestore,functions,auth` veya `firebase emulators:exec` ile calistirin.";

export const functionsEmulatorHost = (): string => process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";

export const callableUrl = (functionName: string): string => {
  const projectId = emulatorProjectId();
  return `http://${functionsEmulatorHost()}/${projectId}/us-central1/${functionName}`;
};

export const invokeCallableRaw = async (functionName: string, data: unknown, opts?: { authToken?: string }) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.authToken) headers.Authorization = `Bearer ${opts.authToken}`;

  const res = await fetch(callableUrl(functionName), {
    method: "POST",
    headers,
    body: JSON.stringify({ data })
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { status: res.status, ok: res.ok, body };
};
