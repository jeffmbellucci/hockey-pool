import SurvivorPlayoffs from "@/components/SurvivorPlayoffs";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Target, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Trophy, RefreshCw, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Team {
  team_id: number;
  team_name: string;
  abbreviation: string;
  games_this_week: number;
  is_available: boolean;
  conference?: string;
  division?: string;
}

const SurvivorContest = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningTeam, setWarningTeam] = useState<Team | null>(null);
  const [contests, setContests] = useState<any[]>([]);
  const [activeContest, setActiveContest] = useState<any>(null);
  const [standings, setStandings] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<any>(null);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [usedTeams, setUsedTeams] = useState<Team[]>([]);
  const [currentPick, setCurrentPick] = useState<any>(null);
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [weekPicks, setWeekPicks] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLatePickWarning, setShowLatePickWarning] = useState(false);
  const [latePickMessage, setLatePickMessage] = useState<string>("");
  const [schedule, setSchedule] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [weekChanging, setWeekChanging] = useState(false);
  const [contestWeeks, setContestWeeks] = useState<any[]>([]);
  const weekRequest = useRef(0);
  const refreshInFlight = useRef(false);
  const mountedRef = useRef(true);

  // Fetch survivor contests on mount
  useEffect(() => {
    mountedRef.current = true;
    loadSurvivorData();
    return () => { mountedRef.current = false; };
  }, []);

  const [refreshError, setRefreshError] = useState('');
  useEffect(() => {
    if (loading || !activeContest || !['waiting', 'in_progress'].includes(activeContest.status)) return;
    let active = true;
    const refresh = async () => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        const list = await api.getSurvivorContests();
        const next = list.find((c: any) => c.contest_id === activeContest.contest_id);
        if (!next) return;
        const [nextStandings, nextUser] = await Promise.all([
          api.getSurvivorStandings(next.contest_id), api.getSurvivorMyStatus(next.contest_id),
        ]);
        if (!active) return;
        setContests(list); setActiveContest(next); setStandings(nextStandings); setUserStatus(nextUser);
        setRefreshError('');
        if (next.status === 'in_progress' && next.phase === 'regular_season') {
          if (next.current_week !== activeContest.current_week || next.phase !== activeContest.phase || activeContest.status !== next.status) {
            setContestWeeks(await api.getSurvivorWeeks(next.contest_id));
            if (nextUser?.is_participant) await loadWeekData(next.contest_id, next.current_week, nextUser.is_eliminated);
            else await loadWeekPicks(next.contest_id, next.current_week);
          } else {
            const week = selectedWeek || next.current_week;
            const lock = await api.getSurvivorLockStatus(next.contest_id, week);
            if (active) setLockStatus(lock);
            await loadWeekPicks(next.contest_id, week);
          }
        }
      } catch {
        if (active) setRefreshError('Live updates are unavailable. Retry to check the latest contest status.');
      } finally { refreshInFlight.current = false; }
    };
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [activeContest?.contest_id, activeContest?.status, activeContest?.phase, activeContest?.current_week, selectedWeek, loading]);

  const loadSurvivorData = async (preferredWeek?: number, contestId = activeContest?.contest_id) => {
    try {
      setLoading(true);
      setError(null);

      // Get all survivor contests
      const contestsData = await api.getSurvivorContests();
      setContests(contestsData);

      // Find first active contest, or most recent completed contest
      let active = contestsData.find((c: any) => c.contest_id === contestId)
        || contestsData.find((c: any) => c.status === 'in_progress')
        || contestsData.find((c: any) => c.status === 'waiting');

      // If no active contest, find most recent completed one
      if (!active) {
        const completedContests = contestsData.filter((c: any) => c.status === 'completed');
        if (completedContests.length > 0) {
          // Sort by contest_id descending to get most recent
          active = completedContests.sort((a: any, b: any) => b.contest_id - a.contest_id)[0];
        }
      }

      if (active) {
        setActiveContest(active);

        // Get Standings for contest
        const standingsData = await api.getSurvivorStandings(active.contest_id);
        setStandings(standingsData);

        // Check if user is a participant
        try {
          const status = await api.getSurvivorMyStatus(active.contest_id);
          setUserStatus(status);

          // If user is participant and contest is in progress, load teams and picks
          if (status?.is_participant && active.status === 'in_progress' && active.phase === 'regular_season') {
            const weeks = await api.getSurvivorWeeks(active.contest_id);
            setContestWeeks(weeks);
            await loadWeekData(active.contest_id, preferredWeek || active.current_week, status.is_eliminated);
          } else if (active.status === 'in_progress' && active.phase === 'regular_season') {
            // Even if not a participant, load week picks to see leaderboard if available
            await loadWeekPicks(active.contest_id, active.current_week);
          }
        } catch (statusErr: any) {
          // User is not a participant (404 error is expected)
          if (statusErr.message?.includes('not a participant')) {
            setUserStatus(null);
          } else {
            throw statusErr;
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading survivor data:', err);
      setError(err.message || 'Failed to load survivor data');
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (contestId: number, weekNumber: number, eliminated = false) => {
    const request = ++weekRequest.current;
    setWeekChanging(true);
    setSelectedWeek(weekNumber);
    setSelectedTeam(null);
    setCurrentPick(null);
    setLockStatus(null);
    setAvailableTeams([]);
    setUsedTeams([]);
    setWeekPicks(null);
    setSchedule(null);
    try {
      // Load the complete schedule before reading counts and the derived pick deadline.
      const scheduleData = await api.getSurvivorWeekSchedule(contestId, weekNumber);
      if (!mountedRef.current || request !== weekRequest.current) return;
      const [teamsData, myPicks, status, picks] = await Promise.all([
        eliminated ? Promise.resolve({ available_teams: [], used_teams: [] }) :
          api.get<any>(`/survivor/contests/${contestId}/available-teams?week=${weekNumber}`),
        api.getSurvivorMyPicks(contestId),
        api.getSurvivorLockStatus(contestId, weekNumber),
        api.getSurvivorWeekPicks(contestId, weekNumber),
      ]);
      if (!mountedRef.current || request !== weekRequest.current) return;
      setAvailableTeams(teamsData.available_teams || []);
      setUsedTeams(teamsData.used_teams || []);
      const currentWeekPick = myPicks.find((p: any) => p.week_number === weekNumber);
      setCurrentPick(currentWeekPick || null);
      setSelectedTeam(currentWeekPick?.team_id || null);
      setLockStatus(status);
      setWeekPicks(picks);
      setSchedule(scheduleData);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (request === weekRequest.current) {
        toast({ title: "Error", description: err.message || 'Failed to load week', variant: "destructive" });
      }
    } finally {
      if (request === weekRequest.current) setWeekChanging(false);
    }
  };

  const loadWeekPicks = async (contestId: number, weekNumber: number) => {
    const request = weekRequest.current;
    try {
      const picks = await api.getSurvivorWeekPicks(contestId, weekNumber);
      if (!mountedRef.current || request !== weekRequest.current) return;
      setWeekPicks(picks);
      setLastUpdated(new Date());
    } catch (err: any) {
      throw err;
    }
  };

  const handleRefreshPicks = async () => {
    if (!activeContest) return;

    setRefreshing(true);
    try {
      await loadWeekPicks(activeContest.contest_id, selectedWeek || activeContest.current_week);
      toast({
        title: "Refreshed",
        description: "Week picks updated successfully!",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to refresh picks",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading survivor contest...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-destructive font-medium">Error Loading Contest</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={() => loadSurvivorData()} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeContest) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <Target className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="font-medium">No Active Survivor Contest</p>
              <p className="text-sm text-muted-foreground">Check back later or contact an admin to create one.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentWeek = activeContest.current_week || 1;

  const displayWeek = selectedWeek || currentWeek;
  const isFutureWeek = displayWeek > currentWeek;
  const isCurrentWeek = displayWeek === currentWeek;
  const pickDisabled = !!userStatus?.is_eliminated || activeContest.status !== 'in_progress' || weekChanging || !lockStatus || lockStatus.has_ended ||
    displayWeek < currentWeek || (lockStatus.is_locked && !!currentPick);

  // Helper: get schedule games for a specific team
  const getTeamSchedule = (teamId: number) => {
    if (!schedule?.teams) return [];
    const team = schedule.teams.find((t: any) => t.team_id === teamId);
    return team?.games || [];
  };

  // Get survivors from standings data
  const survivors: { name: string; status: string; weeksEliminated: number | null; weeksSurvived: number }[] = standings?.participants?.map((p: any) => ({
    name: p.participant_name,
    status: p.is_eliminated ? "eliminated" : "alive",
    currentPick: null,
    weeksEliminated: p.elimination_week,
    weeksSurvived: p.weeks_survived
  })) || [];

  const handleTeamSelection = (team: Team) => {
    // If locked or already picked, don't allow selection
    if (pickDisabled) {
      toast({
        title: "Picks are locked",
        description: "You cannot change your pick after the lock time.",
        variant: "destructive"
      });
      return;
    }

    // Check if team requires 2 wins (4+ games)
    if (team.games_this_week >= 4) {
      setWarningTeam(team);
      setShowWarning(true);
    } else {
      setSelectedTeam(team.team_id);
    }
  };

  const confirmSelection = () => {
    if (warningTeam) {
      setSelectedTeam(warningTeam.team_id);
    }
    setShowWarning(false);
    setWarningTeam(null);
  };

  const handleSubmitPick = async (lateConfirmed = false) => {
    if (!activeContest || !selectedTeam || submitting || pickDisabled) return;
    const weekToSubmit = selectedWeek || currentWeek;

    try {
      setSubmitting(true);
      // Recheck the deadline before posting: the page may have been left open.
      const latestLock = await api.getSurvivorLockStatus(activeContest.contest_id, weekToSubmit);
      setLockStatus(latestLock);
      if (latestLock.is_locked && !currentPick && !lateConfirmed) {
        setLatePickMessage(`You are submitting a late pick for Week ${weekToSubmit}.`);
        setShowLatePickWarning(true);
        return;
      }
      await api.submitSurvivorPick(
        activeContest.contest_id,
        weekToSubmit,
        selectedTeam
      );

      toast({
        title: "Success",
        description: currentPick ? "Your pick has been updated!" : "Your pick has been submitted!",
      });

      // Reload data
      await loadSurvivorData(weekToSubmit);
    } catch (err: any) {
      console.error('Error submitting pick:', err);
      toast({
        title: "Error",
        description: err.message || 'Failed to submit pick',
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinContest = async () => {
    if (!activeContest) return;

    try {
      await api.joinSurvivorContest(activeContest.contest_id, user?.name);
      await loadSurvivorData(); // Reload to get updated status
    } catch (err: any) {
      console.error('Error joining contest:', err);
      setError(err.message || 'Failed to join contest');
    }
  };

  const handleLeaveContest = async () => {
    if (!activeContest) return;

    try {
      await api.leaveSurvivorContest(activeContest.contest_id);
      await loadSurvivorData(); // Reload to get updated status
    } catch (err: any) {
      console.error('Error leaving contest:', err);
      setError(err.message || 'Failed to leave contest');
    }
  };

  const handleWeekChange = async (newWeek: number) => {
    if (!activeContest || !contestWeeks.some(w => w.week_number === newWeek) || submitting) return;
    await loadWeekData(activeContest.contest_id, newWeek, userStatus?.is_eliminated);
  };

  const isUserParticipant = () => {
    return userStatus?.is_participant === true;
  };

  const aliveCount = standings?.active_participants || 0;
  const eliminatedCount = standings?.eliminated_participants || 0;

  const winners = activeContest?.status === 'completed'
    ? standings?.participants?.filter((p: any) => p.placement === 1) || [] : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold gradient-hockey bg-clip-text text-transparent">
          {activeContest?.status === 'completed' ? 'Survivor Contest - Completed' : activeContest?.phase === 'playoff_tiebreaker' ? 'Survivor Contest - Playoffs' : `Survivor Contest - Week ${currentWeek}`}
        </h1>
        <p className="text-muted-foreground">
          {activeContest?.contest_name || 'Pick one team per week. Each team can only be used once. Survive to win!'}
        </p>
      </div>

      {contests.length > 1 && <div className="space-y-1">
        <label htmlFor="survivor-contest" className="text-sm font-medium">Contest</label>
        <select id="survivor-contest" className="w-full rounded-md border bg-background p-2" value={activeContest.contest_id}
          onChange={e => { ++weekRequest.current; setSelectedWeek(null); void loadSurvivorData(undefined, Number(e.target.value)); }}>
          {contests.map(c => <option key={c.contest_id} value={c.contest_id}>{c.contest_name} · {c.season_year} · {c.status.replace('_', ' ')}</option>)}
        </select>
      </div>}
      {refreshError && <Alert variant="destructive"><AlertDescription>{refreshError} <Button variant="outline" onClick={() => { setRefreshError(''); void loadSurvivorData(selectedWeek || undefined); }}>Retry</Button></AlertDescription></Alert>}
      {winners.length > 0 && <Card className="border-yellow-500/50 bg-yellow-500/10">
        <CardContent className="pt-6 text-center space-y-3">
          <Trophy className="h-10 w-10 mx-auto text-yellow-500" />
          <h2 className="text-2xl font-bold">{winners.length > 1 ? 'Shared champions' : 'Survivor Contest Champion'}</h2>
          {winners.map((winner: any) => <p key={winner.id || winner.participant_name} className="text-xl font-semibold">{winner.participant_name}</p>)}
          {winners.length > 1 && <p className="text-sm text-muted-foreground">Tied for first place.</p>}
        </CardContent>
      </Card>}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-ice">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{activeContest.status === 'completed' ? 'Final Survivors' : 'Still Alive'}</CardTitle>
            <Target className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{aliveCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eliminated</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{eliminatedCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pick Deadline</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-warning">
              {activeContest.status === 'completed' ? 'Contest completed' : activeContest?.phase === 'playoff_tiebreaker' ? 'See playoff picks below' : lockStatus?.lock_time
                ? new Date(lockStatus.lock_time).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                : 'TBD'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Join/Leave Contest Section */}
      {!isUserParticipant() && activeContest?.status === 'waiting' && activeContest?.status !== 'completed' && (
        <Card className="shadow-championship border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-primary" />
              <span>Join Survivor Contest</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">You will join as:</p>
              <p className="text-lg font-semibold">{user?.name}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {activeContest.current_participants || 0} / {activeContest.max_participants || 50} participants
              </p>
            </div>
            <Button
              onClick={handleJoinContest}
              disabled={(activeContest.current_participants || 0) >= (activeContest.max_participants || 50)}
              className="w-full gradient-hockey"
              size="lg"
            >
              Join Contest
            </Button>
          </CardContent>
        </Card>
      )}

      {isUserParticipant() && activeContest?.status === 'waiting' && activeContest?.status !== 'completed' && (
        <Card className="shadow-ice border-success/30">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="font-medium">You have joined as {user?.name}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Waiting for contest to start...
                </p>
              </div>
              <Button variant="outline" onClick={handleLeaveContest} className="w-full">
                Leave Contest
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeContest?.phase === 'playoff_tiebreaker' && activeContest.status !== 'completed' && isUserParticipant() && (
        <SurvivorPlayoffs key={`${activeContest.contest_id}-${activeContest.playoff_round}-${activeContest.playoff_game_number}`}
          contestId={activeContest.contest_id} eliminated={!!userStatus?.is_eliminated}
          onAdvance={() => loadSurvivorData()} />
      )}
      {/* Make Your Pick - Regular Season Only - Show only when NOT locked */}
      {isUserParticipant() && activeContest?.status === 'in_progress' && activeContest?.phase === 'regular_season' && !userStatus?.is_eliminated && (
        <Card className="shadow-championship">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-success" />
                <span>Make Your Week {displayWeek} Pick</span>
              </div>
              <div className="flex items-center space-x-2">
                {/* Week Navigation */}
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleWeekChange(displayWeek - 1)}
                    aria-label="Previous week"
                    disabled={displayWeek <= 1 || weekChanging || submitting}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Badge variant={isCurrentWeek ? "default" : "secondary"} className="text-xs">
                    {isCurrentWeek ? `Wk ${displayWeek}` : (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Wk {displayWeek}
                      </span>
                    )}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleWeekChange(displayWeek + 1)}
                    aria-label="Next week"
                    disabled={!contestWeeks.some(w => w.week_number === displayWeek + 1) || weekChanging || submitting}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {isFutureWeek && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleWeekChange(currentWeek)}
                  >
                    Back to Current
                  </Button>
                )}
                {lockStatus && isCurrentWeek && (
                  <Badge variant={lockStatus.is_locked ? "destructive" : "secondary"}>
                    {lockStatus.is_locked ? "Locked" : "Open"}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Pick Display */}
            {currentPick && (
              <Alert className="bg-primary/10 border-primary/20">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium">
                    Current Pick: {availableTeams.find(t => t.team_id === currentPick.team_id)?.abbreviation ||
                                   usedTeams.find(t => t.team_id === currentPick.team_id)?.abbreviation}
                  </div>
                  {!lockStatus?.is_locked && (
                    <div className="text-xs mt-1">You can change your pick until the lock time.</div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Lock Status Info */}
            {lockStatus && !lockStatus.is_locked && lockStatus.lock_time && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <div className="text-sm">
                    Picks lock at: {new Date(lockStatus.lock_time).toLocaleString()}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <label htmlFor="survivor-team" className="block font-semibold text-sm">Choose your team</label>
              <select id="survivor-team" className="w-full rounded-md border bg-background p-2"
                value={selectedTeam || ''} disabled={pickDisabled || submitting}
                onChange={event => {
                  const team = availableTeams.find(t => t.team_id === Number(event.target.value));
                  if (team) handleTeamSelection(team); else setSelectedTeam(null);
                }}>
                <option value="">Select a team</option>
                {[...availableTeams, ...usedTeams].sort((a, b) => a.team_name.localeCompare(b.team_name)).map(team => {
                  const used = usedTeams.some(t => t.team_id === team.team_id);
                  return <option key={team.team_id} value={team.team_id} disabled={used || team.games_this_week === 0}>
                    {team.abbreviation} — {team.team_name} · {team.games_this_week} games{used ? ' · Already used' : team.games_this_week >= 4 ? ' · 2 wins needed' : ''}
                  </option>;
                })}
              </select>
              <p className="text-xs text-muted-foreground">Each team can be used once per season. Other players may choose the same team.</p>
              {selectedTeam && <div className="space-y-1 text-sm">
                <p className="font-medium">Selected team's Week {displayWeek} schedule</p>
                {getTeamSchedule(selectedTeam).map((game: any) => <p key={game.game_id}>
                  {new Date(game.start_time_utc || `${String(game.game_date).slice(0, 10)}T12:00:00Z`).toLocaleString()}
                  {' '}{game.is_home ? 'vs' : '@'} {game.opponent}
                </p>)}
              </div>}
            </div>
            {/* Submit Button */}
            {isFutureWeek && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  <div className="text-sm">
                    You are making an <strong>advance pick</strong> for Week {displayWeek}. You can change this anytime before that week's lock time.
                  </div>
                </AlertDescription>
              </Alert>
            )}
            <Button
              className="w-full gradient-hockey"
              disabled={!selectedTeam || submitting || pickDisabled}
              size="lg"
              onClick={() => handleSubmitPick()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : currentPick ? (
                `Update Week ${displayWeek} Pick`
              ) : (
                `Submit Week ${displayWeek} Pick`
              )}
            </Button>

            {availableTeams.length === 0 && usedTeams.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Loading available teams...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* User's Locked Pick Info - Show when locked and user has picked */}
      {isUserParticipant() && activeContest?.status === 'in_progress' && activeContest?.phase === 'regular_season' && !userStatus?.is_eliminated && lockStatus?.is_locked && currentPick && (
        <Card className="shadow-ice border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Your Pick is Locked In</h3>
                  <p className="text-sm text-muted-foreground">
                    Week {displayWeek}: <span className="font-semibold text-primary">
                      {availableTeams.find(t => t.team_id === currentPick.team_id)?.abbreviation ||
                       usedTeams.find(t => t.team_id === currentPick.team_id)?.abbreviation}
                    </span>
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Picks Locked
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week Picks Leaderboard - Show when picks are visible */}
      {weekPicks && weekPicks.can_see_picks && weekPicks.picks && weekPicks.picks.length > 0 && activeContest?.status === 'in_progress' && (
        <Card className="shadow-ice">
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-primary" />
                <span>Week {currentWeek} Picks</span>
                <Badge variant={weekPicks.is_locked ? "destructive" : "secondary"}>
                  {weekPicks.is_locked ? "Locked" : "Open"}
                </Badge>
              </div>
              <div className="flex items-center space-x-3">
                {lastUpdated && (
                  <span className="text-xs text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshPicks}
                  disabled={refreshing}
                  className="h-8"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="ml-2 hidden sm:inline">Refresh</span>
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Info message */}
              {weekPicks.is_locked && (
                <Alert>
                  <AlertDescription className="text-sm">
                    Picks are now locked. Track progress as the week unfolds!
                  </AlertDescription>
                </Alert>
              )}

              {/* Picks Grid/Table - Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-3 px-4 font-semibold text-sm">Participant</th>
                      <th className="text-left py-3 px-4 font-semibold text-sm">Pick</th>
                      <th className="text-center py-3 px-4 font-semibold text-sm">Games</th>
                      <th className="text-center py-3 px-4 font-semibold text-sm">Wins Needed</th>
                      <th className="text-center py-3 px-4 font-semibold text-sm">Wins</th>
                      <th className="text-center py-3 px-4 font-semibold text-sm">Losses</th>
                      <th className="text-center py-3 px-4 font-semibold text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weekPicks.picks].sort((a: any, b: any) => {
                      // Helper function to calculate status priority
                      const getStatusPriority = (pick: any) => {
                        const winsNeeded = pick.games_needed ?? (pick.games_played >= 4 ? 2 : 1);
                        const wins = pick.wins || 0;
                        const losses = pick.losses || 0;
                        const gamesPlayed = wins + losses;
                        const gamesRemaining = Math.max(0, (pick.games_played || 0) - (pick.games_excluded || 0) - gamesPlayed);

                        if (pick.result === 'survived') return 0;
                        if (wins >= winsNeeded) return 1;
                        if (pick.result === 'eliminated') return 4;
                        if (gamesRemaining + wins < winsNeeded) return 3;
                        return 2; // In progress
                      };

                      const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
                      if (priorityDiff !== 0) return priorityDiff;

                      // If same priority, sort by name
                      return a.participant_name.localeCompare(b.participant_name);
                    }).map((pick: any, idx: number) => {
                      const winsNeeded = pick.games_needed ?? (pick.games_played >= 4 ? 2 : 1);
                      const wins = pick.wins || 0;
                      const losses = pick.losses || 0;
                      const gamesPlayed = wins + losses;
                      const gamesRemaining = Math.max(0, (pick.games_played || 0) - (pick.games_excluded || 0) - gamesPlayed);

                      let statusIcon = null;
                      let statusText = '';
                      let statusColor = '';

                      if (pick.result === 'survived') {
                        statusIcon = <CheckCircle className="h-5 w-5 text-success" />;
                        statusText = 'Survived';
                        statusColor = 'text-success';
                      } else if (pick.result === 'eliminated') {
                        statusIcon = <XCircle className="h-5 w-5 text-destructive" />;
                        statusText = 'Eliminated';
                        statusColor = 'text-destructive';
                      } else {
                        // In progress
                        if (wins >= winsNeeded) {
                          statusIcon = <CheckCircle className="h-5 w-5 text-success" />;
                          statusText = 'Safe';
                          statusColor = 'text-success';
                        } else if (gamesRemaining + wins < winsNeeded) {
                          statusIcon = <XCircle className="h-5 w-5 text-destructive" />;
                          statusText = 'Cannot Win';
                          statusColor = 'text-destructive';
                        } else {
                          statusIcon = <Clock className="h-5 w-5 text-warning" />;
                          statusText = 'In Progress';
                          statusColor = 'text-warning';
                        }
                      }

                      return (
                        <tr
                          key={idx}
                          className={`border-b border-border hover:bg-muted/50 transition-colors ${
                            pick.user_id === user?.id ? 'bg-primary/5' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{pick.participant_name}</span>
                              {pick.user_id === user?.id && (
                                <Badge variant="outline" className="text-xs">You</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-primary">{pick.abbreviation}</span>
                              <span className="text-xs text-muted-foreground">({pick.team_name})</span>
                            </div>
                          </td>
                          <td className="text-center py-3 px-4">
                            <Badge variant="secondary" className="text-xs">
                              {pick.games_played || 0}
                            </Badge>
                          </td>
                          <td className="text-center py-3 px-4">
                            <Badge
                              variant={winsNeeded === 2 ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {winsNeeded}
                            </Badge>
                          </td>
                          <td className="text-center py-3 px-4">
                            <span className="font-semibold text-success text-lg">{wins}</span>
                          </td>
                          <td className="text-center py-3 px-4">
                            <span className="font-semibold text-destructive text-lg">{losses}</span>
                          </td>
                          <td className="text-center py-3 px-4">
                            <div className="flex items-center justify-center space-x-2">
                              {statusIcon}
                              <span className={`text-sm font-medium ${statusColor}`}>
                                {statusText}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Picks Cards - Mobile */}
              <div className="md:hidden space-y-3">
                {[...weekPicks.picks].sort((a: any, b: any) => {
                  // Helper function to calculate status priority
                  const getStatusPriority = (pick: any) => {
                    const winsNeeded = pick.games_needed ?? (pick.games_played >= 4 ? 2 : 1);
                    const wins = pick.wins || 0;
                    const losses = pick.losses || 0;
                    const gamesPlayed = wins + losses;
                    const gamesRemaining = Math.max(0, (pick.games_played || 0) - (pick.games_excluded || 0) - gamesPlayed);

                    if (pick.result === 'survived') return 0;
                    if (wins >= winsNeeded) return 1;
                    if (pick.result === 'eliminated') return 4;
                    if (gamesRemaining + wins < winsNeeded) return 3;
                    return 2; // In progress
                  };

                  const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
                  if (priorityDiff !== 0) return priorityDiff;

                  // If same priority, sort by name
                  return a.participant_name.localeCompare(b.participant_name);
                }).map((pick: any, idx: number) => {
                  const winsNeeded = pick.games_needed ?? (pick.games_played >= 4 ? 2 : 1);
                  const wins = pick.wins || 0;
                  const losses = pick.losses || 0;
                  const gamesPlayed = wins + losses;
                  const gamesRemaining = Math.max(0, (pick.games_played || 0) - (pick.games_excluded || 0) - gamesPlayed);

                  let statusIcon = null;
                  let statusText = '';
                  let statusColor = '';

                  if (pick.result === 'survived') {
                    statusIcon = <CheckCircle className="h-4 w-4 text-success" />;
                    statusText = 'Survived';
                    statusColor = 'text-success';
                  } else if (pick.result === 'eliminated') {
                    statusIcon = <XCircle className="h-4 w-4 text-destructive" />;
                    statusText = 'Eliminated';
                    statusColor = 'text-destructive';
                  } else {
                    // In progress
                    if (wins >= winsNeeded) {
                      statusIcon = <CheckCircle className="h-4 w-4 text-success" />;
                      statusText = 'Safe';
                      statusColor = 'text-success';
                    } else if (gamesRemaining + wins < winsNeeded) {
                      statusIcon = <XCircle className="h-4 w-4 text-destructive" />;
                      statusText = 'Cannot Win';
                      statusColor = 'text-destructive';
                    } else {
                      statusIcon = <Clock className="h-4 w-4 text-warning" />;
                      statusText = 'In Progress';
                      statusColor = 'text-warning';
                    }
                  }

                  return (
                    <div
                      key={idx}
                      className={`border border-border rounded-lg p-4 ${
                        pick.user_id === user?.id ? 'bg-primary/5 border-primary/30' : 'bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-semibold">{pick.participant_name}</span>
                            {pick.user_id === user?.id && (
                              <Badge variant="outline" className="text-xs">You</Badge>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-primary text-lg">{pick.abbreviation}</span>
                            <span className="text-xs text-muted-foreground">({pick.team_name})</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {statusIcon}
                          <span className={`text-sm font-medium ${statusColor}`}>
                            {statusText}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Games</div>
                          <Badge variant="secondary" className="text-xs">
                            {pick.games_played || 0}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Need</div>
                          <Badge
                            variant={winsNeeded === 2 ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {winsNeeded}W
                          </Badge>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Wins</div>
                          <div className="text-lg font-bold text-success">{wins}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Loss</div>
                          <div className="text-lg font-bold text-destructive">{losses}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eliminated Message */}
      {isUserParticipant() && userStatus?.is_eliminated && activeContest?.status !== 'completed' && (
        <Card className="shadow-ice border-destructive/30">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <h3 className="text-lg font-semibold">You've Been Eliminated</h3>
              <p className="text-sm text-muted-foreground">
                {userStatus.elimination_week ? `You were eliminated in week ${userStatus.elimination_week}.` : 'You were eliminated in the playoffs.'} Better luck next season!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contest Completed Message for Participants */}
      {isUserParticipant() && activeContest?.status === 'completed' && winners.length === 0 && (
        <Card className="shadow-ice border-muted">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-semibold">Contest Completed</h3>
              <p className="text-sm text-muted-foreground">
                This survivor contest has ended. Check the standings below for final results.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Survivor Status */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle>Survivor Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Alive Players */}
            <div>
              <h3 className="font-semibold text-success mb-3 flex items-center space-x-2">
                <Target className="h-4 w-4" />
                <span>{activeContest.status === 'completed' ? 'Final Survivors' : 'Still Alive'} ({aliveCount})</span>
              </h3>
              <div className="space-y-2">
                {survivors
                  .filter(s => s.status === "alive")
                  .map((survivor) => (
                    <div key={survivor.name} className="flex items-center justify-between p-2 rounded bg-success/5 border border-success/20">
                      <span className="font-medium">{survivor.name}</span>
                      <Badge variant="outline" className="text-success border-success">
                        {activeContest.status === 'completed' ? 'Final' : activeContest.phase === 'playoff_tiebreaker' ? 'Playoffs' : `Week ${currentWeek}`}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>

            {/* Eliminated Players */}
            <div>
              <h3 className="font-semibold text-destructive mb-3 flex items-center space-x-2">
                <XCircle className="h-4 w-4" />
                <span>Eliminated ({eliminatedCount})</span>
              </h3>
              <div className="space-y-2">
                {survivors
                  .filter(s => s.status === "eliminated")
                  .sort((a, b) => (b.weeksEliminated || 0) - (a.weeksEliminated || 0))
                  .map((survivor) => (
                    <div key={survivor.name} className="flex items-center justify-between p-2 rounded bg-destructive/5 border border-destructive/20">
                      <span className="font-medium opacity-75">{survivor.name}</span>
                      <Badge variant="outline" className="text-destructive border-destructive">
                        {survivor.weeksEliminated ? `Week ${survivor.weeksEliminated}` : 'Playoffs'}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warning Dialog - 4+ games */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span>High Game Count Warning</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {warningTeam?.abbreviation} ({warningTeam?.team_name}) plays {warningTeam?.games_this_week} games this week.
              They will need <strong>2 wins</strong> to keep you alive in the survivor contest.
              <br /><br />
              Are you sure you want to pick this team?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSelection} className="gradient-hockey">
              Yes, Pick {warningTeam?.abbreviation}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Late Pick Warning Dialog - requires acknowledgment */}
      <AlertDialog open={showLatePickWarning} onOpenChange={setShowLatePickWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-warning" />
              <span>Late Pick Notice</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {latePickMessage}
              <br /><br />
              <strong>Important:</strong> Games that have already started will <strong>not</strong> count as wins for you, but they <strong>will</strong> still count toward the team's total games played for the week.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmitPick(true)} disabled={submitting}>
              I Understand, Submit Pick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SurvivorContest;
