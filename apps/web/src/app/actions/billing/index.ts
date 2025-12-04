'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';
import { getStripeClient } from '../shared/clients';

/**
 * Server Actions for Billing and Invoice Management
 *
 * Integrates with PostgreSQL for invoice storage and Stripe for payments.
 */

// Lazy-initialized database connection
let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  taxRate: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidAt: Date | null;
  stripeInvoiceId: string | null;
  issueDate: Date;
  dueDate: Date;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;
  notes: string | null;
  items: InvoiceItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  serviceCode: string | null;
  serviceName: string | null;
  taxRate: number | null;
  taxAmount: number | null;
}

export interface BillingStats {
  totalInvoices: number;
  pendingAmount: number;
  paidAmount: number;
  overdueAmount: number;
  monthlyRevenue: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  tax_rate: string;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: Date | null;
  stripe_invoice_id: string | null;
  issue_date: Date;
  due_date: Date;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_tax_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InvoiceItemRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: number;
  total: number;
  service_code: string | null;
  service_name: string | null;
  tax_rate: string | null;
  tax_amount: number | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateInvoiceSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  customerTaxId: z.string().optional(),
  dueDate: z.coerce.date(),
  notes: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    serviceCode: z.string().optional(),
    serviceName: z.string().optional(),
    taxRate: z.number().min(0).max(100).optional(),
  })).min(1),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        serviceCode: z.string().optional(),
        serviceName: z.string().optional(),
        taxRate: z.number().min(0).max(100).optional(),
      })
    )
    .min(1),
  taxRate: z.number().min(0).max(100).default(19),
  discountAmount: z.number().nonnegative().default(0),
});

const UpdateInvoiceStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded']),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToInvoice(row: InvoiceRow, items: InvoiceItem[] = []): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status as InvoiceStatus,
    subtotal: row.subtotal / 100, // Convert from cents
    taxAmount: row.tax_amount / 100,
    discountAmount: row.discount_amount / 100,
    total: row.total / 100,
    currency: row.currency,
    taxRate: parseFloat(row.tax_rate),
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    paidAt: row.paid_at,
    stripeInvoiceId: row.stripe_invoice_id,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerTaxId: row.customer_tax_id,
    notes: row.notes,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    description: row.description,
    quantity: parseFloat(row.quantity),
    unitPrice: row.unit_price / 100,
    total: row.total / 100,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    taxRate: row.tax_rate ? parseFloat(row.tax_rate) : null,
    taxAmount: row.tax_amount ? row.tax_amount / 100 : null,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all invoices for the current clinic
 */
export async function getInvoicesAction(): Promise<Invoice[]> {
  await requirePermission('billing:read');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const invoicesResult = await database.query<InvoiceRow>(
    `SELECT
      id, invoice_number, status, subtotal, tax_amount, discount_amount, total,
      currency, tax_rate, payment_method, payment_reference, paid_at,
      stripe_invoice_id, issue_date, due_date,
      customer_name, customer_email, customer_phone, customer_address, customer_tax_id,
      notes, created_at, updated_at
    FROM invoices
    WHERE clinic_id = $1
    ORDER BY created_at DESC`,
    [user.clinicId]
  );

  // Get items for all invoices
  const invoiceIds = invoicesResult.rows.map((r) => r.id);
  if (invoiceIds.length === 0) {
    return [];
  }

  const itemsResult = await database.query<InvoiceItemRow & { invoice_id: string }>(
    `SELECT
      id, invoice_id, description, quantity, unit_price, total,
      service_code, service_name, tax_rate, tax_amount
    FROM invoice_items
    WHERE invoice_id = ANY($1)
    ORDER BY sort_order`,
    [invoiceIds]
  );

  // Group items by invoice
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const row of itemsResult.rows) {
    const items = itemsByInvoice.get(row.invoice_id) ?? [];
    items.push(rowToInvoiceItem(row));
    itemsByInvoice.set(row.invoice_id, items);
  }

  return invoicesResult.rows.map((row) =>
    rowToInvoice(row, itemsByInvoice.get(row.id) ?? [])
  );
  return invoicesResult.rows.map((row) => rowToInvoice(row, itemsByInvoice.get(row.id) ?? []));
}

/**
 * Get invoice by ID
 */
