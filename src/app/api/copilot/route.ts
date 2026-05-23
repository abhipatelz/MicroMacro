import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { streamCopilotReply, type ChatMsg, type StreamMeta } from '@/lib/ai/copilotLLM';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const Body = z.object({
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    // Cap per-message length so a single request can't blow the LLM
    // context (and the bill) with megabytes of text.
    content: z.string().min(1).max(8_000),
  })).min(1).max(40),
});

export async function POST(req: NextRequest) {
  const { error, user } = await requireUser(req);
  if (error) return error;

  // Per-user throttle — the LLM call costs real money and is the most
  // abuse-prone endpoint in the app.
  if (!rateLimit(`copilot:${user!.sub}`, 30, 60_000)) {
    return Response.json({ error: 'Slow down — too many copilot messages per minute.' }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
  }
  const messages: ChatMsg[] = parsed.data.messages;

  const firstUser = messages.find(m => m.role === 'user')?.content ?? '';
  const hasTaskContext = /^i'?m working on (?:a|an) [a-z ]+:/i.test(firstUser);

  // Mode decision is finalised inside the streamer (LLM may try and fail).
  // We *attempt* mode based on whether a key is present and let the streamer
  // overwrite it via the meta object as it executes. Headers must be sent
  // BEFORE the body, so we expose actual outcome via a leading control line.
  const attemptedMode = process.env.GEMINI_API_KEY ? 'llm-attempt' : 'kb';
  const meta: StreamMeta = { finalMode: 'kb', errors: [] };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamCopilotReply({ messages, hasTaskContext }, meta)) {
          controller.enqueue(encoder.encode(chunk));
        }
        // Append a trailing control sentinel the client parses out — this is
        // how the badge ("Live AI" vs "KB mode") learns the *actual* outcome.
        const trailer = `\n<!--PRAGATI-META:${JSON.stringify({
          mode: meta.finalMode,
          model: meta.modelUsed,
          errors: meta.errors,
        })}-->`;
        controller.enqueue(encoder.encode(trailer));
      } catch (e) {
        const msg = '\n\n*The Copilot hit an error mid-response. Please try again, or rephrase your question.*';
        controller.enqueue(encoder.encode(msg));
        // eslint-disable-next-line no-console
        console.error('[copilot stream]', e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Copilot-Mode': attemptedMode,
    },
  });
}
