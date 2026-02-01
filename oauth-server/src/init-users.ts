/**
 * Script to initialize users.json with properly hashed passwords.
 * Run this once to generate the initial user database.
 *
 * Usage: npx tsx src/init-users.ts
 */

import bcrypt from 'bcrypt';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../config/users.json');

const SALT_ROUNDS = 10;

interface UserConfig {
  users: {
    id: string;
    username: string;
    passwordHash: string;
    role: string;
    displayName: string;
    enabled: boolean;
  }[];
  settings: {
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    jwtSecret: string;
  };
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('Initializing users.json with hashed passwords...\n');

  // Default passwords (change these in production!)
  const defaultPasswords: Record<string, string> = {
    admin: 'admin123',
    user: 'user123',
    guest: 'guest123',
  };

  const adminHash = await hashPassword(defaultPasswords.admin);
  const userHash = await hashPassword(defaultPasswords.user);
  const guestHash = await hashPassword(defaultPasswords.guest);

  const config: UserConfig = {
    users: [
      {
        id: 'u1',
        username: 'admin',
        passwordHash: adminHash,
        role: 'admin',
        displayName: 'Administrator',
        enabled: true,
      },
      {
        id: 'u2',
        username: 'user',
        passwordHash: userHash,
        role: 'user',
        displayName: 'Standard User',
        enabled: true,
      },
      {
        id: 'u3',
        username: 'guest',
        passwordHash: guestHash,
        role: 'guest',
        displayName: 'Guest User',
        enabled: true,
      },
    ],
    settings: {
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      jwtSecret: 'change-this-secret-in-production-' + Math.random().toString(36).substring(2),
    },
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('users.json created successfully!\n');
  console.log('Default credentials:');
  console.log('  admin / admin123 (role: admin)');
  console.log('  user  / user123  (role: user)');
  console.log('  guest / guest123 (role: guest)');
  console.log('\n⚠️  Change these passwords in production!');
}

main().catch(console.error);
