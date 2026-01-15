import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/* =======================
   Types & Constants
======================= */

type CreateAppointmentBody = {
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:mm (PST)
  duration?: 30 | 60;
  name: string;
  email: string;
  phone?: string;
};

const TZ = "America/Los_Angeles";
const OPEN_HOUR = 9;
const CLOSE_HOUR = 17;

/* =======================
   Helpers
======================= */

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/* =======================
   POST /api/appointments
======================= */

export async function POST(req: Request) {
  try {
    /* --- Supabase server client (Vercel-safe cookies adapter) --- */
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookies().getAll(),
          setAll: (cookiesToSet) => {
            const store = cookies();
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          },
        },
      }
    );

    /* --- Auth --- */
    let session = null;
    try {
      const res = await withTimeout(supabase.auth.getSession(), 5000);
      session = res.data.session;
    } catch {}

    let effectiveUser = session?.user ?? null;
    const isDev = process.env.NODE_ENV !== "production";

    if (!effectiveUser) {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;

      if (token) {
        const anon = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const res = await anon.auth.getUser(token);
        effectiveUser = res.data.user ?? null;
      }

      if (!effectiveUser && !isDev) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    /* --- Parse body --- */
    const body = (await req.json()) as Partial<CreateAppointmentBody>;
    const { date, startTime, name, email } = body;
    const duration = body.duration ?? 30;
    const phone = body.phone ?? null;

    if (!date || !startTime || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (![30, 60].includes(duration)) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }

    /* --- Build PST datetime --- */
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

    const open = day.set({ hour: OPEN_HOUR, minute: 0 });
    const close = day.set({ hour: CLOSE_HOUR, minute: 0 });

    if (startPst < open || endPst > close) {
      return NextResponse.json(
        { error: "Outside booking hours" },
        { status: 400 }
      );
    }

    /* --- Convert to UTC for Prisma --- */
    const createPayload = {
      date: startPst.startOf("day").toUTC().toJSDate(),
      startTime: startPst.toUTC().toJSDate(),
      endTime: endPst.toUTC().toJSDate(),
      name,
      email,
      phone: phone?.trim() || null,
    };

    /* --- Create appointment --- */
    try {
      const created = await prisma.appointment.create({ data: createPayload });
      return NextResponse.json({ appointment: created }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Time slot already booked" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create appointment" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("POST /api/appointments fatal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* =======================
   GET /api/appointments
======================= */

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

    let appts: { startTime: Date }[] = [];
    try {
      appts = await prisma.appointment.findMany({
        where: {
          startTime: {
            gte: open.toUTC().toJSDate(),
            lt: close.toUTC().toJSDate(),
          },
        },
        select: { startTime: true },
      });
    } catch {
      appts = [];
    }

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

    return NextResponse.json({
      date,
      timezone: TZ,
      open: open.toFormat("HH:mm"),
      close: close.toFormat("HH:mm"),
      slots,
      booked: Array.from(booked),
    });
  } catch (err) {
    console.error("GET /api/appointments error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
