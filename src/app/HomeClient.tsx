"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "./lib/auth";

type AvailabilityResponse = {
  date: string;
  timezone: string;
  open: string;
  close: string;
  slotMinutes: number;
  slots: string[];
  booked: string[];
};

const todayISO = new Date().toISOString().split("T")[0];

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use date from URL if present so redirects can restore context
  const initialDate = searchParams.get("date") || todayISO;
  const [date, setDate] = useState(initialDate);

  const [slots, setSlots] = useState<string[]>([]);
  const [booked, setBooked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [status, setStatus] = useState("");
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  // Check auth once on mount (non-blocking)
  useEffect(() => {
    async function checkAuth() {
      const { data } = await getSession();
      const session = data?.session ?? null;
      setIsAuthed(!!session);
      if (session?.user?.email) setEmail(session.user.email);
    }

    checkAuth();
  }, []);

  // Restore selection after returning from login/signup
  useEffect(() => {
    if (!isAuthed) return;

    const time = searchParams.get("time");
    if (time) {
      // defer to avoid synchronous setState during render
      queueMicrotask(() => setSelected(time));
    }
  }, [isAuthed, searchParams]);

  // Load availability when date changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
  setSelected(null);
  // Don't set a persistent loading string; show provisional slots immediately
  setStatus("");

      // show provisional slots immediately so UI isn't blank while fetching
      try {
        setSlots(generateProvisionalSlots());
        setBooked([]);
      } catch {}

      const controller = new AbortController();
  const TIMEOUT_MS = 15000; // 15s to accommodate slower local DB responses
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const fetchStart = Date.now();
      // debug: log origin and fetch start to help diagnose timeouts
      function generateProvisionalSlots(open = "09:00", close = "17:00", minutes = 30) {
        const slots: string[] = [];
        const [oh, om] = open.split(":").map(Number);
        const [ch, cm] = close.split(":").map(Number);
        let cursor = new Date();
        cursor.setHours(oh, om, 0, 0);
        const end = new Date();
        end.setHours(ch, cm, 0, 0);
        while (cursor < end) {
          const hh = String(cursor.getHours()).padStart(2, "0");
          const mm = String(cursor.getMinutes()).padStart(2, "0");
          slots.push(`${hh}:${mm}`);
          cursor = new Date(cursor.getTime() + minutes * 60000);
        }
        return slots;
      }

      try {
        console.debug("Availability fetch start", { origin: typeof window !== 'undefined' ? window.location.origin : 'server', date });
      } catch {}

      try {
        const res = await fetch(`/api/appointments?date=${date}`, { signal: controller.signal });

  const fetchDuration = Date.now() - fetchStart;
  console.debug("Availability fetch finished", { durationMs: fetchDuration, ok: res.ok });

  if (!res.ok) {
          // try to parse error body, but guard against non-json
          let errText = "Failed to load availability";
          try {
            const err = await res.json();
            errText = err?.error || errText;
          } catch {}
          if (!cancelled) {
            setStatus(errText);
            // show provisional slots so UI remains usable
            setSlots(generateProvisionalSlots());
            setBooked([]);
          }
          return;
        }

        // safe parse
        let data: AvailabilityResponse | null = null;
        try {
          data = await res.json();
        } catch {
          if (!cancelled) {
            setStatus("Failed to parse availability response");
            setSlots(generateProvisionalSlots());
            setBooked([]);
          }
          return;
        }

        if (!data) {
          if (!cancelled) setStatus("No availability data returned");
          return;
        }

        if (!cancelled) {
          setSlots(data.slots || []);
          setBooked(data.booked || []);
          setStatus("");
        }
  } catch (errUnknown: unknown) {
        const isAbort = (errUnknown as Error & { name?: string }).name === 'AbortError';
        if (isAbort) {
          console.warn('Availability fetch aborted (timeout)');
          if (!cancelled) {
            setStatus('Request timed out, please retry');
            setSlots(generateProvisionalSlots());
            setBooked([]);
          }
        } else {
          let msg: string;
          if (typeof errUnknown === "object" && errUnknown !== null && "message" in errUnknown) {
            msg = String((errUnknown as { message?: unknown }).message ?? "");
          } else {
            msg = String(errUnknown);
          }
          console.error("Error fetching availability:", msg);
          if (!cancelled) {
            setStatus("Failed to load availability");
            setSlots(generateProvisionalSlots());
            setBooked([]);
          }
        }
      } finally {
        clearTimeout(timeout);
        console.debug("Availability load finally", { cancelled });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [date]);

  async function handleTimeClick(time: string) {
    // If not authed, redirect to login and preserve intent
    if (!isAuthed) {
      // Per requirement: /login?redirect=/?date=YYYY-MM-DD&time=HH:mm
      const params = new URLSearchParams();
      params.set("redirect", "/");
      params.set("date", date);
      params.set("time", time);
      router.push(`/login?${params.toString()}`);
      return;
    }

    setSelected(time);
  }

  async function book() {
    if (!selected) return;

    if (!name || !email) {
      setStatus("Name and email are required.");
      return;
    }

    setStatus("Booking...");

    // Include access token when available to support token auth on server
    let tokenHeader: Record<string, string> = {};
    try {
      const s = await getSession();
      const token = s?.data?.session?.access_token;
      if (token) tokenHeader = { Authorization: `Bearer ${token}` };
    } catch {}

    // Fallback: try to read Supabase token from localStorage (dev setups may store session there)
    if (!tokenHeader.Authorization && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('supabase.auth.token');
        if (raw) {
          const parsed = JSON.parse(raw);
          const token = parsed?.currentSession?.access_token || parsed?.access_token || parsed?.currentSession?.provider_token;
          if (token) tokenHeader = { Authorization: `Bearer ${token}` };
        }
      } catch {}
    }

    // Debug: log what token header will be sent and a short preview of localStorage
    try {
      console.debug('Booking tokenHeader', tokenHeader);
      if (typeof window !== 'undefined') {
        const rawPreview = localStorage.getItem('supabase.auth.token') || null;
        console.debug('localStorage.supabase.auth.token (preview)', rawPreview ? `${rawPreview.slice(0,200)}` : null);
      }
    } catch {}

    let res: Response;
    try {
      res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tokenHeader },
        body: JSON.stringify({
          date,
          startTime: selected,
          duration: 30,
          name,
          email,
          phone: phone || undefined,
        }),
      });
    } catch (fetchErr) {
      console.error('Network error when POST /api/appointments', fetchErr);
      setStatus('Network error while booking');
      return;
    }

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // ignore parse errors
    }

    if (!res.ok) {
      // log response body for debugging
      try {
        const text = await res.text();
        console.error('Booking failed, response body:', text);
      } catch {}

      // safe check for error message
      let errMsg: string | null = null;
      if (typeof data === "object" && data !== null && "error" in data) {
        errMsg = (data as { error?: string }).error ?? null;
      }
      setStatus(errMsg || "Booking failed");
      return;
    }

    setStatus("Booked successfully!");
    setSelected(null);
    setName("");
    setEmail("");
    setPhone("");

    // refresh availability
    const refresh = await fetch(`/api/appointments?date=${date}`);
    if (refresh.ok) {
      const refreshed: AvailabilityResponse = await refresh.json();
      setSlots(refreshed.slots);
      setBooked(refreshed.booked);
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Showroom Scheduler</h1>

      <label style={{ display: "block", marginBottom: 16 }}>
        Date:&nbsp;
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <h2>Available Slots</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {slots.map((s) => {
          const isBooked = booked.includes(s);

          return (
            <button
              key={s}
              disabled={isBooked}
              onClick={() => !isBooked && handleTimeClick(s)}
              style={{
                padding: "8px 12px",
                border: selected === s ? "2px solid black" : "1px solid #ccc",
                background: isBooked
                  ? "#444"
                  : selected === s
                  ? "#eaeaea"
                  : "#fff",
                color: isBooked ? "#999" : "#000",
                cursor: isBooked ? "not-allowed" : "pointer",
                opacity: isBooked ? 0.5 : 1,
              }}
            >
              {new Date(`1970-01-01T${s}:00`).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </button>
          );
        })}
      </div>

      {isAuthed && selected && (
        <div style={{ marginTop: 24, maxWidth: 320 }}>
          <p>
            Selected time: {" "}
            {new Date(`1970-01-01T${selected}:00`).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>

          <label style={{ display: "block", marginBottom: 8 }}>
            Name *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            Email *
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            Phone (optional)
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </label>

          <button onClick={book} style={{ padding: "8px 12px" }}>
            Confirm Booking
          </button>
        </div>
      )}

      {status && (
        <div style={{ marginTop: 16 }}>
          <p
            style={{
              marginTop: 0,
              color: status.toLowerCase().includes("success")
                ? "#22c55e"
                : "#f87171",
            }}
          >
            {status}
          </p>
          {status.toLowerCase().includes("failed") || status.toLowerCase().includes("timed out") ? (
            <button onClick={() => setDate(date)} style={{ padding: "6px 10px", marginTop: 8 }}>
              Retry
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
