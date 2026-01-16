import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";

const TZ = "America/Los_Angeles";
const OPEN_HOUR = 9;
const CLOSE_HOUR = 17;

type CreateAppointmentBody = {
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:mm (PST)
  duration?: 30 | 60;
  name: string;
  email: string;
  phone?: string;
};

/* ---------------- POST (Create booking) ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateAppointmentBody>;
    const { date, startTime, name, email } = body;
    const duration = body.duration ?? 30;
    const phone = body.phone ?? null;

    if (!date || !startTime || !name || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (duration !== 30 && duration !== 60) {
      return NextResponse.json(
        { error: "Invalid duration" },
        { status: 400 }
      );
    }

    const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) {
      return NextResponse.json(
        { error: "Invalid date" },
        { status: 400 }
      );
    }

    const [h, m] = startTime.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      return NextResponse.json(
        { error: "Invalid startTime" },
        { status: 400 }
      );
    }

    const startPst = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    const endPst = startPst.plus({ minutes: duration });

    const open = startPst.set({ hour: OPEN_HOUR, minute: 0 });
    const close = startPst.set({ hour: CLOSE_HOUR, minute: 0 });

    if (startPst < open || endPst > close) {
      return NextResponse.json(
        { error: "Outside booking hours (9am–5pm PST)" },
        { status: 400 }
      );
    }

    // Prevent booking in the past: compare to current server time
    // Use UTC milliseconds to avoid timezone issues
    const startMillisUtc = startPst.toUTC().toMillis();
    if (startMillisUtc < Date.now()) {
      return NextResponse.json(
        { error: "Cannot book appointments in the past" },
        { status: 400 }
      );
    }

    const startUtc = startPst.toUTC().toJSDate();
    const endUtc = endPst.toUTC().toJSDate();
    const dateUtc = startPst.startOf("day").toUTC().toJSDate();

    try {
      const appointment = await prisma.appointment.create({
        data: {
          date: dateUtc,
          startTime: startUtc,
          endTime: endUtc,
          name,
          email,
          phone,
        },
      });

      return NextResponse.json(
        { appointment },
        { status: 201 }
      );
    } catch (err) {
  if ((err as { code?: string } | null)?.code === "P2002") {
        return NextResponse.json(
          { error: "Time slot already booked" },
          { status: 409 }
        );
      }

      console.error("Create appointment failed", err);
      return NextResponse.json(
        { error: "Failed to create appointment" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("POST /api/appointments error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ---------------- GET (Availability) ---------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    // Use provided date if valid, otherwise fall back to today's date
    // computed as UTC start-of-day and expressed in the app time zone.
    let day: DateTime;
    if (!date) {
      // No date provided: fall back
      day = DateTime.utc().startOf("day").setZone(TZ);
    } else {
      const parsed = DateTime.fromISO(date, { zone: TZ });
      day = parsed.isValid ? parsed : DateTime.utc().startOf("day").setZone(TZ);
    }

    const open = day.set({ hour: OPEN_HOUR, minute: 0 });
    const close = day.set({ hour: CLOSE_HOUR, minute: 0 });

    // Normalize requested date to UTC start-of-day. If it's in the past
    // return an empty availability set rather than throwing an error —
    // this prevents first-load errors when the client doesn't send a date
    // or when a user navigates to an already-passed date.
    const requestedUtcStart = day.startOf("day").toUTC();
    const todayUtcStart = DateTime.utc().startOf("day");
    if (requestedUtcStart < todayUtcStart) {
      return NextResponse.json({ slots: [], booked: [] }, { status: 200 });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        startTime: {
          gte: open.toUTC().toJSDate(),
          lt: close.toUTC().toJSDate(),
        },
      },
      select: { startTime: true },
    });

    const booked = new Set(
      appointments.map((a: { startTime: Date }) =>
        DateTime
          .fromJSDate(a.startTime)
          .setZone(TZ)
          .toFormat("HH:mm")
      )
    );

    const slots: string[] = [];
    let cursor = open;

    while (cursor < close) {
      const label = cursor.toFormat("HH:mm");
      if (!booked.has(label)) slots.push(label);
      cursor = cursor.plus({ minutes: 30 });
    }

    return NextResponse.json({
      date,
      timezone: TZ,
      open: open.toFormat("HH:mm"),
      close: close.toFormat("HH:mm"),
      slots,
      booked: Array.from(booked),
    });
  } catch (err) {
    console.error("GET /api/appointments failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
