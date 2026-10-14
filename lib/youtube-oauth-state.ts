import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { encrypt, decrypt } from "./encrypt";

const StateSchema = z.object({ userId: z.string(), firebaseUid: z.string(), nonce: z.string(), verifier: z.string(), expires: z.number() });
export const YOUTUBE_STATE_COOKIE = "animatube_youtube_state";
export function createOAuthState(userId: string, firebaseUid: string) {
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const expires = Date.now() + 10 * 60 * 1000;
  return { nonce, expires, challenge: createHash("sha256").update(verifier).digest("base64url"),
    cookie: encrypt(JSON.stringify({ userId, firebaseUid, nonce, verifier, expires })), token: hashOAuthState(nonce) };
}
export function hashOAuthState(nonce: string): string { return createHash("sha256").update(nonce).digest("hex"); }
export function readOAuthState(cookie: string, nonce: string) {
  const state = StateSchema.parse(JSON.parse(decrypt(cookie)));
  const expected = Buffer.from(state.nonce);
  const actual = Buffer.from(nonce);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || state.expires <= Date.now()) {
    throw new Error("YouTube authorization expired or state did not match");
  }
  return state;
}
