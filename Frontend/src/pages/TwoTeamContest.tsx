import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Trophy, Users, Timer, CheckCircle2 } from 'lucide-react';

interface Contest {
  contest_id: number;
  contest_name: string;
  season_year: string;
  contest_type: string;
  status: 'waiting' | 'drafting' | 'in_progress' | 'completed' | 'cancelled';
  max_participants: number;
  current_participants: number;
  draft_order: number[] | null;
  current_draft_pick: number;
  participants: Participant[];
  is_tiebreaker?: boolean;
  parent_contest_id?: number;
  tiebreaker_type?: string;
  excluded_team_id?: number;
}

interface Participant {
  participant_id: number;
  participant_name: string;
  draft_order: number;
  user_id: number;
  user_email?: string;
}

interface Team {
  team_id: number;
  team_name: string;
  abbreviation: string;
  conference_name: string;
  division_name: string;
}

interface DraftPick {
  pick_number: number;
  round: number;
  participant: Participant;
  total_picks: number;
}

interface LeaderboardEntry {
  participant_id: number;
  participant_name: string;
  draft_order: number;
  team1_name?: string;
  team1_abbrev?: string;
  team2_name?: string;
  team2_abbrev?: string;
  team1_wins?: number;
  team2_wins?: number;
  total_wins?: number;
  // For playoff tiebreaker
  team_ids?: number[];
  total_playoff_wins?: number;
  teams?: Array<{
    team_id: number;
    team_name: string;
    abbreviation: string;
  }>;
}

