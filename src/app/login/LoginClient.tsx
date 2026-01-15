"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "../lib/auth";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = searchParams.get("redirect") || "/";
  const date = searchParams.get("date") || "";
  const time = searchParams.get("time") || "";
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
  type SignInResult = { data?: { session?: { access_token?: string } }; error?: { message?: string } };
  const result = (await signIn(email, password)) as unknown as SignInResult;
  const error = result.error;
  const session = result.data?.session;

    if (error) {
      setMessage(error.message ?? 'Login failed');
      return;
    }

    // Persist token in localStorage for dev environments where cookies are
    // not set/visible to the server. This allows the client to attach an
    // Authorization header on POST and the server to validate the token.
    try {
      const token = session?.access_token;
      if (token && typeof window !== 'undefined') {
        const payload = {
          currentSession: { access_token: token },
          access_token: token,
        };
        localStorage.setItem('supabase.auth.token', JSON.stringify(payload));
      }
    } catch {}

    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (time) params.set("time", time);

    const destination = params.toString()
      ? `${redirectTo}?${params.toString()}`
      : redirectTo;

    router.push(destination);
  }

  function signupHref() {
    const params = new URLSearchParams();
    if (redirectTo) params.set("redirect", redirectTo);
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    if (email) params.set("email", email);
    return `/signup?${params.toString()}`;
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Log in</h1>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 6 }}
          />
        </label>

        <button type="submit" style={{ padding: "8px 12px" }}>
          Log in
        </button>
      </form>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}

      <p style={{ marginTop: 12 }}>
        Don&apos;t have an account? <a href={signupHref()}>Create one</a>
      </p>
    </main>
  );
}
