import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** URL-safe random secret (API tokens, session ids). */
export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
