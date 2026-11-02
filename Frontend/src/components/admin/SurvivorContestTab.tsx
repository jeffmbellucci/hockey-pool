import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Target, Plus, Loader2, Play, Calendar, ChevronRight, CheckCircle, AlertCircle, Trophy, Users, Edit3, Shield, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import SurvivorPlayoffs from '@/components/SurvivorPlayoffs';
import { SurvivorImportDialog } from './SurvivorImportDialog';
import { SurvivorAddPickDialog } from './SurvivorAddPickDialog';

interface SurvivorContestTabProps {
  currentWeek: number;
  survivorAlive: number;
}

export const SurvivorContestTab = ({ currentWeek, survivorAlive }: SurvivorContestTabProps) => {
  const { toast } = useToast();
  const [contests, setContests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startWeek, setStartWeek] = useState(1);
  const [importContest, setImportContest] = useState<any>(null);
  const [addPickContest, setAddPickContest] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showEditWeeksDialog, setShowEditWeeksDialog] = useState(false);
  const [contestToStart, setContestToStart] = useState<any>(null);
  const [contestToEdit, setContestToEdit] = useState<any>(null);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [savingWeeks, setSavingWeeks] = useState(false);
  const [processingResults, setProcessingResults] = useState(false);
  const [advancingWeek, setAdvancingWeek] = useState(false);
  const [weekReadiness, setWeekReadiness] = useState<any>(null);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [contestToAdvance, setContestToAdvance] = useState<any>(null);
  const [formData, setFormData] = useState({
    contest_name: "",
    season_year: "",
    season_start_date: "",
    season_end_date: "",
    max_participants: 50
  });

  // Admin override state
  const [selectedContest, setSelectedContest] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [showParticipantsDialog, setShowParticipantsDialog] = useState(false);
  const [eliminateTarget, setEliminateTarget] = useState<any>(null);
  const [showEliminateDialog, setShowEliminateDialog] = useState(false);
  const [eliminationWeek, setEliminationWeek] = useState(1);
  const [updatingParticipant, setUpdatingParticipant] = useState(false);

  // Pick overrides
  const [weekPicks, setWeekPicks] = useState<any[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(false);
  const [showPicksDialog, setShowPicksDialog] = useState(false);
  const [picksWeek, setPicksWeek] = useState(1);
  const [picksRound, setPicksRound] = useState(1);
  const [pickTeams, setPickTeams] = useState<any[]>([]);
  const [editingPick, setEditingPick] = useState<any>(null);
  const [pickEditData, setPickEditData] = useState({ result: "", team_id: "" });
  const [updatingPick, setUpdatingPick] = useState(false);

  // Contest state overrides
  const [showStateDialog, setShowStateDialog] = useState(false);
  const [stateEditData, setStateEditData] = useState({
    phase: "",
    status: "",
    current_week: 1,
    playoff_round: 1,
    playoff_game_number: 1,
  });
  const [updatingState, setUpdatingState] = useState(false);

  useEffect(() => {
    loadContests();
  }, []);

  const loadContests = async () => {
    try {
      setLoading(true);
      const data = await api.getSurvivorContests();
      setContests(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load contests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      await api.createSurvivorContest(formData);
      toast({
        title: "Success",
        description: "Survivor contest created successfully"
      });
      setShowCreateDialog(false);
      setFormData({
        contest_name: "",
        season_year: "",
        season_start_date: "",
    season_end_date: "",
        max_participants: 50
      });
      loadContests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create contest",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStartContestClick = (contest: any) => {
    setContestToStart(contest);
    setStartWeek(contest.current_week || 1);
    setShowStartDialog(true);
  };

  const handleStartContest = async () => {
    if (!contestToStart) return;
    
    try {
      setStarting(true);
      const started = await api.startSurvivorContest(contestToStart.contest_id, startWeek);
      toast({
        title: started.contest?.week_setup?.success === false ? "Schedule needs attention" : "Success",
        description: started.contest?.week_setup?.success === false ? started.contest.week_setup.message : `Contest "${contestToStart.contest_name}" started at Week ${startWeek}!`
      });
      setShowStartDialog(false);
      setContestToStart(null);
      loadContests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start contest",
        variant: "destructive"
      });
    } finally {
      setStarting(false);
    }
  };

  const handleEditWeeksClick = async (contest: any) => {
    setContestToEdit(contest);
    setShowEditWeeksDialog(true);
    await loadWeeks(contest.contest_id);
  };

  const loadWeeks = async (contestId: number) => {
    try {
      setLoadingWeeks(true);
      const data = await api.getSurvivorWeeks(contestId);
      setWeeks(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load weeks",
        variant: "destructive"
      });
    } finally {
      setLoadingWeeks(false);
    }
  };

  const handleWeekChange = (weekIndex: number, field: string, value: string) => {
    const updatedWeeks = [...weeks];
    updatedWeeks[weekIndex] = { ...updatedWeeks[weekIndex], [field]: value };
    setWeeks(updatedWeeks);
  };

  const handleSaveWeeks = async () => {
    if (!contestToEdit) return;
    
    try {
      setSavingWeeks(true);
      await api.updateSurvivorWeeks(contestToEdit.contest_id, weeks);
      toast({
        title: "Success",
        description: "Weeks updated successfully"
      });
      setShowEditWeeksDialog(false);
      setContestToEdit(null);
      setWeeks([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save weeks",
        variant: "destructive"
      });
    } finally {
      setSavingWeeks(false);
    }
  };

  const checkWeekReadiness = async (contest: any) => {
    try {
      const result = await api.checkSurvivorWeekReadiness(contest.contest_id, contest.current_week);
      setWeekReadiness(result);
      return result;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to check week readiness",
        variant: "destructive"
      });
      return null;
    }
  };

  const handleProcessWeekResults = async (contest: any) => {
    try {
      setProcessingResults(true);
      const result = await api.processSurvivorWeekResults(contest.contest_id, contest.current_week);
      
      toast({
        title: "Week Results Processed",
        description: `Week ${result.week_number}: ${result.survived} survived, ${result.eliminated} eliminated${result.mass_elimination_prevented ? ' (Mass elimination prevented!)' : ''}`,
      });
      
      loadContests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process week results",
        variant: "destructive"
      });
    } finally {
      setProcessingResults(false);
    }
  };

  const handleAdvanceWeekClick = async (contest: any) => {
    setContestToAdvance(contest);
    await checkWeekReadiness(contest);
    setShowAdvanceDialog(true);
  };

  const handleAdvanceWeek = async () => {
    if (!contestToAdvance) return;
    
    try {
      setAdvancingWeek(true);
      const result = await api.advanceSurvivorWeek(contestToAdvance.contest_id);
      
      let description = "";
      if (result.action === 'advanced') {
        description = `Advanced from Week ${result.previous_week} to Week ${result.current_week}`;
      } else if (result.action === 'completed_with_winner') {
        description = `Contest completed! Winner determined in Week ${result.week_number}`;
      } else if (result.action === 'completed_final_week') {
        description = `Contest completed after final week`;
      }
      
      toast({
        title: "Week Advanced",
        description,
      });
      
      setShowAdvanceDialog(false);
      setContestToAdvance(null);
      setWeekReadiness(null);
      loadContests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to advance week",
        variant: "destructive"
      });
    } finally {
      setAdvancingWeek(false);
    }
  };

  // ==================== ADMIN OVERRIDE HANDLERS ====================

  const handleManageParticipants = async (contest: any) => {
    setSelectedContest(contest);
    setShowParticipantsDialog(true);
    try {
      setLoadingParticipants(true);
      const data = await api.getSurvivorParticipants(contest.contest_id);
      if (!Array.isArray(data)) throw new Error('Could not load participants');
      setParticipants(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load participants", variant: "destructive" });
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleEliminateClick = (participant: any) => {
    setEliminateTarget(participant);
    setEliminationWeek(selectedContest?.current_week || 1);
    setShowEliminateDialog(true);
  };

  const handleEliminateConfirm = async () => {
    if (!selectedContest || !eliminateTarget) return;
    try {
      setUpdatingParticipant(true);
      await api.adminUpdateParticipantStatus(selectedContest.contest_id, eliminateTarget.id, {
        is_eliminated: true,
        elimination_week: eliminationWeek,
      });
      toast({ title: "Participant Eliminated", description: `${eliminateTarget.participant_name || eliminateTarget.user_name || eliminateTarget.name} eliminated in week ${eliminationWeek}` });
      setShowEliminateDialog(false);
      handleManageParticipants(selectedContest);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to eliminate participant", variant: "destructive" });
    } finally {
      setUpdatingParticipant(false);
    }
  };

  const handleReinstate = async (participant: any) => {
    if (!selectedContest) return;
    try {
      setUpdatingParticipant(true);
      await api.adminUpdateParticipantStatus(selectedContest.contest_id, participant.id, {
        is_eliminated: false,
      });
      toast({ title: "Participant Reinstated", description: `${participant.participant_name || participant.user_name || participant.name} has been reinstated` });
      handleManageParticipants(selectedContest);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reinstate participant", variant: "destructive" });
    } finally {
      setUpdatingParticipant(false);
    }
  };

  const handleViewPicks = async (contest: any, week: number, round = contest.playoff_round || 1) => {
    setSelectedContest(contest);
    setPicksWeek(week);
    setPicksRound(round);
    setEditingPick(null);
    setShowPicksDialog(true);
    try {
      setLoadingPicks(true);
      const query = contest.phase === 'playoff_tiebreaker' ? `round=${round}&game=${week}` : `week=${week}`;
      const [data, teams] = await Promise.all([
        api.get<{ picks: any[] }>(`/admin/survivor/contests/${contest.contest_id}/picks?${query}`),
        api.get<any[]>('/contest/teams'),
      ]);
      setWeekPicks(data.picks || data || []);
      setPickTeams(teams);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load picks", variant: "destructive" });
    } finally {
      setLoadingPicks(false);
    }
  };

  const handleEditPick = (pick: any) => {
    setEditingPick(pick);
    setPickEditData({ result: pick.result || "pending", team_id: String(pick.team_id) });
  };

  const handleSavePick = async () => {
    if (!selectedContest || !editingPick) return;
    try {
      setUpdatingPick(true);
      if (selectedContest.phase === 'playoff_tiebreaker') {
        await api.adminUpdateTiebreakerPick(selectedContest.contest_id, editingPick.id, {
          is_correct: pickEditData.result === 'pending' ? null : pickEditData.result === 'survived',
          picked_team_id: Number(pickEditData.team_id),
        });
      } else {
        await api.adminUpdateSurvivorPick(selectedContest.contest_id, editingPick.id, {
          result: pickEditData.result, team_id: Number(pickEditData.team_id),
        });
      }
      toast({ title: "Pick Updated", description: "Pick result has been updated" });
      setEditingPick(null);
      handleViewPicks(selectedContest, picksWeek, picksRound);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update pick", variant: "destructive" });
    } finally {
      setUpdatingPick(false);
    }
  };

  const handleEditState = (contest: any) => {
    setSelectedContest(contest);
    setStateEditData({
      phase: contest.phase || "regular_season",
      status: contest.status || "waiting",
      current_week: contest.current_week || 1,
      playoff_round: contest.playoff_round || 1,
      playoff_game_number: contest.playoff_game_number || 1,
    });
    setShowStateDialog(true);
  };

  const handleSaveState = async () => {
    if (!selectedContest) return;
    try {
      setUpdatingState(true);
      await api.adminUpdateContestState(selectedContest.contest_id, stateEditData);
      toast({ title: "Contest State Updated", description: "Contest state has been modified" });
      setShowStateDialog(false);
      loadContests();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update contest state", variant: "destructive" });
    } finally {
      setUpdatingState(false);
    }
  };

  return (
    <Card className="shadow-ice">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Survivor Contest Management</span>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gradient-hockey">
                <Plus className="h-4 w-4 mr-2" />
                Create Contest
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Survivor Contest</DialogTitle>
                <DialogDescription>
                  Create a new survivor contest for the season
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateContest} className="space-y-4">
                <div>
                  <Label htmlFor="contest_name">Contest Name</Label>
                  <Input
                    id="contest_name"
                    value={formData.contest_name}
                    onChange={(e) => setFormData({ ...formData, contest_name: e.target.value })}
                    placeholder="Survivor Pool"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="season_year">Season</Label>
                  <Input
                    id="season_year"
                    value={formData.season_year}
                    onChange={(e) => setFormData({ ...formData, season_year: e.target.value })}
                    placeholder="2025-26"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="season_start_date">Season Start Date</Label>
                  <Input
                    id="season_start_date"
                    type="date"
                    value={formData.season_start_date}
                    onChange={(e) => setFormData({ ...formData, season_start_date: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    First day of the regular season (e.g., opening night)
                  </p>
                </div>
                <div>
                  <Label htmlFor="season_end_date">Regular Season End Date</Label>
                  <Input id="season_end_date" type="date" value={formData.season_end_date}
                    min={formData.season_start_date} required
                    onChange={(e) => setFormData({ ...formData, season_end_date: e.target.value })} />
                  <p className="text-xs text-muted-foreground mt-1">Last day of regular-season games. You can edit week dates afterward for scheduled breaks.</p>
                </div>
                <div>
                  <Label htmlFor="max_participants">Max Participants</Label>
                  <Input
                    id="max_participants"
                    type="number"
                    value={formData.max_participants}
                    onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) })}
                    min={1}
                    required
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="gradient-hockey">
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Contest"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : contests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No survivor contests yet. Create one to get started!
          </div>
        ) : (
          <div className="space-y-4">
            {contests.map((contest) => (
              <div key={contest.contest_id} className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium">{contest.contest_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {contest.phase === 'playoff_tiebreaker' ? `Playoffs · Round ${contest.playoff_round}, Game ${contest.playoff_game_number}` : `Week ${contest.current_week}`} - {contest.active_participants || 0} alive / {contest.total_participants || 0} total
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={contest.status === 'in_progress' ? 'default' : contest.status === 'waiting' ? 'secondary' : 'outline'}>
                    {contest.status === 'in_progress' ? 'Active' : contest.status}
                  </Badge>
                  
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleEditWeeksClick(contest)}
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Edit Weeks
                  </Button>
                  
                  {contest.status === 'waiting' && contest.phase === 'regular_season' && <Button size="sm" variant="outline" onClick={() => setImportContest(contest)}>Import History</Button>}
                  {contest.status === 'in_progress' && contest.phase === 'regular_season' && <Button size="sm" onClick={() => setAddPickContest(contest)}>Add Pick</Button>}
                  {contest.status === 'waiting' && (
                    <Button 
                      size="sm" 
                      onClick={() => handleStartContestClick(contest)}
                      className="gradient-hockey"
                      disabled={!contest.total_participants || contest.total_participants === 0}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start Contest
                    </Button>
                  )}
                  
                  {contest.status === 'in_progress' && contest.phase !== 'playoff_tiebreaker' && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleProcessWeekResults(contest)}
                        disabled={processingResults}
                      >
                        {processingResults ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        )}
                        Process Results
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleAdvanceWeekClick(contest)}
                        className="gradient-hockey"
                        disabled={advancingWeek}
                      >
                        {advancingWeek ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-1" />
                        )}
                        Advance Week
                      </Button>
                    </>
                  )}
                  
                  {contest.status === 'completed' && contest.active_participants === 1 && (
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  )}
                  
                  {/* Admin Override Buttons */}
                  <Separator orientation="vertical" className="h-6" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleManageParticipants(contest)}
                    title="Manage Participants"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleViewPicks(contest, (contest.phase === 'playoff_tiebreaker' ? contest.playoff_game_number : contest.current_week) || 1)}
                    title="View/Override Picks"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEditState(contest)}
                    title="Edit Contest State"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
                {contest.phase === 'playoff_tiebreaker' && contest.status !== 'completed' && <div className="w-full">
                  <SurvivorPlayoffs key={`${contest.contest_id}-${contest.playoff_round}-${contest.playoff_game_number}`}
                    contestId={contest.contest_id} eliminated onAdvance={loadContests} />
                </div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {importContest && <SurvivorImportDialog contest={importContest} onClose={() => setImportContest(null)} onImported={loadContests} />}
      {addPickContest && <SurvivorAddPickDialog contest={addPickContest} initialWeek={addPickContest.addWeek} onClose={() => setAddPickContest(null)} />}

      {/* Start Contest Confirmation Dialog */}
      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Survivor Contest?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to start "{contestToStart?.contest_name}"?
              <br /><br />
              <strong>Participants: {contestToStart?.total_participants || 0}</strong>
              <br />
              Once started, participants can begin making their picks and no new participants can join.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="survivor-start-week">Starting week</Label>
            <Input id="survivor-start-week" type="number" min={1} value={startWeek} disabled={starting}
              onChange={event => setStartWeek(Number(event.target.value))} />
            <p className="text-sm text-muted-foreground">For an existing pool, import earlier picks and final results first. Players still alive need a Survived result for every earlier week.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={starting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleStartContest} 
              disabled={starting}
              className="gradient-hockey"
            >
              {starting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Contest
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Weeks Dialog */}
      <Dialog open={showEditWeeksDialog} onOpenChange={setShowEditWeeksDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contest Weeks - {contestToEdit?.contest_name}</DialogTitle>
            <DialogDescription>
              Adjust the start and end dates for each week. Make sure dates align with games in the database.
            </DialogDescription>
          </DialogHeader>
          
          {loadingWeeks ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                <div className="col-span-1">Week</div>
                <div className="col-span-5">Start Date</div>
                <div className="col-span-5">End Date</div>
                <div className="col-span-1">Locked</div>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {weeks.map((week, index) => (
                  <div key={week.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 font-medium">{week.week_number}</div>
                    <div className="col-span-5">
                      <Input
                        type="date"
                        value={week.start_date ? new Date(week.start_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleWeekChange(index, 'start_date', e.target.value)}
                        disabled={week.is_locked}
                      />
                    </div>
                    <div className="col-span-5">
                      <Input
                        type="date"
                        value={week.end_date ? new Date(week.end_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleWeekChange(index, 'end_date', e.target.value)}
                        disabled={week.is_locked}
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      {week.is_locked ? '🔒' : ''}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowEditWeeksDialog(false);
                    setContestToEdit(null);
                    setWeeks([]);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveWeeks}
                  disabled={savingWeeks}
                  className="gradient-hockey"
                >
                  {savingWeeks ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Advance Week Confirmation Dialog */}
      <AlertDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Advance to Next Week?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div>
                  Are you sure you want to advance "{contestToAdvance?.contest_name}" from Week {contestToAdvance?.current_week} to Week {contestToAdvance?.current_week + 1}?
                </div>
                
                {weekReadiness && (
                  <div className="space-y-2 p-3 bg-muted rounded-lg">
                    <div className="font-medium text-sm">Week {contestToAdvance?.current_week} Status:</div>
                    <div className="space-y-1 text-sm">
                      {weekReadiness.is_ready ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          All {weekReadiness.total_games} games completed
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center text-orange-600">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            {weekReadiness.pending_games} game(s) still pending
                          </div>
                          <div className="text-xs text-muted-foreground ml-6">
                            {weekReadiness.finished_games} finished / {weekReadiness.total_games} total
                            {weekReadiness.future_games > 0 && ` (${weekReadiness.future_games} scheduled)`}
                            {weekReadiness.live_games > 0 && ` (${weekReadiness.live_games} in progress)`}
                          </div>
                        </>
                      )}
                      <div className="text-muted-foreground">
                        • {contestToAdvance?.active_participants || 0} participants still active
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="text-sm font-medium">
                  This will:
                </div>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Process Week {contestToAdvance?.current_week} results (calculate survivors/eliminations)</li>
                  <li>Apply mass elimination protection if needed</li>
                  <li>Advance the contest to Week {contestToAdvance?.current_week + 1}</li>
                  <li>Allow participants to make new picks for the next week</li>
                </ul>
                
                {!weekReadiness?.is_ready && (
                  <div className="text-sm text-orange-600 flex items-start">
                    <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Warning: Not all games are finished. Results will be based only on completed games.</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={advancingWeek}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAdvanceWeek} 
              disabled={advancingWeek}
              className="gradient-hockey"
            >
              {advancingWeek ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Advancing...
                </>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 mr-2" />
                  Advance Week
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Participants Dialog */}
      <Dialog open={showParticipantsDialog} onOpenChange={setShowParticipantsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Manage Participants — {selectedContest?.contest_name}</span>
            </DialogTitle>
            <DialogDescription>
              Eliminate or reinstate participants. Changes take effect immediately.
            </DialogDescription>
          </DialogHeader>
          {loadingParticipants ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : participants.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No participants found.</p>
          ) : (
            <div className="space-y-2">
              {participants.map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div>
                      <span className="font-medium">{p.participant_name || p.user_name || p.name || `User #${p.user_id}`}</span>
                      {p.email && <span className="text-xs text-muted-foreground ml-2">{p.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={p.is_eliminated ? "destructive" : "default"}>
                      {p.is_eliminated ? `Eliminated W${p.elimination_week || '?'}` : "Active"}
                    </Badge>
                    {p.is_eliminated ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReinstate(p)}
                        disabled={updatingParticipant}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Reinstate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleEliminateClick(p)}
                        disabled={updatingParticipant}
                      >
                        Eliminate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Eliminate Confirmation Dialog */}
      <AlertDialog open={showEliminateDialog} onOpenChange={setShowEliminateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminate Participant?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Eliminate <strong>{eliminateTarget?.participant_name || eliminateTarget?.user_name || eliminateTarget?.name}</strong> from {selectedContest?.contest_name}?</p>
                <div className="space-y-1">
                  <Label htmlFor="elimination-week">Elimination Week</Label>
                  <Input
                    id="elimination-week"
                    type="number"
                    min={1}
                    max={53}
                    value={eliminationWeek}
                    onChange={(e) => setEliminationWeek(parseInt(e.target.value) || 1)}
                    className="w-24"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingParticipant}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminateConfirm} disabled={updatingParticipant} className="bg-destructive hover:bg-destructive/90">
              {updatingParticipant ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Eliminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View/Override Picks Dialog */}
      <Dialog open={showPicksDialog} onOpenChange={(open) => { setShowPicksDialog(open); if (!open) setEditingPick(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Edit3 className="h-5 w-5" />
              <span>{selectedContest?.phase === 'playoff_tiebreaker' ? `Round ${picksRound}, Game` : 'Week'} {picksWeek} Picks — {selectedContest?.contest_name}</span>
            </DialogTitle>
            <DialogDescription>
              Correct a team or result. Pending restores automatic result processing. Use Manage Participants to change an elimination already applied.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 mb-4">
            {selectedContest?.phase === 'playoff_tiebreaker' && <>
              <Label htmlFor="override-round">Round:</Label>
              <Input id="override-round" type="number" min={1} max={4} value={picksRound} className="w-20"
                onChange={e => handleViewPicks(selectedContest, 1, Math.max(1, Math.min(4, Number(e.target.value) || 1)))} />
            </>}
            <Label className="text-sm">{selectedContest?.phase === 'playoff_tiebreaker' ? 'Game:' : 'Week:'}</Label>
            <Input
              type="number"
              min={1}
              max={selectedContest?.phase === 'playoff_tiebreaker' ? (picksRound === 4 ? 7 : 4) : 53}
              value={picksWeek}
              onChange={(e) => {
                const w = parseInt(e.target.value) || 1;
                setPicksWeek(w);
                if (selectedContest) handleViewPicks(selectedContest, w, picksRound);
              }}
              className="w-20"
            />
          </div>
          {selectedContest?.status === 'in_progress' && selectedContest?.phase === 'regular_season' && picksWeek >= selectedContest.current_week &&
            <Button className="self-start" onClick={() => { setShowPicksDialog(false); setAddPickContest({ ...selectedContest, addWeek: picksWeek }); }}>Add Pick</Button>}
          {loadingPicks ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (Array.isArray(weekPicks) ? weekPicks : []).length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No picks for this week.</p>
          ) : (
            <div className="space-y-2">
              {(Array.isArray(weekPicks) ? weekPicks : []).map((pick: any) => (
                <div key={pick.id || pick.pick_id} className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-lg">
                  <div>
                    <span className="font-medium">{pick.user_name || pick.participant_name || `User #${pick.user_id}`}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      → {pick.abbreviation || pick.team_abbreviation || pick.team_abbrev || `Team #${pick.team_id}`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingPick && (editingPick.id || editingPick.pick_id) === (pick.id || pick.pick_id) ? (
                      <div className="flex items-center space-x-2">
                        <select aria-label="Override team" className="max-w-36 rounded border bg-background p-2" value={pickEditData.team_id}
                          onChange={e => setPickEditData({ team_id: e.target.value, result: 'pending' })}>
                          {pickTeams.map(team => <option key={team.team_id} value={team.team_id}>{team.team_name}</option>)}
                        </select>
                        <Select value={pickEditData.result} onValueChange={(v) => setPickEditData(prev => ({ ...prev, result: v }))}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="survived">Survived</SelectItem>
                            <SelectItem value="eliminated">Eliminated</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={handleSavePick} disabled={updatingPick}>
                          {updatingPick ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPick(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Badge
                          variant={
                            pick.result === "survived" ? "default" :
                            pick.result === "eliminated" ? "destructive" : "secondary"
                          }
                        >
                          {pick.result || "pending"}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleEditPick(pick)}>
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Contest State Dialog */}
      <Dialog open={showStateDialog} onOpenChange={setShowStateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Settings2 className="h-5 w-5" />
              <span>Edit Contest State</span>
            </DialogTitle>
            <DialogDescription>
              Override the current state of {selectedContest?.contest_name}. Use with caution.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={stateEditData.phase} onValueChange={(v) => setStateEditData({ ...stateEditData, phase: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular_season">Regular Season</SelectItem>
                  <SelectItem value="playoff_tiebreaker">Playoff Tiebreaker</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={stateEditData.status} onValueChange={(v) => setStateEditData({ ...stateEditData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Current Week</Label>
                <Input
                  type="number"
                  min={1}
                  max={53}
                  value={stateEditData.current_week}
                  onChange={(e) => setStateEditData({ ...stateEditData, current_week: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Playoff Round</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={stateEditData.playoff_round}
                  onChange={(e) => setStateEditData({ ...stateEditData, playoff_round: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Game #</Label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={stateEditData.playoff_game_number}
                  onChange={(e) => setStateEditData({ ...stateEditData, playoff_game_number: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => setShowStateDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveState} disabled={updatingState} className="gradient-hockey">
                {updatingState ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Update State
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
