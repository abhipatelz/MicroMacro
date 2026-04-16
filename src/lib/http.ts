import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';

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

export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Validation failed', issues: e.issues }, { status: 400 });
  }
  console.error(e);
  const msg = e instanceof Error ? e.message : 'Internal error';
  return NextResponse.json({ error: msg }, { status: 500 });
}
