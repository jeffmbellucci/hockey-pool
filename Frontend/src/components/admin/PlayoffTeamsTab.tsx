import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trophy, RefreshCw, Loader2, Edit2, Save, X, Settings } from "lucide-react";
import { PlayoffStanding } from "./types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AutoUpdateConfigModal } from "./AutoUpdateConfigModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PlayoffTeamsTabProps {
  standings: PlayoffStanding[];
  eastern: PlayoffStanding[];
  western: PlayoffStanding[];
  standingsDate: string;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export const PlayoffTeamsTab = ({ 
  eastern, 
  western, 
  standingsDate, 
  loading,
  onRefresh 
}: PlayoffTeamsTabProps) => {
  const [updating, setUpdating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<PlayoffStanding>>({});
  const [autoUpdateDialogOpen, setAutoUpdateDialogOpen] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  
  const { toast } = useToast();

  const handleUpdatePlayoffStandings = async () => {
    setUpdating(true);
    try {
      const response = await api.triggerPlayoffStandingsUpdate();
      if (response.success) {
        toast({
          title: "Success",
          description: "Playoff standings updated successfully",
        });
        await onRefresh();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update playoff standings",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const startEditing = (standing: PlayoffStanding) => {
    setEditingId(standing.standings_id);
    setEditValues({
      is_playoff_team: standing.is_playoff_team,
      conference_sequence: standing.conference_sequence,
      division_sequence: standing.division_sequence,
      wildcard_sequence: standing.wildcard_sequence,
      points: standing.points,
      wins: standing.wins,
      losses: standing.losses,
      ot_losses: standing.ot_losses,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEditing = async (standingsId: number) => {
    try {
      const response = await api.updatePlayoffStanding(standingsId, editValues);
      if (response.success) {
        toast({
          title: "Success",
          description: "Standing updated successfully",
        });
        await onRefresh();
        cancelEditing();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update standing",
        variant: "destructive",
      });
    }
  };

  const renderStandingsTable = (teams: PlayoffStanding[], conference: string) => {
    if (teams.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No standings available
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">GP</TableHead>
              <TableHead className="text-center">W</TableHead>
              <TableHead className="text-center">L</TableHead>
              <TableHead className="text-center">OT</TableHead>
              <TableHead className="text-center">PTS</TableHead>
              <TableHead className="text-center">Playoff</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => {
              const isEditing = editingId === team.standings_id;
              
              return (
                <TableRow key={team.standings_id}>
                  <TableCell className="font-medium">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.conference_sequence ?? team.conference_sequence}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            conference_sequence: parseInt(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    ) : (
                      team.conference_sequence
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{team.team_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {team.division_name}
                        {team.wildcard_sequence > 0 && ` (WC${team.wildcard_sequence})`}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{team.games_played}</TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.wins ?? team.wins}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            wins: parseInt(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    ) : (
                      team.wins
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.losses ?? team.losses}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            losses: parseInt(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    ) : (
                      team.losses
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.ot_losses ?? team.ot_losses}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            ot_losses: parseInt(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    ) : (
                      team.ot_losses
                    )}
                  </TableCell>
                  <TableCell className="text-center font-bold">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editValues.points ?? team.points}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            points: parseInt(e.target.value),
                          })
                        }
                        className="w-16"
                      />
                    ) : (
                      team.points
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Switch
                        checked={editValues.is_playoff_team ?? team.is_playoff_team}
                        onCheckedChange={(checked) =>
                          setEditValues({
                            ...editValues,
                            is_playoff_team: checked,
                          })
                        }
                      />
                    ) : team.is_playoff_team ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => saveEditing(team.standings_id)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEditing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Edit playoff team"
                        onClick={() => startEditing(team)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card className="shadow-ice">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <h2 className="text-xl font-semibold">Playoff Teams Management</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {standingsDate ? `Current standings from ${new Date(standingsDate).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}` : "No standings loaded"}
              {autoUpdateEnabled && (
                <span className="ml-2">
                  • Auto-update: <Badge variant="default" className="ml-1">ON</Badge>
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setAutoUpdateDialogOpen(true)}
            >
              <Settings className="h-4 w-4" />
              Automatic Config
            </Button>

            <Button
              onClick={handleUpdatePlayoffStandings}
              disabled={updating}
              className="gradient-hockey gap-2"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Update Now
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Eastern Conference */}
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Badge variant="default">Eastern Conference</Badge>
                <span className="text-sm text-muted-foreground">
                  {eastern.filter(t => t.is_playoff_team).length} playoff teams
                </span>
              </h3>
              {renderStandingsTable(eastern, "Eastern")}
            </div>

            {/* Western Conference */}
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Badge variant="secondary">Western Conference</Badge>
                <span className="text-sm text-muted-foreground">
                  {western.filter(t => t.is_playoff_team).length} playoff teams
                </span>
              </h3>
              {renderStandingsTable(western, "Western")}
            </div>
          </div>
        )}
      </CardContent>
      
      <AutoUpdateConfigModal 
        open={autoUpdateDialogOpen}
        onOpenChange={setAutoUpdateDialogOpen}
        autoUpdateEnabled={autoUpdateEnabled}
        onAutoUpdateEnabledChange={setAutoUpdateEnabled}
      />
    </Card>
  );
};

