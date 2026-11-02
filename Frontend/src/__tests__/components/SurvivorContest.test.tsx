import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import SurvivorContest from '@/pages/SurvivorContest';
import { api } from '@/lib/api';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, name: 'Player' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ api: {
  getSurvivorContests: vi.fn(), getSurvivorStandings: vi.fn(), getSurvivorMyStatus: vi.fn(),
  getSurvivorWeeks: vi.fn(), get: vi.fn(), getSurvivorMyPicks: vi.fn(),
  getSurvivorLockStatus: vi.fn(), getSurvivorWeekPicks: vi.fn(), getSurvivorWeekSchedule: vi.fn(),
  submitSurvivorPick: vi.fn(),
} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getSurvivorContests).mockResolvedValue([
    { contest_id: 10, contest_name: 'Survivor', current_week: 1, status: 'in_progress', phase: 'regular_season' },
  ]);
  vi.mocked(api.getSurvivorStandings).mockResolvedValue({ participants: [], active_participants: 2 });
  vi.mocked(api.getSurvivorMyStatus).mockResolvedValue({ is_participant: true, is_eliminated: false });
  vi.mocked(api.getSurvivorWeeks).mockResolvedValue([{ week_number: 1 }, { week_number: 2 }]);
  vi.mocked(api.get).mockResolvedValue({ available_teams: [
    { team_id: 1, abbreviation: 'TOR', team_name: 'Toronto', games_this_week: 3, is_available: true },
  ], used_teams: [] });
  vi.mocked(api.getSurvivorMyPicks).mockResolvedValue([]);
  vi.mocked(api.getSurvivorLockStatus).mockImplementation(async (_, week) => ({
    week_number: week, is_locked: week === 1, has_ended: false,
  }));
  vi.mocked(api.getSurvivorWeekPicks).mockResolvedValue({ can_see_picks: false, picks: [] });
  vi.mocked(api.getSurvivorWeekSchedule).mockResolvedValue({ teams: [] });
  vi.mocked(api.submitSurvivorPick).mockResolvedValue({});
});

test('late picks remain available and require confirmation before the POST', async () => {
  const user = userEvent.setup();
  render(<SurvivorContest />);
  await user.selectOptions(await screen.findByLabelText('Choose your team'), '1');
  await user.click(screen.getByRole('button', { name: 'Submit Week 1 Pick' }));
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  expect(api.submitSurvivorPick).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.submitSurvivorPick).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Submit Week 1 Pick' }));
  await user.click(await screen.findByRole('button', { name: 'I Understand, Submit Pick' }));
  await waitFor(() => expect(api.submitSurvivorPick).toHaveBeenCalledWith(10, 1, 1));
});

