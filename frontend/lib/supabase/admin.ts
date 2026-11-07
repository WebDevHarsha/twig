import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-side ONLY — bypasses RLS; every call site must
 * already enforce ownership/authorization itself. Never import from a
 * 'use client' module.
 */
let adminClient: SupabaseClient | null | undefined;

export function getAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    adminClient = null;
    return null;
  }
  adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Public (anon-key) client for catalog reads. */
let anonClient: SupabaseClient | null | undefined;

export function getAnonClient(): SupabaseClient | null {
  if (anonClient !== undefined) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    anonClient = null;
    return null;
  }
  anonClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return anonClient;
}
