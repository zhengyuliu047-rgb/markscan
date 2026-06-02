import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import type { H3Event } from "h3";

const SESSION_COOKIE = "markscan_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type SessionPayload = { username: string; exp: number; nonce: string };

function getAuthSecret() {
  const config = useRuntimeConfig();
  const secret = config.authSecret || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set and at least 32 characters long");
  return secret;
}

function getAdminUsername() {
  const config = useRuntimeConfig();
  return config.adminUsername || process.env.ADMIN_USERNAME || "admin";
}

function getAdminPasswordHash() {
  const config = useRuntimeConfig();
  return config.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || "";
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPasswordHash(password: string) {
  const passwordHash = getAdminPasswordHash();
  if (!passwordHash) throw new Error("ADMIN_PASSWORD_HASH must be set");
  const [algorithm, salt, expectedHash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) throw new Error("ADMIN_PASSWORD_HASH must use scrypt:<salt>:<hash> format");
  const actualHash = scryptSync(password, salt, Buffer.from(expectedHash, "hex").length).toString("hex");
  return safeEqual(actualHash, expectedHash);
}

export function verifyAdminCredentials(username: string, password: string) {
  return safeEqual(username, getAdminUsername()) && verifyPasswordHash(password);
}

export function createSessionToken(username: string) {
  const payload: SessionPayload = { username, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE, nonce: randomUUID() };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.username || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminSession(event: H3Event) {
  return verifySessionToken(getCookie(event, SESSION_COOKIE));
}

export function requireAdmin(event: H3Event) {
  const session = getAdminSession(event);
  if (!session) throw createError({ statusCode: 401, message: "Unauthorized" });
  return session;
}

export function setAdminSession(event: H3Event, username: string) {
  setCookie(event, SESSION_COOKIE, createSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export function clearAdminSession(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: "/" });
}
