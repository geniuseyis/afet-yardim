import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionRequest, detectRisk, resolvedRole, transitionStatusForAction, urgentScore } from "./domain";

test("resolvedRole should prefer explicit role claim", () => {
  assert.equal(resolvedRole({ role: "coordinator", volunteer: true }), "coordinator");
  assert.equal(resolvedRole({ role: "volunteer" }), "volunteer");
  assert.equal(resolvedRole({ role: "victim" }), "victim");
});

test("resolvedRole should support legacy boolean claims", () => {
  assert.equal(resolvedRole({ coordinator: true }), "coordinator");
  assert.equal(resolvedRole({ volunteer: true }), "volunteer");
  assert.equal(resolvedRole({ victim: true }), "victim");
  assert.equal(resolvedRole({}), null);
});

test("urgentScore should score urgency labels", () => {
  assert.equal(urgentScore("Acil"), 100);
  assert.equal(urgentScore("Yuksek"), 100);
  assert.equal(urgentScore("Orta"), 60);
  assert.equal(urgentScore("Dusuk"), 30);
  assert.equal(urgentScore(undefined), 30);
});

test("detectRisk should be case-insensitive", () => {
  assert.equal(detectRisk("NEFES almiyor"), true);
  assert.equal(detectRisk("Kanama var"), true);
  assert.equal(detectRisk("su ve gida lazim"), false);
});

test("transitionStatusForAction should map known actions", () => {
  assert.equal(transitionStatusForAction("START_ROUTE"), "in_progress");
  assert.equal(transitionStatusForAction("COMPLETE"), "closed");
  assert.equal(transitionStatusForAction("REOPEN"), "open");
  assert.equal(transitionStatusForAction("UNKNOWN"), null);
});

test("canTransitionRequest should allow volunteer only on assigned request", () => {
  assert.equal(
    canTransitionRequest({ action: "START_ROUTE", role: "volunteer", actorId: "v1", assignedVolunteerId: "v1" }),
    true
  );
  assert.equal(
    canTransitionRequest({ action: "COMPLETE", role: "volunteer", actorId: "v1", assignedVolunteerId: "v2" }),
    false
  );
});

test("canTransitionRequest should allow coordinator for all supported actions", () => {
  assert.equal(canTransitionRequest({ action: "START_ROUTE", role: "coordinator", actorId: "c1" }), true);
  assert.equal(canTransitionRequest({ action: "COMPLETE", role: "coordinator", actorId: "c1" }), true);
  assert.equal(canTransitionRequest({ action: "REOPEN", role: "coordinator", actorId: "c1" }), true);
});

test("canTransitionRequest should reject unsupported actions and unauthorized reopen", () => {
  assert.equal(canTransitionRequest({ action: "REOPEN", role: "volunteer", actorId: "v1", assignedVolunteerId: "v1" }), false);
  assert.equal(canTransitionRequest({ action: "UNKNOWN", role: "coordinator", actorId: "c1" }), false);
});
