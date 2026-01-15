import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { DateTime } from "luxon";

// TEMPORARY debug endpoint: creates an appointment without auth so we can
// check Prisma connectivity and payload handling. Remove after debugging.
export async function POST(req: Request) {
  try {
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {}

    const TZ = "America/Los_Angeles";
  const b = body as Record<string, unknown>;
  const date = (b.date as string) ?? DateTime.now().setZone(TZ).toISODate();
  const startTime = (b.startTime as string) ?? DateTime.now().setZone(TZ).startOf('hour').toFormat('HH:mm');
  const duration = typeof b.duration === 'number' ? (b.duration as number) : 30;
  const name = (b.name as string) ?? 'debug-user';
  const email = (b.email as string) ?? 'debug@example.com';

    const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    const parts = String(startTime).split(":").map((s) => parseInt(s, 10));
    if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) {
      return NextResponse.json({ error: 'invalid startTime' }, { status: 400 });
    }

    const startPst = day.set({ hour: parts[0], minute: parts[1], second: 0, millisecond: 0 });
    const endPst = startPst.plus({ minutes: duration });

    const payload = {
      date: startPst.startOf('day').toUTC().toJSDate(),
      startTime: startPst.toUTC().toJSDate(),
      endTime: endPst.toUTC().toJSDate(),
      name,
      email,
      phone: (b.phone as string) ?? null,
    };

    console.debug('DEBUG /api/appointments/debug-create payload', payload);

    const created = await prisma.appointment.create({ data: payload });
    console.debug('DEBUG /api/appointments/debug-create created', { id: created.id });

    return NextResponse.json({ ok: true, appointment: created }, { status: 201 });
  } catch (err) {
    console.error('DEBUG create error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
