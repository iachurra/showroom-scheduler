"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Per the required URL shape: /login?redirect=/?date=YYYY-MM-DD&time=HH:mm
  const redirectTo = searchParams.get("redirect") || "/";
  const date = searchParams.get("date") || "";
  const time = searchParams.get("time") || "";
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState<string>(prefillEmail);
  const [password, setPassword] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const { error } = await signIn(email, password);
    if (error) {
      setMessage(error.message);
      return;
    }

    // Build a redirect back to the redirectTo with date/time preserved
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (time) params.set("time", time);

    const destination = params.toString() ? `${redirectTo}?${params.toString()}` : redirectTo;
    router.push(destination);
  }

  // Create account link preserves redirect + date + time + email
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
        Don't have an account? <a href={signupHref()}>Create one</a>
      </p>
    </main>
  );
}
