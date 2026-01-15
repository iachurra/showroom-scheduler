import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieMethods = await cookies();
    // cast for auth-helpers compatibility in App Router (debug endpoint)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieMethods }
    );

    const { data } = await supabase.auth.getSession();
    console.debug("DEBUG /api/appointments/debug-session session", { session: !!data?.session, user: data?.session?.user?.email });
    return NextResponse.json({ session: data?.session ?? null });
  } catch (err) {
    console.error("DEBUG session endpoint error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
