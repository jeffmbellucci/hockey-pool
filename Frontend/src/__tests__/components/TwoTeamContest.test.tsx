import { act, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TwoTeamContest from '@/pages/TwoTeamContest';
import { api } from '@/lib/api';
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, name: 'Player' } }) }));
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

test('each draft poll requests the turn once and standings continue refreshing after drafting', async () => {
  let poll: (() => Promise<void>) | undefined;
  const timer = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => Promise<void>) => {
    poll = callback; return 1;
  }) as typeof setInterval);
  let status = 'drafting';
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.includes('/active/')) return { contest_id: 10, contest_name: 'Draft test', contest_type: 'two_team', status,
      max_participants: 16, current_participants: 16, current_draft_pick: 1, participants: [], season_year: '2026-27' };
    if (path.endsWith('/draft/current')) return { pick_number: 1, round: 1, total_picks: 32, participant: { user_id: 8, participant_name: 'Other player' } };
    return [];
  });
  try {
    render(<TwoTeamContest />);
    await screen.findByText(/Waiting for Other player/);
    vi.mocked(api.get).mockClear();
    await act(async () => { await poll!(); });
    expect(vi.mocked(api.get).mock.calls.filter(([path]) => path.endsWith('/draft/current'))).toHaveLength(1);
    expect(api.get).toHaveBeenCalledTimes(3);
    status = 'in_progress';
    await act(async () => { await poll!(); });
    expect(api.get).toHaveBeenCalledWith('/contest/leaderboard?contest_id=10');
    vi.mocked(api.get).mockClear();
    await act(async () => { await poll!(); });
    expect(api.get).toHaveBeenCalledWith('/contest/leaderboard?contest_id=10');
    expect(api.get).toHaveBeenCalledTimes(2);
  } finally { timer.mockRestore(); }
});
