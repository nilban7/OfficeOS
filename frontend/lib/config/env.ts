/**
 * Safe client-side environment configuration.
 * Exposes only public environment variables prefixed with NEXT_PUBLIC_.
 */

export interface EnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
  appUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const nodeEnv = process.env.NODE_ENV || "development";

export const env: EnvConfig = {
  supabaseUrl,
  supabaseAnonKey,
  apiUrl,
  appUrl,
  isProduction: nodeEnv === "production",
  isDevelopment: nodeEnv === "development",
  isTest: nodeEnv === "test",
};

/**
 * Validates that critical environment variables are provided.
 * Useful for runtime health checks and startup logs.
 */
export function validateClientEnv(): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!process.env.NEXT_PUBLIC_API_URL) {
    missing.push("NEXT_PUBLIC_API_URL");
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}
