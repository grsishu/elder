import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/elder_db',
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_6737a04cdbaf5c2e0b39fbd66c63b076',
  encryptionKey: process.env.ENCRYPTION_KEY || 'b818ed8a038fac4323a15b602b08ce44a3024d690c9f2e5c93e5b67ce522b2dd',
  cronSecret: process.env.CRON_SECRET || '274601a5592dd02c4ca783a30da630406bd6e148d75abfad',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:support@smritisaathi.in',
  demoMode: process.env.DEMO_MODE === 'true' || !process.env.TWILIO_ACCOUNT_SID,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
