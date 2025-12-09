'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REVOLUTIONARY LANDING PAGE V3 - Maximum Conversion Edition
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This page integrates ALL revolutionary conversion components:
 * 1. AI Smile Simulator - GPT-4 Vision analysis
 * 2. Adaptive Quiz - Personalized video responses
 * 3. Treatment Plan Generator - Instant PDF export
 * 4. Gamification System - Points, levels, achievements
 *
 * Target: 300+ patients/month for medicalcor.ro
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback } from 'react';
import {
  Sparkles,
  Camera,
  ClipboardList,
  FileText,
  Trophy,
  Phone,
  MessageCircle,
  Star,
  Shield,
  Award,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';

// Import revolutionary components
import { SmileSimulator } from '@/components/smile-simulator';
import { AdaptiveQuiz } from '@/components/adaptive-quiz';
import { TreatmentPlanGenerator } from '@/components/treatment-plan';
import {
  GamificationProvider,
  useGamification,
  PointsDisplay,
  SocialProofWidget,
  TimeLimitedOffer,
} from '@/components/gamification';

// ============================================================================
// TYPES
// ============================================================================

type ActiveTool = 'none' | 'simulator' | 'quiz' | 'plan';

// ============================================================================
// MAIN PAGE CONTENT
// ============================================================================

function LandingPageContent() {
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const { addPoints, unlockAchievement } = useGamification();

  // Handle tool selection
  const selectTool = useCallback(
    (tool: ActiveTool) => {
      setActiveTool(tool);

      // Award points and achievements
      if (tool === 'simulator') {
        addPoints(25, 'Opened Smile Simulator');
        unlockAchievement('smile-simulator');
      } else if (tool === 'quiz') {
        addPoints(15, 'Started Quiz');
        unlockAchievement('quiz-started');
      } else if (tool === 'plan') {
        addPoints(20, 'Opened Treatment Plan');
        unlockAchievement('plan-generated');
      }
    },
    [addPoints, unlockAchievement]
  );

  // Handle simulator completion
  const handleSimulatorComplete = useCallback(() => {
    addPoints(100, 'Completed Smile Simulation');
  }, [addPoints]);

  // Handle quiz completion
  const handleQuizComplete = useCallback(() => {
    addPoints(150, 'Completed Quiz');
    unlockAchievement('quiz-completed');
    unlockAchievement('contact-shared');
  }, [addPoints, unlockAchievement]);

  // Handle plan generation
  const handlePlanGenerated = useCallback(() => {
    addPoints(75, 'Generated Treatment Plan');
  }, [addPoints]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* HEADER - Gamification Status */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <span className="font-bold text-slate-900 hidden sm:block">MedicalCor</span>
          </div>

          {/* Points Display */}
          <div className="flex items-center gap-4">
            <PointsDisplay />
            <a
              href="tel:0747099099"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium"
            >
              <Phone size={16} />
              <span>0747 099 099</span>
            </a>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-5xl">
          {/* Social Proof */}
          <div className="mb-8">
            <SocialProofWidget />
          </div>

          {/* Main Headline */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-medium mb-6">
              <Star size={16} className="fill-amber-500 text-amber-500" />
              <span>4.9/5 din 847 recenzii Google</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 mb-6 leading-tight">
              Zâmbetul Tău Perfect{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
                În 24 de Ore
              </span>
            </h1>

            <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
              Descoperă ce tratament ți se potrivește folosind tehnologia noastră AI.
              <strong className="text-slate-900"> Consultație gratuită + CT 3D inclus.</strong>
            </p>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Shield size={18} className="text-emerald-500" />
                10 ani garanție
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Award size={18} className="text-amber-500" />
                #1 în România
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 size={18} className="text-cyan-500" />
                4.287 pacienți fericiți
              </span>
            </div>

            {/* Scroll indicator */}
            <button
              onClick={() =>
                document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="inline-flex flex-col items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="text-sm">Descoperă</span>
              <ChevronDown size={24} className="animate-bounce" />
            </button>
          </div>
        </div>
      </section>

      {/* TOOL SELECTION SECTION */}
      <section id="tools" className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Alege Experiența Ta</h2>
            <p className="text-slate-600">
              Fiecare interacțiune îți aduce puncte și reduceri exclusive
            </p>
          </div>

          {/* Tool Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Smile Simulator Card */}
            <button
              onClick={() => selectTool('simulator')}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                activeTool === 'simulator'
                  ? 'border-cyan-500 bg-cyan-50 shadow-lg'
                  : 'border-slate-200 hover:border-cyan-300 hover:shadow-md'
              }`}
            >
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mb-4">
                <Camera size={28} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">AI Smile Simulator</h3>
              <p className="text-slate-600 text-sm mb-3">
                Încarcă o poză și vezi instant cum vei arăta cu un zâmbet nou
              </p>
              <div className="flex items-center gap-2 text-cyan-600 font-medium text-sm">
                <Sparkles size={16} />
                <span>+50 puncte</span>
              </div>
            </button>

            {/* Quiz Card */}
            <button
              onClick={() => selectTool('quiz')}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                activeTool === 'quiz'
                  ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                  : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'
              }`}
            >
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center mb-4">
                <ClipboardList size={28} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Quiz Personalizat</h3>
              <p className="text-slate-600 text-sm mb-3">
                Răspunde la câteva întrebări și află tratamentul ideal pentru tine
              </p>
              <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
                <Trophy size={16} />
                <span>+100 puncte</span>
              </div>
            </button>

            {/* Treatment Plan Card */}
            <button
              onClick={() => selectTool('plan')}
              className={`p-6 rounded-2xl border-2 text-left transition-all ${
                activeTool === 'plan'
                  ? 'border-amber-500 bg-amber-50 shadow-lg'
                  : 'border-slate-200 hover:border-amber-300 hover:shadow-md'
              }`}
            >
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mb-4">
                <FileText size={28} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Plan de Tratament</h3>
              <p className="text-slate-600 text-sm mb-3">
                Generează instant un plan detaliat cu prețuri și etape
              </p>
              <div className="flex items-center gap-2 text-amber-600 font-medium text-sm">
                <FileText size={16} />
                <span>+75 puncte</span>
              </div>
            </button>
          </div>

          {/* Active Tool Container */}
          {activeTool !== 'none' && (
            <div className="mb-12">
              {activeTool === 'simulator' && (
                <SmileSimulator
                  onSimulationComplete={handleSimulatorComplete}
                  onLeadCapture={() => unlockAchievement('contact-shared')}
                />
              )}

              {activeTool === 'quiz' && (
                <AdaptiveQuiz
                  doctorName="Dr. Alexandru Ionescu"
                  doctorImage="/images/doctor.jpg"
                  onComplete={handleQuizComplete}
                />
              )}

              {activeTool === 'plan' && (
                <TreatmentPlanGenerator
                  onPlanGenerated={handlePlanGenerated}
                  onLeadCapture={() => unlockAchievement('contact-shared')}
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* TIME-LIMITED OFFER */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="container mx-auto max-w-lg">
          <TimeLimitedOffer
            title="Ofertă Exclusivă"
            description="Consultație + CT 3D + Plan de Tratament"
            discount="100% GRATUIT"
            endTime={new Date(Date.now() + 3 * 60 * 60 * 1000)} // 3 hours
            onClaim={() => {
              addPoints(50, 'Claimed special offer');
              selectTool('quiz');
            }}
          />
        </div>
      </section>

      {/* TESTIMONIALS PREVIEW */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Povești de Succes</h2>
            <p className="text-slate-600">Rezultate reale de la pacienți reali</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Maria P.',
                age: 54,
                quote: 'După 20 de ani cu proteză mobilă, în sfârșit pot să mănânc ce vreau!',
                treatment: 'All-on-4',
              },
              {
                name: 'Ion D.',
                age: 62,
                quote: 'Am venit cu teamă, am plecat cu zâmbet. Recomand cu toată încrederea!',
                treatment: 'All-on-6',
              },
              {
                name: 'Elena M.',
                age: 45,
                quote: 'Zâmbetul meu Hollywood! Cea mai bună investiție din viața mea.',
                treatment: 'Fațete Premium',
              },
            ].map((testimonial, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-6">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={18} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 mb-4">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    {testimonial.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{testimonial.name}</p>
                    <p className="text-sm text-slate-500">
                      {testimonial.age} ani • {testimonial.treatment}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Gata Să Începi Transformarea?</h2>
          <p className="text-xl text-cyan-100 mb-8">
            Alătură-te celor peste 4.287 de pacienți fericiți
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => {
                selectTool('simulator');
                document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 bg-white text-cyan-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Camera size={20} />
              Încearcă Simulatorul AI
            </button>

            <a
              href="https://wa.me/40747099099"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-emerald-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle size={20} />
              WhatsApp Direct
            </a>
          </div>
        </div>
      </section>

      {/* MOBILE STICKY CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-slate-200 shadow-2xl z-40 sm:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => {
              selectTool('simulator');
              document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-white font-bold flex items-center justify-center gap-2"
          >
            <Camera size={18} />
            Simulator AI
          </button>
          <a
            href="https://wa.me/40747099099"
            className="px-4 py-3 bg-emerald-500 rounded-xl text-white flex items-center justify-center"
          >
            <MessageCircle size={20} />
          </a>
          <a
            href="tel:0747099099"
            className="px-4 py-3 bg-slate-900 rounded-xl text-white flex items-center justify-center"
          >
            <Phone size={20} />
          </a>
        </div>
      </div>

      {/* Bottom padding for mobile sticky */}
      <div className="h-20 sm:hidden" />
    </div>
  );
}

// ============================================================================
// MAIN EXPORT - Wrapped with Gamification Provider
// ============================================================================

export default function RevolutionaryLandingPage() {
  return (
    <GamificationProvider
      onLevelUp={(_level) => {
        // Could show a toast notification here
      }}
      onAchievementUnlocked={(_achievement) => {
        // Could show a toast notification here
      }}
    >
      <LandingPageContent />
    </GamificationProvider>
  );
}
