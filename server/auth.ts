/**
 * Admin authentication for the MUET Bus Management System.
 *
 * - Only ONE admin account, configured through environment variables
 *   (see .env.example). Nothing is hard-coded in the source.
 * - Passwords are never stored in the browser. After login the server hands
 *   out a random session id in an HttpOnly + SameSite=Strict cookie, so the
 *   page's JavaScript can never read it and other sites cannot ride on it.
 * - Sessions live in server memory (restart = everybody is logged out).
 * - Repeated wrong passwords from one address lock that address out for a
 *   while, which makes password guessing impractical.
 */
import 'dotenv/config';
import crypto from 'crypto';
import type { IncomingMessage } from 'http';

export const COOKIE_NAME = 'muet_admin_session';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// ------------------------------------------------------------------
// Credentials (from environment)
// ------------------------------------------------------------------

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
let adminPassword = process.env.ADMIN_PASSWORD || '';

if (!adminPassword) {
  // Never ship with a known default password: generate a throw-away one.
  adminPassword = crypto.randomBytes(9).toString('base64url');
  console.warn(
    '\n[auth] ADMIN_PASSWORD is not set in .env.\n' +
      `[auth] Temporary admin login for this run -> username: "${ADMIN_USERNAME}"  password: "${adminPassword}"\n` +
      '[auth] Set ADMIN_PASSWORD in .env to make it permanent.\n'
  );
}

export function verifyCredentials(username: unknown, password: unknown): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username.length > 200 || password.length > 500) return false;

  return username.trim() === ADMIN_USERNAME && password === adminPassword;
}

// ------------------------------------------------------------------
// Sessions
// ------------------------------------------------------------------

const sessions = new Map<string, number>(); // token -> expiry (ms)

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [token, expires] of sessions) {
    if (expires <= now) sessions.delete(token);
  }
}

export function createSession(): string {
  purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

export function getSessionToken(req: IncomingMessage): string | null {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return token || null;
}

export function isAdmin(req: IncomingMessage): boolean {
  const token = getSessionToken(req);
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(req: IncomingMessage) {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
}

function isHttps(req: IncomingMessage): boolean {
  return Boolean((req.socket as any)?.encrypted) || req.headers['x-forwarded-proto'] === 'https';
}

export function sessionCookie(req: IncomingMessage, token: string): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(req: IncomingMessage): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

// ------------------------------------------------------------------
// Brute-force protection
// ------------------------------------------------------------------

interface AttemptInfo {
  fails: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptInfo>();

export function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress || 'unknown';
}

/** Returns the number of seconds the client must still wait, or 0. */
export function lockoutSecondsLeft(key: string): number {
  const info = attempts.get(key);
  if (!info || info.lockedUntil <= Date.now()) return 0;
  return Math.ceil((info.lockedUntil - Date.now()) / 1000);
}

export function recordFailedLogin(key: string) {
  const info = attempts.get(key) || { fails: 0, lockedUntil: 0 };
  // A previous lock that has expired starts a fresh count
  if (info.lockedUntil && info.lockedUntil <= Date.now()) {
    info.fails = 0;
    info.lockedUntil = 0;
  }
  info.fails += 1;
  if (info.fails >= MAX_FAILED_ATTEMPTS) {
    info.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  attempts.set(key, info);
}

export function clearFailedLogins(key: string) {
  attempts.delete(key);
}
