import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  verifyCredentials,
  createSession,
  destroySession,
  isAdmin,
  sessionCookie,
  clearedSessionCookie,
  clientKey,
  lockoutSecondsLeft,
  recordFailedLogin,
  clearFailedLogins,
} from './auth.ts';

const ROOT_DIR = process.cwd();
const IS_WINDOWS = process.platform === 'win32';
const CPP_BIN_NAME = IS_WINDOWS ? 'bus_system.exe' : 'bus_system';
const CPP_BIN = path.join(ROOT_DIR, 'bin', CPP_BIN_NAME);
const DB_FILE = path.join(ROOT_DIR, 'data', 'buses.txt');
const CPP_SOURCE = path.join(ROOT_DIR, 'cpp', 'bus_system.cpp');

const MAX_BODY_BYTES = 64 * 1024;

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res: ServerResponse, statusCode: number, data: any, headers: Record<string, string> = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(data));
}

/** Reads and parses a JSON body. Requires Content-Type: application/json. */
function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (!type.startsWith('application/json')) {
      return reject(new HttpError(415, 'Content-Type must be application/json'));
    }

    let size = 0;
    const chunks: Buffer[] = [];
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function requireAdmin(req: IncomingMessage) {
  if (!isAdmin(req)) {
    throw new HttpError(401, 'Admin login required', 'UNAUTHORIZED');
  }
}

// ------------------------------------------------------------------
// C++ engine runner
// ------------------------------------------------------------------

let binaryChecked = false;

/** Compiles the engine when the binary is missing or older than the source. */
function ensureBinary() {
  if (binaryChecked) return;

  const hasBinary = fs.existsSync(CPP_BIN);
  const stale = !hasBinary || fs.statSync(CPP_BIN).mtimeMs < fs.statSync(CPP_SOURCE).mtimeMs;

  if (stale) {
    try {
      fs.mkdirSync(path.join(ROOT_DIR, 'bin'), { recursive: true });
      const flags = ['-O2', '-std=c++17'];
      if (IS_WINDOWS) flags.push('-static-libgcc', '-static-libstdc++');
      execFileSync('g++', [...flags, CPP_SOURCE, '-o', CPP_BIN], { stdio: 'pipe' });
    } catch (err: any) {
      if (!hasBinary) {
        throw new Error('Failed to compile C++ binary: ' + err.message);
      }
      console.warn('[api] Could not rebuild bus_system (is g++ installed?). Using the existing binary.');
    }
  }
  binaryChecked = true;
}

// Every call to the engine runs one after another. The engine reads the whole
// file, changes it and writes it back, so two overlapping requests could
// otherwise overwrite each other's changes.
let engineQueue: Promise<unknown> = Promise.resolve();

function runCpp(args: string[]): Promise<{ stdout: string; stderr: string; durationMs: number }> {
  const job = () =>
    new Promise<{ stdout: string; stderr: string; durationMs: number }>((resolve, reject) => {
      const startTime = Date.now();
      try {
        ensureBinary();
      } catch (err) {
        return reject(err);
      }

      execFile(
        CPP_BIN,
        args,
        {
          cwd: ROOT_DIR,
          env: { ...process.env, BUS_DB_FILE: DB_FILE },
          timeout: 5000,
          maxBuffer: 5 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          // The engine exits with 1 for "logical" failures but still prints JSON
          if (error && !stdout) return reject(error);
          resolve({ stdout, stderr, durationMs });
        }
      );
    });

  const result = engineQueue.then(job, job);
  engineQueue = result.catch(() => undefined);
  return result;
}

/** Runs the engine and returns its parsed JSON output. */
async function runCppJson(args: string[]): Promise<any> {
  const { stdout, durationMs } = await runCpp(args);
  try {
    const parsed = JSON.parse(stdout);
    parsed.durationMs = durationMs;
    return parsed;
  } catch {
    return { success: false, error: 'Engine returned invalid output', raw: stdout, durationMs };
  }
}

const CODE_TO_STATUS: Record<string, number> = {
  OK: 200,
  VALIDATION: 400,
  NOT_FOUND: 404,
  DUPLICATE: 409,
};

function statusFromEngine(result: any, okStatus = 200): number {
  if (result?.success) return okStatus;
  return CODE_TO_STATUS[result?.code] ?? 500;
}

// ------------------------------------------------------------------
// Input validation (bus records)
// ------------------------------------------------------------------

const BUS_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,9}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function cleanText(
  value: unknown,
  label: string,
  { min = 1, max = 80, forbid = '|' }: { min?: number; max?: number; forbid?: string } = {}
): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required`, 'VALIDATION');
  const text = value.trim();
  if (text.length < min) throw new HttpError(400, `${label} is required`, 'VALIDATION');
  if (text.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters)`, 'VALIDATION');
  if (CONTROL_CHARS_RE.test(text)) throw new HttpError(400, `${label} contains invalid characters`, 'VALIDATION');
  for (const ch of forbid) {
    if (text.includes(ch)) {
      throw new HttpError(400, `${label} must not contain "${ch}"`, 'VALIDATION');
    }
  }
  return text;
}

