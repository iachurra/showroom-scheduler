"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut } from "./lib/auth";

export default function LandingClient() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data } = await getSession();
      const session = data?.session ?? null;
      if (!mounted) return;
      setIsAuthed(!!session);
    }
    check();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    await signOut();
    setIsAuthed(false);
    router.push("/");
  }

  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Showroom Scheduler</h1>
      <p style={{ maxWidth: 520 }}>
        A tiny scheduler to book showroom appointments. Pick a date and a time,
        then confirm your booking.
      </p>

      {isAuthed ? (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => router.push("/scheduler")} style={{ marginRight: 8, padding: "8px 12px" }}>
            Go to scheduler
          </button>
          <button onClick={handleLogout} style={{ padding: "8px 12px" }}>
            Log out
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => router.push("/scheduler")} style={{ marginRight: 8, padding: "8px 12px" }}>
            Book an appointment
          </button>
          <button onClick={() => router.push("/login")} style={{ marginRight: 8, padding: "8px 12px" }}>
            Log in
          </button>
          <button onClick={() => router.push("/signup")} style={{ padding: "8px 12px" }}>
            Create account
          </button>
        </div>
      )}
    </main>
  );
}
