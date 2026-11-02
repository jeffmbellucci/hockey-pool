import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Target, Users, Clock, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  seasonYear?: string | null;
  phase?: string | null;
  playoffRound?: number | null;
  playoffGame?: number | null;
  contestStatus?: string | null;
  currentWeek: number;
  gamesThisWeek: number;
  survivorAlive: number;
  totalParticipants: number;
  leader: {
    name: string;
    wins: number;
  };
  nextDeadline: string | null;
}

const Dashboard = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const response = await api.getDashboardAnalytics();
      if (response.success) {
        setAnalytics(response.data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load analytics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnalytics();

    // Auto-refresh every 60 seconds
    const intervalId = setInterval(() => fetchAnalytics(), 60000);
    return () => clearInterval(intervalId);
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  const stage = analytics.phase === 'playoff_tiebreaker'
    ? `Playoffs${analytics.playoffRound ? ` · Round ${analytics.playoffRound}, Game ${analytics.playoffGame}` : ''}`
    : `Week ${analytics.currentWeek}`;
  const deadline = analytics.nextDeadline ? new Date(analytics.nextDeadline).toLocaleString() : 'Awaiting schedule';

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Hockey Pool Central
          </h1>
          <p className="text-sm text-muted-foreground">
            {analytics.seasonYear ? `${stage} · ${analytics.seasonYear} Season` : 'No active Survivor contest'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Alive</p>
              <p className="text-2xl font-bold text-emerald-500 mt-0.5">{analytics.survivorAlive}<span className="text-base text-muted-foreground font-normal">/{analytics.totalParticipants}</span></p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Players</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{analytics.totalParticipants}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Deadline</p>
              <p className="text-sm font-semibold text-foreground mt-1">{deadline}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contest Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-primary" />
              </div>
              Two-Team Contest
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-4 px-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Current Leader</p>
              <p className="text-xl font-bold text-foreground">{analytics.leader.name}</p>
              <p className="text-sm text-primary font-medium">{analytics.leader.wins} Wins</p>
            </div>
            <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
              <Link to="/two-team">View Standings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Target className="h-4 w-4 text-destructive" />
              </div>
              Survivor Contest
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-4 px-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Players Still Alive</p>
              <p className="text-3xl font-bold text-destructive">{analytics.survivorAlive}</p>
              <p className="text-sm text-muted-foreground">out of {analytics.totalParticipants} total</p>
            </div>
            <Button asChild className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium">
              <Link to="/survivor">Make Your Pick</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Survivor Reminder */}
      <Card className="bg-card border border-l-4 border-l-amber-500">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">Survivor Reminder</p>
              <p className="text-sm text-muted-foreground">
                {analytics.contestStatus === 'in_progress' ? `Check your ${stage.toLowerCase()} pick. No pick means elimination.` : 'Visit Survivor to see contest availability.'}
              </p>
            </div>
            <div className="text-right flex-shrink-0 hidden sm:block">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Deadline</p>
              <p className="text-sm font-semibold text-amber-500">{deadline}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
