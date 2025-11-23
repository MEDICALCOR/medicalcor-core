'use client';

import {
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Calendar,
  User,
  Edit,
  MoreVertical,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PatientDetail, PatientStatus } from '@/lib/patients';

interface PatientHeaderProps {
  patient: PatientDetail;
  onEdit?: () => void;
}

const statusLabels: Record<PatientStatus, string> = {
  lead: 'Lead',
  contacted: 'Contactat',
  scheduled: 'Programat',
  patient: 'Pacient',
  inactive: 'Inactiv',
};

const statusColors: Record<PatientStatus, string> = {
  lead: 'bg-yellow-100 text-yellow-700',
  contacted: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-purple-100 text-purple-700',
  patient: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export function PatientHeader({ patient, onEdit }: PatientHeaderProps) {
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
  const age = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null;

  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-2xl bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Basic Info */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{fullName}</h1>
              <Badge className={cn('text-xs', statusColors[patient.status])}>
                {statusLabels[patient.status]}
              </Badge>
            </div>

            {/* Demographics */}
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {patient.dateOfBirth && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(patient.dateOfBirth)} ({age} ani)
                </span>
              )}
              {patient.gender && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {patient.gender === 'male'
                    ? 'Masculin'
                    : patient.gender === 'female'
                      ? 'Feminin'
                      : 'Altul'}
                </span>
              )}
              {patient.cnp && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => copyToClipboard(patient.cnp ?? '')}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        CNP: {patient.cnp.slice(0, 4)}...
                        <Copy className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click pentru a copia CNP</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Tags */}
            {patient.tags.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {patient.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Editează
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <ExternalLink className="h-4 w-4 mr-2" />
                Deschide în fereastră nouă
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">Arhivează pacient</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
        {/* Phone */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Phone className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Telefon</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => copyToClipboard(patient.contact.phone)}
                    className="font-medium hover:text-primary flex items-center gap-1"
                  >
                    {patient.contact.phone}
                    <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Click pentru a copia</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Email */}
        {patient.contact.email && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Mail className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <a
                href={`mailto:${patient.contact.email}`}
                className="font-medium hover:text-primary"
              >
                {patient.contact.email}
              </a>
            </div>
          </div>
        )}

        {/* WhatsApp */}
        {patient.contact.whatsapp && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <span className="font-medium">{patient.contact.whatsapp}</span>
              {patient.contact.preferredChannel === 'whatsapp' && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  Preferat
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Address */}
      {patient.address && (
        <div className="flex items-center gap-3 mt-4 pt-4 border-t">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Adresă</p>
            <p className="font-medium">
              {[
                patient.address.street,
                patient.address.city,
                patient.address.county,
                patient.address.postalCode,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
