import type { FastifyPluginAsync } from 'fastify';
import { whatsappWebhookRoutes } from './whatsapp.js';
import { voiceWebhookRoutes } from './voice.js';

/**
 * Register all webhook routes
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(whatsappWebhookRoutes);
  await fastify.register(voiceWebhookRoutes);
};

export { whatsappWebhookRoutes, voiceWebhookRoutes };
