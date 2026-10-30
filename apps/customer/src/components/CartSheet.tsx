import type { Menu } from '@ordering/shared';
import { addCentavos, formatCentavos } from '@ordering/shared/money';
import { resolveCart, type CartLine } from '../cart.ts';
import { Sheet } from './Sheet.tsx';

export function CartBar({ menu, cart, onOpen }: { menu: Menu; cart: CartLine[]; onOpen: () => void }) {
  const lines = resolveCart(cart, menu);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  return (
    <button className="cart-bar" onClick={onOpen}>
      <span className="cart-count">{count}</span>
      <span>View order</span>
      <span>{formatCentavos(addCentavos(...lines.map((l) => l.totalCentavos)))}</span>
    </button>
  );
}

interface Props {
  menu: Menu;
  cart: CartLine[];
  name: string;
  onNameChange: (name: string) => void;
  onChange: (cart: CartLine[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

export function CartSheet({ menu, cart, name, onNameChange, onChange, onClose, onSubmit, submitting, error }: Props) {
  const lines = resolveCart(cart, menu);
  const total = addCentavos(...lines.map((l) => l.totalCentavos));
  const unavailable = lines.filter((l) => !l.item.available);

  const setQty = (id: string, qty: number) =>
    onChange(qty <= 0 ? cart.filter((l) => l.id !== id) : cart.map((l) => (l.id === id ? { ...l, qty } : l)));

  return (
    <Sheet label="Your order" onClose={onClose}>
      <div className="sheet-body">
        <h2>Your order</h2>
        <ul className="cart-lines">
          {lines.map(({ line, item, modifiers, totalCentavos }) => (
            <li key={line.id} className={item.available ? '' : 'line-unavailable'}>
              <div className="grow">
                <strong>{item.name}</strong>
                {modifiers.length > 0 && <div className="muted small">{modifiers.map((m) => m.name).join(', ')}</div>}
                {line.notes && <div className="muted small">“{line.notes}”</div>}
                {!item.available && <div className="error small">Sold out, please remove</div>}
              </div>
              <div className="stepper small">
                <button className="icon-button" onClick={() => setQty(line.id, line.qty - 1)} aria-label="Fewer">
                  −
                </button>
                <span>{line.qty}</span>
                <button className="icon-button" onClick={() => setQty(line.id, line.qty + 1)} aria-label="More">
                  +
                </button>
              </div>
              <span className="line-total">{formatCentavos(totalCentavos)}</span>
            </li>
          ))}
        </ul>

        <div className="total-row">
          <span>Total</span>
          <strong>{formatCentavos(total)}</strong>
        </div>

        <label className="field">
          <span>Table number or your name</span>
          <input
            value={name}
            maxLength={40}
            placeholder="e.g. Table 4 or Ana"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      <footer className="sheet-footer">
        <button
          className="button button-primary grow"
          disabled={submitting || cart.length === 0 || !name.trim() || unavailable.length > 0}
          onClick={onSubmit}
        >
          {submitting ? 'Placing order…' : `Place order · ${formatCentavos(total)}`}
        </button>
      </footer>
      <p className="muted small center-text pay-note">Pay at the counter when you pick up.</p>
    </Sheet>
  );
}
