import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { maskEmail, maskPhone, maskTc } from "../utils/privacy";

type MaybeArray = string[] | undefined | null;

const sanitizeArray = (v: MaybeArray) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, 24) : []);

export type UserPublicPayload = {
  fullName?: string;
  name?: string;
  email?: string;
  email_masked?: string;
  phone?: string;
  phone_masked?: string;
  tcNo?: string;
  tcNo_masked?: string;
  role?: string | null;
  city?: string;
  district?: string;
  regionId?: string;
  availability?: string;
  volunteerStatus?: string;
  isCoordinator?: boolean;
  isApprovedVolunteer?: boolean;
  skillLevel?: string;
  skills?: string[];
  interests?: string[];
};

export const buildUserPublicPayload = (input: UserPublicPayload) => {
  const fullName = String(input.fullName || input.name || "").trim();
  const role = input.role || null;
  return {
    fullName,
    role,
    city: String(input.city || "").trim(),
    district: String(input.district || "").trim(),
    regionId: String(input.regionId || "").trim(),
    availability: String(input.availability || "").trim() || "offline",
    volunteerStatus: String(input.volunteerStatus || "").trim() || "not_started",
    isCoordinator: Boolean(input.isCoordinator || role === "coordinator"),
    isApprovedVolunteer: Boolean(input.isApprovedVolunteer),
    skillLevel: String(input.skillLevel || "").trim() || "beginner",
    skills: sanitizeArray(input.skills),
    interests: sanitizeArray(input.interests),
    email_masked: maskEmail(input.email_masked || input.email),
    phone_masked: maskPhone(input.phone_masked || input.phone),
    tcNo_masked: maskTc(input.tcNo_masked || input.tcNo),
    // PII public alanda sadece maskeli tutulur.
    email: maskEmail(input.email_masked || input.email),
    phone: maskPhone(input.phone_masked || input.phone),
    tcNo: maskTc(input.tcNo_masked || input.tcNo),
    piiMasked: true,
    updatedAt: serverTimestamp()
  };
};

// USER-PUBLIC-SYNC: raw users/{uid} değişimlerinden maskeli users_public/{uid} aynası üretir.
export const upsertUserPublicDoc = async (uid: string, input: UserPublicPayload) => {
  const payload = buildUserPublicPayload(input);
  await setDoc(doc(db, "users_public", uid), payload as any, { merge: true });
};
