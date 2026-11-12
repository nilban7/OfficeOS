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

const isBrowser = typeof window !== "undefined";
const isVercel = isBrowser && window.location.hostname.includes("vercel.app");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mhqdddiomxersdouvimc.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Safe dynamic resolution: when running on Vercel or in production without an overridden API URL,
// use the production Render backend instead of crashing on localhost!
const defaultCloudApiUrl = "https://officeos-rwls.onrender.com/api/v1";
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;
const apiUrl =
  rawApiUrl && !rawApiUrl.includes("localhost")
    ? rawApiUrl
    : (isVercel || process.env.NODE_ENV === "production")
    ? defaultCloudApiUrl
    : rawApiUrl || "http://localhost:8000/api/v1";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || (isVercel ? `https://${window.location.host}` : "http://localhost:3000");

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
