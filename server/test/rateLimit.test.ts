import { expect, test } from "vitest";
import { TokenBucket } from "../src/rateLimit.ts";

test("accepts a burst up to capacity", () => {
  const limiter = new TokenBucket(60, 0);
  for (let i = 0; i < 60; i++) expect(limiter.take(0)).toBe(true);
  expect(limiter.take(0)).toBe(false);
});

test("fractional refill is carried to the next attempt", () => {
  const limiter = new TokenBucket(10, 0);
  for (let i = 0; i < 10; i++) limiter.take(0);
  expect(limiter.take(40)).toBe(false);
  expect(limiter.take(100)).toBe(true);
  expect(limiter.take(100)).toBe(false);
});

test("idle time does not accumulate more than capacity", () => {
  const limiter = new TokenBucket(2, 0);
  expect(limiter.take(9000)).toBe(true);
  expect(limiter.take(9000)).toBe(true);
  expect(limiter.take(9000)).toBe(false);
});