export async function getInvoiceByIdAction(id: string): Promise<Invoice | null> {
  await requirePermission('billing:read');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const invoiceResult = await database.query<InvoiceRow>(
    `SELECT
      id, invoice_number, status, subtotal, tax_amount, discount_amount, total,
      currency, tax_rate, payment_method, payment_reference, paid_at,
      stripe_invoice_id, issue_date, due_date,
      customer_name, customer_email, customer_phone, customer_address, customer_tax_id,
      notes, created_at, updated_at
    FROM invoices
    WHERE id = $1 AND clinic_id = $2`,
    [id, user.clinicId]
  );

  if (invoiceResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await database.query<InvoiceItemRow>(
    `SELECT
      id, description, quantity, unit_price, total,
      service_code, service_name, tax_rate, tax_amount
    FROM invoice_items
    WHERE invoice_id = $1
    ORDER BY sort_order`,
    [id]
  );

  return rowToInvoice(
    invoiceResult.rows[0],
    itemsResult.rows.map(rowToInvoiceItem)
  );
  return rowToInvoice(invoiceResult.rows[0], itemsResult.rows.map(rowToInvoiceItem));
}

/**
 * Get billing statistics
 */
export async function getBillingStatsAction(): Promise<BillingStats> {
  await requirePermission('billing:read');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<{
    total_invoices: string;
    pending_amount: string;
    paid_amount: string;
    overdue_amount: string;
    monthly_revenue: string;
  }>(
    `SELECT
      COUNT(*) as total_invoices,
      COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0) as pending_amount,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) as paid_amount,
      COALESCE(SUM(total) FILTER (WHERE status = 'overdue'), 0) as overdue_amount,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE)), 0) as monthly_revenue
    FROM invoices
    WHERE clinic_id = $1`,
    [user.clinicId]
  );

  const stats = result.rows[0];
  return {
    totalInvoices: parseInt(stats.total_invoices, 10),
    pendingAmount: parseInt(stats.pending_amount, 10) / 100,
    paidAmount: parseInt(stats.paid_amount, 10) / 100,
    overdueAmount: parseInt(stats.overdue_amount, 10) / 100,
    monthlyRevenue: parseInt(stats.monthly_revenue, 10) / 100,
  };
}

/**
 * Create a new invoice
 */
export async function createInvoiceAction(
  data: z.infer<typeof CreateInvoiceSchema>
): Promise<Invoice> {
  await requirePermission('billing:write');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const parsed = CreateInvoiceSchema.parse(data);
  const database = getDatabase();

  // Calculate totals
  let subtotal = 0;
  for (const item of parsed.items) {
    subtotal += item.quantity * item.unitPrice;
  }
  const taxAmount = Math.round(subtotal * (parsed.taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount - parsed.discountAmount;

  // Convert to cents for storage
  const subtotalCents = Math.round(subtotal * 100);
  const taxAmountCents = Math.round(taxAmount * 100);
  const discountCents = Math.round(parsed.discountAmount * 100);
  const totalCents = Math.round(total * 100);

  // Generate invoice number
  const invoiceNumberResult = await database.query<{ invoice_number: string }>(
    `SELECT generate_invoice_number($1) as invoice_number`,
    [user.clinicId]
  );
  const invoiceNumber = invoiceNumberResult.rows[0].invoice_number;

  // Insert invoice
  const invoiceResult = await database.query<InvoiceRow>(
    `INSERT INTO invoices (
      clinic_id, invoice_number, subtotal, tax_amount, discount_amount, total,
      tax_rate, due_date, customer_name, customer_email, customer_phone,
      customer_address, customer_tax_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING
      id, invoice_number, status, subtotal, tax_amount, discount_amount, total,
      currency, tax_rate, payment_method, payment_reference, paid_at,
      stripe_invoice_id, issue_date, due_date,
      customer_name, customer_email, customer_phone, customer_address, customer_tax_id,
      notes, created_at, updated_at`,
    [
      user.clinicId,
      invoiceNumber,
      subtotalCents,
      taxAmountCents,
      discountCents,
      totalCents,
      parsed.taxRate,
      parsed.dueDate,
      parsed.customerName,
      parsed.customerEmail ?? null,
      parsed.customerPhone ?? null,
      parsed.customerAddress ?? null,
      parsed.customerTaxId ?? null,
      parsed.notes ?? null,
    ]
  );

  const invoiceId = invoiceResult.rows[0].id;

  // Insert items
  const items: InvoiceItem[] = [];
  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const itemTotal = item.quantity * item.unitPrice;
    const itemTaxAmount = item.taxRate ? Math.round(itemTotal * (item.taxRate / 100) * 100) / 100 : null;
    const itemTaxAmount = item.taxRate
      ? Math.round(itemTotal * (item.taxRate / 100) * 100) / 100
      : null;

    const itemResult = await database.query<InvoiceItemRow>(
      `INSERT INTO invoice_items (
        invoice_id, description, quantity, unit_price, total,
        service_code, service_name, tax_rate, tax_amount, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, description, quantity, unit_price, total, service_code, service_name, tax_rate, tax_amount`,
      [
        invoiceId,
        item.description,
        item.quantity,
        Math.round(item.unitPrice * 100),
        Math.round(itemTotal * 100),
        item.serviceCode ?? null,
        item.serviceName ?? null,
        item.taxRate ?? null,
        itemTaxAmount ? Math.round(itemTaxAmount * 100) : null,
        i,
      ]
    );

    items.push(rowToInvoiceItem(itemResult.rows[0]));
  }

  return rowToInvoice(invoiceResult.rows[0], items);
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatusAction(
  data: z.infer<typeof UpdateInvoiceStatusSchema>
): Promise<Invoice> {
  await requirePermission('billing:write');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const parsed = UpdateInvoiceStatusSchema.parse(data);
  const database = getDatabase();

  const updates: string[] = ['status = $1'];
  const values: unknown[] = [parsed.status];

  if (parsed.status === 'paid') {
    values.push(new Date());
    updates.push(`paid_at = $${values.length}`);

    if (parsed.paymentMethod) {
      values.push(parsed.paymentMethod);
      updates.push(`payment_method = $${values.length}`);
    }
    if (parsed.paymentReference) {
      values.push(parsed.paymentReference);
      updates.push(`payment_reference = $${values.length}`);
    }
  }

  values.push(parsed.id);
  values.push(user.clinicId);

  const result = await database.query<InvoiceRow>(
    `UPDATE invoices
     SET ${updates.join(', ')}
     WHERE id = $${values.length - 1} AND clinic_id = $${values.length}
     RETURNING
       id, invoice_number, status, subtotal, tax_amount, discount_amount, total,
       currency, tax_rate, payment_method, payment_reference, paid_at,
       stripe_invoice_id, issue_date, due_date,
       customer_name, customer_email, customer_phone, customer_address, customer_tax_id,
       notes, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Invoice not found');
  }

  // Fetch items
  const itemsResult = await database.query<InvoiceItemRow>(
    `SELECT id, description, quantity, unit_price, total, service_code, service_name, tax_rate, tax_amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
    [parsed.id]
  );

  return rowToInvoice(result.rows[0], itemsResult.rows.map(rowToInvoiceItem));
}

/**
 * Delete an invoice (only draft invoices)
 */
export async function deleteInvoiceAction(id: string): Promise<boolean> {
  await requirePermission('billing:delete');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  // Only allow deletion of draft invoices
  const result = await database.query(
    `DELETE FROM invoices WHERE id = $1 AND clinic_id = $2 AND status = 'draft' RETURNING id`,
    [id, user.clinicId]
  );

  return result.rows.length > 0;
}

/**
 * Get Stripe revenue data (from Stripe integration)
 */
export async function getStripeRevenueAction(): Promise<{
  dailyRevenue: number;
  monthlyRevenue: number;
  currency: string;
}> {
  await requirePermission('billing:read');

  try {
    const stripe = getStripeClient();
    const dailyData = await stripe.getDailyRevenue('Europe/Bucharest');

    return {
      dailyRevenue: dailyData.amount / 100,
      monthlyRevenue: 0, // Would need separate Stripe query
      currency: dailyData.currency,
    };
  } catch (error) {
    // Graceful fallback when Stripe is not configured or unavailable
    // This is expected in development or when Stripe keys are not set
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Billing] Stripe unavailable, using fallback data:', error);
    }
    return {
      dailyRevenue: 0,
      monthlyRevenue: 0,
      currency: 'RON',
    };
  }
}
