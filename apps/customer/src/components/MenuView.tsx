import type { Menu, MenuItem } from '@ordering/shared';
import { formatCentavos } from '@ordering/shared/money';
import { useState } from 'react';

interface Props {
  menu: Menu | null;
  error: string | null;
  onRetry: () => void;
  onSelect: (item: MenuItem) => void;
  recentOrderId: string | null;
  onOpenOrder: (id: string) => void;
  onDismissOrder: () => void;
}

export function MenuView({ menu, error, onRetry, onSelect, recentOrderId, onOpenOrder, onDismissOrder }: Props) {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  if (error) {
    return (
      <main className="center">
        <p>{error}</p>
        <button className="button" onClick={onRetry}>
          Try again
        </button>
      </main>
    );
  }
  if (!menu) return <main className="center muted">Loading menu…</main>;

  const jumpTo = (id: number) => {
    setActiveCategory(id);
    document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="menu">
      <header className="menu-header">
        <h1>What would you like?</h1>
        <p className="muted">Order here, we'll call your number when it's ready.</p>
      </header>

      {recentOrderId && (
        <div className="banner">
          <button className="banner-link" onClick={() => onOpenOrder(recentOrderId)}>
            View your order status →
          </button>
          <button className="icon-button" aria-label="Dismiss" onClick={onDismissOrder}>
            ×
          </button>
        </div>
      )}

      <nav className="category-tabs" aria-label="Categories">
        {menu.categories.map((c) => (
          <button
            key={c.id}
            className={`chip ${activeCategory === c.id ? 'chip-active' : ''}`}
            onClick={() => jumpTo(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>

      {menu.categories.map((category) => (
        <section key={category.id} id={`category-${category.id}`} className="category">
          <h2>{category.name}</h2>
          <div className="item-grid">
            {menu.items
              .filter((i) => i.categoryId === category.id)
              .map((item) => (
                <button
                  key={item.id}
                  className="item-card"
                  disabled={!item.available}
                  onClick={() => onSelect(item)}
                >
                  {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}
                  <span className="item-name">{item.name}</span>
                  <span className="item-price">
                    {item.available ? formatCentavos(item.priceCentavos) : 'Sold out'}
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}
