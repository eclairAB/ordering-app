import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  dbPath: string;
  imagesDir: string;
  staffPasscode: string;
  /** IANA zone for the business day (order numbers reset at local midnight). */
  timeZone: string;
  customerDistDir: string;
  staffDistDir: string;
  production: boolean;
  development: boolean;
}

const DEFAULT_PASSCODE = 'change-me';
const MIN_PASSCODE_LENGTH = 8;

function appDist(app: string): string {
  return fileURLToPath(new URL(`../../${app}/dist/`, import.meta.url));
}

/**
 * Call before serving traffic; CLI tools (migrate, seed) don't need a passcode.
 * Outside NODE_ENV=development the default or a short passcode is refused, because
 * anyone on the customer Wi-Fi can reach the staff login.
 */
export function assertServable(config: Config): void {
  if (config.development) return;
  if (config.staffPasscode === DEFAULT_PASSCODE || config.staffPasscode.length < MIN_PASSCODE_LENGTH) {
    throw new Error(
      `Set STAFF_PASSCODE (at least ${MIN_PASSCODE_LENGTH} characters, not "${DEFAULT_PASSCODE}") before serving.`,
    );
  }
}

function validTimeZone(zone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    throw new Error(`Invalid SHOP_TIMEZONE: ${zone}`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const staffPasscode = env.STAFF_PASSCODE ?? DEFAULT_PASSCODE;

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${String(env.PORT)}`);
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dbPath: env.DB_PATH ?? './data/shop.db',
    imagesDir: env.IMAGES_DIR ?? './data/images',
    staffPasscode,
    timeZone: validTimeZone(env.SHOP_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
    customerDistDir: env.CUSTOMER_DIST_DIR ?? appDist('customer'),
    staffDistDir: env.STAFF_DIST_DIR ?? appDist('staff'),
    production,
    development: env.NODE_ENV === 'development',
  };
}
