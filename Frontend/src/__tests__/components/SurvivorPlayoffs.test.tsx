import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import SurvivorPlayoffs from '@/components/SurvivorPlayoffs';
import { api } from '@/lib/api';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
let locked = false;
let saved = false;
beforeEach(() => {
  vi.resetAllMocks(); locked = false; saved = false;
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/status')) return { is_active: true, current_round: 1, current_game_number: 1, is_locked: locked, all_complete: false };
    if (path.endsWith('/available-teams')) return { teams: [
      { team_id: 1, team_name: 'Toronto', series_id: 'A', is_available: true, start_time: '2030-04-20T23:00:00Z' },
      { team_id: 2, team_name: 'Used team', series_id: 'B', is_available: false },
      { team_id: 3, team_name: 'Started team', series_id: 'C', is_available: true, game_started: true },
    ] };
    return { can_see_picks: false, picks: [], user_pick: saved ? { pick_id: 1, picked_team_abbrev: 'TOR' } : null };
  });
  vi.mocked(api.post).mockImplementation(async () => { saved = true; return {}; });
});

test('playoff selection disables used/started teams and submits a playable series', async () => {
  const user = userEvent.setup();
  render(<SurvivorPlayoffs contestId={10} eliminated={false} onAdvance={vi.fn()} />);
  const select = await screen.findByLabelText('Team for Game 1');
  expect(screen.getByRole('option', { name: /Used team/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /Started team/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Process Results and Advance' })).toBeDisabled();
  await user.selectOptions(select, '1');
  await user.click(screen.getByRole('button', { name: 'Submit Playoff Pick' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/survivor/contests/10/tiebreaker/picks', { series_id: 'A', team_id: 1 }));
  expect(await screen.findByText('TOR')).toBeInTheDocument();
});

test('a submitted playoff pick cannot be changed after lock', async () => {
  locked = true; saved = true;
  render(<SurvivorPlayoffs contestId={10} eliminated={false} onAdvance={vi.fn()} />);
  expect(await screen.findByText('TOR')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Update Playoff Pick' })).not.toBeInTheDocument();
});


test('a failed team refresh hides stale controls while retaining the latest round', async () => {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/status')) return { is_active: true, current_round: 2, current_game_number: 3, is_locked: false };
    if (path.endsWith('/available-teams')) throw new Error('You are not active in this tiebreaker');
    return { can_see_picks: true, picks: [], user_pick: null };
  });
  render(<SurvivorPlayoffs contestId={10} eliminated={false} onAdvance={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('You are not active');
  expect(screen.getByText(/Round 2, Game 3/)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
