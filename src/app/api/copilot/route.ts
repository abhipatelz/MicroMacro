import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { streamCopilotReply, type ChatMsg } from '@/lib/ai/copilotLLM';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { error } = await requireUser(req);
  if (error) return error;

  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages: ChatMsg[] = body.messages ?? [];
  if (!messages.length) return Response.json({ error: 'No messages' }, { status: 400 });

  // Detect task context from the seed message — page.tsx prefixes these with
  // "I'm working on a <type>: ..."  This lets the LLM tailor its tone.
  const firstUser = messages.find(m => m.role === 'user')?.content ?? '';
  const hasTaskContext = /^i'?m working on (?:a|an) [a-z ]+:/i.test(firstUser);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamCopilotReply({ messages, hasTaskContext })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        // Surface a friendly message if the whole pipeline blew up
        const msg = '\n\n*The Copilot hit an error mid-response. Please try again, or rephrase your question.*';
        controller.enqueue(encoder.encode(msg));
        // eslint-disable-next-line no-console
        console.error('[copilot stream]', e);
      } finally {
        controller.close();
      }
    },
  });

  const mode = process.env.GEMINI_API_KEY ? 'llm' : 'kb';
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Copilot-Mode': mode,
    },
  });
}
