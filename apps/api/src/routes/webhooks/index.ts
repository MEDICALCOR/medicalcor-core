import type { FastifyPluginAsync } from 'fastify';
import { whatsappWebhookRoutes } from './whatsapp.js';
import { voiceWebhookRoutes } from './voice.js';
import { stripeWebhookRoutes } from './stripe.js';
import { bookingWebhookRoutes } from './booking.js';

/**
 * Register all webhook routes
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(whatsappWebhookRoutes);
  await fastify.register(voiceWebhookRoutes);
  await fastify.register(stripeWebhookRoutes);
  await fastify.register(bookingWebhookRoutes);
};

export { whatsappWebhookRoutes, voiceWebhookRoutes, stripeWebhookRoutes, bookingWebhookRoutes };
