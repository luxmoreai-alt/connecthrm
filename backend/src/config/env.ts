import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const normalizeEnvValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const normalizeNamedEnvValue = (name: string) => (value: unknown): unknown => {
  let normalized = normalizeEnvValue(value);
  if (typeof normalized === 'string' && normalized.startsWith(`${name}=`)) {
    normalized = normalizeEnvValue(normalized.slice(name.length + 1));
  }
  return normalized;
};

const optionalString = z.preprocess(
  (value) => {
    const normalized = normalizeEnvValue(value);
    return normalized === '' ? undefined : normalized;
  },
  z.string().optional(),
);

const optionalEmail = z.preprocess(
  (value) => {
    const normalized = normalizeEnvValue(value);
    return normalized === '' ? undefined : normalized;
  },
  z.string().email().optional(),
);

const optionalPort = z.preprocess(
  (value) => {
    const normalized = normalizeEnvValue(value);
    return normalized === '' ? undefined : normalized;
  },
  z.coerce.number().positive().optional(),
);

const optionalSmtpPassword = z.preprocess(
  (value) => {
    const normalized = normalizeEnvValue(value);
    if (typeof normalized !== 'string' || normalized === '') return undefined;
    // Gmail displays app passwords in four groups; SMTP expects the 16
    // characters without spaces.
    return normalized.replace(/\s+/g, '');
  },
  z.string().optional(),
);

const timeZone = z.string().default('Asia/Kolkata').refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, 'APP_TIMEZONE must be a valid IANA timezone');

const envSchema = z.object({
  // One canonical connection string for the active database.
  DATABASE_URL: z.preprocess(normalizeNamedEnvValue('DATABASE_URL'), z.string().url()),

  JWT_ACCESS_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  PORT: z.string().default('5000').transform(Number).pipe(z.number().positive()),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_TIMEZONE: timeZone,

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).optional(),

  ADMIN_EMAIL: z.preprocess(normalizeNamedEnvValue('ADMIN_EMAIL'), z.string().email().default('admin@hrms.com')),
  ADMIN_PASSWORD: z.preprocess(normalizeNamedEnvValue('ADMIN_PASSWORD'), z.string().min(6).default('Admin@123')),
  ADMIN_FIRST_NAME: z.preprocess(normalizeNamedEnvValue('ADMIN_FIRST_NAME'), z.string().default('System')),
  ADMIN_LAST_NAME: z.preprocess(normalizeNamedEnvValue('ADMIN_LAST_NAME'), z.string().default('Admin')),

  // SMTP (optional – when not set, credentials are logged to console)
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalSmtpPassword,
  SMTP_FROM: optionalEmail,
  SMTP_FROM_NAME: z.string().default('Connect HR'),
  CHROME_PATH: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString,
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,
  OFFER_SYNC_TOKEN: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidKeys = Object.keys(parsed.error.flatten().fieldErrors);
  throw new Error(`Invalid or missing environment variables: ${invalidKeys.join(', ')}`);
}

export const env = parsed.data;
