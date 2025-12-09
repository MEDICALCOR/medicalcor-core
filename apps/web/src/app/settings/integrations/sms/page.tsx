'use client';

import { useState } from 'react';
import { MessageSquare, Send, Phone, Settings, BarChart3, Clock, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IntegrationPageHeader,
  IntegrationStatCard,
  IntegrationStatsGrid,
  ProviderListItem,
  HistoryLogItem,
  createStatusConfig,
} from '@/components/shared/integrations';

interface SmsProvider {
  id: string;
  name: string;
  enabled: boolean;
  status: 'active' | 'inactive' | 'error';
  balance?: number;
  currency?: string;
}

const providers: SmsProvider[] = [
  {
    id: 'twilio',
    name: 'Twilio',
    enabled: true,
    status: 'active',
    balance: 125.5,
    currency: 'USD',
  },
  { id: 'vonage', name: 'Vonage (Nexmo)', enabled: false, status: 'inactive' },
  { id: 'textlocal', name: 'TextLocal', enabled: false, status: 'inactive' },
  { id: 'smsto', name: 'SMSto.ro', enabled: true, status: 'active', balance: 450, currency: 'RON' },
];

const recentMessages = [
  {
    id: 'm1',
    to: '+40722123456',
    type: 'reminder',
    status: 'delivered',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: 'm2',
    to: '+40733987654',
    type: 'confirmation',
    status: 'delivered',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: 'm3',
    to: '+40744567890',
    type: 'reminder',
    status: 'pending',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: 'm4',
    to: '+40755111222',
    type: 'marketing',
    status: 'failed',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
];

const statusConfig = createStatusConfig({
  delivered: { label: 'Livrat', color: 'bg-green-100 text-green-700' },
  pending: { label: 'În trimitere', color: 'bg-yellow-100 text-yellow-700' },
  failed: { label: 'Eșuat', color: 'bg-red-100 text-red-700' },
});

export default function SmsGatewayPage() {
  const [selectedProvider, setSelectedProvider] = useState('twilio');
  const [testPhone, setTestPhone] = useState('');

  const totalSentToday = recentMessages.filter((m) => m.status === 'delivered').length;
  const activeProviders = providers.filter((p) => p.enabled && p.status === 'active');

  return (
    <div className="space-y-6">
      <IntegrationPageHeader
        icon={MessageSquare}
        title="Gateway SMS"
        description="Configurare provideri SMS și mesaje automate"
        actionIcon={Send}
        actionLabel="SMS de test"
      />

      <IntegrationStatsGrid>
        <IntegrationStatCard
          icon={Send}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
          label="Trimise azi"
          value={totalSentToday}
        />
        <IntegrationStatCard
          icon={BarChart3}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
          label="Rată livrare"
          value="98.5%"
        />
        <IntegrationStatCard
          icon={Zap}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
          label="Provideri activi"
          value={activeProviders.length}
        />
        <IntegrationStatCard
          icon={Clock}
          iconBgColor="bg-yellow-100"
          iconColor="text-yellow-600"
          label="În coadă"
          value={recentMessages.filter((m) => m.status === 'pending').length}
        />
      </IntegrationStatsGrid>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Provideri</TabsTrigger>
          <TabsTrigger value="config">Configurare</TabsTrigger>
          <TabsTrigger value="templates">Șabloane</TabsTrigger>
          <TabsTrigger value="logs">Istoric</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Provideri SMS</CardTitle>
              <CardDescription>Selectează și configurează providerul de SMS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {providers.map((provider) => (
                <ProviderListItem
                  key={provider.id}
                  icon={Phone}
                  name={provider.name}
                  description={
                    provider.balance !== undefined
                      ? `Sold: ${provider.balance} ${provider.currency}`
                      : undefined
                  }
                  enabled={provider.enabled}
                  status={provider.status}
                  onToggle={() => {
                    /* Provider toggle handler */
                  }}
                  onConfigure={() => setSelectedProvider(provider.id)}
                  configureIcon={Settings}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Credențiale {selectedProvider === 'twilio' ? 'Twilio' : selectedProvider}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Account SID</Label>
                  <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Auth Token</Label>
                  <Input type="password" placeholder="••••••••••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Sender ID / Număr telefon</Label>
                  <Input placeholder="+40700000000 sau CLINICA" />
                  <p className="text-xs text-muted-foreground">
                    Numărul sau numele care apare la destinatar
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline">Testează</Button>
                  <Button>Salvează</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SMS de test</CardTitle>
                <CardDescription>Trimite un mesaj de test pentru verificare</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Număr telefon</Label>
                  <Input
                    placeholder="+40722123456"
                    value={testPhone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setTestPhone(e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mesaj</Label>
                  <Textarea
                    placeholder="Acesta este un mesaj de test de la MedicalCor..."
                    rows={3}
                  />
                </div>
                <Button className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  Trimite SMS de test
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Șabloane SMS</CardTitle>
              <CardDescription>Mesaje predefinite pentru notificări automate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Reminder programare</h4>
                  <Switch defaultChecked />
                </div>
                <Textarea
                  defaultValue="Bună ziua! Vă reamintim că aveți o programare mâine, {{date}} la ora {{time}} la {{doctor}}. Pentru anulare, răspundeți cu ANULARE."
                  rows={2}
                />
              </div>
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Confirmare programare</h4>
                  <Switch defaultChecked />
                </div>
                <Textarea
                  defaultValue="Programarea dvs. la {{doctor}} pentru {{date}} ora {{time}} a fost confirmată. Vă așteptăm!"
                  rows={2}
                />
              </div>
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Rezultate analize</h4>
                  <Switch />
                </div>
                <Textarea
                  defaultValue="Rezultatele analizelor dvs. sunt disponibile. Accesați portalul pacient pentru vizualizare sau contactați clinica."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Istoric mesaje</CardTitle>
              <CardDescription>Ultimele SMS-uri trimise</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentMessages.map((msg) => (
                  <HistoryLogItem
                    key={msg.id}
                    icon={MessageSquare}
                    title={msg.to}
                    subtitle={msg.type}
                    status={msg.status}
                    statusConfig={statusConfig}
                    timestamp={msg.timestamp}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
