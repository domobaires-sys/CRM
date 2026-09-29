import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, normalizePhone } from "../normalize.ts";

test("normaliza teléfonos argentinos a E.164 con el 9 de celular", () => {
  const cases: Array<[string, string]> = [
    ["5491155551234", "+5491155551234"],
    ["+54 9 11 5555-1234", "+5491155551234"],
    ["+54 11 5555-1234", "+5491155551234"],
    ["011 15 5555-1234", "+5491155551234"],
    ["11 5555 1234", "+5491155551234"],
    ["0351 15 555-1234", "+5493515551234"],
    ["(0294) 15 455-1234", "+5492944551234"],
  ];
  for (const [input, expected] of cases) assert.equal(normalizePhone(input), expected, input);
});

test("respeta números de otros países con +", () => {
  assert.equal(normalizePhone("+598 99 123 456"), "+59899123456");
  assert.equal(normalizePhone("0034 612 345 678"), "+34612345678");
});

test("descarta teléfonos inválidos", () => {
  assert.equal(normalizePhone("1234"), undefined);
  assert.equal(normalizePhone(""), undefined);
  assert.equal(normalizePhone("123456789"), undefined);
});

test("normaliza emails", () => {
  assert.equal(normalizeEmail("  Maria@Example.COM "), "maria@example.com");
  assert.equal(normalizeEmail("no-es-mail"), undefined);
});
