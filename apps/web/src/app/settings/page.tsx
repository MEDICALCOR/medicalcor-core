import { NotificationSettings } from '@/components/notifications';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Setări</h1>
        <p className="text-muted-foreground">Configurează preferințele aplicației</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <NotificationSettings />
      </div>
    </div>
  );
}