function cleanNumber(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a number between ${min} and ${max}`, 'VALIDATION');
  }
  return n;
}

function trimNumber(n: number): string {
  // 6 decimals is ~11 cm; the C++ engine writes the same precision
  return String(Number(n.toFixed(6)));
}

function validateBusNumber(value: unknown): string {
  if (typeof value !== 'string' || !BUS_NUMBER_RE.test(value.trim())) {
    throw new HttpError(
      400,
      'Bus number must be 1-10 letters, digits or dashes (e.g. 05 or 12A)',
      'VALIDATION'
    );
  }
  return value.trim();
}

/** Turns the JSON sent by the admin form into one pipe-delimited line. */
function buildBusRecord(data: any): string {
  if (!data || typeof data !== 'object') throw new HttpError(400, 'Invalid bus data', 'VALIDATION');

  const number = validateBusNumber(data.number);
  const name = cleanText(data.name, 'Route name', { max: 60 });
  const startLocation = cleanText(data.startLocation, 'Start location');
  const destination = cleanText(data.destination, 'Destination');
  const morningTime = cleanText(data.morningTime, 'Morning time', { max: 40 });
  const returnTime = cleanText(data.returnTime, 'Return time', { max: 60 });
  const capacity = Math.round(cleanNumber(data.capacity ?? 60, 'Capacity', 1, 200));
  const driverName = cleanText(data.driverName || 'N/A', 'Driver name', { max: 60 });
  const driverPhone = cleanText(data.driverPhone || 'N/A', 'Driver phone', { max: 30 });

  if (!Array.isArray(data.stops)) throw new HttpError(400, 'Stops are required', 'VALIDATION');
  if (data.stops.length < 2) throw new HttpError(400, 'A route needs at least 2 stops', 'VALIDATION');
  if (data.stops.length > 40) throw new HttpError(400, 'A route can have at most 40 stops', 'VALIDATION');

  const stops = data.stops.map((stop: any, index: number) => {
    const label = `Stop ${index + 1}`;
    const stopName = cleanText(stop?.name, `${label} name`, { max: 60, forbid: '|;,' });
    const lat = cleanNumber(stop?.lat, `${label} latitude`, -90, 90);
    const lng = cleanNumber(stop?.lng, `${label} longitude`, -180, 180);
    const time = cleanText(stop?.time, `${label} time`, { max: 20, forbid: '|;,' });
    return `${stopName},${trimNumber(lat)},${trimNumber(lng)},${time}`;
  });

  return [
    number,
    name,
    startLocation,
    destination,
    morningTime,
    returnTime,
    capacity,
    driverName,
    driverPhone,
    stops.join(';'),
  ].join('|');
}

// ------------------------------------------------------------------
// Request router
// ------------------------------------------------------------------

async function route(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL) {
  const method = req.method || 'GET';

  // ---------- Auth ----------
  if (method === 'GET' && pathname === '/api/auth/me') {
    return sendJson(res, 200, { success: true, admin: isAdmin(req) });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const key = clientKey(req);
    const wait = lockoutSecondsLeft(key);
    if (wait > 0) {
      return sendJson(
        res,
        429,
        { success: false, error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
        { 'Retry-After': String(wait) }
      );
    }

    const body = await readJson(req);
    if (verifyCredentials(body?.username, body?.password)) {
      clearFailedLogins(key);
      const token = createSession();
      return sendJson(res, 200, { success: true, admin: true }, { 'Set-Cookie': sessionCookie(req, token) });
    }

    recordFailedLogin(key);
    // Small delay slows down scripted guessing
    await new Promise((r) => setTimeout(r, 400));
    return sendJson(res, 401, { success: false, error: 'Invalid username or password' });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    destroySession(req);
    return sendJson(res, 200, { success: true, admin: false }, { 'Set-Cookie': clearedSessionCookie(req) });
  }

  // ---------- Public: read-only data ----------
  if (method === 'GET' && pathname === '/api/buses') {
    const result = await runCppJson(['--action', 'list']);
    return sendJson(res, result.success === false && !result.buses ? 500 : 200, result);
  }

  if (method === 'GET' && pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    const type = url.searchParams.get('type') || 'point';
    const action = type === 'bus' ? 'search_bus' : 'search_point';
    const result = await runCppJson(['--action', action, '--query', q]);
    return sendJson(res, 200, result);
  }

  if (method === 'GET' && pathname === '/api/points') {
    const result = await runCppJson(['--action', 'get_points']);
    return sendJson(res, 200, result);
  }

  // ---------- Admin only: create / update / delete ----------
  if (method === 'POST' && pathname === '/api/buses') {
    requireAdmin(req);
    const record = buildBusRecord(await readJson(req));
    const result = await runCppJson(['--action', 'add_bus', '--data', record]);
    return sendJson(res, statusFromEngine(result, 201), result);
  }

  if ((method === 'PUT' || method === 'DELETE') && pathname.startsWith('/api/buses/')) {
    requireAdmin(req);

    let busNumber: string;
    try {
      busNumber = decodeURIComponent(pathname.slice('/api/buses/'.length));
    } catch {
      throw new HttpError(400, 'Invalid bus number', 'VALIDATION');
    }
    busNumber = validateBusNumber(busNumber);

    if (method === 'PUT') {
      const record = buildBusRecord(await readJson(req));
      const result = await runCppJson(['--action', 'update_bus', '--query', busNumber, '--data', record]);
      return sendJson(res, statusFromEngine(result), result);
    }

    const result = await runCppJson(['--action', 'delete_bus', '--query', busNumber]);
    return sendJson(res, statusFromEngine(result), result);
  }

  throw new HttpError(404, 'API route not found');
}

export function handleApiRequest(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) {
    return next();
  }

  route(req, res, pathname, url).catch((err: any) => {
    if (res.headersSent) return;
    if (err instanceof HttpError) {
      return sendJson(res, err.status, { success: false, error: err.message, message: err.message, code: err.code });
    }
    console.error('[api] unexpected error:', err);
    sendJson(res, 500, { success: false, error: 'Internal server error' });
  });
}
