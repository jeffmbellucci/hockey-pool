import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import Chat from '@/pages/Chat';
import { api } from '@/lib/api';

const { socket, handlers, user } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  user: { id: 7, name: 'Player' },
  socket: { on: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), timeout: vi.fn(), emit: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), refreshToken: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_API_URL', 'http://localhost:4001/api');
  Element.prototype.scrollIntoView = vi.fn();
  socket.on.mockImplementation((event, handler) => { handlers[event] = handler; return socket; });
  socket.timeout.mockReturnValue(socket);
  vi.mocked(api.get).mockResolvedValue({ success: true, messages: [] });
  vi.mocked(api.refreshToken).mockResolvedValue({ success: true, accessToken: 'renewed' });
});

test('failed sends retain the draft, reconnect renews the session, and only an acknowledgment clears it', async () => {
  render(<Chat />);
  await waitFor(() => expect(handlers.connect).toBeDefined());
  act(() => handlers.connect());
  const input = screen.getByRole('textbox', { name: 'Chat message' });
  fireEvent.change(input, { target: { value: 'Keep this draft' } });
  socket.emit.mockImplementation((event, data, acknowledge) => acknowledge(null, { success: false, message: 'Session expired' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(input).toHaveValue('Keep this draft');
  act(() => handlers.disconnect());
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  await waitFor(() => expect(socket.connect).toHaveBeenCalled());
  expect(api.refreshToken).toHaveBeenCalledOnce();
  act(() => handlers.connect());
  socket.emit.mockImplementation((event, data, acknowledge) => acknowledge(null, { success: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(input).toHaveValue('');
});
