import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

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

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<CreateAppointmentBody>;
    const { date, startTime, name, email } = body;
    const duration = body.duration ?? 30;
    const phone = body.phone ?? null;

    if (!date || !startTime || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const [hourStr, minuteStr] = startTime.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return NextResponse.json({ error: "Invalid startTime" }, { status: 400 });
    }

    const startPst = day.set({ hour, minute, second: 0, millisecond: 0 });
    const endPst = startPst.plus({ minutes: duration });

    const open = startPst.set({ hour: OPEN_HOUR, minute: 0 });
    const close = startPst.set({ hour: CLOSE_HOUR, minute: 0 });

    if (startPst < open || endPst > close) {
      return NextResponse.json({ error: "Outside booking hours" }, { status: 400 });
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

      return NextResponse.json({ appointment }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Time slot already booked" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("POST /api/appointments failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const open = day.set({ hour: OPEN_HOUR, minute: 0 });
    const close = day.set({ hour: CLOSE_HOUR, minute: 0 });

    const appts = await prisma.appointment.findMany({
      where: {
        startTime: {
          gte: open.toUTC().toJSDate(),
          lt: close.toUTC().toJSDate(),
        },
      },
      select: { startTime: true },
    });

    const booked = new Set(
      appts.map((a) =>
        DateTime.fromJSDate(a.startTime).setZone(TZ).toFormat("HH:mm")
      )
    );

    const slots: string[] = [];
    let cursor = open;

    while (cursor < close) {
      const label = cursor.toFormat("HH:mm");
      if (!booked.has(label)) slots.push(label);
      cursor = cursor.plus({ minutes: 30 });
    }

    return NextResponse.json({ date, slots, booked: [...booked] });
  } catch (err) {
    console.error("GET /api/appointments failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
