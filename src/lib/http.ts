import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import { captureError } from '@/lib/errorMonitor';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function readBody<T>(req: Request, schema?: ZodSchema<T>): Promise<T> {
  const raw = await req.json().catch(() => ({}));
  if (!schema) return raw as T;
  return schema.parse(raw);
}

// Infrastructure / config errors that must never leak raw details to users
const INFRA_PATTERNS = [
  /MONGODB_URI/i,
  /USE_IN_MEMORY_MONGO/i,
  /mongo/i,
  /jwt_secret/i,
  /ECONNREFUSED/i,
  /getaddrinfo/i,
  /ETIMEDOUT/i,
  /connect ETIMEOUT/i,
];

function isInfraError(msg: string) {
  return INFRA_PATTERNS.some((re) => re.test(msg));
}

// Next.js uses thrown errors as control flow: redirect(), notFound(), and the
// DynamicServerError it raises to bail out of static rendering all surface as
// exceptions carrying a `digest`. These are NOT failures — they must propagate
// to Next untouched, never get logged to the error monitor, and never become a
// 500. Swallowing the DynamicServerError was flooding the admin monitor with
// bogus "Dynamic server usage" entries.
function isNextControlFlow(e: unknown): boolean {
  const digest = (e as any)?.digest;
  return (
    typeof digest === 'string' &&
    (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))
  );
}

export function handleError(e: unknown) {
  if (isNextControlFlow(e)) throw e;
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Validation failed', issues: e.issues }, { status: 400 });
  }
  console.error('[handleError]', e);
  const raw = e instanceof Error ? e.message : 'Internal error';

  // Capture for admin monitoring (best-effort, non-blocking, never throws).
  void captureError({
    source: 'server',
    message: raw,
    stack: e instanceof Error ? e.stack : undefined,
    statusCode: 500,
  });

  const userMsg = isInfraError(raw)
    ? 'The service is temporarily unavailable. Please try again in a moment or contact your administrator.'
    : raw;

  return NextResponse.json({ error: userMsg }, { status: 500 });
}
