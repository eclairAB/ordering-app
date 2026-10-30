import { useState, type FormEvent } from 'react';
import { login } from '../api.ts';

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(passcode);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setPasscode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center">
      <form className="login" onSubmit={submit}>
        <h1>Staff login</h1>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button className="button button-primary" disabled={busy || !passcode}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
