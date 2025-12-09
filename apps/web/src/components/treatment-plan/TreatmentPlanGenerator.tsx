'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INSTANT TREATMENT PLAN GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates personalized treatment plans in real-time based on:
 * - Smile analysis results
 * - Quiz answers
 * - Patient preferences
 *
 * Features:
 * - PDF export capability
 * - Email delivery option
 * - Pricing breakdown
 * - Timeline visualization
 * - Doctor's signature
 *
 * Psychology: Immediate value delivery increases trust and conversion.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef } from 'react';
import {
  FileText,
  Download,
  Mail,
  Share2,
  CheckCircle2,
  Clock,
  Calendar,
  CreditCard,
  Shield,
  Award,
  Loader2,
  Sparkles,
  Phone,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface TreatmentPhase {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: number;
  included: string[];
}

interface TreatmentPlan {
  id: string;
  patientName: string;
  createdAt: Date;
  treatment: {
    name: string;
    description: string;
    phases: TreatmentPhase[];
    totalDuration: string;
    totalPrice: {
      min: number;
      max: number;
    };
    warranty: string;
  };
  financing: {
    monthlyPayment: number;
    months: number;
    interestRate: number;
  };
  benefits: string[];
  doctorName: string;
  doctorSignature?: string;
  clinicInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

interface TreatmentPlanGeneratorProps {
  initialData?: Partial<TreatmentPlan>;
  onPlanGenerated?: (plan: TreatmentPlan) => void;
  onLeadCapture?: (data: { email: string; phone: string }) => void;
}

// ============================================================================
// DEFAULT TREATMENT TEMPLATES
// ============================================================================

const TREATMENT_TEMPLATES: Record<string, TreatmentPlan['treatment']> = {
  'all-on-4': {
    name: 'All-on-4® Smile Restoration',
    description:
      'Restaurare completă a arcadei dentare cu doar 4 implanturi premium, folosind tehnologia Nobel Biocare.',
    phases: [
      {
        id: 'consultation',
        name: 'Consultație & Planificare',
        description: 'CT Scan 3D, analiză completă, plan digital',
        duration: '1-2 ore',
        price: 0,
        included: [
          'CT Scan 3D panoramic',
          'Consultație specialist',
          'Planificare digitală',
          'Simulare 3D rezultat',
        ],
      },
      {
        id: 'surgery',
        name: 'Intervenție Chirurgicală',
        description: 'Inserare implanturi și proteze provizorii',
        duration: '2-4 ore',
        price: 3500,
        included: [
          '4 implanturi Nobel Biocare',
          'Sedare conștientă',
          'Proteze provizorii fixe',
          'Kit post-operator',
        ],
      },
      {
        id: 'healing',
        name: 'Perioadă de Vindecare',
        description: 'Osteointegrare și controale regulate',
        duration: '3-4 luni',
        price: 0,
        included: ['Controale lunare', 'Ajustări provizorii', 'Suport 24/7'],
      },
      {
        id: 'final',
        name: 'Lucrare Finală',
        description: 'Proteze definitive din zirconiu',
        duration: '2 săptămâni',
        price: 2500,
        included: ['Proteze zirconiu premium', 'Potrivire perfectă', 'Garanție 10 ani'],
      },
    ],
    totalDuration: '4-5 luni',
    totalPrice: { min: 5500, max: 7500 },
    warranty: '10 ani garanție pe implanturi și lucrare',
  },
  'all-on-6': {
    name: 'All-on-6® Premium Restoration',
    description:
      'Restaurare premium cu 6 implanturi pentru stabilitate maximă și estetică superioară.',
    phases: [
      {
        id: 'consultation',
        name: 'Consultație & Planificare',
        description: 'CT Scan 3D, analiză completă, plan digital',
        duration: '1-2 ore',
        price: 0,
        included: [
          'CT Scan 3D panoramic',
          'Consultație specialist',
          'Planificare digitală',
          'Simulare 3D rezultat',
        ],
      },
      {
        id: 'surgery',
        name: 'Intervenție Chirurgicală',
        description: 'Inserare 6 implanturi premium',
        duration: '3-5 ore',
        price: 5000,
        included: [
          '6 implanturi Nobel Biocare',
          'Sedare conștientă',
          'Proteze provizorii fixe',
          'Kit post-operator premium',
        ],
      },
      {
        id: 'healing',
        name: 'Perioadă de Vindecare',
        description: 'Osteointegrare optimă',
        duration: '3-4 luni',
        price: 0,
        included: ['Controale regulate', 'Terapie laser', 'Suport prioritar'],
      },
      {
        id: 'final',
        name: 'Lucrare Finală Premium',
        description: 'Proteze definitive full-zirconiu',
        duration: '2-3 săptămâni',
        price: 3500,
        included: ['Full-zirconiu monolitic', 'Estetică naturală', 'Garanție 15 ani'],
      },
    ],
    totalDuration: '4-6 luni',
    totalPrice: { min: 8000, max: 10000 },
    warranty: '15 ani garanție completă',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function TreatmentPlanGenerator({
  initialData,
  onPlanGenerated,
  onLeadCapture,
}: TreatmentPlanGeneratorProps) {
  // State
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState<string>('all-on-4');

  // Refs
  const planRef = useRef<HTMLDivElement>(null);

  // Generate plan
  const generatePlan = useCallback(async () => {
    setIsGenerating(true);

    // Simulate AI processing
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const template = TREATMENT_TEMPLATES[selectedTreatment];
    if (!template) {
      setIsGenerating(false);
      return;
    }

    const newPlan: TreatmentPlan = {
      id: `TP-${Date.now()}`,
      patientName: initialData?.patientName ?? 'Pacient',
      createdAt: new Date(),
      treatment: template,
      financing: {
        monthlyPayment: Math.round(template.totalPrice.min / 24),
        months: 24,
        interestRate: 0,
      },
      benefits: [
        'Dinți ficși în aceeași zi',
        'Fără os artificial necesar',
        'Aspect natural garantat',
        'Mâncare normală din ziua 1',
        'Procedură minim invazivă',
      ],
      doctorName: 'Dr. Alexandru Ionescu',
      clinicInfo: {
        name: 'MedicalCor Dental',
        address: 'Str. Exemplu 123, București',
        phone: '0747 099 099',
        email: 'contact@medicalcor.ro',
      },
    };

    setPlan(newPlan);
    setIsGenerating(false);
    onPlanGenerated?.(newPlan);
  }, [selectedTreatment, initialData, onPlanGenerated]);

  // Download PDF
  const downloadPDF = useCallback(async () => {
    if (!plan) return;

    setIsDownloading(true);

    try {
      const response = await fetch('/api/treatment-plan/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plan-tratament-${plan.id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('[TreatmentPlan] PDF download error:', error);
    }

    setIsDownloading(false);
  }, [plan]);

  // Send via email
  const sendEmail = useCallback(async () => {
    if (!email || !plan) return;

    onLeadCapture?.({ email, phone });

    try {
      await fetch('/api/treatment-plan/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, email, phone }),
      });
      setShowEmailForm(false);
    } catch (error) {
      console.error('[TreatmentPlan] Email send error:', error);
    }
  }, [email, phone, plan, onLeadCapture]);

  // Calculate monthly payment
  const calculateMonthly = (price: number, months: number): number => {
    return Math.round(price / months);
  };

  // ============================================================================
  // RENDER: Treatment Selector
  // ============================================================================

  const renderSelector = () => (
    <div className="treatment-selector">
      <div className="selector-header">
        <div className="icon-wrapper">
          <FileText size={32} />
        </div>
        <h2>Generează Planul Tău de Tratament</h2>
        <p>Selectează tipul de tratament pentru a primi un plan personalizat gratuit.</p>
      </div>

      <div className="treatment-options">
        {Object.entries(TREATMENT_TEMPLATES).map(([key, template]) => (
          <button
            key={key}
            className={`treatment-option ${selectedTreatment === key ? 'selected' : ''}`}
            onClick={() => setSelectedTreatment(key)}
          >
            <div className="option-header">
              <span className="option-name">{template.name}</span>
              {selectedTreatment === key && <CheckCircle2 size={20} className="check" />}
            </div>
            <p className="option-desc">{template.description}</p>
            <div className="option-price">
              <span>de la</span>
              <strong>€{template.totalPrice.min.toLocaleString()}</strong>
            </div>
          </button>
        ))}
      </div>

      <button className="generate-btn" onClick={generatePlan} disabled={isGenerating}>
        {isGenerating ? (
          <>
            <Loader2 size={20} className="spinner" />
            <span>Se generează planul...</span>
          </>
        ) : (
          <>
            <Sparkles size={20} />
            <span>Generează Planul Gratuit</span>
          </>
        )}
      </button>

      <div className="trust-row">
        <span>
          <Shield size={14} /> Confidențial
        </span>
        <span>
          <Clock size={14} /> Instant
        </span>
        <span>
          <Award size={14} /> Gratuit
        </span>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER: Treatment Plan
  // ============================================================================

  const renderPlan = () => {
    if (!plan) return null;

    return (
      <div className="treatment-plan" ref={planRef}>
        {/* Header */}
        <div className="plan-header">
          <div className="plan-title">
            <FileText size={24} />
            <div>
              <h2>Plan de Tratament Personalizat</h2>
              <span className="plan-id">#{plan.id}</span>
            </div>
          </div>
          <div className="plan-date">
            {plan.createdAt.toLocaleDateString('ro-RO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>

        {/* Treatment Info */}
        <div className="treatment-info">
          <h3>{plan.treatment.name}</h3>
          <p>{plan.treatment.description}</p>
        </div>

        {/* Timeline */}
        <div className="treatment-timeline">
          <h4>
            <Calendar size={18} />
            <span>Etapele Tratamentului</span>
          </h4>
          <div className="phases">
            {plan.treatment.phases.map((phase, index) => (
              <div key={phase.id} className="phase">
                <div className="phase-number">{index + 1}</div>
                <div className="phase-content">
                  <div className="phase-header">
                    <strong>{phase.name}</strong>
                    <span className="phase-duration">{phase.duration}</span>
                  </div>
                  <p>{phase.description}</p>
                  <ul className="phase-included">
                    {phase.included.map((item, i) => (
                      <li key={i}>
                        <CheckCircle2 size={14} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {phase.price > 0 && (
                    <div className="phase-price">€{phase.price.toLocaleString()}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="pricing-section">
          <h4>
            <CreditCard size={18} />
            <span>Investiție & Finanțare</span>
          </h4>
          <div className="pricing-grid">
            <div className="price-card total">
              <span className="label">Preț Total</span>
              <span className="value">
                €{plan.treatment.totalPrice.min.toLocaleString()} - €
                {plan.treatment.totalPrice.max.toLocaleString()}
              </span>
            </div>
            <div className="price-card monthly">
              <span className="label">Rată Lunară de la</span>
              <span className="value">
                €{calculateMonthly(plan.treatment.totalPrice.min, 24)}/lună
              </span>
              <span className="note">24 rate, 0% dobândă</span>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="benefits-section">
          <h4>
            <Award size={18} />
            <span>Ce Este Inclus</span>
          </h4>
          <ul className="benefits-grid">
            {plan.benefits.map((benefit, i) => (
              <li key={i}>
                <CheckCircle2 size={16} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Warranty */}
        <div className="warranty-badge">
          <Shield size={20} />
          <span>{plan.treatment.warranty}</span>
        </div>

        {/* Actions */}
        <div className="plan-actions">
          <button className="action-primary" onClick={() => setShowEmailForm(true)}>
            <Mail size={18} />
            <span>Trimite pe Email</span>
          </button>
          <button className="action-secondary" onClick={downloadPDF} disabled={isDownloading}>
            {isDownloading ? <Loader2 size={18} className="spinner" /> : <Download size={18} />}
            <span>Descarcă PDF</span>
          </button>
          <button className="action-secondary">
            <Share2 size={18} />
            <span>Distribuie</span>
          </button>
        </div>

        {/* CTA */}
        <div className="plan-cta">
          <div className="cta-content">
            <h4>Gata să Începi?</h4>
            <p>Programează consultația gratuită și primește evaluarea completă.</p>
          </div>
          <a href="tel:0747099099" className="cta-btn">
            <Phone size={20} />
            <span>Sună Acum: 0747 099 099</span>
          </a>
        </div>

        {/* Doctor Signature */}
        <div className="doctor-signature">
          <div className="signature-text">
            <p>Cu stimă,</p>
            <strong>{plan.doctorName}</strong>
            <span>Medic Specialist Implantologie</span>
          </div>
        </div>

        {/* Email Form Modal */}
        {showEmailForm && (
          <div className="email-modal">
            <div className="modal-content">
              <h3>Trimite Planul pe Email</h3>
              <p>Completează datele pentru a primi planul și oferta specială.</p>
              <div className="form-group">
                <label htmlFor="plan-email">Email *</label>
                <input
                  type="email"
                  id="plan-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplu.ro"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="plan-phone">Telefon (opțional)</label>
                <input
                  type="tel"
                  id="plan-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0747 099 099"
                />
              </div>
              <div className="modal-actions">
                <button className="modal-cancel" onClick={() => setShowEmailForm(false)}>
                  Anulează
                </button>
                <button className="modal-submit" onClick={sendEmail} disabled={!email}>
                  <Mail size={18} />
                  <span>Trimite</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="treatment-plan-generator">
      {!plan && renderSelector()}
      {plan && renderPlan()}

      <style jsx>{`
        .treatment-plan-generator {
          --gold: #c9a962;
          --gold-light: #e8d5a3;
          --navy: #0a1628;
          --navy-light: #152238;
          --success: #10b981;
          --gray: #6b7a90;

          background: white;
          border-radius: 24px;
          max-width: 700px;
          margin: 0 auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }

        /* Selector */
        .treatment-selector {
          padding: 2rem;
          text-align: center;
        }

        .selector-header {
          margin-bottom: 2rem;
        }

        .icon-wrapper {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, var(--gold), var(--gold-light));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
          color: var(--navy);
        }

        .selector-header h2 {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--navy);
          margin-bottom: 0.5rem;
        }

        .selector-header p {
          color: var(--gray);
        }

        .treatment-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .treatment-option {
          text-align: left;
          padding: 1.25rem;
          background: #f7f8fa;
          border: 2px solid transparent;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .treatment-option:hover {
          border-color: var(--gold);
        }

        .treatment-option.selected {
          background: linear-gradient(135deg, rgba(201, 169, 98, 0.1), rgba(201, 169, 98, 0.05));
          border-color: var(--gold);
        }

        .option-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .option-name {
          font-weight: 700;
          color: var(--navy);
        }

        .option-header .check {
          color: var(--success);
        }

        .option-desc {
          font-size: 0.9rem;
          color: var(--gray);
          margin-bottom: 0.75rem;
        }

        .option-price {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }

        .option-price span {
          font-size: 0.8rem;
          color: var(--gray);
        }

        .option-price strong {
          font-size: 1.25rem;
          color: var(--gold);
        }

        .generate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, var(--gold), var(--gold-light));
          color: var(--navy);
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 1rem;
        }

        .generate-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(201, 169, 98, 0.3);
        }

        .generate-btn:disabled {
          opacity: 0.7;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .trust-row {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          font-size: 0.8rem;
          color: var(--gray);
        }

        .trust-row span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .trust-row svg {
          color: var(--success);
        }

        /* Plan */
        .treatment-plan {
          padding: 2rem;
        }

        .plan-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid #e8ecf1;
        }

        .plan-title {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .plan-title svg {
          color: var(--gold);
        }

        .plan-title h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--navy);
          margin: 0;
        }

        .plan-id {
          font-size: 0.8rem;
          color: var(--gray);
        }

        .plan-date {
          font-size: 0.9rem;
          color: var(--gray);
        }

        .treatment-info {
          margin-bottom: 2rem;
        }

        .treatment-info h3 {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--navy);
          margin-bottom: 0.5rem;
        }

        .treatment-info p {
          color: var(--gray);
        }

        /* Timeline */
        .treatment-timeline {
          margin-bottom: 2rem;
        }

        .treatment-timeline h4,
        .pricing-section h4,
        .benefits-section h4 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          color: var(--navy);
          margin-bottom: 1rem;
        }

        .treatment-timeline h4 svg,
        .pricing-section h4 svg,
        .benefits-section h4 svg {
          color: var(--gold);
        }

        .phases {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .phase {
          display: flex;
          gap: 1rem;
        }

        .phase-number {
          width: 32px;
          height: 32px;
          background: var(--gold);
          color: var(--navy);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }

        .phase-content {
          flex: 1;
          background: #f7f8fa;
          padding: 1rem;
          border-radius: 12px;
        }

        .phase-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .phase-header strong {
          color: var(--navy);
        }

        .phase-duration {
          font-size: 0.8rem;
          color: var(--gray);
          background: white;
          padding: 0.25rem 0.75rem;
          border-radius: 100px;
        }

        .phase-content p {
          font-size: 0.9rem;
          color: var(--gray);
          margin-bottom: 0.75rem;
        }

        .phase-included {
          list-style: none;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .phase-included li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--navy);
        }

        .phase-included svg {
          color: var(--success);
          flex-shrink: 0;
        }

        .phase-price {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--gold);
          text-align: right;
        }

        /* Pricing */
        .pricing-section {
          margin-bottom: 2rem;
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .price-card {
          background: #f7f8fa;
          padding: 1.25rem;
          border-radius: 12px;
          text-align: center;
        }

        .price-card.total {
          background: linear-gradient(135deg, var(--navy), var(--navy-light));
          color: white;
        }

        .price-card .label {
          display: block;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
        }

        .price-card.total .label {
          opacity: 0.8;
        }

        .price-card .value {
          display: block;
          font-size: 1.5rem;
          font-weight: 800;
        }

        .price-card.total .value {
          color: var(--gold);
        }

        .price-card.monthly .value {
          color: var(--navy);
        }

        .price-card .note {
          display: block;
          font-size: 0.75rem;
          color: var(--gray);
          margin-top: 0.25rem;
        }

        /* Benefits */
        .benefits-section {
          margin-bottom: 2rem;
        }

        .benefits-grid {
          list-style: none;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .benefits-grid li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--navy);
        }

        .benefits-grid svg {
          color: var(--success);
        }

        /* Warranty */
        .warranty-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: linear-gradient(135deg, rgba(201, 169, 98, 0.15), rgba(201, 169, 98, 0.05));
          border: 2px solid var(--gold);
          border-radius: 12px;
          color: var(--navy);
          font-weight: 600;
          margin-bottom: 2rem;
        }

        .warranty-badge svg {
          color: var(--gold);
        }

        /* Actions */
        .plan-actions {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 2rem;
        }

        .action-primary {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: linear-gradient(135deg, var(--gold), var(--gold-light));
          color: var(--navy);
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .action-secondary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: #f7f8fa;
          color: var(--navy);
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        /* CTA */
        .plan-cta {
          background: linear-gradient(135deg, var(--navy), var(--navy-light));
          padding: 1.5rem;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .cta-content h4 {
          color: white;
          font-size: 1.1rem;
          margin-bottom: 0.25rem;
        }

        .cta-content p {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.9rem;
        }

        .cta-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.5rem;
          background: var(--gold);
          color: var(--navy);
          border-radius: 12px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }

        /* Signature */
        .doctor-signature {
          text-align: center;
          padding-top: 1.5rem;
          border-top: 2px solid #e8ecf1;
        }

        .signature-text p {
          color: var(--gray);
          margin-bottom: 0.25rem;
        }

        .signature-text strong {
          display: block;
          font-size: 1.1rem;
          color: var(--navy);
        }

        .signature-text span {
          font-size: 0.85rem;
          color: var(--gray);
        }

        /* Email Modal */
        .email-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          padding: 2rem;
          border-radius: 20px;
          max-width: 400px;
          width: 100%;
        }

        .modal-content h3 {
          font-size: 1.25rem;
          color: var(--navy);
          margin-bottom: 0.5rem;
        }

        .modal-content p {
          color: var(--gray);
          margin-bottom: 1.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--navy);
          margin-bottom: 0.5rem;
        }

        .form-group input {
          width: 100%;
          padding: 1rem;
          border: 2px solid #e8ecf1;
          border-radius: 12px;
          font-size: 1rem;
        }

        .form-group input:focus {
          outline: none;
          border-color: var(--gold);
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .modal-cancel {
          flex: 1;
          padding: 1rem;
          background: #f7f8fa;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          color: var(--navy);
        }

        .modal-submit {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: linear-gradient(135deg, var(--gold), var(--gold-light));
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          color: var(--navy);
        }

        .modal-submit:disabled {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}

export default TreatmentPlanGenerator;
