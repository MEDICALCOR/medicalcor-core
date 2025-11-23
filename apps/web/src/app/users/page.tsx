'use client';

import { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Shield,
  Mail,
  Phone,
  Check,
} from 'lucide-react';
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

type Role = 'admin' | 'doctor' | 'operator' | 'receptionist';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: Role;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

const roleLabels: Record<Role, string> = {
  admin: 'Administrator',
  doctor: 'Medic',
  operator: 'Operator',
  receptionist: 'Recepționer',
};

const roleColors: Record<Role, string> = {
  admin: 'bg-red-100 text-red-700',
  doctor: 'bg-blue-100 text-blue-700',
  operator: 'bg-green-100 text-green-700',
  receptionist: 'bg-purple-100 text-purple-700',
};

const rolePermissions: Record<Role, string[]> = {
  admin: ['Toate permisiunile', 'Administrare utilizatori', 'Setări sistem'],
  doctor: ['Vizualizare pacienți', 'Editare fișe', 'Programări', 'Mesaje'],
  operator: ['Vizualizare pacienți', 'Programări', 'Mesaje', 'Triage'],
  receptionist: ['Vizualizare pacienți', 'Programări'],
};

const initialUsers: User[] = [
  {
    id: 'u1',
    firstName: 'Maria',
    lastName: 'Ionescu',
    email: 'maria.ionescu@medicalcor.ro',
    phone: '+40 721 123 456',
    role: 'admin',
    isActive: true,
    lastLogin: new Date(Date.now() - 30 * 60 * 1000),
    createdAt: new Date('2023-01-15'),
  },
  {
    id: 'u2',
    firstName: 'Andrei',
    lastName: 'Popa',
    email: 'andrei.popa@medicalcor.ro',
    phone: '+40 722 234 567',
    role: 'doctor',
    isActive: true,
    lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdAt: new Date('2023-03-20'),
  },
  {
    id: 'u3',
    firstName: 'Ana',
    lastName: 'Popescu',
    email: 'ana.popescu@medicalcor.ro',
    phone: '+40 723 345 678',
    role: 'operator',
    isActive: true,
    lastLogin: new Date(Date.now() - 5 * 60 * 1000),
    createdAt: new Date('2023-06-10'),
  },
  {
    id: 'u4',
    firstName: 'Elena',
    lastName: 'Dumitrescu',
    email: 'elena.dumitrescu@medicalcor.ro',
    role: 'receptionist',
    isActive: true,
    lastLogin: new Date(Date.now() - 24 * 60 * 60 * 1000),
    createdAt: new Date('2023-09-01'),
  },
  {
    id: 'u5',
    firstName: 'Ion',
    lastName: 'Marinescu',
    email: 'ion.marinescu@medicalcor.ro',
    role: 'doctor',
    isActive: false,
    createdAt: new Date('2023-02-01'),
  },
];

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `Acum ${diffMins} min`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `Acum ${diffHours} ore`;
  const diffDays = Math.floor(diffMs / 86400000);
  return `Acum ${diffDays} zile`;
}

export default function UsersPage() {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleToggleActive = (id: string, isActive: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive } : u)));
  };

  const handleDelete = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const activeCount = users.filter((u) => u.isActive).length;

  return (
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
        <Button onClick={() => setIsAddingUser(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Utilizator nou
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total utilizatori</div>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Activi</div>
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Medici</div>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'doctor').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Operatori</div>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'operator').length}
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
              onValueChange={(value: string) => setRoleFilter(value as Role | 'all')}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtru rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate rolurile</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="doctor">Medic</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="receptionist">Recepționer</SelectItem>
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
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={cn(
                  'flex items-center justify-between p-4 border rounded-lg',
                  !user.isActive && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {user.firstName} {user.lastName}
                      </span>
                      <Badge className={cn('text-[10px]', roleColors[user.role])}>
                        {roleLabels[user.role]}
                      </Badge>
                      {!user.isActive && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactiv
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </span>
                      {user.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {user.phone}
                        </span>
                      )}
                    </div>
                    {user.lastLogin && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Ultima conectare: {formatRelativeTime(user.lastLogin)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Activ</span>
                    <Switch
                      checked={user.isActive}
                      onCheckedChange={(checked: boolean) => handleToggleActive(user.id, checked)}
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
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă utilizator nou</DialogTitle>
            <DialogDescription>Completează datele pentru noul utilizator</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prenume</Label>
                <Input placeholder="Prenume" />
              </div>
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input placeholder="Nume" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="email@exemplu.ro" />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input placeholder="+40 7XX XXX XXX" />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selectează rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="doctor">Medic</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="receptionist">Recepționer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddingUser(false)}>
                Anulează
              </Button>
              <Button onClick={() => setIsAddingUser(false)}>Adaugă utilizator</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Permisiuni - {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogTitle>
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
  );
}
