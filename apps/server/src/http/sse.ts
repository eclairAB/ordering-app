import type { FastifyReply, FastifyRequest } from 'fastify';

const HEARTBEAT_MS = 25_000;

export interface SseStream {
  send(event: string, data: unknown): void;
  onClose(listener: () => void): void;
  /** End the stream from the server side. */
  close(): void;
}

/** Take over the response and turn it into a Server-Sent Events stream. */
export function openSse(request: FastifyRequest, reply: FastifyReply): SseStream {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  request.raw.on('close', () => clearInterval(heartbeat));

  return {
    send(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    onClose(listener) {
      request.raw.on('close', listener);
    },
    close() {
      res.end();
    },
  };
}
