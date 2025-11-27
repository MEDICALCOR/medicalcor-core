import type { FastifyPluginAsync } from 'fastify';
import { whatsappWebhookRoutes } from './whatsapp.js';
import { voiceWebhookRoutes } from './voice.js';
import { stripeWebhookRoutes } from './stripe.js';
import { bookingWebhookRoutes } from './booking.js';
import { vapiWebhookRoutes } from './vapi.js';
import { crmWebhookRoutes } from './crm.js';

/**
 * Register all webhook routes
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(whatsappWebhookRoutes);
  await fastify.register(voiceWebhookRoutes);
  await fastify.register(stripeWebhookRoutes);
  await fastify.register(bookingWebhookRoutes);
  await fastify.register(vapiWebhookRoutes);
  await fastify.register(crmWebhookRoutes);
};

export {
  whatsappWebhookRoutes,
  voiceWebhookRoutes,
  stripeWebhookRoutes,
  bookingWebhookRoutes,
  vapiWebhookRoutes,
  crmWebhookRoutes,
};
