import type { FastifyPluginAsync } from 'fastify';
import { whatsappWebhookRoutes } from './whatsapp.js';
import { voiceWebhookRoutes } from './voice.js';
import { stripeWebhookRoutes } from './stripe.js';
import { bookingWebhookRoutes } from './booking.js';
import { vapiWebhookRoutes } from './vapi.js';

/**
 * Register all webhook routes
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(whatsappWebhookRoutes);
  await fastify.register(voiceWebhookRoutes);
  await fastify.register(stripeWebhookRoutes);
  await fastify.register(bookingWebhookRoutes);
  await fastify.register(vapiWebhookRoutes);
};

export { whatsappWebhookRoutes, voiceWebhookRoutes, stripeWebhookRoutes, bookingWebhookRoutes, vapiWebhookRoutes };
