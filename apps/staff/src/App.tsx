import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, checkSession, logout } from './api.ts';
import { Kitchen } from './components/Kitchen.tsx';
import { Login } from './components/Login.tsx';
import { MenuAdmin } from './components/MenuAdmin.tsx';

type Session = 'checking' | 'in' | 'out';

const VIEWS = [
  { path: '/staff/kitchen', label: 'Kitchen' },
  { path: '/staff/menu', label: 'Menu' },
] as const;

function currentView(): string {
  return VIEWS.some((v) => v.path === location.pathname) ? location.pathname : '/staff/kitchen';
}

export function App() {
  const [session, setSession] = useState<Session>('checking');
  const [view, setView] = useState(currentView);

  const recheck = useCallback(() => {
    checkSession()
      .then(() => setSession('in'))
      .catch((e: unknown) => setSession(e instanceof ApiRequestError && e.status === 401 ? 'out' : 'in'));
  }, []);
  useEffect(recheck, [recheck]);

  useEffect(() => {
    const onPop = () => setView(currentView());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = (path: string) => {
    history.pushState(null, '', path);
    setView(path);
  };

  if (session === 'checking') return <main className="center muted">Connecting…</main>;
  if (session === 'out') return <Login onLoggedIn={() => setSession('in')} />;

  return (
    <div className="shell">
      <header className="topbar">
        <strong>☕ Orders</strong>
        <nav>
          {VIEWS.map((v) => (
            <button key={v.path} className={`tab ${view === v.path ? 'tab-active' : ''}`} onClick={() => go(v.path)}>
              {v.label}
            </button>
          ))}
        </nav>
        <button className="tab" onClick={() => void logout().finally(() => setSession('out'))}>
          Log out
        </button>
      </header>
      {view === '/staff/menu' ? <MenuAdmin onUnauthorized={recheck} /> : <Kitchen onUnauthorized={recheck} />}
    </div>
  );
}
