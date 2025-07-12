import { expect, test } from "vitest";
import { validish } from "./simple";

test("validish", () => {
  expect(validish(5)).toBe(true);
  expect(validish("")).toBe(true);
  expect(validish([])).toBe(true);
  expect(validish({})).toBe(true);
  expect(validish(undefined)).toBe(false);
  expect(validish(null)).toBe(false);
});
