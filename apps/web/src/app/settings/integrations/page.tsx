'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  Check,
  X,
  Settings,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'connected' | 'disconnected' | 'error';
  enabled: boolean;
  lastSync?: Date;
}

const initialIntegrations: Integration[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Trimite și primește mesaje WhatsApp',
    icon: MessageSquare,
    status: 'connected',
    enabled: true,
    lastSync: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: 'sms',
    name: 'SMS Gateway',
    description: 'Trimite SMS-uri prin provider-ul selectat',
    icon: Phone,
    status: 'connected',
    enabled: true,
    lastSync: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: 'email',
    name: 'Email (SMTP)',
    description: 'Configurare server de email pentru notificări',
    icon: Mail,
    status: 'disconnected',
    enabled: false,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sincronizare programări cu Google Calendar',
    icon: Calendar,
    status: 'connected',
    enabled: true,
    lastSync: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: 'stripe',
    name: 'Stripe Payments',
    description: 'Procesare plăți online',
    icon: CreditCard,
    status: 'error',
    enabled: false,
  },
];

const statusColors = {
  connected: 'bg-green-100 text-green-700',
  disconnected: 'bg-gray-100 text-gray-700',
  error: 'bg-red-100 text-red-700',
};

const statusLabels = {
  connected: 'Conectat',
  disconnected: 'Deconectat',
  error: 'Eroare',
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `Acum ${diffMins} min`;
  const diffHours = Math.floor(diffMs / 3600000);
  return `Acum ${diffHours} ore`;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState(initialIntegrations);

  const handleToggle = (id: string, enabled: boolean) => {
    setIntegrations((prev) => prev.map((int) => (int.id === id ? { ...int, enabled } : int)));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integrări</CardTitle>
          <CardDescription>
            Conectează aplicația cu servicii externe pentru funcționalități extinse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                  <integration.icon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{integration.name}</h3>
                    <Badge className={statusColors[integration.status]}>
                      {integration.status === 'connected' && <Check className="h-3 w-3 mr-1" />}
                      {integration.status === 'error' && <X className="h-3 w-3 mr-1" />}
                      {statusLabels[integration.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                  {integration.lastSync && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ultima sincronizare: {formatRelativeTime(integration.lastSync)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={integration.enabled}
                  onCheckedChange={(checked: boolean) => handleToggle(integration.id, checked)}
                />
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configurează
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Configurare {integration.name}</DialogTitle>
                      <DialogDescription>
                        Setează credențialele și opțiunile pentru această integrare
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {integration.id === 'whatsapp' && (
                        <>
                          <div className="space-y-2">
                            <Label>Phone Number ID</Label>
                            <Input placeholder="Introdu Phone Number ID" />
                          </div>
                          <div className="space-y-2">
                            <Label>Access Token</Label>
                            <Input type="password" placeholder="••••••••••••" />
                          </div>
                          <div className="space-y-2">
                            <Label>Webhook Verify Token</Label>
                            <Input placeholder="Token pentru verificare webhook" />
                          </div>
                        </>
                      )}
                      {integration.id === 'sms' && (
                        <>
                          <div className="space-y-2">
                            <Label>Provider</Label>
                            <Input placeholder="Twilio, Vonage, etc." />
                          </div>
                          <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input type="password" placeholder="••••••••••••" />
                          </div>
                          <div className="space-y-2">
                            <Label>Sender ID</Label>
                            <Input placeholder="Numele expeditorului" />
                          </div>
                        </>
                      )}
                      {integration.id === 'email' && (
                        <>
                          <div className="space-y-2">
                            <Label>SMTP Server</Label>
                            <Input placeholder="smtp.example.com" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Port</Label>
                              <Input placeholder="587" />
                            </div>
                            <div className="space-y-2">
                              <Label>Encryption</Label>
                              <Input placeholder="TLS" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Username</Label>
                            <Input placeholder="user@example.com" />
                          </div>
                          <div className="space-y-2">
                            <Label>Password</Label>
                            <Input type="password" placeholder="••••••••••••" />
                          </div>
                        </>
                      )}
                      <div className="flex justify-between pt-4">
                        <Button variant="outline" size="sm">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Testează conexiunea
                        </Button>
                        <Button size="sm">Salvează</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>Chei API</CardTitle>
          <CardDescription>Gestionează cheile API pentru integrări personalizate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">API Key Principal</p>
              <p className="text-sm text-muted-foreground font-mono">
                sk_live_••••••••••••••••••••••••
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Copiază
              </Button>
              <Button variant="outline" size="sm">
                Regenerează
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Vezi documentația API
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
