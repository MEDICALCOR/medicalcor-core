'use client';

import { useState, useTransition } from 'react';
import {
  Stethoscope,
  Building2,
  Users,
  Calendar,
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Plus,
  X,
  Mail,
  User,
  Shield,
  Globe,
  Phone,
  MapPin,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
  completeOnboardingAction,
  DEFAULT_SCHEDULE,
  DEFAULT_NOTIFICATIONS,
  type ClinicScheduleDay,
  type NotificationPreferences,
  type TeamMemberInvite,
  type OnboardingInput,
} from '@/app/actions';

// =============================================================================
// Types
// =============================================================================

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

interface FormErrors {
  clinicName?: string;
  email?: string;
  phone?: string;
  website?: string;
  teamMember?: string;
}

// =============================================================================
// Constants
// =============================================================================

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Bun venit',
    description: 'Configurează-ți clinica în câțiva pași simpli',
    icon: Sparkles,
  },
  {
    id: 'clinic',
    title: 'Detalii clinică',
    description: 'Informații despre clinica ta',
    icon: Building2,
  },
  {
    id: 'team',
    title: 'Echipa',
    description: 'Invită membrii echipei',
    icon: Users,
  },
  {
    id: 'schedule',
    title: 'Program',
    description: 'Configurează orarul de lucru',
    icon: Calendar,
  },
  {
    id: 'notifications',
    title: 'Notificări',
    description: 'Setează comunicarea cu pacienții',
    icon: Bell,
  },
  {
    id: 'complete',
    title: 'Gata!',
    description: 'Clinica ta este configurată',
    icon: Check,
  },
];

const SPECIALTIES = [
  'Stomatologie generală',
  'Ortodonție',
  'Chirurgie orală',
  'Implantologie',
  'Endodonție',
  'Parodontologie',
  'Stomatologie pediatrică',
  'Estetică dentară',
  'Protetică dentară',
  'Altele',
];

const TEAM_ROLES: { value: TeamMemberInvite['role']; label: string }[] = [
  { value: 'doctor', label: 'Medic' },
  { value: 'receptionist', label: 'Recepționer' },
  { value: 'staff', label: 'Personal auxiliar' },
];

// =============================================================================
// Step Indicator Component
// =============================================================================

