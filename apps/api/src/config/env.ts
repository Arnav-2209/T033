import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Workspace scripts run with apps/api as the working directory in both source
// and compiled modes, so resolve the ignored root env file from the package.
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
    DATABASE_URL: z.string().min(1).optional(),
    SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(1_440).default(30),
    SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(900),
    API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(100),
    API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
    EVIDENCE_STORAGE_DIR: z.string().min(1).default('.data/evidence'),
    INSTITUTION_TIME_ZONE: z.string().min(1).default('Asia/Kolkata'),
  })
  .refine(
    (environment) =>
      environment.SESSION_IDLE_TIMEOUT_MINUTES < environment.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60,
    { message: 'Idle session timeout must be shorter than absolute session timeout.' },
  );

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
