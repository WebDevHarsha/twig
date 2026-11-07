import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server client bound to the request cookies. Use for auth checks in
 * Route Handlers and Server Components.
 */
export async function createSupabaseServerClient(): Promise<
  SupabaseClient | null
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render: cookie refresh is handled
          // by the proxy middleware (proxy.ts) in that case.
        }
      },
    },
  });
}

/** Resolve the signed-in user, or null. */
export async function getServerUser(): Promise<
  { id: string; email: string | null } | null
> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}
