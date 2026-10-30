import type { Menu, MenuItem, Order } from '@ordering/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, createOrder, fetchMenu, newIdempotencyKey } from './api.ts';
import type { CartLine } from './cart.ts';
import { CartBar, CartSheet } from './components/CartSheet.tsx';
import { ItemSheet } from './components/ItemSheet.tsx';
import { MenuView } from './components/MenuView.tsx';
import { OrderView } from './components/OrderView.tsx';
import { useStoredState } from './storage.ts';

function usePath() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to);
    setPath(to);
    scrollTo(0, 0);
  }, []);
  return [path, navigate] as const;
}

export function App() {
  const [path, navigate] = usePath();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [cart, setCart] = useStoredState<CartLine[]>('cart.v1', []);
  const [name, setName] = useStoredState('tableOrName.v1', '');
  // Reused on retry so a flaky network never creates two orders; cleared when the cart changes.
  const [pendingKey, setPendingKey] = useStoredState<string | null>('pendingOrderKey.v1', null);
  const [recentOrderId, setRecentOrderId] = useStoredState<string | null>('recentOrder.v1', null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadMenu = useCallback(() => {
    setMenuError(null);
    fetchMenu()
      .then(setMenu)
      .catch((e: unknown) => setMenuError(e instanceof Error ? e.message : 'Could not load the menu'));
  }, []);
  useEffect(loadMenu, [loadMenu]);

  const updateCart = (next: CartLine[]) => {
    setCart(next);
    setPendingKey(null);
    setSubmitError(null);
  };

  const placeOrder = async () => {
    const key = pendingKey ?? newIdempotencyKey();
    setPendingKey(key);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order: Order = await createOrder(
        {
          tableOrName: name.trim(),
          lines: cart.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            modifierIds: l.modifierIds,
            ...(l.notes.trim() ? { notes: l.notes.trim() } : {}),
          })),
        },
        key,
      );
      setCart([]);
      setPendingKey(null);
      setCartOpen(false);
      setRecentOrderId(order.id);
      navigate(`/order/${order.id}`);
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 400 || e.status === 422)) {
        // Rejected on validation, so nothing was created; a fresh key is fine next time.
        // Keep the key on 429, 5xx and network errors: the first attempt may have succeeded.
        setPendingKey(null);
        if (e.code === 'item_unavailable') loadMenu();
      }
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const orderMatch = /^\/order\/([^/]+)$/.exec(path);
  if (orderMatch?.[1]) {
    return <OrderView orderId={orderMatch[1]} onBack={() => navigate('/')} />;
  }

  return (
    <>
      <MenuView
        menu={menu}
        error={menuError}
        onRetry={loadMenu}
        onSelect={setSelected}
        recentOrderId={recentOrderId}
        onOpenOrder={(id) => navigate(`/order/${id}`)}
        onDismissOrder={() => setRecentOrderId(null)}
      />
      {menu && cart.length > 0 && !cartOpen && (
        <CartBar menu={menu} cart={cart} onOpen={() => setCartOpen(true)} />
      )}
      {selected && (
        <ItemSheet
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            updateCart([...cart, line]);
            setSelected(null);
          }}
        />
      )}
      {menu && cartOpen && (
        <CartSheet
          menu={menu}
          cart={cart}
          name={name}
          onNameChange={setName}
          onChange={updateCart}
          onClose={() => setCartOpen(false)}
          onSubmit={placeOrder}
          submitting={submitting}
          error={submitError}
        />
      )}
    </>
  );
}
