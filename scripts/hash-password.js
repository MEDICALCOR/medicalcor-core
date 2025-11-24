#!/usr/bin/env node

/**
 * Password Hash Generator for MedicalCor Core
 *
 * Generates bcrypt password hashes for use in environment variables.
 * Uses cost factor 12 (suitable for development) or 14 (recommended for production).
 *
 * Usage:
 *   node scripts/hash-password.js [password] [--production]
 *
 * Examples:
 *   node scripts/hash-password.js                     # Interactive mode
 *   node scripts/hash-password.js MyPassword123!      # Direct mode
 *   node scripts/hash-password.js --production        # Production cost factor (14)
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const passwordArg = args.find((arg) => !arg.startsWith('--'));

// Cost factor: 12 for dev (fast), 14 for production (secure)
const COST_FACTOR_DEV = 12;
const COST_FACTOR_PROD = 14;
const costFactor = isProduction ? COST_FACTOR_PROD : COST_FACTOR_DEV;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function printBanner() {
  console.log(colors.cyan + colors.bright);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      MedicalCor Core - Password Hash Generator        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
}

function printUsage() {
  console.log(colors.yellow + 'Usage:' + colors.reset);
  console.log('  node scripts/hash-password.js [password] [--production]');
  console.log('');
  console.log(colors.yellow + 'Options:' + colors.reset);
  console.log('  --production    Use cost factor 14 (slower but more secure)');
  console.log('');
  console.log(colors.yellow + 'Examples:' + colors.reset);
  console.log('  node scripts/hash-password.js                     # Interactive');
  console.log('  node scripts/hash-password.js MyPassword123!      # Direct');
  console.log('  node scripts/hash-password.js --production        # Prod mode');
  console.log('');
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    console.error(colors.red + '❌ Password must be at least 8 characters long' + colors.reset);
    return false;
  }

  // Check for common weak patterns
  const weakPatterns = [
    'password',
    '12345678',
    'qwerty',
    'admin',
    'letmein',
    'welcome',
  ];

  const lowerPassword = password.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lowerPassword.includes(pattern)) {
      console.warn(
        colors.yellow + '⚠️  Warning: Password contains common weak pattern: ' + pattern + colors.reset
      );
      break;
    }
  }

  return true;
}

async function hashPassword(password) {
  if (!validatePassword(password)) {
    process.exit(1);
  }

  console.log('');
  console.log(colors.cyan + '🔐 Hashing password...' + colors.reset);
  console.log(colors.cyan + `   Cost factor: ${costFactor} (${isProduction ? 'production' : 'development'})` + colors.reset);

  const startTime = Date.now();
  const hash = await bcrypt.hash(password, costFactor);
  const duration = Date.now() - startTime;

  console.log(colors.green + colors.bright + '✅ Password hash generated!' + colors.reset);
  console.log(colors.green + `   Time taken: ${duration}ms` + colors.reset);
  console.log('');

  console.log(colors.bright + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
  console.log(colors.bright + 'Hash:' + colors.reset);
  console.log(colors.green + hash + colors.reset);
  console.log(colors.bright + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
  console.log('');

  console.log(colors.yellow + '📝 Add to your .env file:' + colors.reset);
  console.log('');
  console.log(colors.cyan + 'AUTH_ADMIN_EMAIL=your-email@example.com' + colors.reset);
  console.log(colors.cyan + `AUTH_ADMIN_PASSWORD_HASH=${hash}` + colors.reset);
  console.log(colors.cyan + 'AUTH_ADMIN_NAME=Your Name' + colors.reset);
  console.log('');

  console.log(colors.yellow + '🔒 Security Tips:' + colors.reset);
  console.log('  • Never commit .env files to version control');
  console.log('  • Use strong, unique passwords (12+ characters)');
  console.log('  • Include uppercase, lowercase, numbers, and symbols');
  console.log('  • Rotate passwords regularly in production');
  console.log('  • Use cost factor 14+ for production environments');
  console.log('');
}

async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(colors.bright + 'Enter password to hash: ' + colors.reset, (password) => {
      rl.close();

      // Mask password in terminal history by clearing line
      process.stdout.write('\r\x1b[K');

      if (!password) {
        console.error(colors.red + '❌ No password provided' + colors.reset);
        process.exit(1);
      }

      resolve(password);
    });

    // Hide password input
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (stringToWrite.charCodeAt(0) === 13) {
        rl.output.write('\n');
      } else {
        rl.output.write('*');
      }
    };
  });
}

async function main() {
  printBanner();

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  console.log(colors.cyan + `Mode: ${isProduction ? '🏭 Production' : '🛠️  Development'}` + colors.reset);
  console.log(colors.cyan + `Cost Factor: ${costFactor}` + colors.reset);
  console.log('');

  let password;

  if (passwordArg) {
    // Direct mode - password provided as argument
    password = passwordArg;
    console.warn(
      colors.yellow +
        '⚠️  Warning: Password provided as CLI argument (visible in shell history)' +
        colors.reset
    );
    console.warn(colors.yellow + '   Use interactive mode for better security' + colors.reset);
    console.log('');
  } else {
    // Interactive mode - prompt for password
    password = await interactiveMode();
  }

  await hashPassword(password);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(colors.red + '❌ Error:', error.message + colors.reset);
    process.exit(1);
  });
}

module.exports = { hashPassword };
