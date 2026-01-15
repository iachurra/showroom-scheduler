import { NextResponse } from "next/server";
// ... no direct cookie usage here for the server client creation
import { DateTime } from "luxon";
import { prisma } from "@/app/lib/prisma";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";



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
  try {
    console.log("POST /api/appointments entry");
    try {
      const hdrs: Record<string,string> = {};
      req.headers.forEach((v,k) => { hdrs[k] = v; });
      const preview = Object.fromEntries(Object.entries(hdrs).slice(0,10));
      // redact authorization token for logs
      if (preview.authorization) preview.authorization = `${String(preview.authorization).slice(0,24)}...[redacted]`;
      console.log('Incoming headers (preview)', preview);
    } catch (e) {
      console.error('Error reading headers for debug preview', e);
    }
    // Create Supabase server client using cookies for auth
    // Pass the request cookies so the server client can read the user's session
  let supabase: unknown = null;
    try {
      supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies }
      );
    } catch (e) {
      // Some versions/environments throw when cookie methods differ; log and continue.
      console.error('createServerClient threw, skipping server cookie session lookup', e?.message ?? e);
      supabase = null;
    }

    // small helper to avoid hanging on external services
    const withTimeout = async <T>(p: Promise<T>, ms: number, name = 'operation'): Promise<T> => {
      let timer: NodeJS.Timeout | null = null;
      return await Promise.race([
        p.then((v) => {
          if (timer) clearTimeout(timer);
          return v;
        }),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error(`${name} timed out after ${ms}ms`)), ms);
        }),
      ]);
    };

    // Server-side auth guard (cookies). If missing, fall back to token auth via Authorization header.
  let session: unknown = null;
    if (supabase) {
      try {
        // guard against hangs from auth helper
        const got = await withTimeout(supabase.auth.getSession(), 5000, 'supabase.getSession');
        session = got?.data?.session ?? null;
      } catch (e) {
        console.error('supabase.auth.getSession error', e?.message ?? e);
        session = null;
      }
    } else {
      console.log('Supabase server client not available; skipping cookie session check');
      session = null;
    }

    console.log("POST /api/appointments session", { hasSession: !!session, user: session?.user?.email });

  const isDev = process.env.NODE_ENV !== "production";
  let effectiveUser = session?.user ?? null;

    if (!effectiveUser) {
      // Try Bearer token in Authorization header
  const authHeader = (req.headers.get("authorization") || req.headers.get("Authorization")) as string | null;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
      // also accept token in body (fallback)
      let bodyToken: string | null = null;
      try {
        const maybe = await req.clone().json();
        bodyToken = typeof maybe?.access_token === 'string' ? maybe.access_token : null;
      } catch {}

      const accessToken = token || bodyToken || null;
      console.log('Token auth attempt, hasHeaderToken:', !!token, 'hasBodyToken:', !!bodyToken, 'isDev:', isDev);
      if (!accessToken) {
        if (!isDev) {
          return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        console.log('DEV: no access token provided, continuing due to dev fallback');
      }

      // Validate token with Supabase
      const anonClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      let userResult;
      try {
        // guard against hangs during external token validation
        userResult = await withTimeout(anonClient.auth.getUser(accessToken), 5000, 'anonClient.getUser');
        console.log('getUser result', { ok: !!userResult?.data?.user, error: userResult?.error?.message });
      } catch (e) {
        console.error('Error calling anonClient.auth.getUser', e?.message ?? e);
        if (!isDev) return NextResponse.json({ error: 'Invalid token or auth service error', details: String(e?.message ?? e) }, { status: 401 });
        // in dev we allow fallback
        console.log('DEV: continuing despite getUser error');
        userResult = null;
      }

      if (userResult?.error || !userResult?.data?.user) {
        console.log('Token auth failed', { error: userResult?.error, isDev });
        if (!isDev) {
          return NextResponse.json({ error: "Invalid token" }, { status: 401 });
        }
        console.log('DEV: token validation failed, continuing due to dev fallback');
      } else {
        effectiveUser = userResult.data.user;
        console.log('Token auth succeeded', { user: effectiveUser.email });
      }
    }

    const body = (await req.json()) as Partial<CreateAppointmentBody>;
  // redact any tokens from body before logging
  const bodyPreview = { ...body } as Record<string, unknown>;
  if (bodyPreview?.access_token) bodyPreview.access_token = '[redacted]';
  console.log("POST /api/appointments body", bodyPreview);

    const { date, startTime, name, email } = body;
    // duration defaults to 30 when not provided
    const duration = (body?.duration as number | undefined) ?? 30;
    const phone = (body?.phone as string | undefined) ?? undefined;

  if (!date || !startTime || !name || !email) {
    return NextResponse.json({ error: "Missing required fields (date,startTime,name,email)." }, { status: 400 });
  }

  if (duration !== 30 && duration !== 60) {
    return NextResponse.json({ error: "Duration must be 30 or 60 minutes." }, { status: 400 });
  }

    // Build a PST datetime from date + time robustly
  const day = DateTime.fromISO(date, { zone: TZ });
    if (!day.isValid) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const parts = String(startTime).split(":");
    if (parts.length !== 2) {
      return NextResponse.json({ error: "Invalid startTime format. Use HH:mm." }, { status: 400 });
    }
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return NextResponse.json({ error: "Invalid startTime numbers." }, { status: 400 });
    }

    const startPst = day.set({ hour, minute, second: 0, millisecond: 0 });
    if (!startPst.isValid) {
      return NextResponse.json({ error: "Invalid date/startTime combination." }, { status: 400 });
    }

    // Disallow booking past dates (PST)
    const nowPst = DateTime.now().setZone(TZ);
    if (startPst < nowPst.startOf("day")) {
      return NextResponse.json({ error: "Cannot book a past date." }, { status: 400 });
    }

    const endPst = startPst.plus({ minutes: duration });

    // Log computed times for debugging
    console.debug("Computed times (PST)", {
      startPst: startPst.toISO(),
      endPst: endPst.toISO(),
      startUtc: startPst.toUTC().toISO(),
      endUtc: endPst.toUTC().toISO(),
    });

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

  // Booking is enforced by the DB unique constraint on (date, startTime).
  // We do not perform any overlap/range checks here to avoid expensive scans.

    const createPayload = {
      date: startPst.startOf("day").toUTC().toJSDate(),
      startTime: start,
      endTime: end,
      name,
      email,
      phone: phone && String(phone).trim().length > 0 ? String(phone).trim() : null,
    };

    console.debug("Prisma create payload", createPayload);

    try {
      const created = await prisma.appointment.create({ data: createPayload });
      console.log("Appointment created", { id: created.id });
      return NextResponse.json({ ok: true, appointment: created }, { status: 201 });
    } catch (prismaErr) {
      // Map Prisma errors (P2002 for unique constraint) to proper HTTP responses.
      const pErr = prismaErr as { code?: string } | undefined | null;
      const code = pErr?.code ?? null;
      const message = (prismaErr as Error)?.message ?? String(prismaErr);
      console.error("Prisma create error:", { code, message });
      if (code === 'P2002') {
        return NextResponse.json({ error: 'Time slot already booked (unique constraint).', details: message }, { status: 409 });
      }
      // For other errors, surface as 500 (don't attempt expensive fallback queries here).
      return NextResponse.json({ error: 'Failed to create appointment.', details: message }, { status: 500 });
    }
  } catch (err) {
    // Log full error for diagnostics
    let stack: string | undefined = undefined;
    if (typeof err === 'object' && err !== null && 'stack' in err) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - runtime stack extraction for debugging only
      stack = (err as { stack?: string }).stack;
    }
    console.error("Error in POST /api/appointments:", (err as Error)?.message ?? err, stack);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
  console.debug("GET /api/appointments start", { url: req.url });
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
  let appts: Array<{ startTime: Date }> = [];
  try {
      // Guard against very slow DB responses by racing the query with a timeout.
      // Quick DB probe to ensure connectivity
      try {
        const probe = await prisma.$queryRaw`SELECT 1 as ok`;
        console.debug("DB probe result", probe);
      } catch (probeErr) {
        console.error("DB probe failed (connection issue):", probeErr?.message ?? probeErr);
      }

      try {
        const beforeQuery = Date.now();
        appts = await prisma.appointment.findMany({
          where: {
            startTime: {
              gte: open.toJSDate(),
              lt: close.toJSDate(),
            },
          },
          select: { startTime: true },
          orderBy: { startTime: "asc" },
        });
        console.debug("DB query resolved", { durationMs: Date.now() - beforeQuery, rows: Array.isArray(appts) ? appts.length : null });
      } catch (err) {
        throw err; // let outer catch handle fallback
      }
    } catch (err) {
      console.error("Prisma error fetching appointments (falling back):", err?.message ?? err);
      console.debug("Falling back to empty appointment list; DB error or slow response");
      // Fall back to no appointments so availability can still be shown.
      appts = [];
    }

  const booked = new Set(
    appts.map((a) => DateTime.fromJSDate(a.startTime).setZone(TZ).toFormat("HH:mm"))
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
  } catch (err) {
  console.error("Unexpected error in GET /api/appointments:", err?.message ?? err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
