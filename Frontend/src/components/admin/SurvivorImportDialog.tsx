import { useEffect, useState } from 'react';
import { api, User } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function SurvivorImportDialog({ contest, onClose, onImported }: {
  contest: { contest_id: number; contest_name: string };
  onClose: () => void;
  onImported: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [weeks, setWeeks] = useState<{ week_number: number; start_date: string; end_date: string }[]>([]);
  const [teams, setTeams] = useState<{ team_id: number; team_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [form, setForm] = useState({ user: '', week: '1', team: '', submitted: '', result: 'pending' });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function load() {
    setLoading(true); setError('');
    try {
      const [people, dates, nhlTeams] = await Promise.all([
        api.getAllUsers(), api.getSurvivorWeeks(contest.contest_id),
        api.get<{ team_id: number; team_name: string }[]>('/contest/teams'),
      ]);
      setUsers(people.users.filter(user => user.active !== false)); setWeeks(dates); setTeams(nhlTeams);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load import options'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [contest.contest_id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSaved('');
    try {
      await api.post(`/admin/survivor/contests/${contest.contest_id}/import`, {
        user_id: Number(form.user), week_number: Number(form.week), result: form.result,
        ...(form.result !== 'no_pick' && { team_id: Number(form.team), submitted_at: new Date(form.submitted).toISOString() }),
      });
      setSaved(`Week ${form.week} imported for ${users.find(user => user.id === Number(form.user))?.name}.`);
      setForm({ ...form, user: '', team: '', submitted: '' });
      onImported();
    } catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Import Survivor History</DialogTitle>
        <DialogDescription>{contest.contest_name}: import each player’s earlier weeks first, then current picks. The contest stays Waiting until you start it.</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status">Loading players, weeks and teams…</p> : <form onSubmit={submit}>
        <fieldset disabled={saving} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-survivor-user">Player</Label>
            <Select value={form.user} onValueChange={user => setForm({ ...form, user })} required>
              <SelectTrigger id="import-survivor-user"><SelectValue placeholder="Choose an existing user" /></SelectTrigger>
              <SelectContent><SelectGroup>{users.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name} — {user.email}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-survivor-week">Week</Label>
            <Select value={form.week} onValueChange={week => setForm({ ...form, week })} required>
              <SelectTrigger id="import-survivor-week"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{weeks.map(week => <SelectItem key={week.week_number} value={String(week.week_number)}>Week {week.week_number}: {week.start_date.slice(0, 10)} to {week.end_date.slice(0, 10)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-survivor-result">Recorded result</Label>
            <Select value={form.result} onValueChange={result => setForm({ ...form, result })}>
              <SelectTrigger id="import-survivor-result"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="pending">Pending — calculate from NHL results</SelectItem>
                <SelectItem value="survived">Survived — confirmed historical result</SelectItem>
                <SelectItem value="eliminated">Eliminated — confirmed historical result</SelectItem>
                <SelectItem value="no_pick">No pick — eliminated that week</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>
          {form.result !== 'no_pick' && <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-survivor-team">Picked team</Label>
              <Select value={form.team} onValueChange={team => setForm({ ...form, team })} required>
                <SelectTrigger id="import-survivor-team"><SelectValue placeholder="Choose the original pick" /></SelectTrigger>
                <SelectContent><SelectGroup>{teams.map(team => <SelectItem key={team.team_id} value={String(team.team_id)}>{team.team_name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-survivor-time">Original submission time ({timezone})</Label>
              <Input id="import-survivor-time" type="datetime-local" required value={form.submitted} onChange={event => setForm({ ...form, submitted: event.target.value })} />
              <p className="text-sm text-muted-foreground">Use when the player originally chose the team. Games already started at that time do not count as wins.</p>
            </div>
          </>}
          <p className="text-sm text-muted-foreground">Create missing accounts in User Management. Review imports with View/Override Picks and Manage Participants. After all history is entered, Start Contest at the current week (for example, Week 2).</p>
          <Button type="submit" disabled={!form.user || (form.result !== 'no_pick' && (!form.team || !form.submitted))}>{saving ? 'Importing…' : 'Import Record'}</Button>
        </fieldset>
      </form>}
      {saved && <p role="status">{saved}</p>}
      {error && <div role="alert"><p>{error}</p>{!users.length && <Button variant="outline" onClick={load}>Retry</Button>}</div>}
    </DialogContent>
  </Dialog>;
}
