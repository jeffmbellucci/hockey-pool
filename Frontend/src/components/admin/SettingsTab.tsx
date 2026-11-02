import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings, Calendar, Clock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface SettingsData {
  season_start_date: string;
  season_year: string;
}

interface SettingsTabProps {
  settings: SettingsData;
  onSettingsChange: (settings: SettingsData) => void;
}

export const SettingsTab = ({ settings, onSettingsChange }: SettingsTabProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [playoffAutoUpdate, setPlayoffAutoUpdate] = useState(false);
  const [playoffInterval, setPlayoffInterval] = useState(6);
  const [playoffLastUpdate, setPlayoffLastUpdate] = useState<string | null>(null);
  const [loadingPlayoff, setLoadingPlayoff] = useState(false);

  useEffect(() => {
    const loadPlayoffSettings = async () => {
      try {
        setLoadingPlayoff(true);
        const response = await api.getPlayoffAutoUpdateSettings();
        if (response.success) {
          setPlayoffAutoUpdate(response.settings?.enabled ?? false);
          setPlayoffInterval(response.settings?.interval_hours ?? 6);
          setPlayoffLastUpdate(response.settings?.last_update ?? null);
        }
      } catch {
        // Non-critical, leave defaults
      } finally {
        setLoadingPlayoff(false);
      }
    };
    loadPlayoffSettings();
  }, []);

  const computedWeek = (() => {
    if (!settings.season_start_date) return "—";
    const start = new Date(settings.season_start_date);
    const now = new Date();
    if (isNaN(start.getTime()) || now < start) return "—";
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const [settingsRes, playoffRes] = await Promise.all([
        api.updateSettings(settings as unknown as Record<string, string>),
        api.updatePlayoffAutoUpdateSettings({
          enabled: playoffAutoUpdate,
          intervalHours: playoffInterval,
        }),
      ]);
      if (settingsRes.success && playoffRes.success) {
        toast({ title: "Settings saved", description: "All settings updated successfully." });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const yearFormatValid = /^\d{4}-\d{2}$/.test(settings.season_year);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Season Settings */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Season Configuration</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="season-start-date">Season Start Date</Label>
            <Input
              id="season-start-date"
              type="date"
              value={settings.season_start_date}
              onChange={(e) => onSettingsChange({ ...settings, season_start_date: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Used to auto-calculate the current week number. Set to the first day of the NHL regular season.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="season-year">Season Year</Label>
            <Input
              id="season-year"
              value={settings.season_year}
              onChange={(e) => onSettingsChange({ ...settings, season_year: e.target.value })}
              placeholder="e.g., 2025-26"
            />
            {settings.season_year && !yearFormatValid && (
              <p className="text-xs text-destructive">Expected format: YYYY-YY (e.g. 2025-26)</p>
            )}
          </div>

          <Separator />

          {/* Read-only computed info */}
          <div className="rounded-md bg-muted/50 p-4 space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Computed Info</h4>
            <div className="flex justify-between text-sm">
              <span>Current Week</span>
              <span className="font-mono font-semibold">{computedWeek}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Playoff Auto-Update */}
      <Card className="shadow-ice">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Playoff Auto-Update</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingPlayoff ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-update playoff data</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically fetch updated playoff scores via cron when enabled.
                  </p>
                </div>
                <Switch checked={playoffAutoUpdate} onCheckedChange={setPlayoffAutoUpdate} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="playoff-interval">Update interval (hours)</Label>
                <Input
                  id="playoff-interval"
                  type="number"
                  min={1}
                  max={24}
                  value={playoffInterval}
                  onChange={(e) => setPlayoffInterval(parseInt(e.target.value) || 6)}
                  className="w-24"
                  disabled={!playoffAutoUpdate}
                />
              </div>

              {playoffLastUpdate && (
                <p className="text-xs text-muted-foreground">
                  Last auto-update: {new Date(playoffLastUpdate).toLocaleString()}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <Button
        onClick={() => setShowConfirm(true)}
        disabled={saving || (settings.season_year !== "" && !yearFormatValid)}
        className="gradient-championship w-full"
      >
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
        Save All Settings
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Settings Change</AlertDialogTitle>
            <AlertDialogDescription>
              This will update season configuration and playoff auto-update settings. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={saving} className="gradient-hockey">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

