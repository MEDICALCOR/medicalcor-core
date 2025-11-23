'use client';

import { useState } from 'react';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  type: 'production' | 'test';
  permissions: string[];
  createdAt: Date;
  lastUsed: Date | null;
  isActive: boolean;
  requestsToday: number;
}

const apiKeys: ApiKey[] = [
  {
    id: 'k1',
    name: 'Integrare website',
    key: 'pk_live_abc123...xyz789',
    type: 'production',
    permissions: ['read:patients', 'write:appointments'],
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isActive: true,
    requestsToday: 1234,
  },
  {
    id: 'k2',
    name: 'Aplicație mobilă',
    key: 'pk_live_def456...uvw012',
    type: 'production',
    permissions: ['read:patients', 'read:appointments', 'write:appointments'],
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    lastUsed: new Date(Date.now() - 30 * 60 * 1000),
    isActive: true,
    requestsToday: 567,
  },
  {
    id: 'k3',
    name: 'Test development',
    key: 'pk_test_ghi789...rst345',
    type: 'test',
    permissions: ['read:patients', 'write:patients', 'read:appointments', 'write:appointments'],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000),
    isActive: true,
    requestsToday: 89,
  },
  {
    id: 'k4',
    name: 'Webhook extern',
    key: 'pk_live_jkl012...opq678',
    type: 'production',
    permissions: ['webhooks'],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    lastUsed: null,
    isActive: false,
    requestsToday: 0,
  },
];

const permissionLabels: Record<string, string> = {
  'read:patients': 'Citire pacienți',
  'write:patients': 'Scriere pacienți',
  'read:appointments': 'Citire programări',
  'write:appointments': 'Scriere programări',
  webhooks: 'Webhooks',
};

export default function ApiKeysPage() {
  const [keysList, setKeysList] = useState(apiKeys);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleKeyActive = (id: string) => {
    setKeysList((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: !k.isActive } : k)));
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatLastUsed = (date: Date | null): string => {
    if (!date) return 'Niciodată';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Acum ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Acum ${diffHours} ore`;
    return formatDate(date);
  };

  const totalRequests = keysList.reduce((sum, k) => sum + k.requestsToday, 0);
  const activeKeys = keysList.filter((k) => k.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            Chei API
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează cheile de acces pentru integrări</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Cheie nouă
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Creează cheie API nouă</DialogTitle>
              <DialogDescription>Configurează permisiunile pentru noua cheie</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nume cheie</Label>
                <Input placeholder="ex: Integrare website" />
              </div>
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează tipul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Producție</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Permisiuni</Label>
                <div className="space-y-2">
                  {Object.entries(permissionLabels).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded" />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Creează cheie</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Cheile API oferă acces la datele clinicii. Nu partajați cheile de producție și rotați-le
          periodic.
        </AlertDescription>
      </Alert>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Key className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Chei active</p>
              <p className="text-xl font-bold">{activeKeys}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <RefreshCw className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Request-uri azi</p>
              <p className="text-xl font-bold">{totalRequests.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Limită zilnică</p>
              <p className="text-xl font-bold">10,000</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cheile mele API</CardTitle>
          <CardDescription>Gestionează cheile de acces pentru aplicații externe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {keysList.map((apiKey) => (
              <div
                key={apiKey.id}
                className={cn('p-4 border rounded-lg', !apiKey.isActive && 'opacity-60')}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{apiKey.name}</h4>
                      <Badge variant={apiKey.type === 'production' ? 'default' : 'secondary'}>
                        {apiKey.type === 'production' ? 'Producție' : 'Test'}
                      </Badge>
                      {apiKey.isActive ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Activ
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500">
                          Inactiv
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 font-mono text-sm">
                      <code className="bg-muted px-2 py-1 rounded">
                        {visibleKeys.has(apiKey.id)
                          ? apiKey.key
                          : apiKey.key.replace(/[a-zA-Z0-9]/g, '•')}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                      >
                        {visibleKeys.has(apiKey.id) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(apiKey.key)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Creat: {formatDate(apiKey.createdAt)}
                      </span>
                      <span>Ultima utilizare: {formatLastUsed(apiKey.lastUsed)}</span>
                      <span>{apiKey.requestsToday.toLocaleString()} request-uri azi</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {apiKey.permissions.map((perm) => (
                        <Badge key={perm} variant="secondary" className="text-xs">
                          {permissionLabels[perm] ?? perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={apiKey.isActive}
                      onCheckedChange={() => toggleKeyActive(apiKey.id)}
                    />
                    <Button variant="ghost" size="icon">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
