import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Team = { team_id: number; team_name: string; series_id: string; is_available: boolean; game_started: boolean; start_time: string | null };
type Pick = { pick_id: number; participant_name: string; picked_team_abbrev: string; is_correct: boolean | null };
type Status = { is_active: boolean; current_round: number; current_game_number: number; is_locked: boolean; all_complete: boolean; lock_time: string | null };

export default function SurvivorPlayoffs({ contestId, eliminated, onAdvance }: { contestId: number; eliminated: boolean; onAdvance: () => void }) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [picks, setPicks] = useState<{ can_see_picks: boolean; picks: Pick[]; user_pick: Pick | null } | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const base = `/survivor/contests/${contestId}/tiebreaker`;

  useEffect(() => {
    let active = true;
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api.get<Status>(`${base}/status`);
        if (active) setStatus(next);
        const [available, nextPicks] = await Promise.allSettled([
          next.is_active && !eliminated ? api.get<{ teams: Team[] }>(`${base}/available-teams`) : Promise.resolve({ teams: [] }),
          api.get<typeof picks>(`${base}/picks?round=${next.current_round}&game=${next.current_game_number}`),
        ]);
        if (active) {
          setTeams(available.status === 'fulfilled' ? available.value.teams : []);
          if (nextPicks.status === 'fulfilled') setPicks(nextPicks.value);
          else setPicks(null);
          const failure = [available, nextPicks].find(result => result.status === 'rejected');
          setError(failure?.status === 'rejected' ? failure.reason?.message || 'Could not load playoff picks' : '');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load playoff picks');
      } finally { fetching = false; }
    };
    void load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [base, eliminated, retry]);

  useEffect(() => { setSelected(''); }, [status?.current_round, status?.current_game_number]);

  const submit = async () => {
    const team = teams.find(t => String(t.team_id) === selected);
    if (!team || !status) return;
    setBusy(true); setError('');
    try {
      await api.post(`${base}/picks`, { series_id: team.series_id, team_id: team.team_id });
      const nextPicks = await api.get<typeof picks>(`${base}/picks?round=${status.current_round}&game=${status.current_game_number}`);
      setPicks(nextPicks); setSelected('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save pick'); }
    finally { setBusy(false); }
  };

  const advance = async () => {
    setBusy(true); setError('');
    try { await api.post(`${base}/advance-game`); onAdvance(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not advance'); }
    finally { setBusy(false); }
  };

  return <Card>
    <CardHeader><CardTitle>Playoff Survivor{status && ` · Round ${status.current_round}, Game ${status.current_game_number}`}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {error && <div role="alert" className="space-y-2"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>}
      {!status ? (!error && <p>Loading playoff picks…</p>) : <>
        <p className="text-sm text-muted-foreground">Pick a team to win this game of its series. Used teams reset in Round 3; both finalists are available for every Stanley Cup Final game. No pick means elimination.</p>
        {status.lock_time && <p className="text-sm">Picks lock: {new Date(status.lock_time).toLocaleString()}</p>}
        {picks?.user_pick && <p>Your pick: <strong>{picks.user_pick.picked_team_abbrev}</strong>{status.is_locked && ' · Locked'}</p>}
        {status.is_active && !eliminated && !error && !(picks?.user_pick && status.is_locked) && <div className="space-y-2">
          <label htmlFor="playoff-team" className="block font-medium">Team for Game {status.current_game_number}</label>
          <select id="playoff-team" className="w-full rounded-md border bg-background p-2" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy}>
            <option value="">Choose a team</option>
            {teams.map(team => <option key={team.team_id} value={team.team_id} disabled={!team.is_available || team.game_started || !team.start_time}>
              {team.team_name}{!team.is_available ? ' — Used' : team.game_started ? ' — Started' : !team.start_time ? ' — Awaiting schedule' : ` — ${new Date(team.start_time).toLocaleString()}`}
            </option>)}
          </select>
          {status.is_locked && <p className="text-sm">You may still make your first pick from games that have not started.</p>}
          <Button onClick={submit} disabled={busy || !selected}>{picks?.user_pick ? 'Update Playoff Pick' : 'Submit Playoff Pick'}</Button>
        </div>}
        {picks?.can_see_picks ? <ul className="space-y-1">{picks.picks.map(pick => <li key={pick.pick_id}>{pick.participant_name}: {pick.picked_team_abbrev}{pick.is_correct === null ? '' : pick.is_correct ? ' · Won' : ' · Lost'}</li>)}</ul> : <p className="text-sm text-muted-foreground">Other picks appear after lock once you have submitted yours.</p>}
        {isAdmin && status.is_active && <Button variant="outline" onClick={advance} disabled={busy || !status.all_complete}>Process Results and Advance</Button>}
      </>}
    </CardContent>
  </Card>;
}
