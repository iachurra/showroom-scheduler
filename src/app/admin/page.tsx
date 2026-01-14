"use client";

import { useEffect, useState } from "react";

type Appointment = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  startTime: string;
};

export default function AdminPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    startTime: "",
  });

  // -------------------------
  // FETCH
  // -------------------------
  const fetchAppointments = async () => {
    setLoading(true);
    const res = await fetch("/api/appointments/admin/appointments");
    const data = await res.json();
    setAppointments(data);
    setLoading(false);
  };

useEffect(() => {
  async function load() {
    setLoading(true);

    const res = await fetch("/api/appointments/admin/appointments");
    const data = await res.json();

    setAppointments(data);
    setLoading(false);
  }

  load();
}, []);


  // -------------------------
  // DELETE
  // -------------------------
  const cancelAppointment = async (id: number) => {
    if (!confirm("Cancel this appointment?")) return;

    await fetch(`/api/appointments/admin/appointments?id=${id}`, {
      method: "DELETE",
    });

    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  // -------------------------
  // EDIT
  // -------------------------
  const startEdit = (a: Appointment) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      email: a.email,
      phone: a.phone ?? "",
      startTime: a.startTime,
    });
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/appointments/admin/appointments?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setEditingId(null);
    fetchAppointments();
  };

  // -------------------------
  // UI
  // -------------------------
  if (loading) {
    return <main style={{ padding: 32 }}>Loading appointments...</main>;
  }

  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Admin – Appointments</h1>

      {appointments.length === 0 && <p>No appointments found.</p>}

      <ul style={{ marginTop: 16 }}>
        {appointments.map((a) => (
          <li key={a.id} style={{ marginBottom: 20 }}>
            {editingId === a.id ? (
              <>
                <input
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                />
                <br />

                <input
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                />
                <br />

                <input
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                />
                <br />

                <input
                  type="datetime-local"
                  value={form.startTime.slice(0, 16)}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
                <br />

                <button onClick={() => saveEdit(a.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <strong>
                  {new Date(a.startTime).toLocaleString()}
                </strong>
                <br />
                {a.name} — {a.email}
                <br />

                <button onClick={() => startEdit(a)}>Edit</button>
                <button onClick={() => cancelAppointment(a.id)}>
                  Cancel
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
