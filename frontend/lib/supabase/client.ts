/**
 * Browser Supabase client (stores the session in cookies, per @supabase/ssr).
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}

export function supabaseConfiguredClientSide(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export type BrowserUser = {
  id: string;
  email: string | undefined;
  fullName: string | null;
};

export async function loadCurrentUser(): Promise<BrowserUser | null> {
  const client = supabaseBrowser();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    fullName:
      (data.user.user_metadata?.full_name as string | undefined) ??
      data.user.email ??
      null,
  };
}
