/**
 * Generate a bcrypt hash for a password.
 *
 * Usage: npm run hash-password <password>
 * Example: npm run hash-password mySecurePassword123
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password <password>');
  console.error('Example: npm run hash-password mySecurePassword123');
  process.exit(1);
}

const hash = await bcrypt.hash(password, SALT_ROUNDS);

console.log('\nPassword hash generated:\n');
console.log(hash);
console.log('\nCopy this hash into users.json for the passwordHash field.\n');
