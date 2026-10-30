import type { Order, OrderStatus } from '@ordering/shared';
import { formatCentavos, lineTotalCentavos } from '@ordering/shared/money';
import { useEffect, useState } from 'react';
import { fetchOrder, subscribeToOrder } from '../api.ts';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Received' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
];

const HEADLINE: Record<OrderStatus, string> = {
  placed: "We've got your order",
  accepted: 'Order accepted',
  preparing: "We're making it now",
  ready: 'Ready! Come to the counter',
  completed: 'Enjoy!',
  cancelled: 'This order was cancelled',
};

export function OrderView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder(orderId)
      .then(setOrder)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load order'));
    return subscribeToOrder(orderId, setOrder);
  }, [orderId]);

  useEffect(() => {
    if (order?.status === 'ready' && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, [order?.status]);

  if (error && !order) {
    return (
      <main className="center">
        <p>{error}</p>
        <button className="button" onClick={onBack}>
          Back to menu
        </button>
      </main>
    );
  }
  if (!order) return <main className="center muted">Loading order…</main>;

  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const done = order.status === 'completed';

  return (
    <main className={`order-view status-${order.status}`}>
      <button className="link" onClick={onBack}>
        ← Menu
      </button>
      <p className="muted">Your order number</p>
      <div className="order-number">#{order.number}</div>
      <h1>{HEADLINE[order.status]}</h1>

      {order.status !== 'cancelled' && (
        <ol className="progress">
          {STEPS.map((step, i) => (
            <li key={step.status} className={done || i <= stepIndex ? 'progress-done' : ''}>
              {step.label}
            </li>
          ))}
        </ol>
      )}

      <section className="receipt">
        <h2>{order.tableOrName}</h2>
        <ul>
          {order.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.qty}× {line.nameSnapshot}
                {line.modifiers.length > 0 && (
                  <span className="muted small"> · {line.modifiers.map((m) => m.nameSnapshot).join(', ')}</span>
                )}
              </span>
              <span>
                {formatCentavos(
                  lineTotalCentavos({
                    unitPriceCentavos: line.unitPriceSnapshot,
                    modifierDeltasCentavos: line.modifiers.map((m) => m.priceDeltaSnapshot),
                    qty: line.qty,
                  }),
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="total-row">
          <span>Total</span>
          <strong>{formatCentavos(order.totalCentavos)}</strong>
        </div>
        <p className="muted small">Keep this page open. It updates live.</p>
      </section>
    </main>
  );
}
