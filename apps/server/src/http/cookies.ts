export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeS: number;
  path?: string;
}

/**
 * HttpOnly + SameSite=Strict. No `Secure` flag: the shop LAN serves plain HTTP.
 */
export function serializeCookie(name: string, value: string, { maxAgeS, path = '/' }: CookieOptions): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeS}; HttpOnly; SameSite=Strict`;
}
