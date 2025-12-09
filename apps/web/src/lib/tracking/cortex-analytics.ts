/**
 * CORTEX Analytics - Revolutionary Tracking System for MedicalCor
 *
 * Tracks EVERYTHING:
 * - Page views, scroll depth, time on page
 * - All clicks, form interactions, quiz progress
 * - Video engagement (play, pause, completion)
 * - CRM events (lead created, qualified, scheduled)
 * - Conversion funnel stages
 * - A/B test variants
 *
 * Integrates with:
 * - Google Analytics 4 (GA4)
 * - Google Ads Conversion Tracking
 * - Facebook/Meta Pixel
 * - TikTok Pixel
 * - HubSpot CRM
 * - Internal MedicalCor CRM
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TrackingConfig {
  ga4MeasurementId?: string;
  googleAdsId?: string;
  fbPixelId?: string;
  tiktokPixelId?: string;
  hubspotPortalId?: string;
  debug?: boolean;
}

export interface UserProperties {
  visitorId: string;
  sessionId: string;
  landingPage: string;
  referrer: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string; // Google Ads click ID
  fbclid?: string; // Facebook click ID
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  country?: string;
  city?: string;
}

export interface LeadData {
  phone: string;
  name?: string;
  email?: string;
  procedureInterest?: string;
  urgencyScore?: number;
  quizAnswers?: Record<string, string>;
  source: string;
  campaign?: string;
}

export type ConversionType =
  | 'page_view'
  | 'quiz_start'
  | 'quiz_step'
  | 'quiz_complete'
  | 'form_start'
  | 'form_submit'
  | 'lead_created'
  | 'lead_qualified'
  | 'appointment_scheduled'
  | 'whatsapp_click'
  | 'phone_click'
  | 'video_play'
  | 'video_complete'
  | 'scroll_25'
  | 'scroll_50'
  | 'scroll_75'
  | 'scroll_100'
  | 'time_30s'
  | 'time_60s'
  | 'time_180s'
  | 'exit_intent'
  | 'smile_simulator_start'
  | 'smile_simulator_complete'
  | 'financing_calculator_use'
  | 'before_after_view'
  | 'testimonial_video_play';

export interface ConversionEvent {
  type: ConversionType;
  value?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// GLOBAL DECLARATIONS
// ============================================================================

declare global {
  interface Window {
    dataLayer?: (Record<string, unknown> | unknown[])[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      track: (...args: unknown[]) => void;
      identify: (...args: unknown[]) => void;
    };
    _hsq?: unknown[][];
    cortexAnalytics?: CortexAnalytics;
  }
}

// ============================================================================
// CONVERSION VALUES (for ROAS tracking)
// ============================================================================

const CONVERSION_VALUES: Record<ConversionType, number> = {
  page_view: 0,
  quiz_start: 5,
  quiz_step: 2,
  quiz_complete: 25,
  form_start: 10,
  form_submit: 50,
  lead_created: 100,
  lead_qualified: 250,
  appointment_scheduled: 500,
  whatsapp_click: 75,
  phone_click: 100,
  video_play: 5,
  video_complete: 15,
  scroll_25: 1,
  scroll_50: 2,
  scroll_75: 3,
  scroll_100: 5,
  time_30s: 2,
  time_60s: 5,
  time_180s: 10,
  exit_intent: 0,
  smile_simulator_start: 20,
  smile_simulator_complete: 50,
  financing_calculator_use: 30,
  before_after_view: 10,
  testimonial_video_play: 15,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateVisitorId(): string {
  const stored = localStorage.getItem('cortex_visitor_id');
  if (stored) return stored;

  const newId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  localStorage.setItem('cortex_visitor_id', newId);
  return newId;
}

function generateSessionId(): string {
  const stored = sessionStorage.getItem('cortex_session_id');
  if (stored) return stored;

  const newId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  sessionStorage.setItem('cortex_session_id', newId);
  return newId;
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';
  return 'Unknown';
}

function getUtmParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'fbclid',
  ].forEach((param) => {
    const value = params.get(param);
    if (value) utm[param] = value;
  });

  // Store in session for cross-page tracking
  if (Object.keys(utm).length > 0) {
    sessionStorage.setItem('cortex_utm', JSON.stringify(utm));
  }

  // Return stored UTM if current page doesn't have any
  const stored = sessionStorage.getItem('cortex_utm');
  return stored ? { ...JSON.parse(stored), ...utm } : utm;
}

// ============================================================================
// MAIN ANALYTICS CLASS
// ============================================================================

export class CortexAnalytics {
  private config: TrackingConfig;
  private user: UserProperties;
  private events: ConversionEvent[] = [];
  private scrollDepths = new Set<number>();
  private timeOnPage = 0;
  private timeIntervals: number[] = [];
  private initialized = false;

  constructor(config: TrackingConfig = {}) {
    this.config = {
      ga4MeasurementId: process.env.NEXT_PUBLIC_GA4_ID,
      googleAdsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
      fbPixelId: process.env.NEXT_PUBLIC_FB_PIXEL_ID,
      tiktokPixelId: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
      hubspotPortalId: process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID,
      debug: process.env.NODE_ENV === 'development',
      ...config,
    };

    const utmParams = getUtmParams();

    this.user = {
      visitorId: generateVisitorId(),
      sessionId: generateSessionId(),
      landingPage: typeof window !== 'undefined' ? window.location.pathname : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      utmSource: utmParams.utm_source,
      utmMedium: utmParams.utm_medium,
      utmCampaign: utmParams.utm_campaign,
      utmContent: utmParams.utm_content,
      utmTerm: utmParams.utm_term,
      gclid: utmParams.gclid,
      fbclid: utmParams.fbclid,
      device: getDeviceType(),
      browser: getBrowser(),
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;

    this.initDataLayer();
    this.initScrollTracking();
    this.initTimeTracking();
    this.initExitIntent();
    this.initVideoTracking();
    this.trackPageView();

    this.initialized = true;
    this.log('CORTEX Analytics initialized', this.user);
  }

  private initDataLayer(): void {
    window.dataLayer ??= [];
    window.gtag ??= function (...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }

  private initScrollTracking(): void {
    const checkpoints = [25, 50, 75, 100];

    const handleScroll = (): void => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      checkpoints.forEach((checkpoint) => {
        if (scrollPercent >= checkpoint && !this.scrollDepths.has(checkpoint)) {
          this.scrollDepths.add(checkpoint);
          this.track(`scroll_${checkpoint}` as ConversionType);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  private initTimeTracking(): void {
    const intervals = [30, 60, 180]; // seconds
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed++;
      this.timeOnPage = elapsed;

      intervals.forEach((seconds) => {
        if (elapsed === seconds) {
          this.track(`time_${seconds}s` as ConversionType);
        }
      });
    }, 1000);

    this.timeIntervals.push(timer as unknown as number);
  }

  private initExitIntent(): void {
    let triggered = false;

    const handleMouseLeave = (e: MouseEvent): void => {
      if (e.clientY <= 0 && !triggered) {
        triggered = true;
        this.track('exit_intent');

        // Dispatch custom event for UI to show popup
        window.dispatchEvent(new CustomEvent('cortex:exit_intent'));
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
  }

  private initVideoTracking(): void {
    // Track HTML5 video elements
    document.querySelectorAll('video').forEach((video) => {
      video.addEventListener('play', () => {
        this.track('video_play', { videoSrc: video.src });
      });

      video.addEventListener('ended', () => {
        this.track('video_complete', { videoSrc: video.src });
      });
    });
  }

  // ==========================================================================
  // TRACKING METHODS
  // ==========================================================================

  track(type: ConversionType, metadata?: Record<string, unknown>): void {
    const event: ConversionEvent = {
      type,
      value: CONVERSION_VALUES[type],
      currency: 'EUR',
      metadata,
      timestamp: Date.now(),
    };

    this.events.push(event);
    this.log('Track event', event);

    // Send to all platforms
    this.sendToGA4(event);
    this.sendToGoogleAds(event);
    this.sendToFacebook(event);
    this.sendToTikTok(event);
    this.sendToHubSpot(event);
    void this.sendToInternalCRM(event);
  }

  trackPageView(): void {
    this.track('page_view', {
      page: window.location.pathname,
      title: document.title,
      ...this.user,
    });
  }

  // Quiz tracking
  trackQuizStart(): void {
    this.track('quiz_start');
  }

  trackQuizStep(step: number, answer: string): void {
    this.track('quiz_step', { step, answer });
  }

  trackQuizComplete(answers: Record<string, string>, score: number): void {
    this.track('quiz_complete', { answers, score });
  }

  // Form tracking
  trackFormStart(formName: string): void {
    this.track('form_start', { formName });
  }

  trackFormSubmit(formName: string, data: Partial<LeadData>): void {
    this.track('form_submit', { formName, ...data });
  }

  // Lead tracking
  trackLeadCreated(lead: LeadData): void {
    this.track('lead_created', { ...lead, value: 100 });
  }

  trackLeadQualified(leadId: string, score: number): void {
    this.track('lead_qualified', { leadId, score, value: 250 });
  }

  trackAppointmentScheduled(leadId: string): void {
    this.track('appointment_scheduled', { leadId, value: 500 });
  }

  // CTA tracking
  trackWhatsAppClick(): void {
    this.track('whatsapp_click');
  }

  trackPhoneClick(): void {
    this.track('phone_click');
  }

  // Smile Simulator tracking
  trackSmileSimulatorStart(): void {
    this.track('smile_simulator_start');
  }

  trackSmileSimulatorComplete(beforeImage: string): void {
    this.track('smile_simulator_complete', { beforeImage });
  }

  // Financing calculator
  trackFinancingCalculatorUse(amount: number, months: number): void {
    this.track('financing_calculator_use', { amount, months });
  }

  // Before/After gallery
  trackBeforeAfterView(caseId: string): void {
    this.track('before_after_view', { caseId });
  }

  // Testimonial video
  trackTestimonialVideoPlay(testimonialId: string): void {
    this.track('testimonial_video_play', { testimonialId });
  }

  // ==========================================================================
  // PLATFORM INTEGRATIONS
  // ==========================================================================

  private sendToGA4(event: ConversionEvent): void {
    if (!this.config.ga4MeasurementId || typeof window.gtag !== 'function') return;

    window.gtag('event', event.type, {
      value: event.value,
      currency: event.currency,
      ...event.metadata,
      visitor_id: this.user.visitorId,
      session_id: this.user.sessionId,
    });
  }

  private sendToGoogleAds(event: ConversionEvent): void {
    if (!this.config.googleAdsId || typeof window.gtag !== 'function') return;

    // Only send conversion events
    const conversionEvents: ConversionType[] = [
      'lead_created',
      'lead_qualified',
      'appointment_scheduled',
      'quiz_complete',
      'form_submit',
    ];

    if (conversionEvents.includes(event.type)) {
      window.gtag('event', 'conversion', {
        send_to: `${this.config.googleAdsId}/${event.type}`,
        value: event.value,
        currency: event.currency,
      });
    }
  }

  private sendToFacebook(event: ConversionEvent): void {
    if (!this.config.fbPixelId || typeof window.fbq !== 'function') return;

    const fbEventMap: Partial<Record<ConversionType, string>> = {
      page_view: 'PageView',
      quiz_start: 'ViewContent',
      quiz_complete: 'CompleteRegistration',
      form_submit: 'Lead',
      lead_created: 'Lead',
      appointment_scheduled: 'Schedule',
      whatsapp_click: 'Contact',
      phone_click: 'Contact',
    };

    const fbEvent = fbEventMap[event.type];
    if (fbEvent) {
      window.fbq('track', fbEvent, {
        value: event.value,
        currency: event.currency,
        content_name: event.type,
        ...event.metadata,
      });
    }
  }

  private sendToTikTok(event: ConversionEvent): void {
    if (!this.config.tiktokPixelId || !window.ttq) return;

    const ttEventMap: Partial<Record<ConversionType, string>> = {
      page_view: 'ViewContent',
      quiz_complete: 'CompleteRegistration',
      form_submit: 'SubmitForm',
      lead_created: 'Contact',
      appointment_scheduled: 'Schedule',
    };

    const ttEvent = ttEventMap[event.type];
    if (ttEvent) {
      window.ttq.track(ttEvent, {
        value: event.value,
        currency: event.currency,
        ...event.metadata,
      });
    }
  }

  private sendToHubSpot(event: ConversionEvent): void {
    if (!this.config.hubspotPortalId) return;

    window._hsq ??= [];
    window._hsq.push([
      'trackCustomBehavioralEvent',
      {
        name: `cortex_${event.type}`,
        properties: {
          value: event.value,
          ...event.metadata,
        },
      },
    ]);
  }

  private async sendToInternalCRM(event: ConversionEvent): Promise<void> {
    // Only send significant events to reduce API calls
    const significantEvents: ConversionType[] = [
      'quiz_complete',
      'form_submit',
      'lead_created',
      'appointment_scheduled',
      'whatsapp_click',
      'phone_click',
    ];

    if (!significantEvents.includes(event.type)) return;

    try {
      await fetch('/api/tracking/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          user: this.user,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      this.log('Failed to send to internal CRM', error);
    }
  }

  // ==========================================================================
  // LEAD SUBMISSION WITH FULL TRACKING
  // ==========================================================================

  async submitLead(data: LeadData): Promise<{ success: boolean; reference?: string }> {
    // Track form submission
    this.trackFormSubmit('lead_form', data);

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // Include tracking data
          tracking: {
            visitorId: this.user.visitorId,
            sessionId: this.user.sessionId,
            utmSource: this.user.utmSource,
            utmMedium: this.user.utmMedium,
            utmCampaign: this.user.utmCampaign,
            utmContent: this.user.utmContent,
            utmTerm: this.user.utmTerm,
            gclid: this.user.gclid,
            fbclid: this.user.fbclid,
            device: this.user.device,
            landingPage: this.user.landingPage,
            referrer: this.user.referrer,
            timeOnPage: this.timeOnPage,
            scrollDepth: Math.max(...Array.from(this.scrollDepths), 0),
          },
          gdprConsent: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.trackLeadCreated(data);

        // Enhanced conversion tracking for Google Ads
        if (typeof window.gtag === 'function' && this.config.googleAdsId) {
          window.gtag('set', 'user_data', {
            email: data.email,
            phone_number: data.phone,
          });
        }
      }

      return result;
    } catch (error) {
      this.log('Lead submission failed', error);
      return { success: false };
    }
  }

  // ==========================================================================
  // UTILITY
  // ==========================================================================

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.debug(`[CORTEX] ${message}`, data);
    }
  }

  getUser(): UserProperties {
    return this.user;
  }

  getEvents(): ConversionEvent[] {
    return this.events;
  }

  destroy(): void {
    this.timeIntervals.forEach((interval) => clearInterval(interval));
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let analyticsInstance: CortexAnalytics | null = null;

export function getAnalytics(): CortexAnalytics {
  analyticsInstance ??= new CortexAnalytics();
  return analyticsInstance;
}

export function initAnalytics(config?: TrackingConfig): CortexAnalytics {
  analyticsInstance ??= new CortexAnalytics(config);
  analyticsInstance.init();
  return analyticsInstance;
}

// ============================================================================
// REACT HOOK
// ============================================================================

export function useAnalytics(): CortexAnalytics {
  return getAnalytics();
}
