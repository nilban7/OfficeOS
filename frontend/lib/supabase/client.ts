import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";

let clientInstance: SupabaseClient | null = null;

/**
 * Creates or returns a singleton Supabase client for browser contexts.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // Return fresh instance for server render contexts
    return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }

  if (!clientInstance) {
    clientInstance = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }

  return clientInstance;
}
