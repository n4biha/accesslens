import { test } from "node:test";
import assert from "node:assert/strict";

import { checkRateLimit, type Limit } from "./rateLimit";

function request(ip: string): Request {
  return new Request("https://example.test/api/analyze", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

const LIMIT: Limit = { perCaller: 3, global: 5, windowMs: 60_000 };

test("a caller is allowed up to the per-caller limit, then blocked", () => {
  const scope = `t1-${Math.random()}`;
  const ip = "203.0.113.10";

  for (let i = 0; i < LIMIT.perCaller; i++) {
    assert.equal(checkRateLimit(request(ip), scope, LIMIT).allowed, true, `request ${i + 1}`);
  }

  const blocked = checkRateLimit(request(ip), scope, LIMIT);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.match(blocked.message, /demo limit/i);
});

test("callers are counted separately", () => {
  const scope = `t2-${Math.random()}`;
  for (let i = 0; i < LIMIT.perCaller; i++) checkRateLimit(request("198.51.100.1"), scope, LIMIT);

  assert.equal(checkRateLimit(request("198.51.100.1"), scope, LIMIT).allowed, false);
  assert.equal(checkRateLimit(request("198.51.100.2"), scope, LIMIT).allowed, true);
});

test("the global ceiling stops traffic spread across many callers", () => {
  const scope = `t3-${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 12; i++) {
    if (checkRateLimit(request(`192.0.2.${i}`), scope, LIMIT).allowed) allowed++;
  }
  assert.equal(allowed, LIMIT.global);
});

test("a request with no forwarded address is still limited", () => {
  const scope = `t4-${Math.random()}`;
  const bare = () => new Request("https://example.test/api/analyze", { method: "POST" });
  for (let i = 0; i < LIMIT.perCaller; i++) checkRateLimit(bare(), scope, LIMIT);
  assert.equal(checkRateLimit(bare(), scope, LIMIT).allowed, false);
});
