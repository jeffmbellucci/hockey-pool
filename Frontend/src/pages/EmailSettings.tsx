import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send, Settings, Clock } from 'lucide-react';

interface EmailSettings {
  id: number;
  enabled: boolean;
  delivery_disabled?: boolean;
  scheduler_disabled?: boolean;
  credentials_configured?: boolean;
  mailjet_api_key: string | null;
  mailjet_api_secret: string | null;
  from_email: string;
  from_name: string;
  app_url: string;
  reminder_night_before_enabled: boolean;
  reminder_night_before_time: string;
  reminder_two_hours_enabled: boolean;
}

const EmailSettingsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedSettings, setSavedSettings] = useState<EmailSettings | null>(null);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<{ connected: boolean; sender_verified: boolean; sender_email: string } | null>(null);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.getEmailSettings();
      if (response.success) {
        setSettings(response.settings);
        setSavedSettings(response.settings);
        setConnection(null); setConnectionError('');
        setDirty(false);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load email settings',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const fields = ['mailjet_api_key', 'mailjet_api_secret', 'from_email', 'from_name', 'app_url', 'reminder_night_before_enabled', 'reminder_night_before_time', 'reminder_two_hours_enabled'] as const;
      const changes = Object.fromEntries(fields.filter(key => settings[key] !== savedSettings?.[key]
        && (!key.startsWith('mailjet_') || Boolean(settings[key]))).map(key => [key, settings[key]]));
      if (['mailjet_api_key', 'mailjet_api_secret', 'from_email'].some(key => key in changes)) changes.enabled = false;
      const response = await api.updateEmailSettings(changes);
      if (response.success) {
        setSettings(response.settings);
        setSavedSettings(response.settings);
        setConnection(null); setConnectionError('');
        setDirty(false);
        toast({
          title: 'Success',
          description: 'Email settings updated successfully',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update email settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAutomation = async (enabled: boolean) => {
    setSaving(true);
    try {
      const response = await api.updateEmailSettings({ enabled });
      setSavedSettings(response.settings);
      setSettings(current => current ? { ...current, enabled: response.settings.enabled } : current);
      toast({ title: enabled ? 'Automated emails enabled' : 'Automated emails paused',
        description: enabled ? 'Saved reminder preferences now apply.' : 'No automated emails will be sent. You can continue the trial.' });
    } catch (error: any) { toast({ variant: 'destructive', title: 'Could not update automation', description: error.message }); }
    finally { setSaving(false); }
  };

  const handleCheckConnection = async () => {
    setChecking(true); setConnection(null); setConnectionError('');
    try { setConnection((await api.checkMailjetConnection()).connection); }
    catch (error: any) { setConnectionError(error.message || 'Could not check Mailjet. Try again.'); }
    finally { setChecking(false); }
  };

  const handleSendTestEmail = async (sandbox = false) => {
    if (dirty || saving || testingEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter an email address',
      });
      return;
    }

    try {
      setTestingEmail(true);
      const response = await api.sendTestEmail(testEmail, undefined, sandbox);
      if (response.success) {
        toast({
          title: 'Success',
          description: response.message,
        });
        if (!sandbox) setTestEmail('');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send test email',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const updateSetting = (key: keyof EmailSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setDirty(true);
    setConnection(null); setConnectionError('');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Email settings not found</p>
            <Button variant="outline" onClick={loadSettings}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure email notifications and reminders for survivor contests
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          Back to Admin
        </Button>
      </div>

      <fieldset disabled={saving || testingEmail || checking} className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">Automated emails
            <Badge variant="secondary">{!savedSettings?.enabled ? 'Paused' : savedSettings.delivery_disabled ? 'Blocked by server' : !savedSettings.credentials_configured ? 'Not configured' : savedSettings.scheduler_disabled ? 'Scheduler paused' : 'Enabled'}</Badge>
          </CardTitle>
          <CardDescription>Keep reminders paused during your trial. Saving credentials or checking Mailjet does not turn them on.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{!savedSettings?.enabled ? 'No automated emails will be sent. Reminder switches below are saved preferences only.' : savedSettings.delivery_disabled || savedSettings.scheduler_disabled || !savedSettings.credentials_configured ? 'Automated emails cannot send with the current server or credential settings.' : 'Automation is enabled. Mailjet must accept each message for delivery; use the connection and inbox checks below.'}</p>
          {savedSettings?.enabled ? <Button variant="outline" className="self-start" onClick={() => handleAutomation(false)}>Pause automated emails</Button>
            : <Button className="self-start" onClick={() => handleAutomation(true)} disabled={dirty || !connection?.sender_verified || savedSettings?.delivery_disabled || savedSettings?.scheduler_disabled}>Enable automated emails</Button>}
          {!savedSettings?.enabled && <p className="text-xs text-muted-foreground">Save your settings and check the Mailjet connection before enabling automation.</p>}
          {savedSettings?.delivery_disabled && <Alert><AlertTitle>Server email delivery is off</AlertTitle><AlertDescription>Setup and connection checks work, but no emails can leave this server. When ready, ask the site administrator to set EMAIL_ENABLED=true in the Coolify backend environment and redeploy.</AlertDescription></Alert>}
          {savedSettings?.scheduler_disabled && <Alert><AlertTitle>Scheduled reminders are off</AlertTitle><AlertDescription>The site administrator must enable SCHEDULER_ENABLED in Coolify for automatic reminders. Keep it on for NHL updates; use Pause automated emails here for the trial.</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect your Mailjet account</CardTitle>
          <CardDescription>Use a sender such as reminders@hockeypool.us after verifying it in Mailjet.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 flex flex-col gap-2 text-sm">
            <li>Create or sign in to your <a className="text-primary underline" href="https://app.mailjet.com/" target="_blank" rel="noopener noreferrer">Mailjet account</a>. Copy its API key and secret into the fields below. You do not need to share these keys in chat.</li>
            <li>Add the From Email address or hockeypool.us domain in Mailjet and complete <a className="text-primary underline" href="https://dev.mailjet.com/docs/email-api/senders-domains/sender-validation" target="_blank" rel="noopener noreferrer">sender verification</a>. An individual address needs access to its inbox; domain verification needs access to DNS settings.</li>
            <li>Follow Mailjet’s <a className="text-primary underline" href="https://dev.mailjet.com/docs/email-api/senders-domains/spf-dkim-validation" target="_blank" rel="noopener noreferrer">SPF and DKIM instructions</a> at your domain provider. Use the records from your Mailjet account; merge SPF with an existing record rather than adding a second one.</li>
            <li>Save Settings, then Check Mailjet connection. Enter your own test recipient below and Send Test while automation stays paused. Check your inbox and spam folder.</li>
            <li>When your trial is finished, select Enable automated emails at the top of this page.</li>
          </ol>
        </CardContent>
      </Card>

      {/* Mailjet Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Mailjet Configuration
          </CardTitle>
          <CardDescription>
            Changing credentials or the sender pauses automation until you enable it again. (
            <a 
              href="https://app.mailjet.com/account/api_keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get API Keys
            </a>
            )
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mailjet_api_key">API Key (Public)</Label>
            <Input
              id="mailjet_api_key"
              type="password"
              autoComplete="off"
              value={settings.mailjet_api_key || ''}
              onChange={(e) => updateSetting('mailjet_api_key', e.target.value)}
              placeholder={settings.mailjet_api_key?.startsWith('••••') ? 'Current key (hidden) — enter new value to change' : 'Enter Mailjet API key'}
            />
            {settings.mailjet_api_key?.startsWith('••••') && (
              <p className="text-xs text-muted-foreground">
                Leave as-is to keep current key
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailjet_api_secret">API Secret (Private)</Label>
            <Input
              id="mailjet_api_secret"
              type="password"
              autoComplete="off"
              value={settings.mailjet_api_secret || ''}
              onChange={(e) => updateSetting('mailjet_api_secret', e.target.value)}
              placeholder={settings.mailjet_api_secret?.startsWith('••••') ? 'Current secret (hidden) — enter new value to change' : 'Enter Mailjet API secret'}
            />
            {settings.mailjet_api_secret?.startsWith('••••') && (
              <p className="text-xs text-muted-foreground">
                Leave as-is to keep current secret
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_email">From Email</Label>
              <Input
                id="from_email"
                type="email"
                value={settings.from_email}
                onChange={(e) => updateSetting('from_email', e.target.value)}
                placeholder="reminders@hockeypool.us"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                type="text"
                value={settings.from_name}
                onChange={(e) => updateSetting('from_name', e.target.value)}
                placeholder="Hockey Pool"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_url">Application URL</Label>
            <Input
              id="app_url"
              type="url"
              value={settings.app_url}
              onChange={(e) => updateSetting('app_url', e.target.value)}
              placeholder="https://hockeypool.us"
            />
            <p className="text-xs text-muted-foreground">
              Used for links in emails (e.g., "Make your pick" button)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Check the connection</CardTitle><CardDescription>Check the saved API keys and sender with Mailjet. This sends no email and leaves automation unchanged.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" className="self-start" onClick={handleCheckConnection} disabled={dirty || !savedSettings?.credentials_configured}>{checking ? 'Checking Mailjet…' : 'Check Mailjet connection'}</Button>
          {dirty && <p className="text-sm text-muted-foreground">Save your changes before checking the connection.</p>}
          {connection && <Alert><Mail className="size-4" /><AlertTitle>Mailjet connected</AlertTitle><AlertDescription>
            {connection.sender_verified ? `Sender verified: ${connection.sender_email}. Send yourself a test next; connection success does not confirm inbox delivery.` : `The API keys work, but ${connection.sender_email} is not verified. Add and validate this address or its domain in Mailjet, then check again.`}
          </AlertDescription></Alert>}
          {connectionError && <Alert variant="destructive"><AlertTitle>Connection needs attention</AlertTitle><AlertDescription>{connectionError}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {/* Reminder Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Reminder Settings
          </CardTitle>
          <CardDescription>
            Saved preferences for users who have not made picks. These do not send anything while automated emails are paused.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="reminder_night_before">Night Before Reminder</Label>
              <p className="text-sm text-muted-foreground">
                Send reminder the evening before the first game of the week
              </p>
            </div>
            <Switch
              id="reminder_night_before"
              checked={settings.reminder_night_before_enabled}
              onCheckedChange={(checked) => updateSetting('reminder_night_before_enabled', checked)}
            />
          </div>

          {settings.reminder_night_before_enabled && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="reminder_night_before_time">Send Time</Label>
              <Input
                id="reminder_night_before_time"
                type="time"
                value={settings.reminder_night_before_time}
                onChange={(e) => updateSetting('reminder_night_before_time', e.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Time to send the night before reminder (local server time)
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="reminder_two_hours">2 Hours Before Reminder</Label>
              <p className="text-sm text-muted-foreground">
                Send urgent reminder 2 hours before the first game starts
              </p>
            </div>
            <Switch
              id="reminder_two_hours"
              checked={settings.reminder_two_hours_enabled}
              onCheckedChange={(checked) => updateSetting('reminder_two_hours_enabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Test Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Test Email
          </CardTitle>
          <CardDescription>
            Send only to the recipient below, even while automated emails are paused. This does not notify participants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Label htmlFor="test_email">Test recipient email</Label>
            <Input
              id="test_email"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleSendTestEmail(true)} disabled={testingEmail || saving || dirty || !testEmail}>
                Check Configuration
              </Button>
              <Button onClick={() => handleSendTestEmail()} disabled={testingEmail || saving || dirty || !testEmail || !savedSettings?.credentials_configured || savedSettings?.delivery_disabled}>
                {testingEmail ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
                Send Test
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2" role="status">
            {dirty ? 'Save your changes before checking or sending a test.' : 'Check Configuration validates without sending. Send Test sends one email to the address above; automation stays unchanged.'}
          </p>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={loadSettings} disabled={saving || testingEmail}>
          Reset
        </Button>
        <Button onClick={handleSaveSettings} disabled={saving || testingEmail || !dirty}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
      </fieldset>
    </div>
  );
};

export default EmailSettingsPage;