export default function TwoTeamContest() {
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [currentPick, setCurrentPick] = useState<DraftPick | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');
  const previousStatusRef = useRef<string | null>(null);
  const isInitialLoad = useRef<boolean>(true);

  // Load active contest
  useEffect(() => {
    loadContest();
  }, []);

  const loadingContest = useRef(false);
  useEffect(() => {
    if (!contest || !['waiting', 'drafting', 'in_progress'].includes(contest.status)) return;
    const interval = setInterval(() => void loadContest(), contest.status === 'drafting' ? 10000 : 30000);
    return () => clearInterval(interval);
  }, [contest?.status, contest?.contest_id]);

  // Set initial tab and handle status changes
  useEffect(() => {
    if (contest) {
      // On initial load, set the appropriate tab
      if (isInitialLoad.current) {
        if (contest.status === 'drafting') {
          setActiveTab('draft');
        } else if (contest.status === 'waiting') {
          setActiveTab('join');
        } else {
          setActiveTab('participants');
        }
        isInitialLoad.current = false;
      } else {
        // Check if status changed from waiting to drafting (not initial load)
        if (previousStatusRef.current === 'waiting' && contest.status === 'drafting') {
          setActiveTab('draft');
          toast.success('Draft has started! Select your teams.');
        } else if (previousStatusRef.current !== contest.status && ['in_progress', 'completed'].includes(contest.status)) {
          setActiveTab('participants');
        }
      }
      previousStatusRef.current = contest.status;
    }
  }, [contest?.status]);

  const loadContest = async () => {
    if (loadingContest.current) return;
    loadingContest.current = true;
    try {
      // Try to load regular two_team contest first, then playoff_tiebreaker
      let response: Contest | null = null;
      let foundContest = false;
      
      try {
        response = await api.get<Contest>('/contest/contests/active/two_team');
        foundContest = true;
        console.log('Found two_team contest:', response);
      } catch (error: any) {
        console.log('No two_team contest, trying playoff_tiebreaker...');
        // If no two_team contest (404 or "No active contest found"), try playoff_tiebreaker
        if (error.message?.includes('404') || error.message?.includes('No active contest found')) {
          try {
            response = await api.get<Contest>('/contest/contests/active/playoff_tiebreaker');
            foundContest = true;
            console.log('Found playoff_tiebreaker contest:', response);
          } catch (tiebreakerError: any) {
            // Both failed, no active contest
            console.log('No playoff_tiebreaker either:', tiebreakerError);
            foundContest = false;
          }
        } else {
          console.error('Unexpected error loading two_team contest:', error);
          throw error;
        }
      }
      
      if (!foundContest || !response) {
        console.log('No contest found, showing error');
        // Don't show toast on initial load, let the UI handle it
        return;
      }
      
      console.log('Setting contest:', response);
      setContest(response);
      
      // Load data in parallel for faster initial load
      if (response.status === 'drafting') {
        await Promise.all([
          loadAvailableTeams(response.contest_id),
          loadCurrentPick(response.contest_id)
        ]);
      } else if (response.status === 'in_progress' || response.status === 'completed') {
        await loadLeaderboard(response.contest_id);
      }
    } catch (error: any) {
      console.error('Failed to load contest:', error);
      toast.error('Failed to load contest. Please try again.');
    } finally {
      loadingContest.current = false;
      setLoading(false);
    }
  };

  const loadAvailableTeams = async (contestId: number) => {
    try {
      const response = await api.get<Team[]>(`/contest/picks/available-teams?contest_id=${contestId}`);
      setAvailableTeams(response);
    } catch (error) {
      console.error('Failed to load available teams:', error);
    }
  };

  const loadCurrentPick = async (contestId = contest?.contest_id) => {
    if (!contestId) return;
    
    try {
      const response = await api.get<DraftPick>(`/contest/contests/${contestId}/draft/current`);
      setCurrentPick(response);
    } catch (error) {
      console.error('Failed to load current pick:', error);
    }
  };

  const loadLeaderboard = async (contestId: number) => {
    try {
      const response = await api.get<LeaderboardEntry[]>(`/contest/leaderboard?contest_id=${contestId}`);
      setLeaderboard(response);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    }
  };

  const handleJoinContest = async () => {
    if (!contest || !user) return;

    try {
      const response = await api.post<{ contest: Contest }>(`/contest/contests/${contest.contest_id}/join`, {
        participant_name: user.name
      });
      
      setContest(response.contest);
      toast.success('Successfully joined the contest!');
      
      // If contest is now full and drafting, switch to draft tab
      if (response.contest.status === 'drafting') {
        setActiveTab('draft');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to join contest');
    }
  };

  const handleLeaveContest = async () => {
    if (!contest) return;

    try {
      await api.delete(`/contest/contests/${contest.contest_id}/leave`);
      await loadContest();
      toast.success('Successfully left the contest');
    } catch (error: any) {
      toast.error(error.message || 'Failed to leave contest');
    }
  };

  const handleMakePick = async () => {
    if (!contest || !selectedTeam || submitting) return;

    try {
      setSubmitting(true);
      await api.post(`/contest/contests/${contest.contest_id}/draft/pick`, {
        team_id: selectedTeam
      });
      
      setSelectedTeam(null);
      await loadContest();
      toast.success('Pick submitted successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to make pick');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      waiting: 'secondary',
      drafting: 'default',
      in_progress: 'default',
      completed: 'outline'
    };
    
    return (
      <Badge variant={variants[status] || 'default'}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const isUserParticipant = () => {
    if (!contest || !user) return false;
    return contest.participants.some(p => p.user_id === user.id);
  };

  const isUserTurn = () => {
    if (!currentPick || !user) return false;
    return currentPick.participant.user_id === user.id;
  };

  const getTotalTeamsForTiebreaker = () => {
    if (!contest?.is_tiebreaker) return 32;
    
    // For tiebreaker contests, determine total teams based on participant count
    if (contest.max_participants === 2) return 16; // 2 participants = 16 teams (8 each)
    if (contest.max_participants === 3) return 15; // 3 participants = 15 teams (5 each)
    if (contest.max_participants === 4) return 16; // 4 participants = 16 teams (4 each)
    
    return 16; // default
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertDescription>
            No active Two-Team Contest found. Check back later or contact an administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{contest.contest_name}</h1>
          <p className="text-muted-foreground">
            {contest.season_year}
            {contest.is_tiebreaker && contest.excluded_team_id && (
              <span className="ml-2 text-sm text-orange-600">
                • One team excluded from draft
              </span>
            )}
          </p>
          {contest.is_tiebreaker && (
            <div className="mt-2">
              <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400">
                Playoff Tiebreaker Contest
              </Badge>
            </div>
          )}
        </div>
        {getStatusBadge(contest.status)}
      </div>

      {/* Show leaderboard directly when contest is in progress or completed */}
      {(contest.status === 'in_progress' || contest.status === 'completed') ? (
        <>
          {/* Winner Celebration Section - Only for Completed Contests */}
          {contest.status === 'completed' && leaderboard.length > 0 && (
            <Card className="relative overflow-hidden border-2 border-yellow-400 dark:border-yellow-600 shadow-xl">
              {/* Celebration Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950/20 dark:via-amber-950/20 dark:to-orange-950/20 opacity-50" />
              
              {/* Confetti Effect - Behind content */}
              <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute top-4 left-[15%] text-2xl animate-bounce opacity-40">🎉</div>
                <div className="absolute top-8 right-[15%] text-2xl animate-bounce delay-100 opacity-40">🎊</div>
                <div className="absolute top-12 left-[25%] text-xl animate-bounce delay-200 opacity-40">✨</div>
                <div className="absolute top-6 right-[25%] text-2xl animate-bounce delay-300 opacity-40">🏆</div>
              </div>

              <CardContent className="py-8 relative z-10">
                {/* Trophy and Winner Section */}
                <div className="text-center space-y-4">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-30 animate-pulse" />
                    <Trophy className="h-20 w-20 mx-auto text-yellow-500 relative z-10 drop-shadow-lg" />
                  </div>
                  
                  <div className="space-y-1 relative z-10">
                    <h2 className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                      🎊 CONTEST COMPLETE! 🎊
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      {contest.contest_name}
                    </p>
                  </div>

                  {/* Winner Podium */}
                  {leaderboard.length > 0 && (
                  <div className="max-w-3xl mx-auto mt-6">
                    <div className="bg-gradient-to-br from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 rounded-xl p-6 border-2 border-yellow-300 dark:border-yellow-700">
                      <div className="flex items-center gap-2 justify-center mb-3">
                        <div className="text-5xl">🥇</div>
                      </div>
                      <h3 className="text-3xl font-bold text-yellow-700 dark:text-yellow-400 mb-2">
                        {leaderboard[0].participant_name}
                      </h3>
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {contest.is_tiebreaker 
                          ? `${leaderboard[0].total_playoff_wins} Playoff Wins`
                          : `${leaderboard[0].total_wins} Total Wins`
                        }
                      </p>
                      {!contest.is_tiebreaker && (
                        <div className="flex justify-center gap-6 mt-3 text-base">
                          <div>
                            <div className="font-semibold text-foreground">
                              {leaderboard[0].team1_name}
                            </div>
                            <div className="text-yellow-600 dark:text-yellow-400 font-bold">
                              {leaderboard[0].team1_wins} wins
                            </div>
                          </div>
                          <div className="text-xl text-muted-foreground">+</div>
                          <div>
                            <div className="font-semibold text-foreground">
                              {leaderboard[0].team2_name}
                            </div>
                            <div className="text-yellow-600 dark:text-yellow-400 font-bold">
                              {leaderboard[0].team2_wins} wins
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Runner-ups */}
                    {leaderboard.length > 1 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {/* Second Place */}
                        <div className="bg-muted/50 rounded-lg p-4 border-2 border-border">
                          <div className="text-3xl mb-1">🥈</div>
                          <h4 className="text-xl font-bold text-foreground mb-1">
                            {leaderboard[1].participant_name}
                          </h4>
                          <p className="text-lg font-bold text-muted-foreground">
                            {contest.is_tiebreaker 
                              ? `${leaderboard[1].total_playoff_wins} Playoff Wins`
                              : `${leaderboard[1].total_wins} Total Wins`
                            }
                          </p>
                        </div>

                        {/* Third Place */}
                        {leaderboard.length > 2 && (
                          <div className="bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-lg p-4 border-2 border-orange-300 dark:border-orange-700">
                            <div className="text-3xl mb-1">🥉</div>
                            <h4 className="text-xl font-bold text-orange-700 dark:text-orange-400 mb-1">
                              {leaderboard[2].participant_name}
                            </h4>
                            <p className="text-lg font-bold text-orange-600 dark:text-orange-500">
                              {contest.is_tiebreaker 
                                ? `${leaderboard[2].total_playoff_wins} Playoff Wins`
                                : `${leaderboard[2].total_wins} Total Wins`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Leaderboard */}
          <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <CardTitle>{contest.status === 'completed' ? 'Final Standings' : 'Leaderboard'}</CardTitle>
            </div>
            <CardDescription>
              {contest.is_tiebreaker 
                ? `Playoff Tiebreaker - Ranked by playoff wins (${contest.tiebreaker_type?.replace('_', ' ')})`
                : 'Ranked by total regular season wins'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No standings yet. Waiting for picks to be made.</p>
              </div>
            ) : contest.is_tiebreaker ? (
              // Playoff Tiebreaker Leaderboard
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted/50">
                      <th className="text-left p-4 font-semibold text-sm">Rank</th>
                      <th className="text-left p-4 font-semibold text-sm">Participant</th>
                      <th className="text-left p-4 font-semibold text-sm">Playoff Teams</th>
                      <th className="text-center p-4 font-semibold text-sm bg-primary/10">Playoff Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, index) => (
                      <tr 
                        key={entry.participant_id}
                        className={`border-b border-border transition-colors hover:bg-muted/30 ${
                          index === 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 
                          index === 1 ? 'bg-muted/30' :
                          index === 2 ? 'bg-orange-50 dark:bg-orange-950/20' :
                          ''
                        }`}
                      >
                        <td className="p-4">
                          <div className={`font-bold text-lg ${
                            index === 0 ? 'text-yellow-600' :
                            index === 1 ? 'text-muted-foreground' :
                            index === 2 ? 'text-orange-600' :
                            'text-muted-foreground'
                          }`}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold">{entry.participant_name}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {entry.teams && entry.teams.length > 0 ? (
                              entry.teams.map((team) => (
                                <Badge key={team.team_id} variant="outline" className="text-xs">
                                  {team.abbreviation}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">No picks yet</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center bg-primary/5">
                          <div className="flex flex-col items-center">
                            <div className="text-3xl font-bold text-primary">{entry.total_playoff_wins || 0}</div>
                            {index === 0 && <Trophy className="h-4 w-4 text-yellow-600 mt-1" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // Regular Two-Team Leaderboard
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border bg-muted/50">
                      <th className="text-left p-4 font-semibold text-sm">Rank</th>
                      <th className="text-left p-4 font-semibold text-sm">Participant</th>
                      <th className="text-left p-4 font-semibold text-sm">Team 1</th>
                      <th className="text-center p-4 font-semibold text-sm">Team 1 Wins</th>
                      <th className="text-left p-4 font-semibold text-sm">Team 2</th>
                      <th className="text-center p-4 font-semibold text-sm">Team 2 Wins</th>
                      <th className="text-center p-4 font-semibold text-sm bg-primary/10">Total Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, index) => (
                      <tr 
                        key={entry.participant_id}
                        className={`border-b border-border transition-colors hover:bg-muted/30 ${
                          index === 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 
                          index === 1 ? 'bg-muted/30' :
                          index === 2 ? 'bg-orange-50 dark:bg-orange-950/20' :
                          ''
                        }`}
                      >
                        <td className="p-4">
                          <div className={`font-bold text-lg ${
                            index === 0 ? 'text-yellow-600' :
                            index === 1 ? 'text-muted-foreground' :
                            index === 2 ? 'text-orange-600' :
                            'text-muted-foreground'
                          }`}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold">{entry.participant_name}</div>
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-medium">{entry.team1_name}</div>
                            <div className="text-xs text-muted-foreground">{entry.team1_abbrev}</div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-2xl font-bold">{entry.team1_wins}</div>
                        </td>
                        <td className="p-4">
                          <div>
                            <div className="font-medium">{entry.team2_name}</div>
                            <div className="text-xs text-muted-foreground">{entry.team2_abbrev}</div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-2xl font-bold">{entry.team2_wins}</div>
                        </td>
                        <td className="p-4 text-center bg-primary/5">
                          <div className="flex flex-col items-center">
                            <div className="text-3xl font-bold text-primary">{entry.total_wins}</div>
                            {index === 0 && <Trophy className="h-4 w-4 text-yellow-600 mt-1" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {contest.status === 'waiting' && <TabsTrigger value="join">Join Contest</TabsTrigger>}
            <TabsTrigger value="participants">
              Participants ({contest.current_participants}/{contest.max_participants})
            </TabsTrigger>
            {contest.status === 'drafting' && <TabsTrigger value="draft">Draft</TabsTrigger>}
          </TabsList>

        {/* Join Contest Tab */}
        {contest.status === 'waiting' && (
          <TabsContent value="join">
            <Card>
        <CardHeader>
                <CardTitle>Join the Contest</CardTitle>
                <CardDescription>
                  Click join to enter the draft as "{user?.name}". Once 16 participants join, the draft will begin automatically.
                </CardDescription>
        </CardHeader>
              <CardContent className="space-y-4">
                {!isUserParticipant() ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">You will join as:</p>
                      <p className="text-lg font-semibold">{user?.name}</p>
                    </div>
                    <Button 
                      onClick={handleJoinContest} 
                      disabled={contest.current_participants >= contest.max_participants}
                      className="w-full"
                      size="lg"
                    >
                      Join Contest
                    </Button>
            </div>
                ) : (
                  <div className="space-y-4">
                    <Alert>
                      <AlertDescription>
                        You have successfully joined the contest as <strong>{user?.name}</strong>! Waiting for more participants...
                      </AlertDescription>
                    </Alert>
                    <Button variant="outline" onClick={handleLeaveContest}>
                      Leave Contest
                    </Button>
          </div>
                )}
        </CardContent>
      </Card>
          </TabsContent>
        )}

        {/* Participants Tab */}
        <TabsContent value="participants">
          <Card>
        <CardHeader>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                {contest.status === 'waiting' 
                  ? `${contest.max_participants - contest.current_participants} spots remaining`
                  : 'Draft order determined'}
              </CardDescription>
        </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {contest.participants.length === 0 ? (
                  <p className="text-muted-foreground">No participants yet</p>
                ) : (
                  contest.participants
                    .sort((a, b) => a.draft_order - b.draft_order)
                    .map((participant) => (
                      <div key={participant.participant_id} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <span className="font-medium">{participant.participant_name}</span>
                          {participant.user_id === user?.id && (
                            <Badge variant="secondary" className="ml-2">You</Badge>
                          )}
                        </div>
                        <Badge variant="outline">Pick #{participant.draft_order}</Badge>
                      </div>
                    ))
                )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* Draft Tab */}
        {contest.status === 'drafting' && (
          <TabsContent value="draft">
            <div className="space-y-4">
              {currentPick && (
                <Alert>
                  <AlertDescription>
                    <div className="font-semibold">
                      Current Pick: #{currentPick.pick_number} (Round {currentPick.round}{currentPick.round === 1 ? ' ↓' : ' ↑'})
                    </div>
                    <div className="mt-1">
                      {isUserTurn() ? (
                        <span className="text-green-600 font-medium">It's your turn to pick!</span>
                      ) : (
                        <span>Waiting for {currentPick.participant.participant_name}...</span>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {isUserTurn() && (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-primary animate-pulse" />
                      <CardTitle>Your Turn to Pick!</CardTitle>
                    </div>
                    <CardDescription>Select a team from the available options below</CardDescription>
          </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Conference grouped teams */}
                    {['Eastern', 'Western'].map((conference) => {
                      const conferenceTeams = availableTeams.filter(
                        (t) => t.conference_name === conference
                      );
                      if (conferenceTeams.length === 0) return null;
                      
                      return (
                        <div key={conference} className="space-y-2">
                          <h3 className="font-semibold text-sm text-muted-foreground">
                            {conference} Conference ({conferenceTeams.length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {conferenceTeams.map((team) => (
                              <Button
                                key={team.team_id}
                                variant={selectedTeam === team.team_id ? 'default' : 'outline'}
                                className="h-auto py-3 justify-start"
                                onClick={() => setSelectedTeam(team.team_id)}
                              >
                                <div className="text-left flex-1">
                                  <div className="font-semibold">{team.abbreviation}</div>
                                  <div className="text-xs opacity-80 truncate">
                                    {team.team_name}
                                  </div>
                                </div>
                                {selectedTeam === team.team_id && (
                                  <CheckCircle2 className="h-4 w-4 ml-2" />
                                )}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    
                    <Button 
                      onClick={handleMakePick} 
                      disabled={!selectedTeam || submitting}
                      className="w-full"
                      size="lg"
                    >
                      {submitting ? 'Submitting...' : selectedTeam ? 'Confirm Pick' : 'Select a team to continue'}
                    </Button>
          </CardContent>
        </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Draft Overview</CardTitle>
                  <CardDescription>
                    {contest.is_tiebreaker 
                      ? `${availableTeams.length} playoff teams remaining • ${getTotalTeamsForTiebreaker() - availableTeams.length} teams picked`
                      : `${availableTeams.length} teams remaining • ${32 - availableTeams.length} teams picked`
                    }
                  </CardDescription>
          </CardHeader>
          <CardContent>
                  <div className="space-y-4">
                    {['Eastern', 'Western'].map((conference) => {
                      const conferenceTeams = availableTeams.filter(
                        (t) => t.conference_name === conference
                      );
                      
                      return (
                        <div key={conference}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-sm">{conference} Conference</h4>
                            <Badge variant="secondary">{conferenceTeams.length} available</Badge>
                          </div>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            {conferenceTeams.map((team) => (
                              <div 
                                key={team.team_id} 
                                className="text-center p-2 border rounded hover:bg-accent transition-colors"
                              >
                                <div className="font-bold text-sm">{team.abbreviation}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
          </CardContent>
        </Card>
            </div>
          </TabsContent>
        )}
        </Tabs>
      )}
    </div>
  );
}

