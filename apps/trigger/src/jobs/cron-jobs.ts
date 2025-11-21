import { schedules, logger } from '@trigger.dev/sdk/v3';

/**
 * Scheduled Jobs (Cron)
 * Recurring tasks for automation
 */

/**
 * Daily recall check - finds patients due for follow-up
 * Runs every day at 9:00 AM
 */
export const dailyRecallCheck = schedules.task({
  id: 'daily-recall-check',
  cron: '0 9 * * *', // 9:00 AM every day
  run: async () => {
    logger.info('Starting daily recall check');

    // Find contacts due for recall
    // const recallDueContacts = await hubspotClient.searchContacts({
    //   filterGroups: [{
    //     filters: [
    //       { propertyName: 'last_appointment_date', operator: 'LT', value: sixMonthsAgo() },
    //       { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
    //       { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
    //     ],
    //   }],
    // });

    // logger.info(`Found ${recallDueContacts.total} contacts due for recall`);

    // Trigger recall sequence for each
    // for (const contact of recallDueContacts.results) {
    //   await nurtureSequenceWorkflow.trigger({
    //     phone: contact.properties.phone,
    //     hubspotContactId: contact.id,
    //     sequenceType: 'recall',
    //     correlationId: generateCorrelationId(),
    //   });
    // }

    return {
      success: true,
      // contactsProcessed: recallDueContacts.total,
      contactsProcessed: 0,
    };
  },
});

/**
 * Appointment reminder - sends reminders for upcoming appointments
 * Runs every hour
 */
export const appointmentReminders = schedules.task({
  id: 'appointment-reminders',
  cron: '0 * * * *', // Every hour
  run: async () => {
    logger.info('Starting appointment reminder check');

    // Find appointments in the next 24 hours
    // const upcomingAppointments = await schedulingService.getUpcomingAppointments({
    //   startTime: new Date(),
    //   endTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    // });

    // const reminders24h = upcomingAppointments.filter(a => isIn24Hours(a.scheduledAt));
    // const reminders2h = upcomingAppointments.filter(a => isIn2Hours(a.scheduledAt));

    // Send 24h reminders
    // for (const apt of reminders24h) {
    //   if (!apt.reminder24hSent) {
    //     await whatsappClient.sendTemplate(apt.phone, 'appointment_reminder_24h', {
    //       date: formatDate(apt.scheduledAt),
    //       time: formatTime(apt.scheduledAt),
    //       location: apt.location,
    //     });
    //     await schedulingService.markReminderSent(apt.id, '24h');
    //   }
    // }

    // Send 2h reminders
    // for (const apt of reminders2h) {
    //   if (!apt.reminder2hSent) {
    //     await whatsappClient.sendTemplate(apt.phone, 'appointment_reminder_2h', {
    //       time: formatTime(apt.scheduledAt),
    //       location: apt.location,
    //     });
    //     await schedulingService.markReminderSent(apt.id, '2h');
    //   }
    // }

    return {
      success: true,
      // reminders24hSent: reminders24h.length,
      // reminders2hSent: reminders2h.length,
    };
  },
});

/**
 * Lead scoring refresh - re-scores inactive leads
 * Runs every day at 2:00 AM
 */
export const leadScoringRefresh = schedules.task({
  id: 'lead-scoring-refresh',
  cron: '0 2 * * *', // 2:00 AM every day
  run: async () => {
    logger.info('Starting lead scoring refresh');

    // Find leads that haven't been scored recently
    // const staleLeads = await hubspotClient.searchContacts({
    //   filterGroups: [{
    //     filters: [
    //       { propertyName: 'lead_score_updated', operator: 'LT', value: sevenDaysAgo() },
    //       { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
    //     ],
    //   }],
    //   limit: 100,
    // });

    // Re-score each lead
    // for (const lead of staleLeads.results) {
    //   const recentMessages = await getRecentMessages(lead.id);
    //   if (recentMessages.length > 0) {
    //     await scoreLeadWorkflow.trigger({
    //       phone: lead.properties.phone,
    //       hubspotContactId: lead.id,
    //       message: recentMessages[0].content,
    //       channel: 'whatsapp',
    //       messageHistory: recentMessages,
    //       correlationId: generateCorrelationId(),
    //     });
    //   }
    // }

    return {
      success: true,
      // leadsRefreshed: staleLeads.total,
      leadsRefreshed: 0,
    };
  },
});

/**
 * Weekly analytics report - generates and sends weekly metrics
 * Runs every Monday at 8:00 AM
 */
export const weeklyAnalyticsReport = schedules.task({
  id: 'weekly-analytics-report',
  cron: '0 8 * * 1', // 8:00 AM every Monday
  run: async () => {
    logger.info('Generating weekly analytics report');

    // Calculate metrics
    // const metrics = {
    //   newLeads: await countNewLeads(7),
    //   hotLeads: await countLeadsByClassification('HOT', 7),
    //   conversions: await countConversions(7),
    //   appointmentsScheduled: await countAppointments(7),
    //   messagesReceived: await countMessages('received', 7),
    //   messagesSent: await countMessages('sent', 7),
    //   avgResponseTime: await calculateAvgResponseTime(7),
    // };

    // Generate report
    // const report = formatWeeklyReport(metrics);

    // Send to Slack/Email
    // await notificationService.sendReport('weekly', report);

    return {
      success: true,
      // metrics,
    };
  },
});

/**
 * Stale lead cleanup - archives old unresponsive leads
 * Runs every Sunday at 3:00 AM
 */
export const staleLeadCleanup = schedules.task({
  id: 'stale-lead-cleanup',
  cron: '0 3 * * 0', // 3:00 AM every Sunday
  run: async () => {
    logger.info('Starting stale lead cleanup');

    // Find leads with no activity in 90 days
    // const staleLeads = await hubspotClient.searchContacts({
    //   filterGroups: [{
    //     filters: [
    //       { propertyName: 'last_activity_date', operator: 'LT', value: ninetyDaysAgo() },
    //       { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
    //     ],
    //   }],
    // });

    // Archive stale leads
    // for (const lead of staleLeads.results) {
    //   await hubspotClient.updateContact(lead.id, {
    //     lead_status: 'archived',
    //   });
    // }

    return {
      success: true,
      // leadsArchived: staleLeads.total,
      leadsArchived: 0,
    };
  },
});

/**
 * GDPR consent audit - checks for consent expiry
 * Runs every day at 4:00 AM
 */
export const gdprConsentAudit = schedules.task({
  id: 'gdpr-consent-audit',
  cron: '0 4 * * *', // 4:00 AM every day
  run: async () => {
    logger.info('Starting GDPR consent audit');

    // Find contacts with expiring consent (2 years)
    // const expiringConsent = await hubspotClient.searchContacts({
    //   filterGroups: [{
    //     filters: [
    //       { propertyName: 'consent_date', operator: 'LT', value: almostTwoYearsAgo() },
    //       { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
    //     ],
    //   }],
    // });

    // Send consent renewal request
    // for (const contact of expiringConsent.results) {
    //   await whatsappClient.sendTemplate(contact.properties.phone, 'consent_renewal', {});
    //   await hubspotClient.updateContact(contact.id, {
    //     consent_renewal_sent: new Date().toISOString(),
    //   });
    // }

    return {
      success: true,
      // consentRenewalsSent: expiringConsent.total,
      consentRenewalsSent: 0,
    };
  },
});
