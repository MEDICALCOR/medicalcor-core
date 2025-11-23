import type {
  PatientHistorySummary,
  ProcedureRecommendation,
  QuickReply,
  ResponseSuggestion,
} from './types';

// Quick replies for common scenarios
export const quickReplies: QuickReply[] = [
  {
    id: 'qr-1',
    label: 'Salut',
    content: 'Bună ziua! Vă mulțumesc pentru mesaj. Cu ce vă pot ajuta astăzi?',
    category: 'greeting',
    shortcut: '1',
  },
  {
    id: 'qr-2',
    label: 'Programare',
    content:
      'Cu plăcere vă ajut să programați o consultație. Ce procedură vă interesează și când ați dori să veniți?',
    category: 'scheduling',
    shortcut: '2',
  },
  {
    id: 'qr-3',
    label: 'Prețuri',
    content:
      'Vă pot oferi informații despre prețuri. Pentru o evaluare exactă, vă recomand o consultație gratuită unde medicul va putea evalua cazul dumneavoastră.',
    category: 'info',
    shortcut: '3',
  },
  {
    id: 'qr-4',
    label: 'Confirmare',
    content:
      'Perfect! V-am programat pentru data și ora convenită. Veți primi un SMS de confirmare. Dacă aveți întrebări, nu ezitați să mă contactați.',
    category: 'followup',
    shortcut: '4',
  },
  {
    id: 'qr-5',
    label: 'Reminder',
    content:
      'Bună ziua! Vă reamintim de programarea de mâine la ora [ORA]. Vă așteptăm! Pentru reprogramare, răspundeți la acest mesaj.',
    category: 'followup',
    shortcut: '5',
  },
];

// Mock suggestions generator
export function generateMockSuggestions(context?: {
  currentMessage?: string;
}): ResponseSuggestion[] {
  const message = context?.currentMessage?.toLowerCase() ?? '';

  if (message.includes('pret') || message.includes('cost') || message.includes('cat costa')) {
    return [
      {
        id: 'sug-1',
        content:
          'Prețurile variază în funcție de complexitatea cazului. Pentru rinoplastie, prețurile încep de la 3.500€. Pot să vă programez o consultație gratuită pentru o evaluare personalizată?',
        tone: 'friendly',
        confidence: 0.92,
        category: 'info',
      },
      {
        id: 'sug-2',
        content:
          'Înțeleg că prețul este important. Oferim și opțiuni de plată în rate fără dobândă. Doriți să discutăm despre acest aspect la consultație?',
        tone: 'empathetic',
        confidence: 0.85,
        category: 'objection',
      },
    ];
  }

  if (
    message.includes('programare') ||
    message.includes('cand') ||
    message.includes('disponibil')
  ) {
    return [
      {
        id: 'sug-3',
        content:
          'Avem disponibilitate săptămâna aceasta joi și vineri, între orele 10:00-18:00. Ce zi și oră v-ar conveni mai bine?',
        tone: 'formal',
        confidence: 0.95,
        category: 'scheduling',
      },
      {
        id: 'sug-4',
        content:
          'Super! Pot să vă programez chiar mâine dacă doriți. Preferați dimineața sau după-amiază?',
        tone: 'friendly',
        confidence: 0.88,
        category: 'scheduling',
      },
    ];
  }

  // Default suggestions
  return [
    {
      id: 'sug-default-1',
      content: 'Vă mulțumesc pentru mesaj! Cum vă pot ajuta astăzi?',
      tone: 'friendly',
      confidence: 0.75,
      category: 'greeting',
    },
    {
      id: 'sug-default-2',
      content:
        'Bună ziua! Sunt aici să vă răspund la orice întrebare legată de procedurile noastre.',
      tone: 'formal',
      confidence: 0.72,
      category: 'greeting',
    },
  ];
}

// Mock patient summary
export function generateMockSummary(_patientId: string): PatientHistorySummary {
  return {
    totalInteractions: 12,
    firstContact: '2024-10-15',
    lastContact: '2024-11-20',
    classification: 'HOT',
    score: 87,
    keyInsights: [
      'Interesat de rinoplastie funcțională și estetică',
      'A menționat probleme de respirație',
      'Budget flexibil, preferă calitatea',
      'Disponibil pentru consultație în weekenduri',
    ],
    proceduresDiscussed: ['Rinoplastie', 'Septoplastie', 'Lifting facial'],
    objections: ['Îngrijorat de timpul de recuperare', 'Vrea să vadă rezultate anterioare'],
    appointmentHistory: [
      { date: '2024-11-01', procedure: 'Consultație inițială', status: 'completed' },
      { date: '2024-11-15', procedure: 'Consultație follow-up', status: 'cancelled' },
    ],
    sentiment: 'positive',
    engagementLevel: 'high',
  };
}

// Mock procedure recommendations
export function generateMockRecommendations(): ProcedureRecommendation[] {
  return [
    {
      id: 'proc-1',
      name: 'Rinoplastie',
      category: 'Chirurgie estetică nas',
      relevanceScore: 0.95,
      reasoning:
        'Pacientul a menționat explicit interes pentru rinoplastie și probleme funcționale de respirație.',
      priceRange: { min: 3500, max: 5500, currency: 'EUR' },
      duration: '2-3 ore',
      relatedProcedures: ['Septoplastie', 'Turbinoplastie'],
      commonQuestions: [
        'Cât durează recuperarea?',
        'Se vede că am făcut operație?',
        'Pot respira normal după?',
      ],
    },
    {
      id: 'proc-2',
      name: 'Septoplastie',
      category: 'Chirurgie funcțională',
      relevanceScore: 0.82,
      reasoning:
        'Complementar rinoplastiei pentru rezolvarea problemelor de respirație menționate.',
      priceRange: { min: 1500, max: 2500, currency: 'EUR' },
      duration: '1-2 ore',
      relatedProcedures: ['Rinoplastie', 'Turbinoplastie'],
      commonQuestions: ['Se poate face împreună cu rinoplastia?', 'Este acoperită de asigurare?'],
    },
    {
      id: 'proc-3',
      name: 'Lifting facial',
      category: 'Chirurgie estetică',
      relevanceScore: 0.45,
      reasoning: 'Menționat în conversații anterioare ca potențial interes viitor.',
      priceRange: { min: 4000, max: 8000, currency: 'EUR' },
      duration: '3-5 ore',
      relatedProcedures: ['Blefaroplastie', 'Liposucție bărbie'],
      commonQuestions: ['La ce vârstă este recomandat?', 'Cât durează rezultatul?'],
    },
  ];
}
