import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Server,
  Database,
  RefreshCw,
  Download,
  History,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Trash2,
  Calculator,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) {
    const abs = Math.abs(seconds);
    if (abs < 60) return `in ${abs}s`;
    if (abs < 3600) return `in ${Math.floor(abs / 60)}m`;
    if (abs < 86400) return `in ${Math.floor(abs / 3600)}h`;
    return `in ${Math.floor(abs / 86400)}d`;
  }
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const SystemTab = () => {
  const { toast } = useToast();

  // NHL API Health
  const [apiHealth, setApiHealth] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Scheduler
  const [scheduler, setScheduler] = useState<any>(null);
  const [loadingScheduler, setLoadingScheduler] = useState(false);

  // Data sync
  const [syncing, setSyncing] = useState(false);
  const [fetchingRecent, setFetchingRecent] = useState(false);
  const [fetchingHistorical, setFetchingHistorical] = useState(false);
  const [purgingGames, setPurgingGames] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recentDays, setRecentDays] = useState(3);
  const [showHistoricalDialog, setShowHistoricalDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const loadSchedulerStatus = useCallback(async () => {
    try {
      setLoadingScheduler(true);
      const response = await api.getSchedulerStatus();
      if (response.success) {
        setScheduler(response.scheduler);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load scheduler status",
        variant: "destructive",
      });
    } finally {
      setLoadingScheduler(false);
    }
  }, [toast]);

  const checkHealth = useCallback(async () => {
    try {
      setCheckingHealth(true);
      const response = await api.checkNhlApiHealth();
      if (response.success) {
        setApiHealth(response.nhlApi);
      }
    } catch (error: any) {
      setApiHealth({ available: false, error: error.message });
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    loadSchedulerStatus();
    checkHealth();
  }, [loadSchedulerStatus, checkHealth]);

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      setLastSyncMessage(null);
      const response = await api.triggerDataFetchNow();
      setLastSyncMessage(response.message);
      toast({ title: "Sync Complete", description: response.message });
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync data",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleFetchRecent = async () => {
    try {
      setFetchingRecent(true);
      setLastSyncMessage(null);
      const response = await api.triggerRecentDataFetch(recentDays);
      setLastSyncMessage(response.message);
      toast({ title: "Fetch Complete", description: response.message });
    } catch (error: any) {
      toast({
        title: "Fetch Failed",
        description: error.message || "Failed to fetch recent data",
        variant: "destructive",
      });
    } finally {
      setFetchingRecent(false);
    }
  };

  const handleFetchHistorical = async () => {
    try {
      setFetchingHistorical(true);
      setShowHistoricalDialog(false);
      setLastSyncMessage(null);
      const response = await api.triggerHistoricalDataFetch();
      setLastSyncMessage(response.message);
      toast({ title: "Historical Fetch Complete", description: response.message });
    } catch (error: any) {
      toast({
        title: "Historical Fetch Failed",
        description: error.message || "Failed to fetch historical data",
        variant: "destructive",
      });
    } finally {
      setFetchingHistorical(false);
    }
  };

  const handlePurgeAndRefetch = async () => {
    try {
      setPurgingGames(true);
      setShowPurgeDialog(false);
      setLastSyncMessage(null);
      const response = await api.purgeAndRefetchGames();
      setLastSyncMessage(response.message);
      toast({ title: "Purge & Refetch Complete", description: response.message });
    } catch (error: any) {
      toast({
        title: "Purge & Refetch Failed",
        description: error.message || "Failed to purge and refetch games",
        variant: "destructive",
      });
    } finally {
      setPurgingGames(false);
    }
  };

  const handleRecalculatePoints = async () => {
    try {
      setRecalculating(true);
      setLastSyncMessage(null);
      const response = await api.recalculateContestPoints();
      setLastSyncMessage(response.message);
      toast({ title: "Recalculation Complete", description: response.message });
    } catch (error: any) {
      toast({
        title: "Recalculation Failed",
        description: error.message || "Failed to recalculate contest points",
        variant: "destructive",
      });
    } finally {
      setRecalculating(false);
    }
  };

  const isAnyOperationRunning = syncing || fetchingRecent || fetchingHistorical || purgingGames || recalculating;

  return (
    <div className="space-y-6">
      {/* NHL API Health */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>NHL API Health</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={checkHealth}
              disabled={checkingHealth}
            >
              {checkingHealth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Check Now
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {apiHealth ? (
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                {apiHealth.available ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  {apiHealth.available ? "Connected" : "Unreachable"}
                </span>
              </div>
              {apiHealth.responseTime != null && (
                <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span>{apiHealth.responseTime}ms</span>
                </div>
              )}
              {apiHealth.lastCheck && (
                <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Checked {timeAgo(apiHealth.lastCheck)}</span>
                </div>
              )}
            </div>
          ) : checkingHealth ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking API health...</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Click "Check Now" to test the NHL API connection.</p>
          )}
        </CardContent>
      </Card>

      {/* Scheduler Status */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="h-5 w-5" />
              <span>Scheduler Status</span>
            </div>
            <div className="flex items-center space-x-2">
              {scheduler && (
                <Badge variant={scheduler.isRunning ? "default" : "destructive"}>
                  {scheduler.isRunning ? "Running" : "Stopped"}
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={loadSchedulerStatus}
                disabled={loadingScheduler}
              >
                {loadingScheduler ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingScheduler && !scheduler ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading scheduler status...</span>
            </div>
          ) : scheduler?.jobs?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduler.jobs.map((job: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{job.name}</span>
                        {job.description && (
                          <p className="text-xs text-muted-foreground">{job.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{job.schedule}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(job.lastRun)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(job.nextRun)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No cron jobs registered.</p>
          )}
        </CardContent>
      </Card>

      {/* Data Sync Controls */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Data Sync Controls</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {lastSyncMessage && (
            <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span>{lastSyncMessage}</span>
            </div>
          )}

          {/* Sync Now */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Sync Today's Games</h4>
              <p className="text-sm text-muted-foreground">
                Fetch the latest game scores and results from the NHL API.
              </p>
            </div>
            <Button
              onClick={handleSyncNow}
              disabled={isAnyOperationRunning}
              className="gradient-hockey"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* Fetch Recent Days */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Fetch Recent Days</h4>
              <p className="text-sm text-muted-foreground">
                Re-fetch game data for the last N days to fill gaps or correct scores.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                <Label htmlFor="recent-days" className="text-sm sr-only">Days</Label>
                <Input
                  id="recent-days"
                  type="number"
                  min={1}
                  max={30}
                  value={recentDays}
                  onChange={(e) => setRecentDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20"
                  aria-label="Number of days"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <Button
                onClick={handleFetchRecent}
                disabled={isAnyOperationRunning}
                variant="outline"
              >
                {fetchingRecent ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Fetch
                  </>
                )}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Backfill Historical */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Backfill Historical Data</h4>
              <p className="text-sm text-muted-foreground">
                Re-fetch all games from season start. This is slow and should only be used for initial setup or data recovery.
              </p>
            </div>
            <Button
              onClick={() => setShowHistoricalDialog(true)}
              disabled={isAnyOperationRunning}
              variant="destructive"
            >
              {fetchingHistorical ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <History className="h-4 w-4 mr-2" />
                  Backfill
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* Purge & Refetch All Games */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Purge & Refetch All Games</h4>
              <p className="text-sm text-muted-foreground">
                Delete all stored games, then re-fetch from season start. Use "Recalculate" afterwards to update contest points.
              </p>
            </div>
            <Button
              onClick={() => setShowPurgeDialog(true)}
              disabled={isAnyOperationRunning}
              variant="destructive"
            >
              {purgingGames ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Purging...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Purge & Refetch
                </>
              )}
            </Button>
          </div>

          <Separator />

          {/* Recalculate Two-Team Contest Points */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Recalculate Two-Team Contest Points</h4>
              <p className="text-sm text-muted-foreground">
                Refresh team standings and recalculate all two-team pick totals based on current game data.
              </p>
            </div>
            <Button
              onClick={handleRecalculatePoints}
              disabled={isAnyOperationRunning}
              variant="outline"
            >
              {recalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recalculating...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Recalculate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historical Backfill Confirmation */}
      <AlertDialog open={showHistoricalDialog} onOpenChange={setShowHistoricalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backfill Historical Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will re-fetch <strong>all game data</strong> from the season start date.
              This operation can take several minutes and makes many requests to the NHL API.
              <br /><br />
              Only use this for initial setup or data recovery. For recent corrections, use "Fetch Recent Days" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFetchHistorical}>
              Start Backfill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge & Refetch Confirmation */}
      <AlertDialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge All Games & Refetch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>permanently delete ALL game data</strong> (regular season, playoffs, and playoff standings),
              then re-fetch everything from the season start date.
              <br /><br />
              This is a destructive operation that can take several minutes. Use it when game data is incorrect and needs a full reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurgeAndRefetch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Purge & Refetch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
