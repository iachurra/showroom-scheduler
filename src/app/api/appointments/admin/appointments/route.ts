import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { DateTime } from "luxon";

const TZ = "America/Los_Angeles";

export async function GET() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { startTime: "desc" },
  });
  return NextResponse.json(appointments);
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    id: idRaw,
    startTime: startTimeRaw,
    duration,
    name,
    email,
    phone,
    date: dateRaw,
  } = (body ?? {}) as Record<string, unknown>;

  if (idRaw === undefined || idRaw === null) {
    return NextResponse.json({ error: "Missing appointment id." }, { status: 400 });
  }

  const numericId = Number(idRaw);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid appointment id." }, { status: 400 });
  }

  if (!startTimeRaw) {
    return NextResponse.json({ error: "Missing startTime." }, { status: 400 });
  }

  const dur = duration && Number.isFinite(Number(duration)) ? Number(duration) : 30;

  // Determine date and time. Accept either:
  // - startTime as an ISO datetime (contains 'T'), or
  // - startTime as "HH:mm" with a separate date field (YYYY-MM-DD)
  let day: DateTime;
  let hour: number;
  let minute: number;

  const startTimeStr = String(startTimeRaw);
  if (startTimeStr.includes("T")) {
    // full datetime-local or ISO
    const dt = DateTime.fromISO(startTimeStr, { zone: TZ });
    if (!dt.isValid) {
      // try parsing as ISO in UTC
      const dt2 = DateTime.fromISO(startTimeStr).setZone(TZ);
      if (!dt2.isValid) {
        return NextResponse.json({ error: "Invalid startTime format." }, { status: 400 });
      }
      day = dt2.startOf("day");
      hour = dt2.hour;
      minute = dt2.minute;
    } else {
      day = dt.startOf("day");
      hour = dt.hour;
      minute = dt.minute;
    }
  } else {
    // expect HH:mm and a date
    const parts = startTimeStr.split(":");
    if (parts.length !== 2) {
      return NextResponse.json({ error: "Invalid startTime format." }, { status: 400 });
    }
    hour = parseInt(parts[0], 10);
    minute = parseInt(parts[1], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return NextResponse.json({ error: "Invalid startTime numbers." }, { status: 400 });
    }

    if (!dateRaw) {
      return NextResponse.json({ error: "Missing date for provided startTime." }, { status: 400 });
    }
    const dayCandidate = DateTime.fromISO(String(dateRaw), { zone: TZ });
    if (!dayCandidate.isValid) {
      return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
    }
    day = dayCandidate.startOf("day");
  }

  const startPst = day.set({ hour, minute, second: 0, millisecond: 0 });
  if (!startPst.isValid) {
    return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
  }

  const endPst = startPst.plus({ minutes: dur });

  const start = startPst.toUTC().toJSDate();
  const end = endPst.toUTC().toJSDate();
  const dateUtc = startPst.startOf("day").toUTC().toJSDate();

  try {
    await prisma.appointment.update({
      where: { id: numericId },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(email !== undefined ? { email: String(email) } : {}),
        phone:
          phone && String(phone).trim().length > 0 ? String(phone).trim() : null,
        date: dateUtc,
        startTime: start,
        endTime: end,
      },
    });

    return NextResponse.json({ success: true, message: "Appointment updated successfully" }, { status: 200 });
  } catch (errUnknown) {
    const code = (errUnknown as { code?: string } | null)?.code ?? null;
    // Record not found
    if (code === "P2025") {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    }
    if (code === "P2002") {
      return NextResponse.json({ error: "Time slot already booked." }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to update appointment." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing appointment id." }, { status: 400 });
  }

  const numericId = Number(idParam);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid appointment id." }, { status: 400 });
  }

  try {
    const deleted = await prisma.appointment.delete({ where: { id: numericId } });
    return NextResponse.json({ appointment: deleted });
  } catch {
    return NextResponse.json({ error: "Failed to delete appointment." }, { status: 500 });
  }
}
