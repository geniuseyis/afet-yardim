import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "../firebase";

export type SosLogStatus =
  | "initiated"
  | "dial_opened"
  | "sms_composer_opened"
  | "completed"
  | "failed";

export const createSosLog = async (payload: {
  location?: { latitude: number; longitude: number } | null;
  contactCount?: number;
  note?: string;
}) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("no-user");

  const ref = await addDoc(collection(db, "sos_logs"), {
    userId: uid,
    status: "initiated",
    location: payload.location || null,
    contactCount: payload.contactCount || 0,
    note: payload.note || "SOS flow started",
    timeline: [
      {
        status: "initiated",
        at: Date.now(),
        note: payload.note || "SOS flow started"
      }
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  } as any);

  return ref.id;
};

export const appendSosLogStatus = async (
  logId: string,
  status: SosLogStatus,
  note: string
) => {
  const ref = doc(db, "sos_logs", logId);
  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp(),
    timeline: arrayUnion({
      status,
      at: Date.now(),
      note
    })
  } as any);
};

export const subscribeMySosLogs = (
  callback: (
    rows: Array<{
      id: string;
      status?: SosLogStatus;
      note?: string;
      createdAt?: any;
      updatedAt?: any;
    }>
  ) => void
) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  // INDEX-SAFE QUERY:
  // where(userId==) + orderBy(createdAt) combination can require composite index in prod.
  // We fetch by userId and sort client-side to avoid failed-precondition/index blocker.
  const q = query(
    collection(db, "sos_logs"),
    where("userId", "==", uid),
    limit(80)
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a: any, b: any) => {
          const aMs = Number(a?.createdAt?.toMillis?.() || a?.updatedAt?.toMillis?.() || 0);
          const bMs = Number(b?.createdAt?.toMillis?.() || b?.updatedAt?.toMillis?.() || 0);
          return bMs - aMs;
        })
        .slice(0, 20);
      callback(rows);
    },
    (err) => {
      console.warn("[sos-logs] snapshot error:", err);
      callback([]);
    }
  );
};
