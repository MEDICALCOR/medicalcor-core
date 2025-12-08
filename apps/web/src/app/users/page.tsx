'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Shield,
  Mail,
  Check,
  Loader2,
} from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getUsersAction,
  getUserStatsAction,
  createUserAction,
  updateUserAction,
  deleteUserAction,
  type User,
  type UserRole,
  type UserStats,
} from '@/app/actions';

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  doctor: 'Medic',
  receptionist: 'Recepționer',
  staff: 'Personal',
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  doctor: 'bg-blue-100 text-blue-700',
  receptionist: 'bg-purple-100 text-purple-700',
  staff: 'bg-green-100 text-green-700',
};

const rolePermissions: Record<UserRole, string[]> = {
  admin: ['Toate permisiunile', 'Administrare utilizatori', 'Setări sistem'],
  doctor: ['Vizualizare pacienți', 'Editare fișe', 'Programări', 'Mesaje'],
  receptionist: ['Vizualizare pacienți', 'Programări'],
  staff: ['Vizualizare pacienți', 'Programări de bază'],
};

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Niciodată';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `Acum ${diffMins} min`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `Acum ${diffHours} ore`;
  const diffDays = Math.floor(diffMs / 86400000);
  return `Acum ${diffDays} zile`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    activeUsers: 0,
    byRole: { admin: 0, doctor: 0, receptionist: 0, staff: 0 },
  });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');

  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [usersData, statsData] = await Promise.all([getUsersAction(), getUserStatsAction()]);
      setUsers(usersData);
      setStats(statsData);
    } catch {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca utilizatorii',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('staff');
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleActive = (user: User) => {
    startTransition(async () => {
      try {
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        await updateUserAction({ id: user.id, status: newStatus });
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)));
        toast({
          title: 'Succes',
          description: `Utilizatorul a fost ${newStatus === 'active' ? 'activat' : 'dezactivat'}`,
        });
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza starea utilizatorului',
          variant: 'destructive',
        });
      }
    });
  };

  const handleCreateUser = () => {
    if (!formName || !formEmail || !formPassword) {
      toast({
        title: 'Eroare',
        description: 'Completează toate câmpurile obligatorii',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        const newUser = await createUserAction({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
        });
        setUsers((prev) => [newUser, ...prev]);
        setIsAddingUser(false);
        resetForm();
        await loadData();
        toast({
          title: 'Succes',
          description: 'Utilizatorul a fost creat cu succes',
        });
      } catch (error) {
        toast({
          title: 'Eroare',
          description: error instanceof Error ? error.message : 'Nu s-a putut crea utilizatorul',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteUserAction(id);
        setUsers((prev) => prev.filter((u) => u.id !== id));
        await loadData();
        toast({
          title: 'Succes',
          description: 'Utilizatorul a fost șters',
        });
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut șterge utilizatorul',
          variant: 'destructive',
        });
      }
    });
  };

  if (isLoading) {
    return (
      <PagePermissionGate pathname="/users">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PagePermissionGate>
    );
  }

  return (
    <PagePermissionGate pathname="/users">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Utilizatori
            </h1>
            <p className="text-muted-foreground mt-1">Gestionează utilizatorii și permisiunile</p>
          </div>
          <Button onClick={() => setIsAddingUser(true)} disabled={isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Utilizator nou
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total utilizatori</div>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Activi</div>
              <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Medici</div>
              <div className="text-2xl font-bold">{stats.byRole.doctor}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Personal</div>
              <div className="text-2xl font-bold">
                {stats.byRole.staff + stats.byRole.receptionist}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută utilizatori..."
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(value: string) => setRoleFilter(value as UserRole | 'all')}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filtru rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate rolurile</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="doctor">Medic</SelectItem>
                  <SelectItem value="receptionist">Recepționer</SelectItem>
                  <SelectItem value="staff">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>Lista utilizatori ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nu există utilizatori</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className={cn(
                      'flex items-center justify-between p-4 border rounded-lg',
                      user.status !== 'active' && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <Badge className={cn('text-[10px]', roleColors[user.role])}>
                            {roleLabels[user.role]}
                          </Badge>
                          {user.status !== 'active' && (
                            <Badge variant="secondary" className="text-[10px]">
                              {user.status === 'inactive' ? 'Inactiv' : user.status}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                          {user.clinicName && (
                            <span className="text-xs">Clinică: {user.clinicName}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Ultima conectare: {formatRelativeTime(user.lastLoginAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Activ</span>
                        <Switch
                          checked={user.status === 'active'}
                          onCheckedChange={() => handleToggleActive(user)}
                          disabled={isPending}
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editează
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Shield className="h-4 w-4 mr-2" />
                            Permisiuni
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600"
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Șterge
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add User Dialog */}
        <Dialog
          open={isAddingUser}
          onOpenChange={(open) => {
            setIsAddingUser(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adaugă utilizator nou</DialogTitle>
              <DialogDescription>Completează datele pentru noul utilizator</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nume complet *</Label>
                <Input
                  placeholder="ex: Ion Popescu"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="email@exemplu.ro"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Parolă *</Label>
                <Input
                  type="password"
                  placeholder="Minim 8 caractere"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Rol *</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="doctor">Medic</SelectItem>
                    <SelectItem value="receptionist">Recepționer</SelectItem>
                    <SelectItem value="staff">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsAddingUser(false)}
                  disabled={isPending}
                >
                  Anulează
                </Button>
                <Button onClick={handleCreateUser} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adaugă utilizator
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Permissions Dialog */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Permisiuni - {selectedUser?.name}</DialogTitle>
              <DialogDescription>
                Rol curent: {selectedUser && roleLabels[selectedUser.role]}
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Permisiuni asociate rolului</Label>
                  <div className="space-y-2 mt-2">
                    {rolePermissions[selectedUser.role].map((perm) => (
                      <div
                        key={perm}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="h-4 w-4 text-green-500" />
                        {perm}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedUser(null)}>
                    Închide
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PagePermissionGate>
  );
}
