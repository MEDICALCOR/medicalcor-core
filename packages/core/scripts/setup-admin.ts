#!/usr/bin/env node
/**
 * Auth Setup Script
 * Creates the initial admin user for MedicalCor Cortex
 *
 * Usage:
 *   npx ts-node scripts/setup-admin.ts
 *   # or
 *   node dist/scripts/setup-admin.js
 *
 * Environment variables required:
 *   DATABASE_URL - PostgreSQL connection string
 *
 * Optional environment variables:
 *   ADMIN_EMAIL - Admin email (default: prompted)
 *   ADMIN_PASSWORD - Admin password (default: prompted)
 *   ADMIN_NAME - Admin name (default: "Administrator")
 */

import { createInterface } from 'readline';
import { createHash, randomBytes } from 'crypto';

// Dynamic imports for optional dependencies
async function main() {
  const bcrypt = await import('bcryptjs');
  const { Pool } = await import('pg');

  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const questionHidden = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      process.stdout.write(prompt);
      const stdin = process.stdin;
      stdin.setRawMode?.(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let password = '';
      const onData = (char: string) => {
        if (char === '\n' || char === '\r') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit();
        } else if (char === '\u007F') {
          // Backspace
          password = password.slice(0, -1);
        } else {
          password += char;
          process.stdout.write('*');
        }
      };
      stdin.on('data', onData);
    });

  console.log('\n🔐 MedicalCor Cortex - Admin Setup\n');
  console.log('This script will create the initial admin user.\n');

  // Get admin details
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Administrator';

  if (!email) {
    email = await question('Admin email: ');
  }

  if (!password) {
    password = await questionHidden('Admin password: ');
    const confirmPassword = await questionHidden('Confirm password: ');

    if (password !== confirmPassword) {
      console.error('\n❌ Passwords do not match');
      rl.close();
      process.exit(1);
    }
  }

  // Validate password
  if (password.length < 8) {
    console.error('\n❌ Password must be at least 8 characters');
    rl.close();
    process.exit(1);
  }

  if (!/[A-Z]/.test(password)) {
    console.error('\n❌ Password must contain at least one uppercase letter');
    rl.close();
    process.exit(1);
  }

  if (!/[a-z]/.test(password)) {
    console.error('\n❌ Password must contain at least one lowercase letter');
    rl.close();
    process.exit(1);
  }

  if (!/[0-9]/.test(password)) {
    console.error('\n❌ Password must contain at least one number');
    rl.close();
    process.exit(1);
  }

  rl.close();

  // Connect to database
  console.log('\n📡 Connecting to database...');
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Check if admin already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existing.rows.length > 0) {
      console.log('\n⚠️  An admin user already exists.');
      const continueAnyway = process.env.FORCE_CREATE === 'true';
      if (!continueAnyway) {
        console.log('Set FORCE_CREATE=true to create another admin.\n');
        await pool.end();
        process.exit(0);
      }
    }

    // Hash password
    console.log('🔒 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    console.log('👤 Creating admin user...');
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, status, email_verified)
       VALUES ($1, $2, $3, 'admin', 'active', true)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    const user = result.rows[0];

    // Log the event
    await pool.query(
      `INSERT INTO auth_events (user_id, email, event_type, result, details)
       VALUES ($1, $2, 'user_created', 'success', $3)`,
      [user.id, user.email, JSON.stringify({ createdBy: 'setup-script', role: 'admin' })]
    );

    console.log('\n✅ Admin user created successfully!\n');
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   Role:', user.role);
    console.log('   Created:', user.created_at);
    console.log('\n🎉 You can now login at /login\n');

  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      console.error('\n❌ A user with this email already exists');
    } else if ((error as { code?: string }).code === '42P01') {
      console.error('\n❌ Auth tables not found. Run the migration first:');
      console.error('   psql $DATABASE_URL < packages/core/src/auth/schema.sql\n');
    } else {
      console.error('\n❌ Failed to create admin:', error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
