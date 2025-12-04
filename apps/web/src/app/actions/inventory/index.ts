'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Inventory Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sku: string | null;
  quantity: number;
  minStock: number;
  maxStock: number | null;
  unit: string;
  price: number | null;
  totalValue: number;
  supplier: string | null;
  location: string | null;
  expiryDate: Date | null;
  lastRestocked: Date | null;
  isLowStock: boolean;
  isExpiringSoon: boolean;
}

export interface InventoryStats {
  totalItems: number;
  lowStockItems: number;
  expiringSoon: number;
  totalValue: number;
}

interface InventoryItemRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  quantity: number;
  min_stock: number;
  max_stock: number | null;
  unit: string;
  unit_price: number | null;
  total_value: number | null;
  supplier: string | null;
  location: string | null;
  expiry_date: Date | null;
  last_restocked: Date | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateInventoryItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  sku: z.string().max(100).optional(),
  quantity: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  maxStock: z.number().min(0).optional(),
  unit: z.string().max(50).default('buc'),
  price: z.number().min(0).optional(),
  supplier: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  expiryDate: z.string().optional(),
});

const UpdateInventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  supplier: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
});

const AdjustStockSchema = z.object({
  itemId: z.string().uuid(),
  adjustment: z.number(),
  type: z.enum(['restock', 'use', 'adjustment', 'expired', 'return']),
  notes: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToInventoryItem(row: InventoryItemRow): InventoryItem {
  const isLowStock = row.quantity <= row.min_stock;
  const isExpiringSoon =
    row.expiry_date != null &&
    new Date(row.expiry_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category ?? 'General',
    sku: row.sku,
    quantity: row.quantity,
    minStock: row.min_stock,
    maxStock: row.max_stock,
    unit: row.unit,
    price: row.unit_price,
    totalValue: row.total_value ?? 0,
    supplier: row.supplier,
    location: row.location,
    expiryDate: row.expiry_date,
    lastRestocked: row.last_restocked,
    isLowStock,
    isExpiringSoon,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getInventoryAction(): Promise<{ items: InventoryItem[]; error?: string }> {
  try {
    await requirePermission('inventory:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<InventoryItemRow>(
      `SELECT id, name, description, category, sku, quantity, min_stock, max_stock,
              unit, unit_price, total_value, supplier, location, expiry_date, last_restocked
       FROM inventory_items
       WHERE clinic_id = $1 AND is_active = true
       ORDER BY
         CASE WHEN quantity <= min_stock THEN 0 ELSE 1 END,
         CASE WHEN expiry_date IS NOT NULL AND expiry_date < NOW() + INTERVAL '30 days' THEN 0 ELSE 1 END,
         name`,
      [user.clinicId]
    );

    return { items: result.rows.map(rowToInventoryItem) };
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return { items: [], error: 'Failed to fetch inventory' };
  }
}

export async function getInventoryStatsAction(): Promise<{ stats: InventoryStats | null; error?: string }> {
  try {
    await requirePermission('inventory:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_items: string;
      low_stock_items: string;
      expiring_soon: string;
      total_value: string;
    }>(
      `SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE quantity <= min_stock) as low_stock_items,
        COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < NOW() + INTERVAL '30 days') as expiring_soon,
        COALESCE(SUM(total_value), 0) as total_value
       FROM inventory_items
       WHERE clinic_id = $1 AND is_active = true`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalItems: parseInt(row.total_items),
        lowStockItems: parseInt(row.low_stock_items),
        expiringSoon: parseInt(row.expiring_soon),
        totalValue: parseFloat(row.total_value),
      },
    };
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    return { stats: null, error: 'Failed to fetch inventory stats' };
  }
}

export async function createInventoryItemAction(
  data: z.infer<typeof CreateInventoryItemSchema>
): Promise<{ item: InventoryItem | null; error?: string }> {
  try {
    await requirePermission('inventory:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateInventoryItemSchema.parse(data);

    const result = await database.query<InventoryItemRow>(
      `INSERT INTO inventory_items (clinic_id, name, description, category, sku, quantity,
              min_stock, max_stock, unit, unit_price, supplier, location, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, description, category, sku, quantity, min_stock, max_stock,
                 unit, unit_price, total_value, supplier, location, expiry_date, last_restocked`,
      [
        user.clinicId,
        validated.name,
        validated.description ?? null,
        validated.category ?? 'General',
        validated.sku ?? null,
        validated.quantity,
        validated.minStock,
        validated.maxStock ?? null,
        validated.unit,
        validated.price ?? null,
        validated.supplier ?? null,
        validated.location ?? null,
        validated.expiryDate ?? null,
      ]
    );

    return { item: rowToInventoryItem(result.rows[0]) };
  } catch (error) {
    console.error('Error creating inventory item:', error);
    return { item: null, error: 'Failed to create inventory item' };
  }
}

export async function updateInventoryItemAction(
  data: z.infer<typeof UpdateInventoryItemSchema>
): Promise<{ item: InventoryItem | null; error?: string }> {
  try {
    await requirePermission('inventory:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = UpdateInventoryItemSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validated.name);
    }
    if (validated.quantity !== undefined) {
      updates.push(`quantity = $${paramIndex++}`);
      values.push(validated.quantity);
    }
    if (validated.minStock !== undefined) {
      updates.push(`min_stock = $${paramIndex++}`);
      values.push(validated.minStock);
    }
    if (validated.price !== undefined) {
      updates.push(`unit_price = $${paramIndex++}`);
      values.push(validated.price);
    }
    if (validated.supplier !== undefined) {
      updates.push(`supplier = $${paramIndex++}`);
      values.push(validated.supplier);
    }
    if (validated.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(validated.location);
    }

    if (updates.length === 0) {
      return { item: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<InventoryItemRow>(
      `UPDATE inventory_items SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, name, description, category, sku, quantity, min_stock, max_stock,
                 unit, unit_price, total_value, supplier, location, expiry_date, last_restocked`,
      values
    );

    if (result.rows.length === 0) {
      return { item: null, error: 'Item not found' };
    }

    return { item: rowToInventoryItem(result.rows[0]) };
  } catch (error) {
    console.error('Error updating inventory item:', error);
    return { item: null, error: 'Failed to update inventory item' };
  }
}

export async function adjustStockAction(
  data: z.infer<typeof AdjustStockSchema>
): Promise<{ item: InventoryItem | null; error?: string }> {
  try {
    await requirePermission('inventory:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = AdjustStockSchema.parse(data);

    // Start transaction
    const client = await database.connect();
    try {
      await client.query('BEGIN');

      // Get current item
      const itemResult = await client.query<InventoryItemRow & { clinic_id: string }>(
        `SELECT * FROM inventory_items WHERE id = $1 AND clinic_id = $2 FOR UPDATE`,
        [validated.itemId, user.clinicId]
      );

      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { item: null, error: 'Item not found' };
      }

      const item = itemResult.rows[0];
      const newQuantity = item.quantity + validated.adjustment;

      if (newQuantity < 0) {
        await client.query('ROLLBACK');
        return { item: null, error: 'Insufficient stock' };
      }

      // Update item
      const updateResult = await client.query<InventoryItemRow>(
        `UPDATE inventory_items
         SET quantity = $1, last_restocked = CASE WHEN $3 = 'restock' THEN NOW() ELSE last_restocked END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, description, category, sku, quantity, min_stock, max_stock,
                   unit, unit_price, total_value, supplier, location, expiry_date, last_restocked`,
        [newQuantity, validated.itemId, validated.type]
      );

      // Log transaction
      await client.query(
        `INSERT INTO inventory_transactions (item_id, clinic_id, transaction_type, quantity,
                previous_quantity, new_quantity, notes, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          validated.itemId,
          user.clinicId,
          validated.type,
          validated.adjustment,
          item.quantity,
          newQuantity,
          validated.notes ?? null,
          user.id,
        ]
      );

      await client.query('COMMIT');

      return { item: rowToInventoryItem(updateResult.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adjusting stock:', error);
    return { item: null, error: 'Failed to adjust stock' };
  }
}

export async function deleteInventoryItemAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('inventory:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `UPDATE inventory_items SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Item not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return { success: false, error: 'Failed to delete inventory item' };
  }
}
