/**
 * Supabase Admin client — SERVER-SIDE ONLY.
 *
 * ⚠️  WARNING: Never import this file in any client component or 'use client' file.
 *     SUPABASE_SERVICE_ROLE_KEY has full database access and must never be
 *     exposed to the browser.
 *
 * Usage:
 *   import { supabaseAdmin } from "@/lib/supabase";
 *   await supabaseAdmin.storage.from("videos").upload(...)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase admin client.
 * Lazy-initialised on first call so missing env vars only throw at
 * request time (not at build time on Vercel).
 */
function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables."
    );
  }

  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable auto-refresh and session persistence — not needed server-side
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

/**
 * Supabase admin client proxy.
 * Access it like a normal client: supabaseAdmin.storage.from(...)
 * The real client is created lazily on first property access.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});
