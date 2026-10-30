import type { ApiError, CreateOrderBody, Menu, Order } from '@ordering/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError(0, 'network', "Can't reach the counter. Check you're on the shop Wi-Fi and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as Partial<ApiError> | null)?.error;
    throw new ApiRequestError(res.status, error?.code ?? 'internal', error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const fetchMenu = () => request<Menu>('/api/menu');

export const fetchOrder = (id: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}`);

export const createOrder = (body: CreateOrderBody, idempotencyKey: string) =>
  request<Order>('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });

/** Live status updates. Returns a function that closes the stream. */
export function subscribeToOrder(id: string, onOrder: (order: Order) => void): () => void {
  const source = new EventSource(`/api/orders/${encodeURIComponent(id)}/events`);
  source.addEventListener('order', (event) => onOrder(JSON.parse((event as MessageEvent<string>).data) as Order));
  return () => source.close();
}

/**
 * Random key for the Idempotency-Key header. Uses getRandomValues rather than
 * crypto.randomUUID, which browsers only expose on HTTPS, and the shop LAN is plain HTTP.
 */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
