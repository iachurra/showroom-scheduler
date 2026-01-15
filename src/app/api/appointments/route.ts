import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";
import { createServerClient } from "@supabase/ssr";

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

function getSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}

/* ---------------- POST (Create booking) ---------------- */

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateAppointmentBody;
    const { date, startTime, name, email } = body;
    const duration = body.duration ?? 30;
    const phone = body.phone ?? null;

    if (!date || !startTime || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (duration !== 30 && duration !== 60) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
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
      return NextResponse.json(
        { error: "Outside booking hours (9am–5pm PST)" },
        { status: 400 }
      );
    }

    const startUtc = startPst.toUTC().toJSDate();
    const endUtc = endPst.toUTC().toJSDate();
    const dateUtc = startPst.startOf("day").toUTC().toJSDate();

    try {
      const created = await prisma.appointment.create({
        data: {
          date: dateUtc,
          startTime: startUtc,
          endTime: endUtc,
          name,
          email,
          phone,
        },
      });

      return NextResponse.json({ appointment: created }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Time slot already booked" },
          { status: 409 }
        );
      }

      console.error("Create appointment failed", err);
      return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
    }
  } catch (err) {
    console.error("POST /api/appointments error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ---------------- GET (Availability) ---------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Missing date param" }, { status: 400 });
    }

    const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const open = day.set({ hour: OPEN_HOUR, minute: 0 });
    const close = day.set({ hour: CLOSE_HOUR, minute: 0 });

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
      appointments.map(a =>
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

    return NextResponse.json({
      date,
      timezone: TZ,
      open: open.toFormat("HH:mm"),
      close: close.toFormat("HH:mm"),
      slots,
    });
  } catch (err) {
    console.error("GET /api/appointments error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
