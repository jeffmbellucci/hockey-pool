import { afterEach, expect, test, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { api } from '@/lib/api';
const response = (status: number, data: unknown) => ({ ok: status === 200, status, json: async () => data }) as Response;
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

test('parallel expired requests share one refresh and a late 401 reuses the renewed token', async () => {
  localStorage.setItem('hockey_pool_token', 'expired');
  let finishRefresh!: (result: Response) => void;
  let finishLate!: (result: Response) => void;
  let refreshes = 0;
  vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit) => {
    if (url.endsWith('/auth/refresh-token')) {
      refreshes++;
      return new Promise(resolve => { finishRefresh = resolve; });
    }
    const token = (options.headers as Record<string, string>).Authorization;
    if (token === 'Bearer renewed') return Promise.resolve(response(200, { ok: true }));
    if (url.endsWith('/late')) return new Promise(resolve => { finishLate = resolve; });
    return Promise.resolve(response(401, { message: 'Expired' }));
  }));
  const first = api.get('/first');
  const second = api.get('/second');
  const late = api.get('/late');
  await waitFor(() => expect(refreshes).toBe(1));
  const manual = api.refreshToken();
  finishRefresh(response(200, { success: true, accessToken: 'renewed' }));
  await Promise.all([first, second, manual]);
  finishLate(response(401, { message: 'Expired' }));
  expect(await late).toEqual({ ok: true });
  expect(refreshes).toBe(1);
  expect(localStorage.getItem('hockey_pool_token')).toBe('renewed');
});
