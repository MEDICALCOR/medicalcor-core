import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Video AI Task - Avatar Video Generation with HeyGen
 *
 * Generates personalized avatar videos using HeyGen API.
 * Implements cost optimization through script-based caching.
 *
 * Features:
 * - Cache check: Reuses existing videos with identical scripts (~$2 savings)
 * - Polling: Waits for video generation (typically 1-3 minutes)
 * - Cost tracking: ~$2 per video generation
 * - Webhook support: Optional webhook for completion notification
 */

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const VideoGenerationPayloadSchema = z.object({
  script: z.string().min(1).max(5000),
  patientName: z.string().min(1).max(100),
  templateId: z.string().optional(),
  avatarId: z.string().optional(),
  voiceId: z.string().optional(),
  language: z.enum(['ro', 'en', 'de']).optional().default('ro'),
  correlationId: z.string().optional(),
  hubspotContactId: z.string().optional(),
  patientId: z.string().optional(),
  // Webhook URL for completion notification (optional)
  webhookUrl: z.string().url().optional(),
});

export type VideoGenerationPayload = z.infer<typeof VideoGenerationPayloadSchema>;

// HeyGen API Types
interface HeyGenVideoStatus {
  video_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  error?: {
    code: string;
    message: string;
  };
}

interface HeyGenCreateVideoResponse {
  data: {
    video_id: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface HeyGenVideoStatusResponse {
  data: HeyGenVideoStatus;
  error?: {
    code: string;
    message: string;
  };
}

// Cache check result
interface CachedVideo {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  createdAt: string;
}

// Cost configuration
const HEYGEN_COST_PER_VIDEO_CENTS = 200; // ~$2 per video

// Default avatar/voice settings (Romanian speaker)
const DEFAULT_AVATAR_ID = process.env.HEYGEN_DEFAULT_AVATAR_ID ?? 'anna_costume1_cameraA';
const DEFAULT_VOICE_ID = process.env.HEYGEN_DEFAULT_VOICE_ID ?? 'ro-RO-AlinaNeural';

// Polling configuration
const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_POLL_ATTEMPTS = 60; // 10 minutes max wait

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Hash script for cache lookup
 */
function hashScript(script: string): string {
  const normalized = script.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if a video with the same script already exists
 */
function checkVideoCache(scriptHash: string): Promise<CachedVideo | null> {
  // In production, this would query the avatar_videos table
  // For now, we return null (no cache hit)
  // This is implemented via SQL function find_cached_video()

  logger.info('Checking video cache', { scriptHash });

  // TODO: Implement database query when Supabase client is available
  // const { data } = await supabase
  //   .rpc('find_cached_video', { p_script_hash: scriptHash })
  //   .single();

  return Promise.resolve(null);
}

/**
 * Get HeyGen API client configuration
 */
function getHeyGenConfig(): { apiKey: string; apiBaseUrl: string } {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error('HEYGEN_API_KEY is required for video generation');
  }
  return {
    apiKey,
    apiBaseUrl: 'https://api.heygen.com/v2',
  };
}

/**
 * Create video via HeyGen API
 */
async function createHeyGenVideo(
  script: string,
  avatarId: string,
  voiceId: string,
  _language: string, // Reserved for future multi-language voice selection
  webhookUrl?: string
): Promise<string> {
  const { apiKey, apiBaseUrl } = getHeyGenConfig();

  const requestBody = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: script,
          voice_id: voiceId,
          speed: 1.0,
        },
        background: {
          type: 'color',
          value: '#FFFFFF',
        },
      },
    ],
    dimension: {
      width: 1280,
      height: 720,
    },
    aspect_ratio: '16:9',
    ...(webhookUrl && { callback_url: webhookUrl }),
  };

  logger.info('Creating HeyGen video', {
    avatarId,
    voiceId,
    scriptLength: script.length,
    hasWebhook: !!webhookUrl,
  });

  const response = await fetch(`${apiBaseUrl}/video/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('HeyGen API error', {
      status: response.status,
      error: errorText,
    });
    throw new Error(`HeyGen API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as HeyGenCreateVideoResponse;

  if (result.error) {
    throw new Error(`HeyGen error: ${result.error.code} - ${result.error.message}`);
  }

  return result.data.video_id;
}

