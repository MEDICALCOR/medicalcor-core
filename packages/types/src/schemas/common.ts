/**
 * Common schemas shared across the platform
 */
import { z } from "zod";

/**
 * Romanian phone number format (+40 or 0 prefix)
 */
export const PhoneNumberSchema = z
  .string()
  .regex(/^(\+40|0)[0-9]{9}$/, "Invalid Romanian phone number format")
  .describe("Romanian phone number in E.164 or local format");

/**
 * Normalized E.164 phone number
 */
export const E164PhoneSchema = z
  .string()
  .regex(/^\+40[0-9]{9}$/, "Must be E.164 format with +40 prefix")
  .describe("Phone number in E.164 format");

/**
 * Email address validation
 */
export const EmailSchema = z
  .string()
  .email("Invalid email address")
  .describe("Valid email address");

/**
 * UUID v4 validation
 */
export const UUIDSchema = z.string().uuid("Invalid UUID format").describe("UUID v4 identifier");

/**
 * ISO 8601 timestamp
 */
export const TimestampSchema = z.coerce.date().describe("ISO 8601 timestamp");

/**
 * Correlation ID for request tracing
 */
export const CorrelationIdSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("Correlation ID for distributed tracing");

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PhoneNumber = z.infer<typeof PhoneNumberSchema>;
export type E164Phone = z.infer<typeof E164PhoneSchema>;
export type Email = z.infer<typeof EmailSchema>;
export type UUID = z.infer<typeof UUIDSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
