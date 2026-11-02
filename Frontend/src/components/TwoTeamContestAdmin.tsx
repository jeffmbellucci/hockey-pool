import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Plus, Play, CheckCircle, XCircle, Trash2, Users, Calendar, Edit, UserMinus, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface Contest {
  contest_id: number;
  contest_name: string;
  season_year: string;
  contest_type: string;
  status: 'waiting' | 'drafting' | 'in_progress' | 'completed' | 'cancelled';
  max_participants: number;
  current_participants: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface Participant {
  participant_id: number;
  participant_name: string;
  draft_order: number;
  user_email?: string;
}

interface User {
  id: number;
  email: string;
  name: string;
  lastName: string;
}

interface Team {
  team_id: number;
  team_name: string;
  abbreviation: string;
  conference_name?: string;
  division_name?: string;
}

export default function TwoTeamContestAdmin() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [editingContest, setEditingContest] = useState<Contest | null>(null);
  const [importingContest, setImportingContest] = useState<Contest | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [newContest, setNewContest] = useState({
    contest_name: '',
    season_year: '',
    max_participants: 16,
    contest_type: 'two_team'
  });
  const [editContest, setEditContest] = useState({
    contest_name: '',
    season_year: '',
    max_participants: 2
  });
  const [importParticipant, setImportParticipant] = useState({
    user_id: '',
    team1_id: '',
    team2_id: ''
  });

  useEffect(() => {
    loadContests();
    loadUsers();
    loadTeams();
  }, []);

  const loadContests = async () => {
    try {
      setLoading(true);
      const response = await api.get<Contest[]>('/contest/contests');
      // Filter to only show two_team contests (not survivor or other types)
      const twoTeamContests = response.filter(contest => 
        contest.contest_type === 'two_team' || 
        contest.contest_type === 'playoff_tiebreaker'
      );
      setContests(twoTeamContests);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load contests');
    } finally {
      setLoading(false);
    }
  };

  const loadContestDetails = async (contestId: number) => {
    try {
      const response = await api.get<{ participants: Participant[] }>(`/contest/contests/${contestId}`);
      setParticipants(response.participants || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load contest details');
    }
  };

  const loadUsers = async () => {
    try {
      const response = await api.getAllUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error: any) {
      console.error('Failed to load users:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await api.get<Team[]>('/contest/teams');
      setTeams(response);
    } catch (error: any) {
      console.error('Failed to load teams:', error);
    }
  };

  const loadAvailableTeams = async (contestId: number) => {
    try {
      const response = await api.get<Team[]>(`/contest/picks/available-teams?contest_id=${contestId}`);
      setAvailableTeams(response);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load available teams');
    }
  };

  const handleCreateContest = async () => {
    if (!newContest.contest_name || !newContest.season_year) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/contest/contests', newContest);
      toast.success('Contest created successfully!');
      setIsCreateDialogOpen(false);
      setNewContest({
        contest_name: '',
        season_year: '',
        max_participants: 16,
        contest_type: 'two_team'
      });
      await loadContests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create contest');
    }
  };

  const handleStartContest = async (contestId: number) => {
    if (!confirm('Are you sure you want to start the draft? This will randomize the draft order.')) return;

    try {
      await api.post(`/contest/contests/${contestId}/start`, {});
      toast.success('Contest started successfully!');
      await loadContests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to start contest');
    }
  };

  const handleCompleteContest = async (contestId: number) => {
    if (!confirm('Are you sure you want to complete this contest? This action cannot be undone.')) return;

    try {
      await api.post(`/contest/contests/${contestId}/complete`, {});
      toast.success('Contest completed successfully!');
      await loadContests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete contest');
    }
  };

  const handleDeleteContest = async (contestId: number) => {
    if (!confirm('Are you sure you want to delete this contest? This will delete all associated participants and picks.')) return;

    try {
      await api.delete(`/contest/contests/${contestId}`);
      toast.success('Contest deleted successfully!');
      await loadContests();
      if (selectedContest?.contest_id === contestId) {
        setSelectedContest(null);
        setParticipants([]);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete contest');
    }
  };

  const handleEditContest = async () => {
    if (!editingContest || !editContest.contest_name || !editContest.season_year) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await api.put(`/contest/contests/${editingContest.contest_id}`, {
        contest_name: editContest.contest_name,
        season_year: editContest.season_year,
        max_participants: editContest.max_participants
      });
      toast.success('Contest updated successfully!');
      setIsEditDialogOpen(false);
      setEditingContest(null);
      await loadContests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update contest');
    }
  };

  const openEditDialog = (contest: Contest) => {
    setEditingContest(contest);
    setEditContest({
      contest_name: contest.contest_name,
      season_year: contest.season_year,
      max_participants: contest.max_participants
    });
    setIsEditDialogOpen(true);
  };

  const handleRemoveParticipant = async (contestId: number, participantId: number, participantName: string) => {
    if (!confirm(`Are you sure you want to remove ${participantName} from this contest?`)) return;

    try {
      await api.delete(`/contest/participants/${participantId}`);
      toast.success('Participant removed successfully!');
      await loadContestDetails(contestId);
      await loadContests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove participant');
    }
  };

  const openImportDialog = async (contest: Contest) => {
    setImportingContest(contest);
    await loadAvailableTeams(contest.contest_id);
    setImportParticipant({
      user_id: '',
      team1_id: '',
      team2_id: ''
    });
    setIsImportDialogOpen(true);
  };

  const handleImportParticipant = async () => {
    if (!importingContest || !importParticipant.user_id || !importParticipant.team1_id || !importParticipant.team2_id) {
      toast.error('Please select a user and both teams');
      return;
    }

    if (importParticipant.team1_id === importParticipant.team2_id) {
      toast.error('Team 1 and Team 2 must be different');
      return;
    }

    try {
      await api.post(`/contest/contests/${importingContest.contest_id}/admin/add-participant`, {
        user_id: parseInt(importParticipant.user_id),
        team1_id: parseInt(importParticipant.team1_id),
        team2_id: parseInt(importParticipant.team2_id)
      });
      toast.success('Participant imported successfully!');
      setIsImportDialogOpen(false);
      setImportParticipant({
        user_id: '',
        team1_id: '',
        team2_id: ''
      });
      await loadContests();
      if (selectedContest?.contest_id === importingContest.contest_id) {
        await loadContestDetails(importingContest.contest_id);
      }
      await loadAvailableTeams(importingContest.contest_id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to import participant');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
      waiting: { variant: 'secondary', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
      drafting: { variant: 'default', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
      in_progress: { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
      completed: { variant: 'outline' },
      cancelled: { variant: 'destructive' }
    };
    
    const { variant, className } = variants[status] || variants.waiting;
    
    return (
      <Badge variant={variant} className={className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getActionButton = (contest: Contest) => {
    switch (contest.status) {
      case 'waiting':
        return (
          <Button 
            size="sm" 
            onClick={() => handleStartContest(contest.contest_id)}
            disabled={contest.current_participants === 0}
          >
            <Play className="h-4 w-4 mr-2" />
            Start Draft
          </Button>
        );
      case 'drafting':
        return (
          <Badge variant="secondary">Draft in Progress</Badge>
        );
      case 'in_progress':
        return (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => handleCompleteContest(contest.contest_id)}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Complete
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-ice">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <CardTitle>Two-Team Contest Management</CardTitle>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-hockey">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Contest
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New Contest</DialogTitle>
                  <DialogDescription>
                    Set up a new Two-Team Contest for the season. Configure the contest name, season year, and maximum participants.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="contest-name">Contest Name *</Label>
                    <Input
                      id="contest-name"
                      placeholder="e.g., 2025-26 Two Team Contest"
                      value={newContest.contest_name}
                      onChange={(e) => setNewContest({ ...newContest, contest_name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="season-year">Season Year *</Label>
                    <Input
                      id="season-year"
                      placeholder="e.g., 2025-26"
                      value={newContest.season_year}
                      onChange={(e) => setNewContest({ ...newContest, season_year: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-participants">Maximum Participants *</Label>
                    <Select
                      value={newContest.max_participants.toString()}
                      onValueChange={(value) => setNewContest({ ...newContest, max_participants: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 Participants (4 teams)</SelectItem>
                        <SelectItem value="4">4 Participants (8 teams)</SelectItem>
                        <SelectItem value="8">8 Participants (16 teams)</SelectItem>
                        <SelectItem value="16">16 Participants (32 teams) - Recommended</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Standard NHL has 32 teams. 2-16 participants work best without duplicate picks.
                    </p>
                  </div>


                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateContest} className="gradient-hockey">
                    Create Contest
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Import Participant Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Import Participant to Contest</DialogTitle>
                  <DialogDescription>
                    Add a user to {importingContest?.contest_name} with their team selections. This bypasses the normal draft process.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="import-user">Select User *</Label>
                    <Select
                      value={importParticipant.user_id}
                      onValueChange={(value) => setImportParticipant({ ...importParticipant, user_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name} {user.lastName} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="import-team1">Team 1 *</Label>
                      <Select
                        value={importParticipant.team1_id}
                        onValueChange={(value) => setImportParticipant({ ...importParticipant, team1_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Team 1..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTeams.map((team) => (
                            <SelectItem 
                              key={team.team_id} 
                              value={team.team_id.toString()}
                              disabled={importParticipant.team2_id === team.team_id.toString()}
                            >
                              {team.team_name} ({team.abbreviation})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-team2">Team 2 *</Label>
                      <Select
                        value={importParticipant.team2_id}
                        onValueChange={(value) => setImportParticipant({ ...importParticipant, team2_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Team 2..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTeams.map((team) => (
                            <SelectItem 
                              key={team.team_id} 
                              value={team.team_id.toString()}
                              disabled={importParticipant.team1_id === team.team_id.toString()}
                            >
                              {team.team_name} ({team.abbreviation})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      <strong>Available teams:</strong> {availableTeams.length} team(s) remaining
                    </p>
                    {importParticipant.team1_id && importParticipant.team2_id && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Selected: <strong>{teams.find(t => t.team_id.toString() === importParticipant.team1_id)?.abbreviation}</strong> and <strong>{teams.find(t => t.team_id.toString() === importParticipant.team2_id)?.abbreviation}</strong>
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleImportParticipant} className="gradient-hockey">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Import Participant
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Contest Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Edit Contest</DialogTitle>
                  <DialogDescription>
                    Update contest details. Note: You can only edit contests in "waiting" status.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-contest-name">Contest Name *</Label>
                    <Input
                      id="edit-contest-name"
                      placeholder="e.g., 2025-26 Two Team Contest"
                      value={editContest.contest_name}
                      onChange={(e) => setEditContest({ ...editContest, contest_name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-season-year">Season Year *</Label>
                    <Input
                      id="edit-season-year"
                      placeholder="e.g., 2025-26"
                      value={editContest.season_year}
                      onChange={(e) => setEditContest({ ...editContest, season_year: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-max-participants">Maximum Participants *</Label>
                    <Select
                      value={editContest.max_participants.toString()}
                      onValueChange={(value) => setEditContest({ ...editContest, max_participants: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 Participants (4 teams)</SelectItem>
                        <SelectItem value="4">4 Participants (8 teams)</SelectItem>
                        <SelectItem value="8">8 Participants (16 teams)</SelectItem>
                        <SelectItem value="16">16 Participants (32 teams) - Recommended</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {editingContest && editingContest.current_participants > 0 && 
                        `Current participants: ${editingContest.current_participants}. Cannot set below this number.`
                      }
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditContest} className="gradient-hockey">
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Create and manage Two-Team Contests. Monitor participant counts, start drafts, and complete seasons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading contests...
            </div>
          ) : contests.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground mb-4">No contests found. Create your first contest to get started.</p>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gradient-hockey">
                <Plus className="h-4 w-4 mr-2" />
                Create First Contest
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {contests
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((contest) => (
                  <div key={contest.contest_id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{contest.contest_name}</h3>
                          {getStatusBadge(contest.status)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>Season: {contest.season_year}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{contest.current_participants}/{contest.max_participants} Participants</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getActionButton(contest)}
                        {(contest.status === 'waiting' || contest.status === 'drafting' || contest.status === 'in_progress') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openImportDialog(contest)}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Import
                          </Button>
                        )}
                        {contest.status === 'waiting' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              aria-label={`Edit ${contest.contest_name}`}
                              onClick={() => openEditDialog(contest)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              aria-label={`Delete ${contest.contest_name}`}
                              onClick={() => handleDeleteContest(contest.contest_id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {selectedContest?.contest_id === contest.contest_id && (
                      <div className="border-t pt-3 mt-3">
                        <h4 className="font-medium mb-2">Participants ({participants.length})</h4>
                        {participants.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No participants yet</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {participants
                              .sort((a, b) => a.draft_order - b.draft_order)
                              .map((participant) => (
                                <div key={participant.participant_id} className="text-sm p-2 border rounded flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">#{participant.draft_order}</Badge>
                                    <div>
                                      <div className="font-medium">{participant.participant_name}</div>
                                      {participant.user_email && (
                                        <div className="text-xs text-muted-foreground">{participant.user_email}</div>
                                      )}
                                    </div>
                                  </div>
                                  {contest.status === 'waiting' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleRemoveParticipant(contest.contest_id, participant.participant_id, participant.participant_name)}
                                    >
                                      <UserMinus className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Toggle Details Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        if (selectedContest?.contest_id === contest.contest_id) {
                          setSelectedContest(null);
                          setParticipants([]);
                        } else {
                          setSelectedContest(contest);
                          loadContestDetails(contest.contest_id);
                        }
                      }}
                    >
                      {selectedContest?.contest_id === contest.contest_id ? 'Hide Details' : 'Show Details'}
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

