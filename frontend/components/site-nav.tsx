"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser, supabaseConfiguredClientSide, loadCurrentUser } from "@/lib/supabase/client";

export function SiteNav() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string | null; fullName: string | null } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!supabaseConfiguredClientSide()) {
      // Deferred so the effect body performs no synchronous state update.
      void Promise.resolve().then(() => setChecked(true));
      return;
    }
    loadCurrentUser().then((u) => {
      setUser(u ? { email: u.email ?? null, fullName: u.fullName } : null);
      setChecked(true);
    });
  }, []);

  async function signOut() {
    const client = supabaseBrowser();
    if (!client) return;
    await client.auth.signOut();
    setUser(null);
    router.refresh();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-sand-50/90 backdrop-blur supports-[backdrop-filter]:bg-sand-50/70">
      <nav className="container-x flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-pine-700">TWIG</span>
          <span className="hidden text-xs text-sand-400 md:inline">data marketplace for agents</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2 text-sm">
          <Link href="/marketplace" className="rounded-md px-3 py-1.5 text-sand-500 hover:bg-pine-50 hover:text-pine-700">
            Marketplace
          </Link>
          <Link href="/custom" className="rounded-md px-3 py-1.5 text-sand-500 hover:bg-pine-50 hover:text-pine-700">
            Custom data
          </Link>
          <Link href="/assistant" className="rounded-md px-3 py-1.5 text-sand-500 hover:bg-pine-50 hover:text-pine-700">
            Assistant
          </Link>
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sand-500 hover:bg-pine-50 hover:text-pine-700">
            Dashboard
          </Link>
          {checked && user ? (
            <button
              onClick={signOut}
              className="rounded-md px-3 py-1.5 text-pine-700 hover:bg-pine-100"
              title={user.email ?? ""}
            >
              Sign out
            </button>
          ) : checked && !user ? (
            <Link
              href="/login"
              className="rounded-md bg-pine-600 px-3 py-1.5 font-medium text-white hover:bg-pine-500"
            >
              Sign in
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-xs text-sand-400" aria-hidden>…</span>
          )}
        </div>
      </nav>
    </header>
  );
}
