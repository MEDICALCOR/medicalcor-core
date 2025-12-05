'use client';

/**
 * OSAX-FIX Landing Page
 * 
 * High-conversion landing page for OSAX (Obstructive Sleep Apnea) treatment campaign.
 * Features:
 * - Hero section with background video
 * - Interactive quiz modal
 * - Sticky CTA button on mobile
 * - Conversion-optimized design
 */

import { useState, useEffect } from 'react';
import { Play, CheckCircle2, ArrowRight, X, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function OsaxFixLandingPage() {
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

  const quizQuestions = [
    {
      question: 'Cât de des te simți obosit dimineața?',
      options: [
        'Rar sau niciodată',
        'Câteva zile pe săptămână',
        'Aproape în fiecare zi',
        'Întotdeauna',
      ],
    },
    {
      question: 'Te trezești noaptea simțind că nu poți respira?',
      options: ['Nu', 'Rar', 'Des', 'Foarte des'],
    },
    {
      question: 'Roncăi tare sau te plângi că roncăi?',
      options: ['Nu', 'Uneori', 'Des', 'Foarte des'],
    },
    {
      question: 'Ai probleme de concentrare sau memorie?',
      options: ['Nu', 'Rar', 'Des', 'Foarte des'],
    },
  ];

  const handleQuizAnswer = (answer: string) => {
    setQuizAnswers({ ...quizAnswers, [quizStep]: answer });
    if (quizStep < quizQuestions.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      // Quiz completed - redirect to booking or show results
      setTimeout(() => {
        setIsQuizOpen(false);
        // In production, redirect to booking page or show results
        window.location.href = '/booking?campaign=osax-fix';
      }, 1500);
    }
  };

  const handleStartQuiz = () => {
    setIsQuizOpen(true);
    setQuizStep(0);
    setQuizAnswers({});
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section with Video Background */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          poster="/hero-bg-poster.jpg"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
          {/* Fallback gradient if video doesn't load */}
        </video>
        
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40 z-10" />
        
        {/* Content */}
        <div className="relative z-20 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Rezolvă Problema de Somn
            <br />
            <span className="text-teal-300">În 30 de Zile</span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/90 mb-8 max-w-2xl mx-auto">
            Descoperă dacă suferi de Apnee în Somn și obține soluția personalizată
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={handleStartQuiz}
              size="lg"
              className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg font-semibold shadow-xl"
            >
              <Play className="mr-2 h-5 w-5" />
              Începe Testul Gratuit
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 px-8 py-6 text-lg"
              onClick={() => window.location.href = 'tel:+40123456789'}
            >
              <Phone className="mr-2 h-5 w-5" />
              Sună Acum
            </Button>
          </div>
          
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-white/90">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-teal-300" />
              <span>Test gratuit 5 minute</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-teal-300" />
              <span>Fără obligații</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-teal-300" />
              <span>Rezultate instant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12 text-gray-900">
            De ce să alegi tratamentul OSAX-FIX?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Rezultate Rapide',
                description: 'Văd îmbunătățiri în primele 2 săptămâni de tratament',
                icon: '⚡',
              },
              {
                title: 'Tratament Personalizat',
                description: 'Fiecare plan este adaptat nevoilor tale specifice',
                icon: '🎯',
              },
              {
                title: 'Suport 24/7',
                description: 'Echipa noastră este disponibilă oricând ai nevoie',
                icon: '💬',
              },
            ].map((benefit, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
              >
                <div className="text-4xl mb-4">{benefit.icon}</div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-teal-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Gata să îți îmbunătățești calitatea somnului?
          </h2>
          <p className="text-xl mb-8 text-teal-100">
            Începe acum cu testul gratuit de 5 minute
          </p>
          <Button
            onClick={handleStartQuiz}
            size="lg"
            className="bg-white text-teal-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold"
          >
            Începe Testul
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Sticky CTA Button (Mobile Only) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
        <div className="bg-teal-600 p-4 shadow-lg">
          <Button
            onClick={handleStartQuiz}
            className="w-full bg-white text-teal-600 hover:bg-gray-100 font-semibold py-6 text-lg"
          >
            <MessageCircle className="mr-2 h-5 w-5" />
            Începe Testul Gratuit
          </Button>
        </div>
      </div>

      {/* Quiz Modal */}
      {isQuizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                Test OSAX-FIX ({quizStep + 1}/{quizQuestions.length})
              </h3>
              <button
                onClick={() => setIsQuizOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              {quizStep < quizQuestions.length ? (
                <>
                  <h4 className="text-2xl font-semibold mb-6 text-gray-900">
                    {quizQuestions[quizStep].question}
                  </h4>
                  <div className="space-y-3">
                    {quizQuestions[quizStep].options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuizAnswer(option)}
                        className={cn(
                          'w-full text-left p-4 rounded-lg border-2 transition-all',
                          'hover:border-teal-500 hover:bg-teal-50',
                          'focus:outline-none focus:ring-2 focus:ring-teal-500',
                          quizAnswers[quizStep] === option
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-200 bg-white'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-900 font-medium">{option}</span>
                          {quizAnswers[quizStep] === option && (
                            <CheckCircle2 className="h-5 w-5 text-teal-600" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-6">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-600 transition-all duration-300"
                        style={{ width: `${((quizStep + 1) / quizQuestions.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-16 w-16 text-teal-600 mx-auto mb-4" />
                  <h4 className="text-2xl font-semibold mb-4 text-gray-900">
                    Test completat!
                  </h4>
                  <p className="text-gray-600 mb-6">
                    Vom analiza răspunsurile tale și te vom contacta în cel mai scurt timp.
                  </p>
                  <Button
                    onClick={() => {
                      setIsQuizOpen(false);
                      window.location.href = '/booking?campaign=osax-fix';
                    }}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    Continuă către programare
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


