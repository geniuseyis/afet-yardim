import test from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { mustAuth } from "./guards";

test("mustAuth should throw unauthenticated when auth is missing", () => {
  assert.throws(
    () => mustAuth(undefined),
    (err: any) => err instanceof HttpsError && err.code === "unauthenticated"
  );
});

test("mustAuth should return uid and default empty token", () => {
  const res = mustAuth({ uid: "u1" });
  assert.equal(res.uid, "u1");
  assert.deepEqual(res.token, {});
});

test("mustAuth should preserve token payload", () => {
  const res = mustAuth({ uid: "u2", token: { role: "volunteer", volunteer: true } });
  assert.equal(res.uid, "u2");
  assert.deepEqual(res.token, { role: "volunteer", volunteer: true });
});
