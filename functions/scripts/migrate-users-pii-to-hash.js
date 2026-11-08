/* eslint-disable no-console */
const { getApps, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "afetyardim-79135";

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const STRIP_RAW = args.includes("--strip-raw");
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 0;

const normalizeDigits11 = (value) => String(value || "").replace(/\D/g, "").slice(0, 11);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const { pbkdf2Sync } = require("crypto");
const piiHash = (scope, value) => (value ? pbkdf2Sync(value, `afy-v3|${scope}`, 20000, 16, "sha256").toString("hex") : "");

const maskKeepingLast = (raw, keep = 2) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes("*")) return value;
  if (value.length <= keep) return value;
  return `${"*".repeat(value.length - keep)}${value.slice(-keep)}`;
};

const maskTc = (value) => {
  const digits = normalizeDigits11(value);
  return digits ? maskKeepingLast(digits, 2) : "";
};

const maskPhone = (value) => {
  const digits = normalizeDigits11(value);
  return digits ? maskKeepingLast(digits, 2) : "";
};

const maskEmail = (value) => {
  const email = normalizeEmail(value);
  if (!email) return "";
  if (email.includes("*")) return email;
  const [localRaw, domainRaw] = email.split("@");
  if (!domainRaw) return maskKeepingLast(email, 2);
  const local = maskKeepingLast(localRaw, 2);
  const parts = domainRaw.split(".");
  const host = parts[0] ? maskKeepingLast(parts[0], 2) : "**";
  const tld = parts.length > 1 ? parts.slice(1).join(".") : "";
  return tld ? `${local}@${host}.${tld}` : `${local}@${host}`;
};

const main = async () => {
  console.log(`\n[users-pii-migration] mode=${APPLY ? "APPLY" : "DRY-RUN"} stripRaw=${STRIP_RAW ? "yes" : "no"} limit=${LIMIT || "all"}`);

  let processed = 0;
  let updated = 0;
  let createdPublic = 0;
  let lastDoc = null;

  while (true) {
    let q = db.collection("users").orderBy(FieldPath.documentId()).limit(400);
    if (lastDoc) q = q.startAfter(lastDoc.id);
    const snap = await q.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const uid = docSnap.id;
      const row = docSnap.data() || {};
      processed += 1;

      const rawTc = normalizeDigits11(row.tcNo || "");
      const rawPhone = normalizeDigits11(row.phone || "");
      const rawEmail = normalizeEmail(row.email || "");

      const update = {
        piiVersion: 2,
        updatedAt: FieldValue.serverTimestamp()
      };

      const tcHash = row.tcNo_hash || piiHash("tcNo", rawTc);
      const phoneHash = row.phone_hash || piiHash("phone", rawPhone);
      const emailHash = row.email_hash || piiHash("email", rawEmail);
      const tcMasked = row.tcNo_masked || maskTc(rawTc);
      const phoneMasked = row.phone_masked || maskPhone(rawPhone);
      const emailMasked = row.email_masked || maskEmail(rawEmail);

      if (tcHash) update.tcNo_hash = tcHash;
      if (phoneHash) update.phone_hash = phoneHash;
      if (emailHash) update.email_hash = emailHash;
      if (tcMasked) update.tcNo_masked = tcMasked;
      if (phoneMasked) update.phone_masked = phoneMasked;
      if (emailMasked) update.email_masked = emailMasked;

      if (STRIP_RAW) {
        if (typeof row.tcNo !== "undefined") update.tcNo = FieldValue.delete();
        if (typeof row.phone !== "undefined") update.phone = FieldValue.delete();
        if (typeof row.email !== "undefined") update.email = FieldValue.delete();
      }

      const shouldWriteUser =
        update.tcNo_hash ||
        update.phone_hash ||
        update.email_hash ||
        update.tcNo_masked ||
        update.phone_masked ||
        update.email_masked ||
        STRIP_RAW;

      const publicPayload = {
        fullName: row.fullName || row.name || "",
        name: row.name || row.fullName || "",
        role: row.role || null,
        city: row.city || "",
        district: row.district || "",
        regionId: row.regionId || "",
        availability: row.availability || "offline",
        volunteerStatus: row.volunteerStatus || "not_started",
        isCoordinator: Boolean(row.isCoordinator || row.role === "coordinator"),
        isApprovedVolunteer: Boolean(row.isApprovedVolunteer),
        skillLevel: row.skillLevel || "beginner",
        skills: Array.isArray(row.skills) ? row.skills : [],
        interests: Array.isArray(row.interests) ? row.interests : [],
        email: emailMasked || "",
        phone: phoneMasked || "",
        tcNo: tcMasked || "",
        email_masked: emailMasked || "",
        phone_masked: phoneMasked || "",
        tcNo_masked: tcMasked || "",
        piiMasked: true,
        updatedAt: FieldValue.serverTimestamp()
      };

      if (APPLY && shouldWriteUser) {
        await db.collection("users").doc(uid).set(update, { merge: true });
        updated += 1;
      }

      if (APPLY) {
        await db.collection("users_public").doc(uid).set(publicPayload, { merge: true });
        createdPublic += 1;
      }

      if (!APPLY && processed <= 5) {
        console.log("[dry-run sample]", {
          uid,
          tcNo_hash: tcHash ? "set" : "skip",
          phone_hash: phoneHash ? "set" : "skip",
          email_hash: emailHash ? "set" : "skip",
          tcNo_masked: tcMasked || "",
          phone_masked: phoneMasked || "",
          email_masked: emailMasked || ""
        });
      }

      if (LIMIT && processed >= LIMIT) {
        console.log("[users-pii-migration] limit reached.");
        console.log({ processed, updated, usersPublicUpserts: createdPublic, mode: APPLY ? "apply" : "dry-run" });
        return;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  console.log("[users-pii-migration] done", {
    processed,
    updated,
    usersPublicUpserts: createdPublic,
    mode: APPLY ? "apply" : "dry-run"
  });
};

main().catch((err) => {
  console.error("[users-pii-migration] failed", err);
  process.exit(1);
});
