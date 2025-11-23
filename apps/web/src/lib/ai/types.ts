/**
 * AI Copilot types for MedicalCor Cortex
 */

// Chat message types
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    context?: string;
  };
}

export interface ChatContext {
  patientId?: string;
  patientPhone?: string;
  patientName?: string;
  currentConversation?: ConversationMessage[];
  patientHistory?: PatientHistorySummary;
  procedures?: string[];
}

export interface ConversationMessage {
  direction: 'IN' | 'OUT';
  content: string;
  timestamp: string;
  channel: 'whatsapp' | 'sms' | 'voice';
}

// Smart suggestions
export interface ResponseSuggestion {
  id: string;
  content: string;
  tone: 'formal' | 'friendly' | 'empathetic' | 'urgent';
  confidence: number;
  category: 'greeting' | 'info' | 'scheduling' | 'followup' | 'objection';
}

export interface QuickReply {
  id: string;
  label: string;
  content: string;
  category: string;
  shortcut?: string;
}

// Patient summary
export interface PatientHistorySummary {
  totalInteractions: number;
  firstContact: string;
  lastContact: string;
  classification: 'HOT' | 'WARM' | 'COLD';
  score: number;
  keyInsights: string[];
  proceduresDiscussed: string[];
  objections: string[];
  appointmentHistory: AppointmentSummary[];
  sentiment: 'positive' | 'neutral' | 'negative';
  engagementLevel: 'high' | 'medium' | 'low';
}

export interface AppointmentSummary {
  date: string;
  procedure: string;
  status: 'completed' | 'cancelled' | 'no-show' | 'scheduled';
}

// Procedure recommendations
export interface ProcedureRecommendation {
  id: string;
  name: string;
  category: string;
  relevanceScore: number;
  reasoning: string;
  priceRange: {
    min: number;
    max: number;
    currency: string;
  };
  duration: string;
  relatedProcedures: string[];
  commonQuestions: string[];
}

// AI API request/response
export interface AICompletionRequest {
  messages: AIMessage[];
  context?: ChatContext;
  maxTokens?: number;
  temperature?: number;
}

export interface AICompletionResponse {
  message: AIMessage;
  suggestions?: ResponseSuggestion[];
  recommendations?: ProcedureRecommendation[];
}

export interface AISummaryRequest {
  patientId: string;
  includeHistory?: boolean;
  includeInsights?: boolean;
}

export interface AISuggestionsRequest {
  patientId: string;
  currentMessage?: string;
  context?: ChatContext;
  count?: number;
}

// Copilot state
export interface CopilotState {
  isOpen: boolean;
  activeTab: 'chat' | 'suggestions' | 'summary' | 'procedures';
  isLoading: boolean;
  error: string | null;
}
