'use client';

import { useState } from 'react';
import {
  Stethoscope,
  Building2,
  Users,
  Calendar,
  MessageSquare,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
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

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const steps: OnboardingStep[] = [
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
  { id: 'team', title: 'Echipa', description: 'Adaugă membrii echipei', icon: Users },
  { id: 'schedule', title: 'Program', description: 'Configurează orarul de lucru', icon: Calendar },
  {
    id: 'notifications',
    title: 'Notificări',
    description: 'Setează comunicarea cu pacienții',
    icon: MessageSquare,
  },
  { id: 'complete', title: 'Gata!', description: 'Clinica ta este configurată', icon: Check },
];

export function OnboardingWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [clinicData, setClinicData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
  });

  const progress = ((currentStep + 1) / steps.length) * 100;
  const step = steps[currentStep];
  const StepIcon = step.icon;

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onComplete?.();
      onOpenChange(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
          <Progress value={progress} className="h-2 mb-6" />

          {currentStep === 0 && (
            <div className="text-center py-8">
              <Stethoscope className="h-16 w-16 mx-auto text-primary mb-4" />
              <h3 className="text-xl font-bold mb-2">Bun venit la MedicalCor Cortex!</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Te vom ghida prin configurarea clinicii tale. Procesul durează aproximativ 5 minute.
              </p>
              <div className="flex justify-center gap-8 mt-8">
                {[
                  { icon: Users, label: 'Pacienți' },
                  { icon: Calendar, label: 'Programări' },
                  { icon: MessageSquare, label: 'Comunicare' },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="w-12 h-12 mx-auto rounded-lg bg-muted flex items-center justify-center mb-2">
                      <item.icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinicName">Numele clinicii *</Label>
                <Input
                  id="clinicName"
                  placeholder="ex: Clinica MedicalCor"
                  value={clinicData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setClinicData({ ...clinicData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresa</Label>
                <Input
                  id="address"
                  placeholder="ex: Str. Victoriei 100, București"
                  value={clinicData.address}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setClinicData({ ...clinicData, address: e.target.value })
                  }
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    placeholder="ex: 021 123 4567"
                    value={clinicData.phone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setClinicData({ ...clinicData, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ex: contact@clinica.ro"
                    value={clinicData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setClinicData({ ...clinicData, email: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Poți adăuga membrii echipei acum sau mai târziu din Setări.
              </p>
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Admin (Tu)</h4>
                    <p className="text-sm text-muted-foreground">Administrator principal</p>
                  </div>
                  <Check className="h-5 w-5 text-green-500" />
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <Users className="h-4 w-4 mr-2" />
                Adaugă membru echipă
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Poți sări acest pas și să adaugi echipa mai târziu
              </p>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Configurează programul de lucru al clinicii.
              </p>
              <div className="space-y-2">
                {['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri'].map((day) => (
                  <div
                    key={day}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="font-medium">{day}</span>
                    <div className="flex items-center gap-2">
                      <Input type="time" defaultValue="09:00" className="w-28" />
                      <span>-</span>
                      <Input type="time" defaultValue="18:00" className="w-28" />
                    </div>
                  </div>
                ))}
                {['Sâmbătă', 'Duminică'].map((day) => (
                  <div
                    key={day}
                    className="flex items-center justify-between p-3 border rounded-lg opacity-60"
                  >
                    <span className="font-medium">{day}</span>
                    <span className="text-sm text-muted-foreground">Închis</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Alege cum dorești să comunici cu pacienții.
              </p>
              {[
                {
                  title: 'Reminder SMS',
                  desc: 'Trimite remindere cu 24h înainte de programare',
                  default: true,
                },
                {
                  title: 'Reminder Email',
                  desc: 'Trimite email cu detaliile programării',
                  default: true,
                },
                {
                  title: 'WhatsApp Business',
                  desc: 'Comunică prin WhatsApp (necesită configurare)',
                  default: false,
                },
                {
                  title: 'Confirmare automată',
                  desc: 'Cere confirmarea programării de la pacient',
                  default: true,
                },
              ].map((item) => (
                <label
                  key={item.title}
                  className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50"
                >
                  <div>
                    <span className="font-medium block">{item.title}</span>
                    <span className="text-sm text-muted-foreground block">{item.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded"
                    defaultChecked={item.default}
                    aria-label={item.title}
                  />
                </label>
              ))}
            </div>
          )}

          {currentStep === 5 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Felicitări!</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Clinica ta este configurată și gata de utilizare. Poți modifica setările oricând din
                meniul de setări.
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">0</div>
                  <p className="text-xs text-muted-foreground">Pacienți</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">0</div>
                  <p className="text-xs text-muted-foreground">Programări</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">1</div>
                  <p className="text-xs text-muted-foreground">Utilizatori</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={prevStep} disabled={currentStep === 0}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Înapoi
          </Button>
          <Button onClick={nextStep}>
            {currentStep === steps.length - 1 ? (
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
