import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, RefreshCw, Target, Mail, Server } from "lucide-react";
import { api, User } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import TwoTeamContestAdmin from "@/components/TwoTeamContestAdmin";
import { UserManagement } from "@/components/admin/UserManagement";
import { SurvivorContestTab } from "@/components/admin/SurvivorContestTab";
import { PlayoffTeamsTab } from "@/components/admin/PlayoffTeamsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { SystemTab } from "@/components/admin/SystemTab";
import { PlayoffStanding } from "@/components/admin/types";
import { SeasonGamesTab } from "@/components/admin/SeasonGamesTab";
import { PlayoffGamesTab } from "@/components/admin/PlayoffGamesTab";

const Admin = () => {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    season_start_date: "2025-10-08",
    season_year: "2025-26"
  });
  
  const [stats, setStats] = useState({
    totalUsers: 0,
    currentWeek: 1,
    gamesThisWeek: 0,
    survivorAlive: 0,
    lastUpdate: "Loading..."
  });
  
  // Playoff standings state
  const [playoffLoading, setPlayoffLoading] = useState(false);
  const [standings, setStandings] = useState<PlayoffStanding[]>([]);
  const [eastern, setEastern] = useState<PlayoffStanding[]>([]);
  const [western, setWestern] = useState<PlayoffStanding[]>([]);
  const [standingsDate, setStandingsDate] = useState<string>("");
  
  const { toast } = useToast();
  
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.getAllUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch users",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.getSettings();
      if (response.success) {
        setSettings({
          season_start_date: response.settings.season_start_date || "2025-10-08",
          season_year: response.settings.season_year || "2025-26"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch settings",
        variant: "destructive"
      });
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await api.getDashboardAnalytics();
      if (response.success) {
        setStats(prevStats => ({
          ...prevStats,
          currentWeek: response.data.currentWeek,
          gamesThisWeek: response.data.gamesThisWeek,
          survivorAlive: response.data.survivorAlive,
          lastUpdate: "Just now"
        }));
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      toast({
        title: "Analytics Error",
        description: error instanceof Error ? error.message : "Failed to load analytics",
        variant: "destructive"
      });
    }
  };

  const loadPlayoffStandings = async () => {
    setPlayoffLoading(true);
    try {
      const response = await api.getPlayoffStandings();
      if (response.success) {
        setStandings(response.data.standings || []);
        setEastern(response.data.eastern || []);
        setWestern(response.data.western || []);
        setStandingsDate(response.data.date || "");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load playoff standings",
        variant: "destructive",
      });
    } finally {
      setPlayoffLoading(false);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchUsers(),
        fetchSettings(),
        fetchAnalytics(),
        loadPlayoffStandings()
      ]);
    };
    
    initializeData();
  }, []);

  useEffect(() => {
    setStats(prevStats => ({
      ...prevStats,
      totalUsers: users.length
    }));
  }, [users]);
  
  const handleUpdate = async () => {
    setIsUpdating(true);
    await Promise.all([fetchUsers(), fetchSettings(), fetchAnalytics()]);
    setIsUpdating(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold gradient-championship bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage your hockey pool settings and data
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate('/admin/email-settings')}
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Settings
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating} className="gradient-hockey">
            <RefreshCw className={`h-4 w-4 mr-2 ${isUpdating ? 'animate-spin' : ''}`} />
            Update All Data
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="shadow-ice">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Current Week</p>
                <p className="text-2xl font-bold">{stats.currentWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Games This Week</p>
                <p className="text-2xl font-bold">{stats.gamesThisWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Survivor Alive</p>
                <p className="text-2xl font-bold">{stats.survivorAlive}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-ice">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Last Update</p>
                <p className="text-sm font-semibold">{stats.lastUpdate}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="user-management" className="space-y-4">
        <div className="overflow-x-auto pb-2"><TabsList className="inline-flex w-max min-w-full">
          <TabsTrigger value="user-management">User Management</TabsTrigger>
          <TabsTrigger value="two-team-contest">Two-Team Contest</TabsTrigger>
          <TabsTrigger value="survivor-contest">Survivor Contest</TabsTrigger>
          <TabsTrigger value="playoff-teams">Playoff Teams</TabsTrigger>
          <TabsTrigger value="season-games">Season Games</TabsTrigger>
          <TabsTrigger value="playoff-games">Playoff Games</TabsTrigger>
          <TabsTrigger value="system">
            <Server className="h-3 w-3 mr-1" />
            System
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList></div>

        <TabsContent value="user-management" className="space-y-4">
          <UserManagement 
            users={users}
            loading={loading}
            onRefresh={fetchUsers}
          />
        </TabsContent>

        <TabsContent value="two-team-contest" className="space-y-4">
          <TwoTeamContestAdmin />
        </TabsContent>

        <TabsContent value="survivor-contest" className="space-y-4">
          <SurvivorContestTab 
            currentWeek={stats.currentWeek}
            survivorAlive={stats.survivorAlive}
          />
        </TabsContent>

        <TabsContent value="playoff-teams" className="space-y-4">
          <PlayoffTeamsTab
            standings={standings}
            eastern={eastern}
            western={western}
            standingsDate={standingsDate}
            loading={playoffLoading}
            onRefresh={loadPlayoffStandings}
          />
        </TabsContent>

        <TabsContent value="season-games" className="space-y-4">
          <SeasonGamesTab />
        </TabsContent>

        <TabsContent value="playoff-games" className="space-y-4">
          <PlayoffGamesTab />
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <SystemTab />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab 
            settings={settings}
            onSettingsChange={setSettings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
