import type { ApiError, Menu, MenuItem, Order, OrderStatus } from '@ordering/shared';

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
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json' } : {},
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Server unreachable. Is the ordering box on?');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as Partial<ApiError> | null)?.error;
    throw new ApiRequestError(res.status, error?.code ?? 'internal', error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const checkSession = () => request<{ ok: true }>('/api/staff/me');
export const login = (passcode: string) => request<{ ok: true }>('/api/staff/login', json('POST', { passcode }));
export const logout = () => request<{ ok: true }>('/api/staff/logout', { method: 'POST' });
export const fetchMenu = () => request<Menu>('/api/staff/menu');
export const setAvailability = (id: number, available: boolean) =>
  request<MenuItem>(`/api/staff/menu/items/${id}`, json('PATCH', { available }));
export const transitionOrder = (id: string, from: OrderStatus, to: OrderStatus) =>
  request<Order>(`/api/staff/orders/${id}/transition`, json('POST', { from, to }));

export interface OrderStreamHandlers {
  onSnapshot: (orders: Order[]) => void;
  onOrder: (order: Order) => void;
  onConnectionChange: (connected: boolean) => void;
}

/** Live order feed for the kitchen. EventSource reconnects by itself; a fresh snapshot arrives each time. */
export function subscribeToOrders({ onSnapshot, onOrder, onConnectionChange }: OrderStreamHandlers): () => void {
  const source = new EventSource('/api/staff/events');
  source.addEventListener('open', () => onConnectionChange(true));
  source.addEventListener('error', () => onConnectionChange(false));
  source.addEventListener('snapshot', (e) => onSnapshot(JSON.parse((e as MessageEvent<string>).data) as Order[]));
  source.addEventListener('order', (e) => onOrder(JSON.parse((e as MessageEvent<string>).data) as Order));
  return () => source.close();
}