/**
 * Get video status from HeyGen API
 */
async function getHeyGenVideoStatus(videoId: string): Promise<HeyGenVideoStatus> {
  const { apiKey, apiBaseUrl } = getHeyGenConfig();

  const response = await fetch(`${apiBaseUrl}/video_status.get?video_id=${videoId}`, {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HeyGen status check failed: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as HeyGenVideoStatusResponse;

  if (result.error) {
    throw new Error(`HeyGen error: ${result.error.code} - ${result.error.message}`);
  }

  return result.data;
}

/**
 * Poll for video completion
 */
async function pollVideoCompletion(
  videoId: string,
  maxAttempts: number = MAX_POLL_ATTEMPTS
): Promise<HeyGenVideoStatus> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    logger.info('Polling video status', { videoId, attempt: attempts });

    const status = await getHeyGenVideoStatus(videoId);

    if (status.status === 'completed') {
      logger.info('Video generation completed', {
        videoId,
        videoUrl: status.video_url,
        duration: status.duration,
        attempts,
      });
      return status;
    }

    if (status.status === 'failed') {
      logger.error('Video generation failed', {
        videoId,
        error: status.error,
        attempts,
      });
      throw new Error(
        `Video generation failed: ${status.error?.code ?? 'unknown'} - ${status.error?.message ?? 'Unknown error'}`
      );
    }

    // Wait before next poll
    logger.debug('Video still processing, waiting...', {
      videoId,
      status: status.status,
      attempt: attempts,
    });

    await wait.for({ seconds: POLL_INTERVAL_MS / 1000 });
  }

  throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
}

// =============================================================================
// CLIENTS
// =============================================================================

function getClients() {
  return createIntegrationClients({
    source: 'video-generation',
    includeOpenAI: false,
  });
}

// =============================================================================
// MAIN TASK
// =============================================================================

