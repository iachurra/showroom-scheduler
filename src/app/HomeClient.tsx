"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "./lib/auth";



type AvailabilityResponse = {
  date: string;
  timezone: string;
  open: string;
  close: string;
  slots: string[];
  booked?: string[];
};

const todayISO = new Date().toISOString().split("T")[0];

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialDate = searchParams.get("date") || todayISO;
  const [date, setDate] = useState(initialDate);

  const [slots, setSlots] = useState<string[]>([]);
  const [booked, setBooked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // FIX: status is ALWAYS a string
  const [status, setStatus] = useState<string>("");

  const [isAuthed, setIsAuthed] = useState<boolean>(false);

  /* ---------------- AUTH CHECK ---------------- */

  useEffect(() => {
    (async () => {
      const { data } = await getSession();
      const session = data?.session ?? null;
      setIsAuthed(!!session);
      if (session?.user?.email) setEmail(session.user.email);
    })();
  }, []);

  /* ---------------- LOAD AVAILABILITY ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("");
      setSelected(null);

      try {
        const res = await fetch(`/api/appointments?date=${date}`);

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setStatus(err?.error ?? "Failed to load availability");
          return;
        }

        const data: AvailabilityResponse = await res.json();

        if (!cancelled) {
          setSlots(data.slots ?? []);
          setBooked(data.booked ?? []);
        }
      } catch {
        if (!cancelled) setStatus("Failed to load availability");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  /* ---------------- TIME SELECT ---------------- */

  function handleTimeClick(time: string) {
    if (!isAuthed) {
      const params = new URLSearchParams();
      params.set("redirect", "/");
      params.set("date", date);
      params.set("time", time);
      router.push(`/login?${params.toString()}`);
      return;
    }

    setSelected(time);
  }

  /* ---------------- BOOK ---------------- */

  async function book() {
    if (!selected) return;

    if (!name || !email) {
      setStatus("Name and email are required");
      return;
    }

    setStatus("Booking…");

    let tokenHeader: Record<string, string> = {};

    try {
      const s = await getSession();
      const token = s?.data?.session?.access_token;
      if (token) tokenHeader = { Authorization: `Bearer ${token}` };
    } catch {}

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...tokenHeader,
        },
        body: JSON.stringify({
          date,
          startTime: selected,
          duration: 30,
          name,
          email,
          phone: phone || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // FIX: normalize all errors into strings
        setStatus(
          typeof data?.error === "string"
            ? data.error
            : res.status === 401
            ? "Unauthorized"
            : "Failed to create appointment"
        );
        return;
      }

      setStatus("Booked successfully!");
      setSelected(null);
      setName("");
      setPhone("");

      // Refresh availability
      const refresh = await fetch(`/api/appointments?date=${date}`);
      if (refresh.ok) {
        const refreshed: AvailabilityResponse = await refresh.json();
        setSlots(refreshed.slots ?? []);
        setBooked(refreshed.booked ?? []);
      }
    } catch {
      setStatus("Network error while booking");
    }
  }

  /* ---------------- RENDER ---------------- */

  return (
    <main style={{ padding: 32 }}>
      <h1>Showroom Scheduler</h1>

      <label>
        Date:&nbsp;
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <h2>Available Slots</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {slots.map((s) => {
          const isBooked = booked.includes(s);
          return (
            <button
              key={s}
              disabled={isBooked}
              onClick={() => handleTimeClick(s)}
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
        <div style={{ marginTop: 24 }}>
          <p>Selected time: {selected}</p>

          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <button onClick={book}>Confirm Booking</button>
        </div>
      )}

      {status && (
        <p
          style={{
            marginTop: 16,
            color: status.includes("success") ? "green" : "red",
          }}
        >
          {status}
        </p>
      )}
    </main>
  );
}
