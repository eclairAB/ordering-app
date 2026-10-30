import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { onRequestAsyncHookHandler } from 'fastify';
import type { DB } from '../db/connection.ts';
import { readCookie } from '../http/cookies.ts';
import { HttpError } from '../http/errors.ts';

export const SESSION_COOKIE = 'staff_session';
export const SESSION_TTL_S = 12 * 60 * 60; // one shift

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export interface StaffAuth {
  checkPasscode(candidate: string): boolean;
  /** Returns the raw token for the cookie; only its hash is stored. */
  createSession(): string;
  isValid(token: string | undefined): boolean;
  revoke(token: string | undefined): void;
  requireStaff: onRequestAsyncHookHandler;
}

export function createStaffAuth(db: DB, passcode: string): StaffAuth {
  const expected = sha256(passcode);
  const insert = db.prepare('INSERT INTO staff_session (token_hash, created_at, expires_at) VALUES (?, ?, ?)');
  const find = db.prepare<[string, string], { token_hash: string }>(
    'SELECT token_hash FROM staff_session WHERE token_hash = ? AND expires_at > ?',
  );
  const remove = db.prepare<[string]>('DELETE FROM staff_session WHERE token_hash = ?');
  const purgeExpired = db.prepare<[string]>('DELETE FROM staff_session WHERE expires_at <= ?');

  const isValid = (token: string | undefined): boolean =>
    token !== undefined && find.get(sha256(token).toString('hex'), new Date().toISOString()) !== undefined;

  return {
    checkPasscode: (candidate) => timingSafeEqual(sha256(candidate), expected),
    createSession() {
      const now = new Date();
      purgeExpired.run(now.toISOString());
      const token = randomBytes(32).toString('base64url');
      const expires = new Date(now.getTime() + SESSION_TTL_S * 1000);
      insert.run(sha256(token).toString('hex'), now.toISOString(), expires.toISOString());
      return token;
    },
    isValid,
    revoke(token) {
      if (token) remove.run(sha256(token).toString('hex'));
    },
    async requireStaff(request) {
      if (!isValid(readCookie(request.headers.cookie, SESSION_COOKIE))) {
        throw new HttpError(401, 'unauthorized', 'Staff login required');
      }
    },
  };
}
