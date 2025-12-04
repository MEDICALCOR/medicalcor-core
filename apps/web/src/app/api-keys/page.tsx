'use client';

import { useState, useEffect, useTransition } from 'react';
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
  Loader2,
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
import { useToast } from '@/hooks/use-toast';
import {
  getApiKeysAction,
  getApiKeyStatsAction,
  createApiKeyAction,
  toggleApiKeyAction,
  revokeApiKeyAction,
  regenerateApiKeyAction,
  type ApiKey,
  type ApiKeyStats,
} from '@/app/actions';

const permissionLabels: Record<string, string> = {
  'read:patients': 'Citire pacienți',
  'write:patients': 'Scriere pacienți',
  'read:appointments': 'Citire programări',
  'write:appointments': 'Scriere programări',
  webhooks: 'Webhooks',
};

const availablePermissions = Object.keys(permissionLabels);

export default function ApiKeysPage() {
  const [keysList, setKeysList] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<ApiKeyStats>({ activeKeys: 0, totalRequestsToday: 0, dailyLimit: 10000 });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'production' | 'test'>('production');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const { toast } = useToast();

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [keysData, statsData] = await Promise.all([
        getApiKeysAction(),
        getApiKeyStatsAction(),
      ]);
      setKeysList(keysData);
      setStats(statsData);
    } catch (_error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca cheile API',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

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

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    startTransition(async () => {
      try {
        const updated = await toggleApiKeyAction(id, !currentActive);
        setKeysList((prev) => prev.map((k) => (k.id === id ? updated : k)));
        toast({
          title: 'Succes',
          description: `Cheia a fost ${!currentActive ? 'activată' : 'dezactivată'}`,
        });
      } catch (_error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza starea cheii',
          variant: 'destructive',
        });
      }
    });
  };

  const handleCreateKey = async () => {
    if (!newKeyName || newKeyPermissions.length === 0) {
      toast({
        title: 'Eroare',
        description: 'Completează numele și selectează cel puțin o permisiune',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        const newKey = await createApiKeyAction({
          name: newKeyName,
          type: newKeyType,
          permissions: newKeyPermissions,
        });
        setKeysList((prev) => [newKey, ...prev]);
        setNewlyCreatedKey(newKey.key);
        setNewKeyName('');
        setNewKeyType('production');
        setNewKeyPermissions([]);
        await loadData(); // Refresh stats
        toast({
          title: 'Succes',
          description: 'Cheia API a fost creată. Copiază-o acum - nu va mai fi afișată!',
        });
      } catch (_error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut crea cheia API',
          variant: 'destructive',
        });
      }
    });
  };

  const handleRevokeKey = async (id: string) => {
    startTransition(async () => {
      try {
        await revokeApiKeyAction(id);
        setKeysList((prev) => prev.filter((k) => k.id !== id));
        await loadData(); // Refresh stats
        toast({
          title: 'Succes',
          description: 'Cheia API a fost revocată',
        });
      } catch (_error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut revoca cheia',
          variant: 'destructive',
        });
      }
    });
  };

  const handleRegenerateKey = async (id: string) => {
    startTransition(async () => {
      try {
        const newKey = await regenerateApiKeyAction(id);
        setKeysList((prev) => prev.map((k) => (k.id === id ? newKey : k)));
        setNewlyCreatedKey(newKey.key);
        toast({
          title: 'Succes',
          description: 'Cheia a fost regenerată. Copiază noua cheie!',
        });
      } catch (_error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut regenera cheia',
          variant: 'destructive',
        });
      }
    });
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Copiat',
      description: 'Cheia a fost copiată în clipboard',
    });
  };

  const togglePermission = (permission: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatLastUsed = (date: Date | null): string => {
    if (!date) return 'Niciodată';
    const d = new Date(date);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Acum ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Acum ${diffHours} ore`;
    return formatDate(d);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setNewlyCreatedKey(null);
        }}>
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

            {newlyCreatedKey ? (
              <div className="space-y-4 py-4">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Cheia a fost creată! Copiaz-o acum - nu va mai fi afișată.
                  </AlertDescription>
                </Alert>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {newlyCreatedKey}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => copyToClipboard(newlyCreatedKey)} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" />
                    Copiază cheia
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setIsDialogOpen(false);
                    setNewlyCreatedKey(null);
                  }}>
                    Închide
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nume cheie</Label>
                  <Input
                    placeholder="ex: Integrare website"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tip</Label>
                  <Select value={newKeyType} onValueChange={(v) => setNewKeyType(v as 'production' | 'test')}>
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
                    {availablePermissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={newKeyPermissions.includes(permission)}
                          onChange={() => togglePermission(permission)}
                        />
                        <span className="text-sm">{permissionLabels[permission]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Anulează
                  </Button>
                  <Button onClick={handleCreateKey} disabled={isPending}>
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Creează cheie
                  </Button>
                </div>
              </div>
            )}
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
              <p className="text-xl font-bold">{stats.activeKeys}</p>
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
              <p className="text-xl font-bold">{stats.totalRequestsToday.toLocaleString()}</p>
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
              <p className="text-xl font-bold">{stats.dailyLimit.toLocaleString()}</p>
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
          {keysList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu ai nicio cheie API</p>
              <p className="text-sm">Creează o cheie pentru a integra aplicații externe</p>
            </div>
          ) : (
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
                        <span>Ultima utilizare: {formatLastUsed(apiKey.lastUsedAt)}</span>
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
                        onCheckedChange={() => handleToggleActive(apiKey.id, apiKey.isActive)}
                        disabled={isPending}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRegenerateKey(apiKey.id)}
                        disabled={isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleRevokeKey(apiKey.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