test('a locked current pick does not prevent selecting an unlocked future week', async () => {
  vi.mocked(api.getSurvivorMyPicks).mockResolvedValue([{ week_number: 1, team_id: 1 }]);
  const user = userEvent.setup();
  render(<SurvivorContest />);
  expect(await screen.findByRole('button', { name: 'Update Week 1 Pick' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next week' }));
  const team = await screen.findByLabelText('Choose your team');
  await waitFor(() => expect(team).toBeEnabled());
  await user.selectOptions(team, '1');
  await user.click(screen.getByRole('button', { name: 'Submit Week 2 Pick' }));
  await waitFor(() => expect(api.submitSurvivorPick).toHaveBeenCalledWith(10, 2, 1));
  await screen.findByRole('button', { name: 'Submit Week 2 Pick' });
  expect(api.getSurvivorLockStatus).toHaveBeenCalledWith(10, 2);
  expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
});

test('future-week counts and deadlines wait for the complete schedule', async () => {
  let finishSchedule: (value: any) => void;
  vi.mocked(api.getSurvivorWeekSchedule).mockImplementation(async (_, week) =>
    week === 2 ? new Promise(resolve => { finishSchedule = resolve; }) : { teams: [] });
  const user = userEvent.setup();
  render(<SurvivorContest />);
  await screen.findByLabelText('Choose your team');
  await user.click(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByLabelText('Choose your team')).toBeDisabled();
  expect(api.get).not.toHaveBeenCalledWith('/survivor/contests/10/available-teams?week=2');
  expect(api.getSurvivorLockStatus).not.toHaveBeenCalledWith(10, 2);
  vi.mocked(api.get).mockResolvedValue({ available_teams: [
    { team_id: 1, abbreviation: 'TOR', team_name: 'Toronto', games_this_week: 4, is_available: true },
  ], used_teams: [] });
  await act(async () => finishSchedule({ teams: [] }));
  expect(await screen.findByRole('option', { name: /TOR.*4 games.*2 wins needed/ })).toBeInTheDocument();
  expect(api.getSurvivorLockStatus).toHaveBeenCalledWith(10, 2);
});

test('four-game teams require a two-win warning that can be cancelled', async () => {
  vi.mocked(api.get).mockResolvedValue({ available_teams: [
    { team_id: 1, abbreviation: 'TOR', team_name: 'Toronto', games_this_week: 4, is_available: true },
  ], used_teams: [] });
  const user = userEvent.setup();
  render(<SurvivorContest />);
  await user.selectOptions(await screen.findByLabelText('Choose your team'), '1');
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(/2 wins/i);
  await user.click(screen.getByRole('button', { name: /cancel/i }));
  expect(screen.getByRole('button', { name: 'Submit Week 1 Pick' })).toBeDisabled();
});

test('previously used teams remain visible but disabled in the dropdown', async () => {
  vi.mocked(api.get).mockResolvedValue({ available_teams: [
    { team_id: 1, abbreviation: 'TOR', team_name: 'Toronto', games_this_week: 3, is_available: true },
  ], used_teams: [{ team_id: 2, abbreviation: 'MTL', team_name: 'Montreal', games_this_week: 3, used_in_week: 1 }] });
  render(<SurvivorContest />);
  expect(await screen.findByRole('option', { name: /Montreal/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /Toronto/ })).toBeEnabled();
});


test('a waiting contest does not hide a running contest and shared champions are all shown', async () => {
  vi.mocked(api.getSurvivorContests).mockResolvedValue([
    { contest_id: 11, contest_name: 'Next season', status: 'waiting' },
    { contest_id: 10, contest_name: 'Running season', current_week: 1, status: 'in_progress', phase: 'regular_season' },
    { contest_id: 9, contest_name: 'Finished season', current_week: 28, status: 'completed', phase: 'playoff_tiebreaker' },
  ]);
  const user = userEvent.setup();
  render(<SurvivorContest />);
  const contest = await screen.findByLabelText('Contest');
  expect(contest).toHaveValue('10');
  vi.mocked(api.getSurvivorStandings).mockResolvedValue({ participants: [
    { id: 1, participant_name: 'Alice', placement: 1 }, { id: 2, participant_name: 'Bob', placement: 1 },
  ] });
  await user.selectOptions(contest, '9');
  expect(await screen.findByRole('heading', { name: 'Shared champions' })).toBeInTheDocument();
  expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  expect(screen.queryByText(/Loading playoff picks/)).not.toBeInTheDocument();
});

test('background updates preserve an unsaved choice and remove the form after elimination', async () => {
  let refresh: (() => Promise<void>) | undefined;
  const timer = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => Promise<void>) => {
    refresh = callback; return 1;
  }) as typeof setInterval);
  try {
    const user = userEvent.setup();
    render(<SurvivorContest />);
    const select = await screen.findByLabelText('Choose your team');
    await user.selectOptions(select, '1');
    await act(async () => { await refresh!(); });
    expect(select).toHaveValue('1');
    vi.mocked(api.getSurvivorMyStatus).mockResolvedValue({ is_participant: true, is_eliminated: true });
    await act(async () => { await refresh!(); });
    expect(screen.queryByLabelText('Choose your team')).not.toBeInTheDocument();
  } finally { timer.mockRestore(); }
});
