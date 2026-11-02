import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Participant = { user_id: number; participant_name: string; email: string; is_eliminated: boolean };
type Week = { week_number: number; start_date: string; end_date: string };
type Team = { team_id: number; team_name: string };

export function SurvivorAddPickDialog({ contest, initialWeek, onClose }: {
  contest: { contest_id: number; contest_name: string; current_week: number };
  initialWeek?: number;
  onClose: () => void;
}) {
  const [week, setWeek] = useState(String(initialWeek || contest.current_week));
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [recorded, setRecorded] = useState<number[]>([]);
  const [form, setForm] = useState({ user: '', team: '', submitted: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retry, setRetry] = useState(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(''); setError('');
    Promise.all([
      api.getSurvivorParticipants(contest.contest_id), api.getSurvivorWeeks(contest.contest_id),
      api.get<Team[]>('/contest/teams'),
      api.get<{ picks: { user_id: number }[] }>(`/admin/survivor/contests/${contest.contest_id}/picks?week=${week}`),
    ]).then(([data, dates, nhlTeams, picks]) => {
      if (cancelled) return;
      if (!Array.isArray(data)) throw new Error('Could not load participants. Please retry.');
      setParticipants(data);
      setWeeks(dates.filter((date: Week) => date.week_number >= contest.current_week));
      setTeams(nhlTeams); setRecorded(picks.picks.map(pick => pick.user_id));
    }).catch(err => { if (!cancelled) setLoadError(err.message || 'Could not load pick options'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contest.contest_id, contest.current_week, week, retry]);

  const eligible = participants.filter(person => !person.is_eliminated && !recorded.includes(person.user_id));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const response = await api.post<{ warning?: string }>(`/admin/survivor/contests/${contest.contest_id}/picks`, {
        user_id: Number(form.user), week_number: Number(week), team_id: Number(form.team),
        submitted_at: new Date(form.submitted).toISOString(),
      });
      setSuccess(`Pick added for ${eligible.find(person => person.user_id === Number(form.user))?.participant_name}, Week ${week}.${response.warning ? ` ${response.warning}` : ''}`);
      setRecorded(current => [...current, Number(form.user)]);
      setForm({ user: '', team: '', submitted: '' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add pick'); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add Survivor Pick</DialogTitle>
        <DialogDescription>{contest.contest_name}: record a pick received by email for a participant who has not entered one.</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status">Loading participants and picks…</p> : loadError ? <Alert variant="destructive"><AlertDescription>{loadError} <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></AlertDescription></Alert> :
        <form onSubmit={submit}>
          <fieldset disabled={saving} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-pick-week">Week</Label>
              <Select value={week} onValueChange={value => { setWeek(value); setForm({ user: '', team: '', submitted: '' }); setSuccess(''); }}>
                <SelectTrigger id="add-pick-week"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{weeks.map(date => <SelectItem key={date.week_number} value={String(date.week_number)}>Week {date.week_number}: {date.start_date.slice(0, 10)} to {date.end_date.slice(0, 10)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-pick-user">Participant without a pick</Label>
              <Select value={form.user} onValueChange={user => setForm({ ...form, user })} required>
                <SelectTrigger id="add-pick-user"><SelectValue placeholder="Choose a participant" /></SelectTrigger>
                <SelectContent><SelectGroup>{eligible.map(person => <SelectItem key={person.user_id} value={String(person.user_id)}>{person.participant_name} — {person.email}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {!eligible.length && <p className="text-sm text-muted-foreground">{!participants.length ? 'No participants are registered in this contest.' : participants.every(person => person.is_eliminated) ? 'There are no remaining participants. Review Manage Participants.' : 'All remaining participants have a pick for this week.'}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-pick-team">Picked team</Label>
              <Select value={form.team} onValueChange={team => setForm({ ...form, team })} required>
                <SelectTrigger id="add-pick-team"><SelectValue placeholder="Choose their team" /></SelectTrigger>
                <SelectContent><SelectGroup>{teams.map(team => <SelectItem key={team.team_id} value={String(team.team_id)}>{team.team_name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">The participant cannot reuse a team from another week.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-pick-time">Original submission time ({timezone})</Label>
              <Input id="add-pick-time" type="datetime-local" required value={form.submitted} onChange={event => setForm({ ...form, submitted: event.target.value })} />
              <p className="text-sm text-muted-foreground">Enter when their email was received. Late-pick rules use this time, not when you enter it here. Future submission times are not accepted.</p>
            </div>
            <p className="text-sm text-muted-foreground">Results are calculated automatically. Existing picks stay unchanged. Past weeks and eliminated participants need separate review in View/Override Picks and Manage Participants.</p>
            <Button type="submit" disabled={!form.user || !form.team || !form.submitted}>{saving ? 'Adding…' : 'Add Pick'}</Button>
          </fieldset>
        </form>}
      {success && <p role="status">{success}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </DialogContent>
  </Dialog>;
}
