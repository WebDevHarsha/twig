"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { supabaseBrowser, supabaseConfiguredClientSide } from "@/lib/supabase/client";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const nextUrl = search.get("next") || "/dashboard";
  const callbackError = search.get("error");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("" + (callbackError ? "Could not complete the sign-in link." : ""));
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfiguredClientSide()) {
      setError("Supabase is not configured on this deployment. Set NEXT_PUBLIC_SUPABASE_URL and keys in frontend/.env.local.");
      return;
    }
    const client = supabaseBrowser();
    if (!client) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { error: signUpError, data } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.push(nextUrl);
          router.refresh();
        } else {
          setNotice("Account created. Confirm your email address to sign in.");
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push(nextUrl);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-x flex max-w-sm flex-col py-16">
      <h1 className="text-2xl font-semibold text-sand-600">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-sand-400">Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
              autoComplete="name"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-sand-400">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm outline-none focus:border-pine-400"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-pine-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pine-500 disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-pine-700">{notice}</p>}

      <p className="mt-6 text-sm text-sand-400">
        {mode === "signin" ? "New to TWIG?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
          className="text-pine-600 hover:underline"
        >
          {mode === "signin" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container-x py-16 text-sm text-sand-400">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