function StepIndicator({
  steps,
  currentStep,
  onStepClick,
}: {
  steps: OnboardingStep[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <div className="hidden sm:flex items-center justify-center gap-2 mb-6">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const StepIcon = step.icon;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepClick?.(index)}
            disabled={index > currentStep}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all',
              isCompleted && 'bg-primary/10 text-primary',
              isCurrent && 'bg-primary text-primary-foreground',
              !isCompleted && !isCurrent && 'text-muted-foreground',
              index <= currentStep && 'cursor-pointer hover:opacity-80',
              index > currentStep && 'cursor-not-allowed opacity-50'
            )}
          >
            <StepIcon className="h-4 w-4" />
            <span className="hidden md:inline">{step.title}</span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function OnboardingWizard({
  open,
  onOpenChange,
  onComplete,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (result: { clinicId: string; clinicName: string }) => void;
  initialData?: Partial<OnboardingInput>;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});

  // Form state
  const [clinicData, setClinicData] = useState({
    clinicName: initialData?.clinicName ?? '',
    address: initialData?.address ?? '',
    city: initialData?.city ?? '',
    country: initialData?.country ?? 'Romania',
    phone: initialData?.phone ?? '',
    email: initialData?.email ?? '',
    taxId: initialData?.taxId ?? '',
    website: initialData?.website ?? '',
    specialty: initialData?.specialty ?? '',
    hipaaCompliant: initialData?.hipaaCompliant ?? false,
    gdprCompliant: initialData?.gdprCompliant ?? true,
  });

  const [teamMembers, setTeamMembers] = useState<TeamMemberInvite[]>(
    initialData?.teamMembers ?? []
  );
  const [newMember, setNewMember] = useState<TeamMemberInvite>({
    email: '',
    name: '',
    role: 'doctor',
  });

  const [schedule, setSchedule] = useState<ClinicScheduleDay[]>(
    initialData?.schedule ?? DEFAULT_SCHEDULE
  );

  const [notifications, setNotifications] = useState<NotificationPreferences>(
    initialData?.notifications ?? DEFAULT_NOTIFICATIONS
  );

  // Computed values
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  // =============================================================================
  // Validation
  // =============================================================================

  const validateClinicDetails = (): boolean => {
    const newErrors: FormErrors = {};

    if (!clinicData.clinicName.trim()) {
      newErrors.clinicName = 'Numele clinicii este obligatoriu';
    }

    if (clinicData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clinicData.email)) {
      newErrors.email = 'Adresa de email nu este validă';
    }

    if (clinicData.website && !/^https?:\/\/.+/.test(clinicData.website)) {
      newErrors.website = 'URL-ul trebuie să înceapă cu http:// sau https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateTeamMember = (): boolean => {
    if (!newMember.email || !newMember.name) {
      setErrors({ teamMember: 'Email și nume sunt obligatorii' });
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMember.email)) {
      setErrors({ teamMember: 'Adresa de email nu este validă' });
      return false;
    }

    if (teamMembers.some((m) => m.email === newMember.email)) {
      setErrors({ teamMember: 'Acest email a fost deja adăugat' });
      return false;
    }

    setErrors({});
    return true;
  };

  // =============================================================================
  // Navigation
  // =============================================================================

  const nextStep = () => {
    // Validate current step before proceeding
    if (currentStep === 1 && !validateClinicDetails()) {
      return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setErrors({});
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setErrors({});
    }
  };

  const goToStep = (index: number) => {
    if (index <= currentStep) {
      setCurrentStep(index);
      setErrors({});
    }
  };

  // =============================================================================
  // Actions
  // =============================================================================

  const addTeamMember = () => {
    if (!validateTeamMember()) return;

    setTeamMembers((prev) => [...prev, { ...newMember }]);
    setNewMember({ email: '', name: '', role: 'doctor' });
  };

  const removeTeamMember = (email: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.email !== email));
  };

  const updateScheduleDay = (
    dayIndex: number,
    field: keyof ClinicScheduleDay,
    value: string | boolean
  ) => {
    setSchedule((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, [field]: value } : day))
    );
  };

  const handleComplete = () => {
    startTransition(async () => {
      try {
        const data: OnboardingInput = {
          clinicName: clinicData.clinicName,
          address: clinicData.address || undefined,
          city: clinicData.city || undefined,
          country: clinicData.country,
          phone: clinicData.phone || undefined,
          email: clinicData.email || undefined,
          taxId: clinicData.taxId || undefined,
          website: clinicData.website || undefined,
          specialty: clinicData.specialty || undefined,
          hipaaCompliant: clinicData.hipaaCompliant,
          gdprCompliant: clinicData.gdprCompliant,
          teamMembers,
          schedule,
          notifications,
        };

        const result = await completeOnboardingAction(data);

        if (result.success) {
          toast({
            title: 'Felicitări!',
            description: `Clinica ${result.clinicName} a fost configurată cu succes.`,
          });

          onComplete?.({
            clinicId: result.clinicId,
            clinicName: result.clinicName,
          });

          onOpenChange(false);
        }
      } catch (error) {
        toast({
          title: 'Eroare',
          description:
            error instanceof Error ? error.message : 'A apărut o eroare la salvarea datelor.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleSkip = () => {
    toast({
      title: 'Onboarding sărit',
      description: 'Poți configura clinica oricând din Setări.',
    });
    onOpenChange(false);
  };

  // =============================================================================
  // Render Steps
  // =============================================================================

  const renderWelcomeStep = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Stethoscope className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-2xl font-bold mb-3">Bun venit la MedicalCor Cortex!</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Te vom ghida prin configurarea clinicii tale. Procesul durează aproximativ 5 minute și poți
        reveni oricând pentru a modifica setările.
      </p>
      <div className="grid grid-cols-3 gap-6 max-w-sm mx-auto">
        {[
          { icon: Users, label: 'Pacienți', desc: 'Gestionare completă' },
          { icon: Calendar, label: 'Programări', desc: 'Calendar inteligent' },
          { icon: Bell, label: 'Comunicare', desc: 'Multi-canal' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <div className="w-14 h-14 mx-auto rounded-xl bg-muted flex items-center justify-center mb-3">
              <item.icon className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderClinicDetailsStep = () => (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="clinicName" className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Numele clinicii *
        </Label>
        <Input
          id="clinicName"
          placeholder="ex: Clinica MedicalCor Central"
          value={clinicData.clinicName}
          onChange={(e) => setClinicData({ ...clinicData, clinicName: e.target.value })}
          className={cn(errors.clinicName && 'border-destructive')}
        />
        {errors.clinicName && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errors.clinicName}
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="specialty">Specializare principală</Label>
          <Select
            value={clinicData.specialty}
            onValueChange={(value) => setClinicData({ ...clinicData, specialty: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selectează specializarea" />
            </SelectTrigger>
            <SelectContent>
              {SPECIALTIES.map((specialty) => (
                <SelectItem key={specialty} value={specialty}>
                  {specialty}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxId">CUI / CIF</Label>
          <Input
            id="taxId"
            placeholder="ex: RO12345678"
            value={clinicData.taxId}
            onChange={(e) => setClinicData({ ...clinicData, taxId: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address" className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Adresa
        </Label>
        <Input
          id="address"
          placeholder="ex: Str. Victoriei 100, Sector 1"
          value={clinicData.address}
          onChange={(e) => setClinicData({ ...clinicData, address: e.target.value })}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">Oraș</Label>
          <Input
            id="city"
            placeholder="ex: București"
            value={clinicData.city}
            onChange={(e) => setClinicData({ ...clinicData, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Țară</Label>
          <Input
            id="country"
            value={clinicData.country}
            onChange={(e) => setClinicData({ ...clinicData, country: e.target.value })}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Telefon
          </Label>
          <Input
            id="phone"
            placeholder="ex: 021 123 4567"
            value={clinicData.phone}
            onChange={(e) => setClinicData({ ...clinicData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="ex: contact@clinica.ro"
            value={clinicData.email}
            onChange={(e) => setClinicData({ ...clinicData, email: e.target.value })}
            className={cn(errors.email && 'border-destructive')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website" className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Website
        </Label>
        <Input
          id="website"
          placeholder="ex: https://clinica.ro"
          value={clinicData.website}
          onChange={(e) => setClinicData({ ...clinicData, website: e.target.value })}
          className={cn(errors.website && 'border-destructive')}
        />
        {errors.website && <p className="text-sm text-destructive">{errors.website}</p>}
      </div>

      <div className="pt-4 border-t space-y-3">
        <Label className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Conformitate
        </Label>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="gdprCompliant"
              checked={clinicData.gdprCompliant}
              onCheckedChange={(checked) =>
                setClinicData({ ...clinicData, gdprCompliant: checked === true })
              }
            />
            <Label htmlFor="gdprCompliant" className="text-sm cursor-pointer">
              GDPR Compliant
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="hipaaCompliant"
              checked={clinicData.hipaaCompliant}
              onCheckedChange={(checked) =>
                setClinicData({ ...clinicData, hipaaCompliant: checked === true })
              }
            />
            <Label htmlFor="hipaaCompliant" className="text-sm cursor-pointer">
              HIPAA Compliant
            </Label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeamStep = () => (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Invită membrii echipei tale. Aceștia vor primi un email cu instrucțiuni de activare. Poți
        sări acest pas și adăuga echipa mai târziu.
      </p>

      {/* Current admin */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Tu (Administrator)</p>
              <p className="text-sm text-muted-foreground">Administrator principal</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="h-3 w-3 mr-1" />
            Activ
          </Badge>
        </div>
      </div>

      {/* Added team members */}
      {teamMembers.length > 0 && (
        <div className="space-y-2">
          <Label>Membri invitați ({teamMembers.length})</Label>
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div
                key={member.email}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {TEAM_ROLES.find((r) => r.value === member.role)?.label}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeTeamMember(member.email)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new member form */}
      <div className="border rounded-lg p-4 space-y-4">
        <Label>Adaugă membru nou</Label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            placeholder="Nume complet"
            value={newMember.name}
            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
          />
          <Input
            type="email"
            placeholder="Email"
            value={newMember.email}
            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={newMember.role}
            onValueChange={(value) =>
              setNewMember({ ...newMember, role: value as TeamMemberInvite['role'] })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={addTeamMember} className="flex-1 sm:flex-none">
            <Plus className="h-4 w-4 mr-2" />
            Adaugă
          </Button>
        </div>
        {errors.teamMember && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errors.teamMember}
          </p>
        )}
      </div>
    </div>
  );

  const renderScheduleStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configurează programul de lucru standard al clinicii. Poți modifica ulterior pentru fiecare
        medic în parte.
      </p>

      <div className="space-y-2">
        {schedule.map((day, index) => (
          <div
            key={day.day}
            className={cn(
              'flex items-center justify-between p-3 border rounded-lg transition-colors',
              !day.isOpen && 'bg-muted/50'
            )}
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={day.isOpen}
                onCheckedChange={(checked) => updateScheduleDay(index, 'isOpen', checked)}
              />
              <span className={cn('font-medium w-24', !day.isOpen && 'text-muted-foreground')}>
                {day.day}
              </span>
            </div>
            {day.isOpen ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={day.startTime}
                  onChange={(e) => updateScheduleDay(index, 'startTime', e.target.value)}
                  className="w-28"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="time"
                  value={day.endTime}
                  onChange={(e) => updateScheduleDay(index, 'endTime', e.target.value)}
                  className="w-28"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Închis</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSchedule(DEFAULT_SCHEDULE)}
          className="text-xs"
        >
          Resetează la implicit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSchedule((prev) =>
              prev.map((d) => ({
                ...d,
                isOpen: ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri'].includes(d.day),
              }))
            )
          }
          className="text-xs"
        >
          Doar zile lucrătoare
        </Button>
      </div>
    </div>
  );

  const renderNotificationsStep = () => (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Configurează modul în care clinica comunică automat cu pacienții.
      </p>

      <div className="space-y-3">
        {[
          {
            key: 'emailReminders' as const,
            title: 'Reminder Email',
            description: 'Trimite email cu detaliile programării',
            icon: Mail,
          },
          {
            key: 'smsReminders' as const,
            title: 'Reminder SMS',
            description: 'Trimite SMS cu reminder înainte de programare',
            icon: Bell,
          },
          {
            key: 'whatsappEnabled' as const,
            title: 'WhatsApp Business',
            description: 'Comunică prin WhatsApp (necesită configurare)',
            icon: Bell,
          },
          {
            key: 'autoConfirmation' as const,
            title: 'Confirmare automată',
            description: 'Cere confirmarea programării de la pacient',
            icon: Check,
          },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Label
              htmlFor={`notification-${item.key}`}
              className="flex items-center gap-3 cursor-pointer flex-1"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <span className="font-medium block">{item.title}</span>
                <span className="text-sm text-muted-foreground block font-normal">
                  {item.description}
                </span>
              </div>
            </Label>
            <Switch
              id={`notification-${item.key}`}
              checked={notifications[item.key]}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, [item.key]: checked })
              }
            />
          </div>
        ))}
      </div>

      <div className="pt-4 border-t">
        <Label htmlFor="reminderHours" className="mb-3 block">
          Interval reminder
        </Label>
        <div className="flex items-center gap-3">
          <Select
            value={notifications.reminderHours.toString()}
            onValueChange={(value) =>
              setNotifications({ ...notifications, reminderHours: parseInt(value, 10) })
            }
          >
            <SelectTrigger id="reminderHours" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 oră înainte</SelectItem>
              <SelectItem value="2">2 ore înainte</SelectItem>
              <SelectItem value="4">4 ore înainte</SelectItem>
              <SelectItem value="12">12 ore înainte</SelectItem>
              <SelectItem value="24">24 ore înainte</SelectItem>
              <SelectItem value="48">48 ore înainte</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">de programare</span>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
        <Check className="h-10 w-10 text-green-600" />
      </div>
      <h3 className="text-2xl font-bold mb-3">Felicitări!</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        Clinica <span className="font-medium text-foreground">{clinicData.clinicName}</span> este
        configurată și gata de utilizare.
      </p>

      <div className="grid grid-cols-3 gap-6 max-w-sm mx-auto mb-8">
        <div className="text-center">
          <div className="text-3xl font-bold text-primary">{teamMembers.length + 1}</div>
          <p className="text-sm text-muted-foreground">Utilizatori</p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-primary">
            {schedule.filter((d) => d.isOpen).length}
          </div>
          <p className="text-sm text-muted-foreground">Zile deschis</p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-primary">
            {
              [
                notifications.emailReminders,
                notifications.smsReminders,
                notifications.whatsappEnabled,
              ].filter(Boolean).length
            }
          </div>
          <p className="text-sm text-muted-foreground">Canale active</p>
        </div>
      </div>

      {teamMembers.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <Mail className="h-4 w-4 inline mr-1" />
          {teamMembers.length} invitații vor fi trimise după finalizare.
        </p>
      )}
    </div>
  );

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <StepIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle>{step.title}</DialogTitle>
              <DialogDescription>{step.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <Progress value={progress} className="h-2 mb-4" />
          <StepIndicator steps={STEPS} currentStep={currentStep} onStepClick={goToStep} />

          {currentStep === 0 && renderWelcomeStep()}
          {currentStep === 1 && renderClinicDetailsStep()}
          {currentStep === 2 && renderTeamStep()}
          {currentStep === 3 && renderScheduleStep()}
          {currentStep === 4 && renderNotificationsStep()}
          {currentStep === 5 && renderCompleteStep()}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            {isFirstStep ? (
              <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
                Sari peste
              </Button>
            ) : (
              <Button variant="outline" onClick={prevStep} disabled={isPending}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Înapoi
              </Button>
            )}
          </div>
          <Button onClick={nextStep} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isLastStep ? (
              <>
                Începe să folosești Cortex
                <Check className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Continuă
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
