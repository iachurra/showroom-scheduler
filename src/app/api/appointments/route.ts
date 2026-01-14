import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";

type CreateAppointmentBody = {
  date: string;      // "YYYY-MM-DD"
  startTime: string; // "HH:mm" in PST (ex: "09:30")
  duration: 30 | 60;
  name: string;
  email: string;
  phone?: string;
};

const TZ = "America/Los_Angeles";
const OPEN_HOUR = 9;  // 9am
const CLOSE_HOUR = 17; // 5pm

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<CreateAppointmentBody>;
  const { date, startTime, duration, name, email, phone } = body;

  if (!date || !startTime || !duration || !name || !email) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (duration !== 30 && duration !== 60) {
    return NextResponse.json({ error: "Duration must be 30 or 60 minutes." }, { status: 400 });
  }

  // Build a PST datetime from date + time
  const startPst = DateTime.fromISO(`${date}T${startTime}`, { zone: TZ });
  if (!startPst.isValid) {
    return NextResponse.json({ error: "Invalid date/startTime format." }, { status: 400 });
  }

  // Disallow booking past dates (PST)
const nowPst = DateTime.now().setZone(TZ);

if (startPst < nowPst.startOf("day")) {
  return NextResponse.json(
    { error: "Cannot book a past date." },
    { status: 400 }
  );
}

  const endPst = startPst.plus({ minutes: duration });

  // Enforce 9am–5pm PST (end must be <= 5pm)
  const openTime = startPst.set({ hour: OPEN_HOUR, minute: 0, second: 0, millisecond: 0 });
  const closeTime = startPst.set({ hour: CLOSE_HOUR, minute: 0, second: 0, millisecond: 0 });

  if (startPst < openTime || endPst > closeTime) {
    return NextResponse.json(
      { error: "Outside booking hours (9am–5pm PST)." },
      { status: 400 }
    );
  }

  // Convert to JS Dates (Prisma stores as DateTime)
  const start = startPst.toUTC().toJSDate();
  const end = endPst.toUTC().toJSDate();

  // Prevent overlap:
  // existing.start < newEnd AND existing.end > newStart  => overlap
  const overlap = await prisma.appointment.findFirst({
    where: {
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });

  if (overlap) {
    return NextResponse.json({ error: "Time slot already booked." }, { status: 409 });
  }

  const created = await prisma.appointment.create({
    data: {
      date: startPst.startOf("day").toUTC().toJSDate(),
      startTime: start,
      endTime: end,
      name,
      email,
      phone: phone ?? null,
    },
  });

  return NextResponse.json({ ok: true, appointment: created }, { status: 201 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // "YYYY-MM-DD"

  if (!date) {
    return NextResponse.json({ error: "Missing date query param." }, { status: 400 });
  }

  // Validate date format quickly
  const day = DateTime.fromISO(date, { zone: TZ });
  if (!day.isValid) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Build business-hours time window in PT for that day
  const open = day.set({ hour: OPEN_HOUR, minute: 0, second: 0, millisecond: 0 });
  const close = day.set({ hour: CLOSE_HOUR, minute: 0, second: 0, millisecond: 0 });

  // Pull existing appointments that start on that PT day (between open/close)
  const appts = await prisma.appointment.findMany({
    where: {
      startTime: {
        gte: open.toJSDate(),
        lt: close.toJSDate(),
      },
    },
    select: { startTime: true },
    orderBy: { startTime: "asc" },
  });

  const booked = new Set(
    appts.map(a => DateTime.fromJSDate(a.startTime).setZone(TZ).toFormat("HH:mm"))
  );

  // Generate 30-min slots between open and close (end exclusive)
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
    slotMinutes: 30,
    slots,
    booked: Array.from(booked),
  });
}
