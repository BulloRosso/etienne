import { TeamsConfig } from '../types';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file in the ms-teams directory
// This handles both development (src/) and production (dist/) scenarios
const envPath = path.resolve(__dirname, '../../.env');
console.log(`[Config] Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

export function loadConfig(): TeamsConfig {
  const microsoftAppId = process.env.MICROSOFT_APP_ID;
  const microsoftAppPassword = process.env.MICROSOFT_APP_PASSWORD;

  if (!microsoftAppId || !microsoftAppPassword) {
    console.error('Error: MICROSOFT_APP_ID and MICROSOFT_APP_PASSWORD environment variables are required');
    console.error('');
    console.error('To create a Teams bot:');
    console.error('1. Go to Azure Portal -> Create a resource -> Azure Bot');
    console.error('2. Copy the Microsoft App ID from Configuration');
    console.error('3. Click "Manage" next to App ID -> Certificates & secrets -> New client secret');
    console.error('4. Copy the secret value (this is your MICROSOFT_APP_PASSWORD)');
    console.error('5. Add the Teams channel to your bot');
    console.error('');
    console.error('Example .env file:');
    console.error('  MICROSOFT_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
    console.error('  MICROSOFT_APP_PASSWORD=your-client-secret-value');
    process.exit(1);
  }

  return {
    microsoftAppId,
    microsoftAppPassword,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:6060',
    port: parseInt(process.env.TEAMS_PORT || '6360', 10),
  };
}
