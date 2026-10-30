import { describe, expect, it } from 'vitest';
import { assertServable, loadConfig } from './config.ts';

describe('assertServable', () => {
  it('allows the default passcode only in development', () => {
    expect(() => assertServable(loadConfig({ NODE_ENV: 'development' }))).not.toThrow();
    expect(() => assertServable(loadConfig({}))).toThrow(/STAFF_PASSCODE/);
    expect(() => assertServable(loadConfig({ NODE_ENV: 'production' }))).toThrow(/STAFF_PASSCODE/);
  });

  it('requires a passcode of at least 8 characters outside development', () => {
    expect(() => assertServable(loadConfig({ STAFF_PASSCODE: '1234' }))).toThrow();
    expect(() => assertServable(loadConfig({ STAFF_PASSCODE: 'brew-4821-latte' }))).not.toThrow();
  });
});

describe('loadConfig', () => {
  it('rejects an unknown time zone', () => {
    expect(() => loadConfig({ SHOP_TIMEZONE: 'Mars/Olympus' })).toThrow(/SHOP_TIMEZONE/);
    expect(loadConfig({ SHOP_TIMEZONE: 'Asia/Manila' }).timeZone).toBe('Asia/Manila');
  });
});
