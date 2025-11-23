'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Search,
  Book,
  Video,
  MessageCircle,
  ChevronRight,
  ExternalLink,
  FileText,
  Calendar,
  Users,
  Settings,
  BarChart3,
  Mail,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface HelpCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  articles: number;
}

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const categories: HelpCategory[] = [
  {
    id: 'getting-started',
    name: 'Primii pași',
    description: 'Ghid de start și configurare inițială',
    icon: Book,
    articles: 8,
  },
  {
    id: 'patients',
    name: 'Gestionare pacienți',
    description: 'Adăugare, editare și căutare pacienți',
    icon: Users,
    articles: 12,
  },
  {
    id: 'appointments',
    name: 'Programări',
    description: 'Calendar, programări și remindere',
    icon: Calendar,
    articles: 10,
  },
  {
    id: 'analytics',
    name: 'Rapoarte și analytics',
    description: 'Statistici și exporturi de date',
    icon: BarChart3,
    articles: 6,
  },
  {
    id: 'settings',
    name: 'Setări și configurare',
    description: 'Personalizare și integrări',
    icon: Settings,
    articles: 15,
  },
  {
    id: 'billing',
    name: 'Facturare',
    description: 'Plăți, facturi și abonamente',
    icon: FileText,
    articles: 5,
  },
];

const faqs: FAQ[] = [
  {
    question: 'Cum adaug un pacient nou?',
    answer:
      'Accesați secțiunea Pacienți din meniul lateral, apoi apăsați butonul "Adaugă pacient". Completați formularul cu datele pacientului și salvați.',
    category: 'patients',
  },
  {
    question: 'Cum programez o consultație?',
    answer:
      'Din pagina Calendar, selectați data și ora dorită, apoi alegeți pacientul și tipul de consultație. Pacientul va primi automat un reminder.',
    category: 'appointments',
  },
  {
    question: 'Cum configurez notificările automate?',
    answer:
      'Accesați Setări > Notificări pentru a configura reminder-ele SMS și email. Puteți seta timing-ul și template-urile de mesaje.',
    category: 'settings',
  },
  {
    question: 'Cum export datele pacienților?',
    answer:
      'Din secțiunea Rapoarte, selectați tipul de raport dorit și perioada. Apăsați "Export" pentru a descărca în format PDF sau Excel.',
    category: 'analytics',
  },
  {
    question: 'Cum integrez WhatsApp Business?',
    answer:
      'Accesați Setări > Integrări > WhatsApp. Urmați pașii pentru a conecta contul WhatsApp Business și a configura template-urile de mesaje.',
    category: 'settings',
  },
  {
    question: 'Cum schimb parola contului?',
    answer:
      'Accesați Setări > Profil și în secțiunea Securitate veți găsi opțiunea de schimbare a parolei.',
    category: 'settings',
  },
];

const videos = [
  { title: 'Introducere în MedicalCor Cortex', duration: '5:30', thumbnail: '🎬' },
  { title: 'Gestionarea programărilor', duration: '8:15', thumbnail: '📅' },
  { title: 'Configurare notificări', duration: '4:45', thumbnail: '🔔' },
  { title: 'Rapoarte și analytics', duration: '6:20', thumbnail: '📊' },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <HelpCircle className="h-8 w-8 text-primary" />
          Centru de ajutor
        </h1>
        <p className="text-muted-foreground mt-2">
          Găsește răspunsuri la întrebările tale și învață să folosești platforma
        </p>
        <div className="relative mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Caută în documentație..."
            className="pl-12 h-12 text-lg"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.id} className="cursor-pointer hover:border-primary transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{cat.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{cat.description}</p>
                    <p className="text-xs text-muted-foreground mt-2">{cat.articles} articole</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Întrebări frecvente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Tutoriale video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {videos.map((video, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="w-16 h-12 rounded bg-muted flex items-center justify-center text-2xl">
                    {video.thumbnail}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{video.title}</h4>
                    <p className="text-xs text-muted-foreground">{video.duration}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="text-center">
            <h3 className="text-lg font-medium">Nu ai găsit ce căutai?</h3>
            <p className="text-muted-foreground mt-1">
              Echipa noastră de suport este aici să te ajute
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
              <Button variant="outline" className="gap-2">
                <Mail className="h-4 w-4" />
                suport@medicalcor.ro
              </Button>
              <Button variant="outline" className="gap-2">
                <Phone className="h-4 w-4" />
                0800 123 456
              </Button>
              <Button className="gap-2">
                <MessageCircle className="h-4 w-4" />
                Chat live
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
