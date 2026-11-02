import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AutoUpdateConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoUpdateEnabled: boolean;
  onAutoUpdateEnabledChange: (enabled: boolean) => void;
}

export const AutoUpdateConfigModal = ({ 
  open, 
  onOpenChange, 
  autoUpdateEnabled, 
  onAutoUpdateEnabledChange 
}: AutoUpdateConfigModalProps) => {
  const [autoUpdateInterval, setAutoUpdateInterval] = useState(24);
  const [lastAutoUpdate, setLastAutoUpdate] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadAutoUpdateSettings();
    }
  }, [open]);

  const loadAutoUpdateSettings = async () => {
    try {
      const response = await api.getPlayoffAutoUpdateSettings();
      if (response.success) {
        onAutoUpdateEnabledChange(response.data.enabled);
        setAutoUpdateInterval(response.data.intervalHours);
        setLastAutoUpdate(response.data.lastUpdate);
      }
    } catch (error: any) {
      console.error("Failed to load auto-update settings:", error);
    }
  };

  const handleAutoUpdateToggle = async (enabled: boolean) => {
    try {
      const response = await api.updatePlayoffAutoUpdateSettings({ enabled });
      if (response.success) {
        onAutoUpdateEnabledChange(enabled);
        toast({
          title: "Success",
          description: `Auto-update ${enabled ? 'enabled' : 'disabled'}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update auto-update setting",
        variant: "destructive",
      });
    }
  };

  const handleIntervalChange = async (hours: number) => {
    if (hours < 1) return;
    
    try {
      const response = await api.updatePlayoffAutoUpdateSettings({ intervalHours: hours });
      if (response.success) {
        setAutoUpdateInterval(hours);
        toast({
          title: "Success",
          description: `Update interval set to ${hours} hour${hours !== 1 ? 's' : ''}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update interval",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Automatic Update Configuration</DialogTitle>
          <DialogDescription>
            Configure automatic fetching of playoff standings from the NHL API
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-update-enabled" className="text-base font-medium cursor-pointer">
                  Enable Automatic Updates
                </Label>
                <Badge variant={autoUpdateEnabled ? "default" : "secondary"}>
                  {autoUpdateEnabled ? "ON" : "OFF"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically fetch standings at regular intervals
              </p>
            </div>
            <Switch
              id="auto-update-enabled"
              checked={autoUpdateEnabled}
              onCheckedChange={handleAutoUpdateToggle}
            />
          </div>

          {autoUpdateEnabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="update-interval">Update Interval</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="update-interval"
                    type="number"
                    min="1"
                    max="168"
                    value={autoUpdateInterval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1) setAutoUpdateInterval(val);
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1) handleIntervalChange(val);
                    }}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    hour{autoUpdateInterval !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recommended: 24 hours for daily updates. Choose from 5, 10, 12, 24, or 48 hours.
                </p>
              </div>

              {lastAutoUpdate && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Last Auto-Update</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(lastAutoUpdate).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
                <p className="text-xs text-muted-foreground">
                  ⏰ The system checks every hour. Updates trigger automatically when the interval has passed.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

