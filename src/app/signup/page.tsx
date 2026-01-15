"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signUp } from "../lib/auth";

export default function SignupPage() {
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

    const { error } = await signUp(email, password);

    if (error) {
      setMessage(error.message);
      return;
    }

    // After signup, send user to login with preserved params so they can log in and continue
    const params = new URLSearchParams();
    if (redirectTo) params.set("redirect", redirectTo);
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    if (email) params.set("email", email);

    router.push(`/login?${params.toString()}`);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Create Account</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: 6, marginBottom: 8 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 6, marginBottom: 8 }}
        />

        <button type="submit" style={{ padding: "8px 12px" }}>
          Sign up
        </button>
      </form>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </main>
  );
}
