"use client";

import { useEffect, useState } from "react";

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
  const [date, setDate] = useState(todayISO);
  const [slots, setSlots] = useState<string[]>([]);
  const [booked, setBooked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [status, setStatus] = useState("");

  // Load availability when date changes
  useEffect(() => {
    async function load() {
      setSelected(null);
      setStatus("Loading availability...");

      const res = await fetch(`/api/appointments?date=${date}`);
      const data: AvailabilityResponse = await res.json();

      setSlots(data.slots);
      setBooked(data.booked);
      setStatus("");
    }

    load();
  }, [date]);

  async function book() {
    if (!selected) return;

    if (!name || !email) {
      setStatus("Name and email are required.");
      return;
    }

    setStatus("Booking...");

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        startTime: selected,
        duration: 30,
        name,
        email,
        phone: phone || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Booking failed");
      return;
    }

    setStatus("Booked successfully!");
    setSelected(null);
    setName("");
    setEmail("");
    setPhone("");

    const refresh = await fetch(`/api/appointments?date=${date}`);
    const refreshed: AvailabilityResponse = await refresh.json();
    setSlots(refreshed.slots);
    setBooked(refreshed.booked);
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
              onClick={() => !isBooked && setSelected(s)}
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

      {selected && (
        <div style={{ marginTop: 24, maxWidth: 320 }}>
          <p>
            Selected time:{" "}
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
        <p
          style={{
            marginTop: 16,
            color: status.toLowerCase().includes("success")
              ? "#22c55e"
              : "#facc15",
          }}
        >
          {status}
        </p>
      )}
    </main>
  );
}
