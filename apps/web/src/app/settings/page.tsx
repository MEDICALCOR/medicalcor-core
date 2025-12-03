'use client';

import { useState } from 'react';
import { Mail, Phone, Camera, Save } from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ProfileSettingsPage() {
  // SECURITY: Demo/placeholder data only - no real PII
  // In production, this would be loaded from the authenticated user's session
  const [profile, setProfile] = useState({
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@example.com',
    phone: '+40 700 000 000',
    role: 'doctor',
    language: 'ro',
    timezone: 'Europe/Bucharest',
  });

  const handleChange = (field: string, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <PagePermissionGate pathname="/settings">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profil Utilizator</CardTitle>
          <CardDescription>Actualizează informațiile tale de profil</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {profile.firstName[0]}
                {profile.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button variant="outline" size="sm">
                <Camera className="h-4 w-4 mr-2" />
                Schimbă poza
              </Button>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG sau GIF. Max 2MB.</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prenume</Label>
              <Input
                id="firstName"
                value={profile.firstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange('firstName', e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nume</Label>
              <Input
                id="lastName"
                value={profile.lastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange('lastName', e.target.value)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange('email', e.target.value)
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange('phone', e.target.value)
                  }
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={profile.role}
                onValueChange={(value: string) => handleChange('role', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="doctor">Medic</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="receptionist">Recepționer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Limbă</Label>
              <Select
                value={profile.language}
                onValueChange={(value: string) => handleChange('language', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ro">Română</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Fus orar</Label>
              <Select
                value={profile.timezone}
                onValueChange={(value: string) => handleChange('timezone', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Bucharest">Europe/Bucharest (GMT+2)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT+0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Salvează modificările
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schimbă Parola</CardTitle>
          <CardDescription>Actualizează parola contului tău</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Parola curentă</Label>
              <Input id="currentPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Parola nouă</Label>
              <Input id="newPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmă parola</Label>
              <Input id="confirmPassword" type="password" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline">Schimbă parola</Button>
          </div>
        </CardContent>
        </Card>
      </div>
    </PagePermissionGate>
  );
}
