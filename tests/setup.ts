import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// rls.test.ts runs in the node environment; everything else runs in jsdom.
const browser = typeof window !== 'undefined';

beforeEach(() => {
  if (!browser) return;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => cleanup());

// Browser APIs jsdom does not provide.
if (browser) {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  URL.createObjectURL ??= vi.fn(() => 'blob:test');
  URL.revokeObjectURL ??= vi.fn();
}
