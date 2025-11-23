'use client';

import { useState } from 'react';
import {
  Shield,
  Search,
  Download,
  User,
  Calendar,
  Clock,
  FileText,
  Settings,
  Users,
  Database,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;
  userRole: string;
  action: string;
  category: 'patient' | 'appointment' | 'settings' | 'user' | 'system' | 'data';
  status: 'success' | 'warning' | 'error';
  details: string;
  ipAddress: string;
}

const auditLogs: AuditLog[] = [
  {
    id: 'l1',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    user: 'Dr. Maria Popescu',
    userRole: 'Doctor',
    action: 'Vizualizare fișă pacient',
    category: 'patient',
    status: 'success',
    details: 'Pacient: Ion Popescu (#P-1234)',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'l2',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    user: 'Ana Ionescu',
    userRole: 'Operator',
    action: 'Creare programare',
    category: 'appointment',
    status: 'success',
    details: 'Programare nouă pentru Ion Popescu',
    ipAddress: '192.168.1.22',
  },
  {
    id: 'l3',
    timestamp: new Date(Date.now() - 25 * 60 * 1000),
    user: 'Admin',
    userRole: 'Admin',
    action: 'Modificare setări',
    category: 'settings',
    status: 'success',
    details: 'Actualizare configurare notificări',
    ipAddress: '192.168.1.1',
  },
  {
    id: 'l4',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    user: 'System',
    userRole: 'System',
    action: 'Backup automat',
    category: 'system',
    status: 'success',
    details: 'Backup zilnic completat cu succes',
    ipAddress: 'localhost',
  },
  {
    id: 'l5',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    user: 'Ana Ionescu',
    userRole: 'Operator',
    action: 'Încercare acces neautorizat',
    category: 'user',
    status: 'warning',
    details: 'Încercare acces la setări admin',
    ipAddress: '192.168.1.22',
  },
  {
    id: 'l6',
    timestamp: new Date(Date.now() - 90 * 60 * 1000),
    user: 'Dr. Ion Ionescu',
    userRole: 'Doctor',
    action: 'Export date pacienți',
    category: 'data',
    status: 'success',
    details: 'Export CSV - 150 înregistrări',
    ipAddress: '192.168.1.50',
  },
  {
    id: 'l7',
    timestamp: new Date(Date.now() - 120 * 60 * 1000),
    user: 'Admin',
    userRole: 'Admin',
    action: 'Creare utilizator',
    category: 'user',
    status: 'success',
    details: 'Utilizator nou: elena.popa@clinic.ro',
    ipAddress: '192.168.1.1',
  },
  {
    id: 'l8',
    timestamp: new Date(Date.now() - 180 * 60 * 1000),
    user: 'System',
    userRole: 'System',
    action: 'Eroare sincronizare',
    category: 'system',
    status: 'error',
    details: 'Eșec conectare la serviciul extern',
    ipAddress: 'localhost',
  },
];

const categoryIcons = {
  patient: FileText,
  appointment: Calendar,
  settings: Settings,
  user: Users,
  system: Database,
  data: Database,
};

const categoryColors = {
  patient: 'bg-blue-100 text-blue-700',
  appointment: 'bg-green-100 text-green-700',
  settings: 'bg-purple-100 text-purple-700',
  user: 'bg-yellow-100 text-yellow-700',
  system: 'bg-gray-100 text-gray-700',
  data: 'bg-orange-100 text-orange-700',
};

const statusIcons = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

const statusColors = {
  success: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
};

export default function AuditLogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `Acum ${diffMins} minute`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Acum ${diffHours} ore`;
    return date.toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      searchQuery === '' ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Jurnal Audit
          </h1>
          <p className="text-muted-foreground mt-1">Istoricul tuturor acțiunilor din sistem</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export log
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Succese</p>
              <p className="text-xl font-bold">
                {auditLogs.filter((l) => l.status === 'success').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avertizări</p>
              <p className="text-xl font-bold">
                {auditLogs.filter((l) => l.status === 'warning').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erori</p>
              <p className="text-xl font-bold">
                {auditLogs.filter((l) => l.status === 'error').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Utilizatori activi</p>
              <p className="text-xl font-bold">{new Set(auditLogs.map((l) => l.user)).size}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Evenimente recente</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută în log..."
                  className="pl-9 w-[200px]"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(value: string) => setCategoryFilter(value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="patient">Pacienți</SelectItem>
                  <SelectItem value="appointment">Programări</SelectItem>
                  <SelectItem value="settings">Setări</SelectItem>
                  <SelectItem value="user">Utilizatori</SelectItem>
                  <SelectItem value="system">Sistem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredLogs.map((log) => {
              const CategoryIcon = categoryIcons[log.category];
              const StatusIcon = statusIcons[log.status];

              return (
                <div key={log.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      categoryColors[log.category]
                    )}
                  >
                    <CategoryIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{log.action}</h4>
                      <StatusIcon className={cn('h-4 w-4', statusColors[log.status])} />
                    </div>
                    <p className="text-sm text-muted-foreground">{log.details}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {log.user} ({log.userRole})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span>{log.ipAddress}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
