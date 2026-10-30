import type { Menu } from '@ordering/shared';
import { formatCentavos } from '@ordering/shared/money';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, fetchMenu, setAvailability } from '../api.ts';

export function MenuAdmin({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 401) onUnauthorized();
      setError(e instanceof Error ? e.message : 'Request failed');
    },
    [onUnauthorized],
  );

  useEffect(() => {
    fetchMenu().then(setMenu).catch(handle);
  }, [handle]);

  const toggle = async (id: number, available: boolean) => {
    setError(null);
    try {
      const updated = await setAvailability(id, available);
      setMenu((m) => m && { ...m, items: m.items.map((i) => (i.id === id ? updated : i)) });
    } catch (e) {
      handle(e);
    }
  };

  if (!menu) return <main className="center muted">{error ?? 'Loading menu…'}</main>;

  return (
    <main className="menu-admin">
      <p className="muted">Mark items sold out. Customers see the change on their next menu load.</p>
      {error && <p className="error">{error}</p>}
      {menu.categories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {menu.items
              .filter((i) => i.categoryId === category.id)
              .map((item) => (
                <li key={item.id} className={item.available ? '' : 'sold-out'}>
                  {item.imageUrl && <img src={item.imageUrl} alt="" />}
                  <span className="grow">
                    <strong>{item.name}</strong>
                    <span className="muted"> · {formatCentavos(item.priceCentavos)}</span>
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={item.available}
                      onChange={(e) => void toggle(item.id, e.target.checked)}
                    />
                    <span>{item.available ? 'Available' : 'Sold out'}</span>
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
