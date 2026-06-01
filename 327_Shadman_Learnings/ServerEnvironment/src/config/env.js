import dotenv from 'dotenv';

dotenv.config();

/**
 * Validates that all required environment variables are set.
 * Fails fast at startup with a clear error message if anything is missing.
 */
const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DROPBOX_CLIENT_ID',
  'DROPBOX_CLIENT_SECRET',
  'APP_URL',
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error('\n❌ Missing required environment variables:\n');
  missing.forEach((key) => console.error(`   - ${key}`));
  console.error('\n   Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  appUrl: process.env.APP_URL,

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },

  dropbox: {
    clientId: process.env.DROPBOX_CLIENT_ID,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET,
  },
};

export default env;
