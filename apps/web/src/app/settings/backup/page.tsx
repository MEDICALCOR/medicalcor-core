'use client';

import { useState } from 'react';
import {
  Database,
  Download,
  Upload,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  HardDrive,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface Backup {
  id: string;
  date: Date;
  size: string;
  type: 'auto' | 'manual';
  status: 'completed' | 'in_progress' | 'failed';
  includes: string[];
}

const backups: Backup[] = [
  {
    id: 'b1',
    date: new Date(Date.now() - 6 * 60 * 60 * 1000),
    size: '245 MB',
    type: 'auto',
    status: 'completed',
    includes: ['Pacienți', 'Programări', 'Documente', 'Setări'],
  },
  {
    id: 'b2',
    date: new Date(Date.now() - 30 * 60 * 60 * 1000),
    size: '243 MB',
    type: 'auto',
    status: 'completed',
    includes: ['Pacienți', 'Programări', 'Documente', 'Setări'],
  },
  {
    id: 'b3',
    date: new Date(Date.now() - 54 * 60 * 60 * 1000),
    size: '240 MB',
    type: 'manual',
    status: 'completed',
    includes: ['Pacienți', 'Programări', 'Documente', 'Setări'],
  },
  {
    id: 'b4',
    date: new Date(Date.now() - 78 * 60 * 60 * 1000),
    size: '238 MB',
    type: 'auto',
    status: 'completed',
    includes: ['Pacienți', 'Programări', 'Documente', 'Setări'],
  },
];

export default function BackupRestorePage() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState('daily');

  const startBackup = () => {
    setIsBackingUp(true);
    setBackupProgress(0);
    const interval = setInterval(() => {
      setBackupProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsBackingUp(false);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const lastBackup = backups[0];
  const totalStorage = '1.2 GB';
  const usedStorage = '756 MB';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          Backup & Restaurare
        </h1>
        <p className="text-muted-foreground mt-1">Gestionează backup-urile și restaurează datele</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ultimul backup</p>
              <p className="text-sm font-medium">{formatDate(lastBackup.date)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Spațiu utilizat</p>
              <p className="text-sm font-medium">
                {usedStorage} / {totalStorage}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Backup-uri salvate</p>
              <p className="text-sm font-medium">{backups.length} backup-uri</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Backup manual
            </CardTitle>
            <CardDescription>Creează un backup complet al datelor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isBackingUp ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <span>Backup în curs...</span>
                </div>
                <Progress value={backupProgress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {Math.round(backupProgress)}% completat
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Include în backup:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Pacienți', 'Programări', 'Documente', 'Mesaje', 'Setări', 'Facturi'].map(
                      (item) => (
                        <label key={item} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="rounded" defaultChecked />
                          <span className="text-sm">{item}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>
                <Button onClick={startBackup} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Începe backup
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restaurare
            </CardTitle>
            <CardDescription>Restaurează datele dintr-un backup anterior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Restaurarea va înlocui datele existente. Această acțiune nu poate fi anulată.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Selectează backup</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Alege backup-ul" />
                </SelectTrigger>
                <SelectContent>
                  {backups.map((backup) => (
                    <SelectItem key={backup.id} value={backup.id}>
                      {formatDate(backup.date)} - {backup.size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Restaurează
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Backup automat
              </CardTitle>
              <CardDescription>Configurează backup-urile automate</CardDescription>
            </div>
            <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
          </div>
        </CardHeader>
        {autoBackup && (
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frecvență</Label>
                <Select
                  value={backupFrequency}
                  onValueChange={(value: string) => setBackupFrequency(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">La fiecare oră</SelectItem>
                    <SelectItem value="daily">Zilnic</SelectItem>
                    <SelectItem value="weekly">Săptămânal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retenție</Label>
                <Select defaultValue="30">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 zile</SelectItem>
                    <SelectItem value="30">30 zile</SelectItem>
                    <SelectItem value="90">90 zile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Istoric backup-uri</CardTitle>
          <CardDescription>Ultimele backup-uri create</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      backup.status === 'completed' ? 'bg-green-100' : 'bg-yellow-100'
                    )}
                  >
                    {backup.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <RefreshCw className="h-5 w-5 text-yellow-600 animate-spin" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{formatDate(backup.date)}</h4>
                      <Badge variant={backup.type === 'auto' ? 'secondary' : 'outline'}>
                        {backup.type === 'auto' ? 'Automat' : 'Manual'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {backup.size} • {backup.includes.join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Descarcă
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
