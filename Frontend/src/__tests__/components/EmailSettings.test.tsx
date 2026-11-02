import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailSettings from '@/pages/EmailSettings';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: { getEmailSettings: vi.fn(), updateEmailSettings: vi.fn(), sendTestEmail: vi.fn(), checkMailjetConnection: vi.fn() } }));
const saved = { id: 1, enabled: false, delivery_disabled: true, credentials_configured: true, mailjet_api_key: '••••1234', mailjet_api_secret: '••••5678', from_email: 'sender@example.test', from_name: 'Pool', app_url: 'https://example.test', reminder_night_before_enabled: false, reminder_two_hours_enabled: true, reminder_night_before_time: '20:00:00' };
beforeEach(() => vi.resetAllMocks());

test('admin saves changes before sandbox testing and cannot send with server delivery disabled', async () => {
  vi.mocked(api.getEmailSettings).mockResolvedValue({ success: true, settings: saved });
  vi.mocked(api.updateEmailSettings).mockImplementation(async settings => ({ success: true, settings: { ...saved, ...settings } }));
  vi.mocked(api.sendTestEmail).mockResolvedValue({ success: true, message: 'No email sent.' });
  const user = userEvent.setup();
  render(<MemoryRouter><EmailSettings /></MemoryRouter>);
  await user.type(await screen.findByLabelText('Test recipient email'), 'recipient@example.test');
  expect(screen.getByRole('button', { name: 'Send Test' })).toBeDisabled();
  await user.type(screen.getByLabelText('From Name'), ' test');
  expect(screen.getByRole('button', { name: 'Check Configuration' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check Configuration' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Check Configuration' }));
  expect(api.sendTestEmail).toHaveBeenCalledWith('recipient@example.test', undefined, true);
  expect(screen.getByRole('button', { name: 'Send Test' })).toBeDisabled();
});

test('pausing works without keys and does not submit other unsaved fields', async () => {
  const empty = { ...saved, enabled: true, credentials_configured: false, mailjet_api_key: null, mailjet_api_secret: null };
  vi.mocked(api.getEmailSettings).mockResolvedValue({ success: true, settings: empty });
  vi.mocked(api.updateEmailSettings).mockResolvedValue({ success: true, settings: { ...empty, enabled: false } });
  const user = userEvent.setup();
  render(<MemoryRouter><EmailSettings /></MemoryRouter>);
  await user.clear(await screen.findByLabelText('Application URL'));
  await user.click(screen.getByRole('button', { name: 'Pause automated emails' }));
  expect(api.updateEmailSettings).toHaveBeenCalledWith({ enabled: false });
  expect(await screen.findByText('Paused', { selector: '[data-slot="badge"], div, span' })).toBeInTheDocument();
  expect(screen.getByLabelText('Application URL')).toHaveValue('');
});

test('checking a connection keeps automation paused and enables a separate opt-in', async () => {
  vi.mocked(api.getEmailSettings).mockResolvedValue({ success: true, settings: { ...saved, delivery_disabled: false } });
  vi.mocked(api.checkMailjetConnection).mockResolvedValue({ success: true, connection: { connected: true, sender_verified: true, sender_email: 'sender@example.test' } });
  vi.mocked(api.updateEmailSettings).mockResolvedValue({ success: true, settings: { ...saved, delivery_disabled: false, enabled: true } });
  const user = userEvent.setup();
  render(<MemoryRouter><EmailSettings /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'Enable automated emails' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check Mailjet connection' }));
  await screen.findByText('Mailjet connected');
  expect(api.updateEmailSettings).not.toHaveBeenCalled();
  expect(api.sendTestEmail).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Enable automated emails' }));
  expect(api.updateEmailSettings).toHaveBeenCalledWith({ enabled: true });
});
