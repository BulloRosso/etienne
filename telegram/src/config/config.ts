import { TelegramConfig } from '../types';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in the telegram directory
// This handles both development (src/) and production (dist/) scenarios
const envPath = path.resolve(__dirname, '../../.env');
console.log(`[Config] Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

export function loadConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
    console.error('');
    console.error('To create a Telegram bot:');
    console.error('1. Open Telegram and search for @BotFather');
    console.error('2. Send /newbot and follow the instructions');
    console.error('3. Copy the bot token and set TELEGRAM_BOT_TOKEN environment variable');
    console.error('');
    console.error('Example:');
    console.error('  export TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"');
    process.exit(1);
  }

  return {
    botToken,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:6060',
    port: parseInt(process.env.TELEGRAM_PORT || '6350', 10),
  };
}