export const generateAvatarVideo = task({
  id: 'generate-avatar-video',
  retry: {
    maxAttempts: 2, // Limited retries since video gen is expensive
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  // Allow up to 15 minutes for video generation
  run: async (payload: VideoGenerationPayload) => {
    const startTime = Date.now();
    const {
      script,
      patientName,
      templateId,
      avatarId,
      voiceId,
      language,
      correlationId,
      hubspotContactId,
      patientId,
      webhookUrl,
    } = payload;

    const { eventStore } = getClients();
    const scriptHash = hashScript(script);
    const eventCorrelationId = correlationId ?? `video-${Date.now()}`;

    logger.info('Starting avatar video generation', {
      patientName,
      scriptLength: script.length,
      scriptHash: scriptHash.substring(0, 16),
      correlationId: eventCorrelationId,
    });

    // Step 1: Check cache - reuse existing video if script matches
    const cachedVideo = await checkVideoCache(scriptHash);

    if (cachedVideo) {
      logger.info('Cache hit! Reusing existing video', {
        originalVideoId: cachedVideo.id,
        videoUrl: cachedVideo.videoUrl,
        savingsInCents: HEYGEN_COST_PER_VIDEO_CENTS,
      });

      // Emit cache hit event
      await eventStore.emit({
        type: 'video.cache_hit',
        correlationId: eventCorrelationId,
        aggregateId: patientId ?? patientName,
        aggregateType: 'avatar_video',
        payload: {
          patientId,
          patientName,
          hubspotContactId,
          scriptHash,
          sourceVideoId: cachedVideo.id,
          videoUrl: cachedVideo.videoUrl,
          thumbnailUrl: cachedVideo.thumbnailUrl,
          durationSeconds: cachedVideo.durationSeconds,
          isCacheHit: true,
          costInCents: 0, // No cost for cache hit!
        },
      });

      return {
        success: true,
        videoId: cachedVideo.id,
        videoUrl: cachedVideo.videoUrl,
        thumbnailUrl: cachedVideo.thumbnailUrl,
        durationSeconds: cachedVideo.durationSeconds,
        isCacheHit: true,
        costInCents: 0,
        processingDurationMs: Date.now() - startTime,
        correlationId: eventCorrelationId,
      };
    }

    // Step 2: Generate new video via HeyGen
    const finalAvatarId = avatarId ?? DEFAULT_AVATAR_ID;
    const finalVoiceId = voiceId ?? DEFAULT_VOICE_ID;

    let heygenVideoId: string;

    const lang = language;
    try {
      heygenVideoId = await createHeyGenVideo(
        script,
        finalAvatarId,
        finalVoiceId,
        lang,
        webhookUrl
      );

      logger.info('HeyGen video created, starting poll', {
        heygenVideoId,
        avatarId: finalAvatarId,
        voiceId: finalVoiceId,
      });
    } catch (error) {
      logger.error('Failed to create HeyGen video', { error });

      // Emit failure event
      await eventStore.emit({
        type: 'video.generation_failed',
        correlationId: eventCorrelationId,
        aggregateId: patientId ?? patientName,
        aggregateType: 'avatar_video',
        payload: {
          patientId,
          patientName,
          hubspotContactId,
          scriptHash,
          error: error instanceof Error ? error.message : 'Unknown error',
          avatarId: finalAvatarId,
          voiceId: finalVoiceId,
        },
      });

      throw error;
    }

    // Step 3: Poll for completion (or rely on webhook)
    let videoStatus: HeyGenVideoStatus;

    try {
      videoStatus = await pollVideoCompletion(heygenVideoId);
    } catch (error) {
      logger.error('Video polling failed', { error, heygenVideoId });

      // Emit polling failure event
      await eventStore.emit({
        type: 'video.polling_failed',
        correlationId: eventCorrelationId,
        aggregateId: patientId ?? patientName,
        aggregateType: 'avatar_video',
        payload: {
          patientId,
          patientName,
          hubspotContactId,
          scriptHash,
          heygenVideoId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }

    const processingDurationMs = Date.now() - startTime;

    // Step 4: Emit success event
    await eventStore.emit({
      type: 'video.generation_completed',
      correlationId: eventCorrelationId,
      aggregateId: patientId ?? patientName,
      aggregateType: 'avatar_video',
      payload: {
        patientId,
        patientName,
        hubspotContactId,
        script,
        scriptHash,
        templateId,
        avatarId: finalAvatarId,
        voiceId: finalVoiceId,
        language: lang,
        status: 'completed',
        heygenVideoId,
        videoUrl: videoStatus.video_url,
        thumbnailUrl: videoStatus.thumbnail_url,
        durationSeconds: videoStatus.duration,
        costInCents: HEYGEN_COST_PER_VIDEO_CENTS,
        isCacheHit: false,
        processingDurationMs,
        providerMetadata: {
          video_id: heygenVideoId,
          avatar_id: finalAvatarId,
          voice_id: finalVoiceId,
        },
      },
    });

    logger.info('Avatar video generation completed', {
      heygenVideoId,
      videoUrl: videoStatus.video_url,
      durationSeconds: videoStatus.duration,
      costInCents: HEYGEN_COST_PER_VIDEO_CENTS,
      processingDurationMs,
    });

    return {
      success: true,
      videoId: heygenVideoId,
      videoUrl: videoStatus.video_url ?? '',
      thumbnailUrl: videoStatus.thumbnail_url,
      durationSeconds: videoStatus.duration,
      isCacheHit: false,
      costInCents: HEYGEN_COST_PER_VIDEO_CENTS,
      processingDurationMs,
      correlationId: eventCorrelationId,
    };
  },
});

/**
 * Video webhook handler for HeyGen completion callbacks
 * This can be triggered from the API when HeyGen sends a webhook
 */
export const handleVideoWebhook = task({
  id: 'handle-video-webhook',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: {
    videoId: string;
    status: 'completed' | 'failed';
    videoUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    error?: { code: string; message: string };
    correlationId?: string;
  }) => {
    const { videoId, status, videoUrl, thumbnailUrl, duration, error, correlationId } = payload;

    const { eventStore } = getClients();
    const eventCorrelationId = correlationId ?? `webhook-${videoId}`;

    logger.info('Processing video webhook', {
      videoId,
      status,
      hasVideoUrl: !!videoUrl,
    });

    if (status === 'failed') {
      await eventStore.emit({
        type: 'video.webhook_failed',
        correlationId: eventCorrelationId,
        aggregateId: videoId,
        aggregateType: 'avatar_video',
        payload: {
          videoId,
          error: error?.message ?? 'Unknown error',
          errorCode: error?.code,
        },
      });

      return {
        success: false,
        videoId,
        error: error?.message,
      };
    }

    // Emit webhook completion event
    await eventStore.emit({
      type: 'video.webhook_completed',
      correlationId: eventCorrelationId,
      aggregateId: videoId,
      aggregateType: 'avatar_video',
      payload: {
        videoId,
        videoUrl,
        thumbnailUrl,
        durationSeconds: duration,
        webhookReceivedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      videoId,
      videoUrl,
      thumbnailUrl,
      durationSeconds: duration,
    };
  },
});

/**
 * Generate personalized video for a patient
 * Creates a video with patient name in the script
 */
export const generatePersonalizedVideo = task({
  id: 'generate-personalized-video',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: {
    patientName: string;
    patientId?: string;
    hubspotContactId?: string;
    templateType: 'appointment_reminder' | 'welcome' | 'treatment_instructions' | 'follow_up';
    customData?: Record<string, string>;
    correlationId?: string;
    language?: 'ro' | 'en' | 'de';
  }) => {
    const {
      patientName,
      patientId,
      hubspotContactId,
      templateType,
      customData,
      correlationId,
      language,
    } = payload;

    // Script templates
    const templates: Record<string, (name: string, data?: Record<string, string>) => string> = {
      appointment_reminder: (name, data) =>
        `
Bună ziua, ${name}!

Vă reamintim de programarea dumneavoastră la clinica noastră pentru data de ${data?.date ?? 'în curând'}.

Vă așteptăm cu drag și suntem aici să vă ajutăm să obțineți zâmbetul pe care îl meritați.

Dacă aveți întrebări, nu ezitați să ne contactați.

O zi frumoasă!
      `.trim(),

      welcome: (name) =>
        `
Bună ziua, ${name}!

Bine ați venit la clinica noastră! Suntem încântați să vă avem alături și vă mulțumim pentru încrederea acordată.

Echipa noastră de specialiști este pregătită să vă ofere cele mai bune servicii și tratamente personalizate.

Așteptăm cu nerăbdare să vă cunoaștem personal!
      `.trim(),

      treatment_instructions: (name, data) =>
        `
Bună ziua, ${name}!

Iată câteva instrucțiuni importante pentru tratamentul dumneavoastră:

${data?.instructions ?? 'Vă rugăm să urmați recomandările medicului dumneavoastră.'}

Dacă aveți orice nelămuriri, suntem la dispoziția dumneavoastră.

Vă dorim recuperare rapidă!
      `.trim(),

      follow_up: (name) =>
        `
Bună ziua, ${name}!

Ne dorim să știm cum vă simțiți după vizita la clinica noastră.

Sănătatea și confortul dumneavoastră sunt prioritatea noastră.

Dacă aveți întrebări sau nereguli, vă rugăm să ne contactați imediat.

Cu drag, echipa noastră!
      `.trim(),
    };

    const templateFn = templates[templateType];
    if (!templateFn) {
      throw new Error(`Unknown template type: ${templateType}`);
    }

    const script = templateFn(patientName, customData);

    // Trigger the main video generation task
    const result = await generateAvatarVideo.triggerAndWait({
      script,
      patientName,
      patientId,
      hubspotContactId,
      language: language ?? 'ro',
      correlationId,
    });

    if (!result.ok) {
      throw new Error('Video generation task failed');
    }

    return result.output;
  },
});

export default generateAvatarVideo;
