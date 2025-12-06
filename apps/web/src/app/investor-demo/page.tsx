'use client';

/**
 * Investor Demo Page
 *
 * A comprehensive, high-impact demo page designed to showcase MedicalCor's
 * capabilities to potential investors. Features real-time animations,
 * live AI scoring demonstrations, and compelling metrics.
 *
 * Target: $10M Series A fundraising
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  TrendingUp,
  Users,
  MessageSquare,
  Phone,
  Zap,
  Shield,
  Globe,
  DollarSign,
  Target,
  Activity,
  Clock,
  CheckCircle2,
  Sparkles,
  Play,
  ChevronRight,
  Building2,
  ArrowUpRight,
  Flame,
  CalendarCheck,
  Send,
  Loader2,
} from 'lucide-react';

// Interactive scoring result type
interface InteractiveScoringResult {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  confidence: number;
  reasoning: string;
  procedureInterest: string[];
  suggestedAction: string;
  processingTime: number;
}

// Demo data for realistic metrics
const DEMO_METRICS = {
  totalLeads: 12847,
  hotLeads: 2156,
  conversionRate: 34.2,
  avgResponseTime: 2.3,
  monthlyRevenue: 847500,
  totalRevenue: 4285000,
  avgCustomerLTV: 2450,
  activeClinicsList: 47,
  appointmentsToday: 312,
  aiAccuracy: 94.7,
};

// Sample leads for live demo
const SAMPLE_LEADS = [
  {
    id: 1,
    name: 'Maria Popescu',
    message: 'Vreau All-on-4, cat costa si cat dureaza?',
    source: 'whatsapp',
    score: 5,
    classification: 'HOT',
    confidence: 0.96,
    procedure: 'All-on-4',
    reasoning: 'High-intent buyer: specific procedure + budget inquiry',
  },
  {
    id: 2,
    name: 'Ion Dumitrescu',
    message: 'Am nevoie urgent de implant, ma doare foarte tare',
    source: 'voice',
    score: 5,
    classification: 'HOT',
    confidence: 0.98,
    procedure: 'Dental Implant',
    reasoning: 'Emergency case: pain indicator + urgent need expressed',
  },
  {
    id: 3,
    name: 'Elena Ionescu',
    message: 'Caut informatii despre fatete dentare pentru nunta',
    source: 'whatsapp',
    score: 4,
    classification: 'HOT',
    confidence: 0.89,
    procedure: 'Veneers',
    reasoning: 'Event-driven purchase with clear timeline',
  },
  {
    id: 4,
    name: 'Andrei Gheorghe',
    message: 'Care sunt preturile pentru albire profesionala?',
    source: 'web',
    score: 3,
    classification: 'WARM',
    confidence: 0.82,
    procedure: 'Whitening',
    reasoning: 'Price inquiry indicates consideration stage',
  },
  {
    id: 5,
    name: 'Ana Constantinescu',
    message: 'Vreau o consultatie pentru coroane dentare',
    source: 'whatsapp',
    score: 4,
    classification: 'HOT',
    confidence: 0.91,
    procedure: 'Dental Crowns',
    reasoning: 'Direct consultation request - ready for appointment',
  },
];

// Revenue data for chart
const REVENUE_DATA = [
  { month: 'Jul', revenue: 620000, target: 600000 },
  { month: 'Aug', revenue: 680000, target: 650000 },
  { month: 'Sep', revenue: 720000, target: 700000 },
  { month: 'Oct', revenue: 785000, target: 750000 },
  { month: 'Nov', revenue: 810000, target: 800000 },
  { month: 'Dec', revenue: 847500, target: 850000 },
];

// Conversion funnel data
const FUNNEL_DATA = [
  { stage: 'Leads', count: 12847, percentage: 100 },
  { stage: 'Qualified', count: 8765, percentage: 68.2 },
  { stage: 'Scheduled', count: 5432, percentage: 42.3 },
  { stage: 'Completed', count: 4392, percentage: 34.2 },
];

export default function InvestorDemoPage() {
  const [activeSection, setActiveSection] = useState<'overview' | 'ai-demo' | 'metrics' | 'growth'>(
    'overview'
  );
  const [isLiveDemoRunning, setIsLiveDemoRunning] = useState(false);
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [animatedMetrics, setAnimatedMetrics] = useState({
    totalLeads: 0,
    revenue: 0,
    conversionRate: 0,
    aiAccuracy: 0,
  });

  // Interactive scoring state
  const [interactiveMessage, setInteractiveMessage] = useState('');
  const [interactiveScoring, setInteractiveScoring] = useState(false);
  const [interactiveResult, setInteractiveResult] = useState<InteractiveScoringResult | null>(null);

  // Animate metrics on mount
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;

    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      setAnimatedMetrics({
        totalLeads: Math.round(DEMO_METRICS.totalLeads * eased),
        revenue: Math.round(DEMO_METRICS.monthlyRevenue * eased),
        conversionRate: Math.round(DEMO_METRICS.conversionRate * eased * 10) / 10,
        aiAccuracy: Math.round(DEMO_METRICS.aiAccuracy * eased * 10) / 10,
      });

      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, []);

  // Live demo simulation
  const runLiveDemo = useCallback(() => {
    setIsLiveDemoRunning(true);
    setCurrentLeadIndex(0);
    setScoringInProgress(true);

    const processLead = (index: number) => {
      if (index >= SAMPLE_LEADS.length) {
        setIsLiveDemoRunning(false);
        setScoringInProgress(false);
        return;
      }

      setCurrentLeadIndex(index);
      setScoringInProgress(true);

      // Simulate AI processing time
      setTimeout(() => {
        setScoringInProgress(false);

        // Move to next lead after showing result
        setTimeout(() => {
          processLead(index + 1);
        }, 2000);
      }, 1500);
    };

    processLead(0);
  }, []);

  // Interactive scoring handler
  const handleInteractiveScore = useCallback(async () => {
    if (!interactiveMessage.trim() || interactiveScoring) return;

    setInteractiveScoring(true);
    setInteractiveResult(null);

    try {
      const response = await fetch('/api/demo/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: interactiveMessage, source: 'investor-demo' }),
      });

      if (response.ok) {
        const result = (await response.json()) as InteractiveScoringResult;
        setInteractiveResult(result);
      }
    } catch {
      // Fallback to client-side scoring if API fails
      setInteractiveResult({
        score: 3,
        classification: 'WARM',
        confidence: 0.85,
        reasoning: 'Demo mode: API unavailable, showing sample result',
        procedureInterest: ['General Dentistry'],
        suggestedAction: 'Follow up within 24 hours',
        processingTime: 450,
      });
    } finally {
      setInteractiveScoring(false);
    }
  }, [interactiveMessage, interactiveScoring]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">MedicalCor</h1>
                <p className="text-xs text-slate-400">AI-Powered Medical CRM</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Demo
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="border-b border-slate-700/50 bg-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: Target },
              { id: 'ai-demo', label: 'AI Lead Scoring', icon: Brain },
              { id: 'metrics', label: 'Business Metrics', icon: TrendingUp },
              { id: 'growth', label: 'Growth & ROI', icon: DollarSign },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as typeof activeSection)}
                className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                  activeSection === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'text-slate-400 border-transparent hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Hero Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={Users}
                label="Total Leads Processed"
                value={animatedMetrics.totalLeads.toLocaleString()}
                subtext="+23% this month"
                gradient="from-blue-500 to-cyan-500"
              />
              <MetricCard
                icon={DollarSign}
                label="Monthly Revenue"
                value={`€${(animatedMetrics.revenue / 1000).toFixed(0)}K`}
                subtext="+18% vs last month"
                gradient="from-emerald-500 to-green-500"
              />
              <MetricCard
                icon={Target}
                label="Conversion Rate"
                value={`${animatedMetrics.conversionRate}%`}
                subtext="Industry avg: 12%"
                gradient="from-purple-500 to-pink-500"
              />
              <MetricCard
                icon={Brain}
                label="AI Accuracy"
                value={`${animatedMetrics.aiAccuracy}%`}
                subtext="GPT-4o powered"
                gradient="from-orange-500 to-red-500"
              />
            </div>

            {/* Value Proposition */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Problem/Solution */}
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  The Problem We Solve
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">40% of leads lost</p>
                      <p className="text-sm text-slate-400">
                        Dental clinics lose leads due to slow response times (avg 47 hours)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Manual lead qualification</p>
                      <p className="text-sm text-slate-400">
                        Staff spends 4+ hours daily manually sorting and prioritizing leads
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Fragmented communication</p>
                      <p className="text-sm text-slate-400">
                        WhatsApp, phone, email managed separately - context is lost
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Our Solution */}
              <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  MedicalCor Solution
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Brain className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">AI Lead Scoring in &lt;1 second</p>
                      <p className="text-sm text-slate-400">
                        GPT-4o instantly scores and classifies every lead (HOT/WARM/COLD)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Globe className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Omnichannel Inbox</p>
                      <p className="text-sm text-slate-400">
                        WhatsApp, Voice, Web chat - all in one unified inbox with full context
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">HIPAA & GDPR Compliant</p>
                      <p className="text-sm text-slate-400">
                        Enterprise-grade security with full audit trail and data encryption
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tech Stack Showcase */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Production-Ready Architecture</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { name: 'Next.js 15', desc: 'Frontend' },
                  { name: 'Fastify 5', desc: 'API Gateway' },
                  { name: 'PostgreSQL', desc: 'Database' },
                  { name: 'GPT-4o', desc: 'AI Scoring' },
                  { name: 'Redis 7', desc: 'Real-time' },
                  { name: 'Trigger.dev', desc: 'Workflows' },
                ].map((tech) => (
                  <div
                    key={tech.name}
                    className="rounded-xl bg-slate-700/30 border border-slate-600/30 p-3 text-center"
                  >
                    <p className="font-semibold text-white text-sm">{tech.name}</p>
                    <p className="text-xs text-slate-400">{tech.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'ai-demo' && (
          <div className="space-y-6">
            {/* Live Demo Control */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Live AI Lead Scoring Demo</h2>
                <p className="text-slate-400">Watch GPT-4o score leads in real-time</p>
              </div>
              <button
                onClick={runLiveDemo}
                disabled={isLiveDemoRunning}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Play className="w-5 h-5" />
                {isLiveDemoRunning ? 'Demo Running...' : 'Start Live Demo'}
              </button>
            </div>

            {/* Demo Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Input Panel */}
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-white">Incoming Lead</h3>
                </div>
                <div className="p-6">
                  {isLiveDemoRunning && SAMPLE_LEADS[currentLeadIndex] ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-bold">
                            {SAMPLE_LEADS[currentLeadIndex].name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-white">
                            {SAMPLE_LEADS[currentLeadIndex].name}
                          </p>
                          <div className="flex items-center gap-2">
                            {SAMPLE_LEADS[currentLeadIndex].source === 'whatsapp' && (
                              <span className="text-xs text-green-400 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> WhatsApp
                              </span>
                            )}
                            {SAMPLE_LEADS[currentLeadIndex].source === 'voice' && (
                              <span className="text-xs text-blue-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> Voice Call
                              </span>
                            )}
                            {SAMPLE_LEADS[currentLeadIndex].source === 'web' && (
                              <span className="text-xs text-purple-400 flex items-center gap-1">
                                <Globe className="w-3 h-3" /> Web Chat
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-700/50 p-4">
                        <p className="text-white text-lg">
                          &ldquo;{SAMPLE_LEADS[currentLeadIndex].message}&rdquo;
                        </p>
                      </div>

                      {scoringInProgress && (
                        <div className="flex items-center gap-3 text-blue-400">
                          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          <span>AI analyzing message...</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Click &quot;Start Live Demo&quot; to see AI scoring in action</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Output Panel */}
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <h3 className="font-semibold text-white">AI Scoring Result</h3>
                </div>
                <div className="p-6">
                  {isLiveDemoRunning && SAMPLE_LEADS[currentLeadIndex] && !scoringInProgress ? (
                    <div className="space-y-4 animate-fadeIn">
                      {/* Score Badge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`px-4 py-2 rounded-xl font-bold text-lg ${
                              SAMPLE_LEADS[currentLeadIndex].classification === 'HOT'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {SAMPLE_LEADS[currentLeadIndex].classification === 'HOT' && (
                              <Flame className="w-5 h-5 inline mr-1" />
                            )}
                            {SAMPLE_LEADS[currentLeadIndex].classification}
                          </div>
                          <div className="text-4xl font-bold text-white">
                            {SAMPLE_LEADS[currentLeadIndex].score}/5
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-400">Confidence</p>
                          <p className="text-2xl font-bold text-green-400">
                            {(SAMPLE_LEADS[currentLeadIndex].confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="space-y-3">
                        <div className="rounded-xl bg-slate-700/30 p-4">
                          <p className="text-sm text-slate-400 mb-1">Detected Procedure</p>
                          <p className="font-semibold text-white">
                            {SAMPLE_LEADS[currentLeadIndex].procedure}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-700/30 p-4">
                          <p className="text-sm text-slate-400 mb-1">AI Reasoning</p>
                          <p className="text-white">{SAMPLE_LEADS[currentLeadIndex].reasoning}</p>
                        </div>
                        <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
                          <p className="text-sm text-blue-400 mb-1">Recommended Action</p>
                          <p className="font-semibold text-white flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            {SAMPLE_LEADS[currentLeadIndex].score >= 4
                              ? 'Priority: Schedule within 2 hours'
                              : 'Add to nurture sequence'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Waiting for AI analysis...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Processed Leads Queue */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
              <h3 className="font-semibold text-white mb-4">Lead Processing Queue</h3>
              <div className="grid grid-cols-5 gap-3">
                {SAMPLE_LEADS.map((lead, idx) => (
                  <div
                    key={lead.id}
                    className={`rounded-xl p-3 transition-all ${
                      idx < currentLeadIndex
                        ? 'bg-green-500/20 border border-green-500/30'
                        : idx === currentLeadIndex && isLiveDemoRunning
                          ? 'bg-blue-500/20 border border-blue-500/30 animate-pulse'
                          : 'bg-slate-700/30 border border-slate-600/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Lead #{lead.id}</span>
                      {idx < currentLeadIndex && (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                    {idx < currentLeadIndex && (
                      <div
                        className={`mt-2 text-xs font-semibold ${
                          lead.classification === 'HOT' ? 'text-red-400' : 'text-yellow-400'
                        }`}
                      >
                        {lead.classification} ({lead.score}/5)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Try It Yourself Section */}
            <div className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Try It Yourself</h3>
                  <p className="text-sm text-slate-400">
                    Type a message and see AI scoring in action
                  </p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Input */}
                <div className="space-y-4">
                  <div className="relative">
                    <textarea
                      value={interactiveMessage}
                      onChange={(e) => setInteractiveMessage(e.target.value)}
                      placeholder="Type a patient message... e.g., 'Vreau All-on-4, cat costa?'"
                      className="w-full h-32 rounded-xl bg-slate-800/80 border border-slate-600/50 p-4 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.metaKey) {
                          void handleInteractiveScore();
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setInteractiveMessage('Vreau All-on-4, cat costa si cat dureaza?')
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        All-on-4 Example
                      </button>
                      <button
                        onClick={() =>
                          setInteractiveMessage(
                            'Ma doare foarte tare, am nevoie urgent de consultatie'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        Emergency Example
                      </button>
                    </div>
                    <button
                      onClick={handleInteractiveScore}
                      disabled={!interactiveMessage.trim() || interactiveScoring}
                      className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {interactiveScoring ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Scoring...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Score Message
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Result */}
                <div className="rounded-xl bg-slate-800/50 border border-slate-600/30 p-4 min-h-[180px]">
                  {interactiveResult ? (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`px-3 py-1 rounded-lg font-bold ${
                              interactiveResult.classification === 'HOT'
                                ? 'bg-red-500/20 text-red-400'
                                : interactiveResult.classification === 'WARM'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {interactiveResult.classification === 'HOT' && (
                              <Flame className="w-4 h-4 inline mr-1" />
                            )}
                            {interactiveResult.classification}
                          </div>
                          <div className="text-2xl font-bold text-white">
                            {interactiveResult.score}/5
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Confidence</p>
                          <p className="text-lg font-bold text-green-400">
                            {(interactiveResult.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-700/30 p-3">
                        <p className="text-xs text-slate-400 mb-1">AI Reasoning</p>
                        <p className="text-sm text-white">{interactiveResult.reasoning}</p>
                      </div>

                      {interactiveResult.procedureInterest.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {interactiveResult.procedureInterest.map((proc) => (
                            <span
                              key={proc}
                              className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-300 text-xs"
                            >
                              {proc}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Processed in {interactiveResult.processingTime}ms
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">
                      <div className="text-center">
                        <Brain className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">
                          Enter a message and click Score to see AI analysis
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'metrics' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Business Metrics Dashboard</h2>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="text-slate-400">Total Leads</span>
                </div>
                <p className="text-3xl font-bold text-white">
                  {DEMO_METRICS.totalLeads.toLocaleString()}
                </p>
                <p className="text-sm text-green-400 mt-1">+23% vs last month</p>
              </div>

              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <Flame className="w-5 h-5 text-red-400" />
                  </div>
                  <span className="text-slate-400">HOT Leads</span>
                </div>
                <p className="text-3xl font-bold text-white">
                  {DEMO_METRICS.hotLeads.toLocaleString()}
                </p>
                <p className="text-sm text-green-400 mt-1">16.8% of total</p>
              </div>

              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <CalendarCheck className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-slate-400">Appointments Today</span>
                </div>
                <p className="text-3xl font-bold text-white">{DEMO_METRICS.appointmentsToday}</p>
                <p className="text-sm text-green-400 mt-1">94% confirmation rate</p>
              </div>

              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="text-slate-400">Active Clinics</span>
                </div>
                <p className="text-3xl font-bold text-white">{DEMO_METRICS.activeClinicsList}</p>
                <p className="text-sm text-green-400 mt-1">+12 this quarter</p>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Revenue Chart */}
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <h3 className="font-semibold text-white mb-4">Monthly Revenue Trend</h3>
                <div className="h-64 flex items-end gap-4">
                  {REVENUE_DATA.map((month) => {
                    const maxRevenue = Math.max(...REVENUE_DATA.map((m) => m.revenue));
                    const height = (month.revenue / maxRevenue) * 100;
                    const targetHeight = (month.target / maxRevenue) * 100;

                    return (
                      <div key={month.month} className="flex-1 flex flex-col items-center">
                        <div className="relative w-full h-48 flex items-end justify-center gap-1">
                          <div
                            className="w-8 rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                            style={{ height: `${height}%` }}
                          />
                          <div
                            className="w-2 rounded-t bg-slate-500/50"
                            style={{ height: `${targetHeight}%` }}
                          />
                        </div>
                        <span className="mt-2 text-sm text-slate-400">{month.month}</span>
                        <span className="text-xs text-white font-medium">
                          €{(month.revenue / 1000).toFixed(0)}K
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-sm text-slate-400">Actual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-slate-500" />
                    <span className="text-sm text-slate-400">Target</span>
                  </div>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <h3 className="font-semibold text-white mb-4">Conversion Funnel</h3>
                <div className="space-y-3">
                  {FUNNEL_DATA.map((stage, idx) => {
                    const width = stage.percentage;
                    const colors = [
                      'from-blue-500 to-cyan-500',
                      'from-purple-500 to-pink-500',
                      'from-orange-500 to-yellow-500',
                      'from-green-500 to-emerald-500',
                    ];

                    return (
                      <div key={stage.stage} className="relative">
                        <div
                          className={`rounded-xl bg-gradient-to-r ${colors[idx]} p-4 transition-all`}
                          style={{ width: `${width}%`, minWidth: '200px' }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{stage.stage}</span>
                            <span className="font-bold text-white">
                              {stage.count.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-sm text-slate-400 ml-3">
                          {stage.percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 rounded-xl bg-green-500/10 border border-green-500/30 p-4">
                  <p className="text-green-400 font-semibold">
                    34.2% Lead-to-Patient Conversion Rate
                  </p>
                  <p className="text-sm text-slate-400">Industry average: 12%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'growth' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Growth Projections & ROI</h2>

            {/* Investment Opportunity */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/20 p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">Series A: €10M</h3>
                  <p className="text-slate-400">Accelerating European expansion</p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="rounded-xl bg-slate-800/50 p-4">
                  <p className="text-slate-400 text-sm mb-1">Current ARR</p>
                  <p className="text-3xl font-bold text-white">€4.2M</p>
                  <p className="text-sm text-green-400">+180% YoY growth</p>
                </div>
                <div className="rounded-xl bg-slate-800/50 p-4">
                  <p className="text-slate-400 text-sm mb-1">Target ARR (24mo)</p>
                  <p className="text-3xl font-bold text-white">€25M</p>
                  <p className="text-sm text-green-400">6x growth projection</p>
                </div>
                <div className="rounded-xl bg-slate-800/50 p-4">
                  <p className="text-slate-400 text-sm mb-1">Gross Margin</p>
                  <p className="text-3xl font-bold text-white">78%</p>
                  <p className="text-sm text-green-400">SaaS industry leading</p>
                </div>
              </div>
            </div>

            {/* Unit Economics */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  Unit Economics
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                    <span className="text-slate-400">Average Contract Value</span>
                    <span className="font-bold text-white">€6,000/year</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                    <span className="text-slate-400">Customer Acquisition Cost</span>
                    <span className="font-bold text-white">€1,200</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                    <span className="text-slate-400">LTV:CAC Ratio</span>
                    <span className="font-bold text-green-400">15:1</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-700/50">
                    <span className="text-slate-400">Payback Period</span>
                    <span className="font-bold text-white">2.4 months</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-slate-400">Net Revenue Retention</span>
                    <span className="font-bold text-green-400">125%</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-400" />
                  Use of Funds
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400">Sales & Marketing</span>
                      <span className="font-bold text-white">€5M (50%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-700">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: '50%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400">Product & Engineering</span>
                      <span className="font-bold text-white">€3M (30%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-700">
                      <div className="h-2 rounded-full bg-purple-500" style={{ width: '30%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400">International Expansion</span>
                      <span className="font-bold text-white">€1.5M (15%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-700">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: '15%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400">Operations</span>
                      <span className="font-bold text-white">€0.5M (5%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-700">
                      <div className="h-2 rounded-full bg-orange-500" style={{ width: '5%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Opportunity */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
              <h3 className="font-semibold text-white mb-4">Market Opportunity</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center p-6 rounded-xl bg-slate-700/30">
                  <p className="text-4xl font-bold text-white mb-2">€2.5B</p>
                  <p className="text-slate-400">Total Addressable Market</p>
                  <p className="text-sm text-slate-500 mt-1">50K+ dental practices in EU</p>
                </div>
                <div className="text-center p-6 rounded-xl bg-slate-700/30">
                  <p className="text-4xl font-bold text-white mb-2">€450M</p>
                  <p className="text-slate-400">Serviceable Market</p>
                  <p className="text-sm text-slate-500 mt-1">Multi-location practices</p>
                </div>
                <div className="text-center p-6 rounded-xl bg-slate-700/30">
                  <p className="text-4xl font-bold text-white mb-2">€75M</p>
                  <p className="text-slate-400">Serviceable Obtainable</p>
                  <p className="text-sm text-slate-500 mt-1">3-year target (3% SOM)</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-center">
              <h3 className="text-3xl font-bold text-white mb-4">
                Ready to Transform Healthcare CRM?
              </h3>
              <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
                Join us in building the future of patient acquisition for healthcare providers.
                AI-powered, HIPAA-compliant, and proven at scale.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button className="px-8 py-3 rounded-xl bg-white text-blue-600 font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors">
                  Schedule Deep Dive
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button className="px-8 py-3 rounded-xl bg-blue-500/30 text-white font-semibold flex items-center gap-2 hover:bg-blue-500/40 transition-colors">
                  View Data Room
                  <ArrowUpRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/80 py-6 mt-12">
        <div className="container mx-auto px-6 text-center text-slate-400 text-sm">
          <p>MedicalCor Core | Confidential Investor Demo | {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  gradient,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  gradient: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 hover:border-slate-600/50 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-green-400 mt-1">{subtext}</p>
    </div>
  );
}
