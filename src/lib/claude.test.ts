import assert from "node:assert/strict";
import { test } from "node:test";

import { describeModelFailure } from "./claude";

/** Shaped like an SDK APIError: status plus a nested provider message. */
function apiError(status: number, message: string) {
  return { status, message: `${status} ${message}`, error: { error: { message } } };
}

test("an exhausted credit balance says so instead of blaming the network", () => {
  const failure = describeModelFailure(
    apiError(400, "Your credit balance is too low to access the Anthropic API.")
  );
  assert.equal(failure.status, 402);
  assert.match(failure.message, /run out of API credits/);
  assert.doesNotMatch(failure.message, /could not be reached/);
});

test("a missing key is reported as configuration, not as a retry", () => {
  const failure = describeModelFailure(apiError(401, "invalid x-api-key"));
  assert.equal(failure.status, 500);
  assert.match(failure.message, /API key/);
});

test("busy and overloaded are the cases actually worth retrying", () => {
  assert.equal(describeModelFailure(apiError(429, "rate_limit_error")).status, 429);
  assert.equal(describeModelFailure(apiError(529, "Overloaded")).status, 503);
});

test("an oversized schema is named as a bug rather than blamed on the assignment", () => {
  const failure = describeModelFailure(
    apiError(400, "The compiled grammar is too large, which would cause performance issues.")
  );
  assert.match(failure.message, /bug, not your assignment/);
});

test("anything unrecognised keeps the original generic message", () => {
  const failure = describeModelFailure(new Error("socket hang up"));
  assert.equal(failure.status, 502);
  assert.match(failure.message, /could not be reached/);
});
