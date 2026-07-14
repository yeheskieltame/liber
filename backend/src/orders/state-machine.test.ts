import { test } from "node:test";
import assert from "node:assert/strict";
import { transition, InvalidTransitionError, type OrderState } from "./state-machine.js";

test("happy path: scanned -> quoted -> approved -> bridging -> redeeming -> completed", () => {
  assert.equal(transition("scanned", "quote_received"), "quoted");
  assert.equal(transition("quoted", "user_approved"), "approved");
  assert.equal(transition("approved", "bridge_submitted"), "bridging");
  assert.equal(transition("bridging", "bridge_confirmed"), "redeeming");
  assert.equal(transition("redeeming", "idrx_redeemed"), "completed");
});

test("any state can move to failed via a failure event", () => {
  assert.equal(transition("bridging", "failure"), "failed");
  assert.equal(transition("redeeming", "failure"), "failed");
});

test("rejects an out-of-order transition", () => {
  assert.throws(() => transition("scanned", "user_approved"), InvalidTransitionError);
});

test("rejects any transition out of a terminal state", () => {
  assert.throws(() => transition("completed", "user_approved"), InvalidTransitionError);
  assert.throws(() => transition("failed", "user_approved"), InvalidTransitionError);
});

test("rejects an unrecognized state with InvalidTransitionError (not TypeError)", () => {
  assert.throws(() => transition("some_unknown_state" as OrderState, "user_approved"), InvalidTransitionError);
});
