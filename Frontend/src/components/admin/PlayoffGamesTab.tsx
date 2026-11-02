import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, RefreshCw, Save, Edit2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Game {
  game_id: number;
  game_date: string;
  team_id: number;
  team_abbrev: string;
  team_name: string;
  team_score: number;
  is_home: boolean;
  opponent_id: number;
  opponent_abbrev: string;
  opponent_name: string;
  opponent_score: number;
  opponent_logo?: string;
  result: string;
  game_state: string;
  game_type: number;
}

interface GamesByDate {
  game_date: string;
  games: Game[];
}

interface EditingGame {
  game_id: number;
  team_id: number;
  team_score: number;
  opponent_score: number;
  result: string;
}

export const PlayoffGamesTab = () => {
  const [gamesByDate, setGamesByDate] = useState<GamesByDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGame, setEditingGame] = useState<EditingGame | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const DAYS_PER_PAGE = 2;
  const { toast } = useToast();

  const loadGames = async () => {
    setLoading(true);
    try {
      const response = await api.getAllPlayoffGames();
      if (response.success) {
        setGamesByDate(response.data);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load playoff games",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Invalid Date';
    
    // Parse the date string (format: YYYY-MM-DD)
    const [year, month, day] = dateString.split('-').map(Number);
    
    // Create date in local timezone
    const date = new Date(year, month - 1, day);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleEdit = (game: Game) => {
    setEditingGame({
      game_id: game.game_id,
      team_id: game.team_id,
      team_score: game.team_score,
      opponent_score: game.opponent_score,
      result: game.result,
    });
  };

  const handleCancelEdit = () => {
    setEditingGame(null);
  };

  const handleSaveEdit = async () => {
    if (!editingGame) return;

    try {
      // Determine result based on scores
      let result = editingGame.result;
      if (editingGame.team_score > editingGame.opponent_score) {
        result = 'W';
      } else if (editingGame.team_score < editingGame.opponent_score) {
        // Keep the existing OTL/SOL if it was set, otherwise default to L
        if (!['OTL', 'SOL'].includes(result)) {
          result = 'L';
        }
      }

      const response = await api.updatePlayoffGameScore(
        editingGame.game_id,
        editingGame.team_id,
        {
          team_score: editingGame.team_score,
          opponent_score: editingGame.opponent_score,
          result: result,
          game_state: 'FINAL',
        }
      );

      if (response.success) {
        toast({
          title: "Success",
          description: "Playoff game score updated successfully",
        });
        setEditingGame(null);
        loadGames();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update playoff game score",
        variant: "destructive",
      });
    }
  };

  const isEditing = (gameId: number, teamId: number) => {
    return editingGame?.game_id === gameId && editingGame?.team_id === teamId;
  };

  // Pagination logic
  const totalPages = Math.ceil(gamesByDate.length / DAYS_PER_PAGE);
  const startIndex = currentPage * DAYS_PER_PAGE;
  const endIndex = startIndex + DAYS_PER_PAGE;
  const paginatedGames = gamesByDate.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getResultDisplay = (game: Game) => {
    const isWin = game.result === 'W';
    const isOT = game.result === 'OTL';
    const isSO = game.result === 'SOL';
    
    // Determine winner and loser
    const winningTeam = isWin ? game.team_abbrev : game.opponent_abbrev;
    const winningScore = isWin ? game.team_score : game.opponent_score;
    const losingTeam = isWin ? game.opponent_abbrev : game.team_abbrev;
    const losingScore = isWin ? game.opponent_score : game.team_score;
    
    return (
      <span>
        <span className="text-green-600 font-semibold">{winningTeam} {winningScore}</span>
        <span>, </span>
        <span className="text-red-600">{losingTeam} {losingScore}</span>
        {isOT && <span className="text-muted-foreground"> (OT)</span>}
        {isSO && <span className="text-muted-foreground"> (SO)</span>}
      </span>
    );
  };

  return (
    <Card className="shadow-ice">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="h-5 w-5 text-warning" />
            <span>Playoff Games</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button 
              onClick={loadGames} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-muted-foreground">Loading playoff games...</p>
          </div>
        ) : gamesByDate.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No playoff games found in the database.
          </div>
        ) : (
          <div className="space-y-6">
            {paginatedGames.map((dateGroup) => (
              <div key={dateGroup.game_date} className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-warning" />
                  {formatDate(dateGroup.game_date)}
                </h3>
                
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="grid grid-cols-12 gap-4 mb-2 text-sm font-semibold text-muted-foreground">
                    <div className="col-span-5">Matchup</div>
                    <div className="col-span-3">Result</div>
                    <div className="col-span-4 text-right">Edit Score</div>
                  </div>
                  
                  <div className="space-y-2">
                    {dateGroup.games.map((game) => (
                      <div 
                        key={`${game.game_id}-${game.team_id}`}
                        className="grid grid-cols-12 gap-4 items-center bg-background p-3 rounded border border-warning/20"
                      >
                        {/* Matchup */}
                        <div className="col-span-5 flex items-center space-x-2">
                          <span className="font-semibold">{game.team_name}</span>
                          <span className="text-muted-foreground">@</span>
                          <span className="font-semibold">{game.opponent_name}</span>
                        </div>
                        
                        {/* Result */}
                        <div className="col-span-3">
                          {getResultDisplay(game)}
                        </div>
                        
                        {/* Edit Score */}
                        <div className="col-span-4 flex items-center justify-end space-x-2">
                          {isEditing(game.game_id, game.team_id) ? (
                            <>
                              <Input
                                type="number"
                                min="0"
                                value={editingGame?.team_score}
                                onChange={(e) =>
                                  setEditingGame({
                                    ...editingGame!,
                                    team_score: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-16 h-8 text-center"
                                placeholder={game.team_abbrev}
                              />
                              <span>-</span>
                              <Input
                                type="number"
                                min="0"
                                value={editingGame?.opponent_score}
                                onChange={(e) =>
                                  setEditingGame({
                                    ...editingGame!,
                                    opponent_score: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-16 h-8 text-center"
                                placeholder={game.opponent_abbrev}
                              />
                              <Button
                                onClick={handleSaveEdit}
                                size="sm"
                                variant="default"
                                className="h-8"
                                aria-label="Save score"
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={handleCancelEdit}
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                aria-label="Cancel editing"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-muted-foreground mr-2">
                                {game.team_score} - {game.opponent_score}
                              </span>
                              <Button
                                onClick={() => handleEdit(game)}
                                size="sm"
                                variant="outline"
                                className="h-8"
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <Button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 0}
                  variant="outline"
                  size="sm"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                
                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {totalPages}
                </span>
                
                <Button
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1}
                  variant="outline"
                  size="sm"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
