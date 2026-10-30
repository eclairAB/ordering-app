import type { Order, OrderStatus } from '@ordering/shared';
import { canTransition, isTerminalStatus } from '@ordering/shared/order-status';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, checkSession, subscribeToOrders, transitionOrder } from '../api.ts';
import { chime } from '../chime.ts';

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'placed', title: 'New' },
  { status: 'accepted', title: 'Accepted' },
  { status: 'preparing', title: 'Preparing' },
  { status: 'ready', title: 'Ready for pickup' },
];

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: 'accepted', label: 'Accept' },
  accepted: { to: 'preparing', label: 'Start' },
  preparing: { to: 'ready', label: 'Ready' },
  ready: { to: 'completed', label: 'Picked up' },
};

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

export function Kitchen({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [orders, setOrders] = useState<Map<string, Order>>(new Map());
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(
    () =>
      subscribeToOrders({
        onSnapshot: (list) => {
          seen.current = new Set(list.map((o) => o.id));
          setOrders(new Map(list.map((o) => [o.id, o])));
        },
        onOrder: (order) => {
          if (seen.current && !seen.current.has(order.id)) {
            seen.current.add(order.id);
            chime();
          }
          setOrders((prev) => {
            const next = new Map(prev);
            if (isTerminalStatus(order.status)) next.delete(order.id);
            else next.set(order.id, order);
            return next;
          });
        },
        onConnectionChange: (ok) => {
          setConnected(ok);
          // EventSource hides the HTTP status, so check whether the session expired.
          if (!ok) checkSession().catch((e: unknown) => e instanceof ApiRequestError && e.status === 401 && onUnauthorized());
        },
      }),
    [onUnauthorized],
  );

  const move = async (order: Order, to: OrderStatus) => {
    setNotice(null);
    try {
      await transitionOrder(order.id, order.status, to);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onUnauthorized();
      setNotice(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const all = [...orders.values()];

  return (
    <main className="kitchen">
      {!connected && <div className="offline">Reconnecting to the server…</div>}
      {notice && (
        <div className="notice" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <div className="board">
        {COLUMNS.map((col) => {
          const inColumn = all.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className={`column column-${col.status}`}>
              <h2>
                {col.title} <span className="count">{inColumn.length}</span>
              </h2>
              {inColumn.map((order) => {
                const mins = minutesSince(order.createdAt, now);
                const next = NEXT[order.status];
                return (
                  <article key={order.id} className={`ticket ${mins >= 10 ? 'ticket-late' : ''}`}>
                    <header>
                      <span className="ticket-number">#{order.number}</span>
                      <span className="ticket-name">{order.tableOrName}</span>
                      <span className="ticket-age">{mins}m</span>
                    </header>
                    <ul>
                      {order.lines.map((line) => (
                        <li key={line.id}>
                          <strong>{line.qty}×</strong> {line.nameSnapshot}
                          {line.modifiers.length > 0 && (
                            <div className="mods">{line.modifiers.map((m) => m.nameSnapshot).join(' · ')}</div>
                          )}
                          {line.notes && <div className="notes">“{line.notes}”</div>}
                        </li>
                      ))}
                    </ul>
                    <footer>
                      {canTransition(order.status, 'cancelled') && (
                        <button
                          className="button button-ghost"
                          onClick={() => confirm(`Cancel order #${order.number}?`) && void move(order, 'cancelled')}
                        >
                          Cancel
                        </button>
                      )}
                      {next && (
                        <button className="button button-primary grow" onClick={() => void move(order, next.to)}>
                          {next.label}
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
