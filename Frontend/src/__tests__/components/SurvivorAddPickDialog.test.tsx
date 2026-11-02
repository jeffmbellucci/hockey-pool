import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SurvivorAddPickDialog } from '@/components/admin/SurvivorAddPickDialog';
import { SurvivorContestTab } from '@/components/admin/SurvivorContestTab';
const people = [
  { id: 11, user_id: 1, participant_name: 'Already entered', email: 'one@example.test', is_eliminated: false },
  { id: 12, user_id: 2, participant_name: 'Jeff', email: 'jeff@example.test', is_eliminated: false },
  { id: 13, user_id: 3, participant_name: 'Eliminated', email: 'three@example.test', is_eliminated: true },
];
let participantResponse: unknown;
let postError: string | null;
let savedBody: unknown;
const fetchMock = vi.fn();
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('PointerEvent', MouseEvent);
  participantResponse = people; postError = null; savedBody = null;
  const contest = { contest_id: 7, contest_name: 'Trial', current_week: 2, status: 'in_progress', phase: 'regular_season' };
  fetchMock.mockImplementation(async (url: string, options: RequestInit = {}) => {
    const path = new URL(url).pathname.replace(/^\/api/, '');
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (path === '/admin/survivor/contests/7/picks' && options.method === 'POST') {
      savedBody = JSON.parse(options.body as string);
      return postError ? respond({ message: postError }, 400) : respond({ success: true }, 201);
    }
    // Match actual HTTP response shapes: contest details have no participant list.
    if (path === '/survivor/contests') return respond([contest]);
    if (path === '/survivor/contests/7') return respond(contest);
    if (path === '/survivor/contests/7/participants') return respond(participantResponse);
    if (path === '/survivor/contests/7/weeks') return respond([
      { week_number: 1, start_date: '2026-10-05', end_date: '2026-10-11' },
      { week_number: 2, start_date: '2026-10-12', end_date: '2026-10-18' },
    ]);
    if (path === '/contest/teams') return respond([{ team_id: 10, team_name: 'Utah Mammoth' }]);
    if (path === '/admin/survivor/contests/7/picks') return respond({ picks: [{ user_id: 1 }] });
    throw new Error(`Unexpected API request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
const show = () => render(<SurvivorAddPickDialog contest={{ contest_id: 7, contest_name: 'Trial', current_week: 2 }} onClose={vi.fn()} />);
async function fill() {
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText('Participant without a pick'));
  expect(screen.queryByRole('option', { name: /Already entered|Eliminated/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('option', { name: /Jeff/ }));
  await user.click(screen.getByLabelText('Picked team'));
  await user.click(screen.getByRole('option', { name: 'Utah Mammoth' }));
  fireEvent.change(screen.getByLabelText(/Original submission time/), { target: { value: '2026-10-12T10:30' } });
  return user;
}
test('adds only a missing pick with the original timestamp, then removes that participant from the list', async () => {
  show();
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Add Pick' }));
  await waitFor(() => expect(savedBody).toEqual({
    user_id: 2, week_number: 2, team_id: 10, submitted_at: new Date('2026-10-12T10:30').toISOString(),
  }));
  expect(await screen.findByText('Pick added for Jeff, Week 2.')).toBeInTheDocument();
  expect(screen.getByText('All remaining participants have a pick for this week.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Pick' })).toBeDisabled();
});
test('keeps the emailed pick available for correction after a rejected team', async () => {
  postError = 'You have already used UTA in this contest';
  show();
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Add Pick' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already used UTA');
  expect(screen.getByLabelText(/Original submission time/)).toHaveValue('2026-10-12T10:30');
  expect(screen.getByRole('button', { name: 'Add Pick' })).toBeEnabled();
});

test('a malformed participant response shows a retryable error rather than an empty roster', async () => {
  participantResponse = { participants: people };
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load participants');
  expect(screen.queryByText('All remaining participants have a pick for this week.')).not.toBeInTheDocument();
  participantResponse = people;
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByLabelText('Participant without a pick')).toBeInTheDocument();
});

test('Manage Participants loads the roster from the participants endpoint', async () => {
  render(<SurvivorContestTab currentWeek={2} survivorAlive={2} />);
  await userEvent.click(await screen.findByRole('button', { name: /Manage Participants/ }));
  expect(await screen.findByText('jeff@example.test')).toBeInTheDocument();
  expect(screen.getByText('Jeff')).toBeInTheDocument();
});
