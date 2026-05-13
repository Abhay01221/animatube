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
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
  );
}

/**
 * Supabase admin client with service role key.
 * Bypasses Row Level Security — use only in server-side code.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    // Disable auto-refresh and session persistence — not needed for server-side usage
    autoRefreshToken: false,
    persistSession: false,
  },
});
