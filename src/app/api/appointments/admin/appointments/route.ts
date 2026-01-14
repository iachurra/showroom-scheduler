import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { startTime: "desc" },
  });

  return NextResponse.json(appointments);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, name, email, phone, startTime } = body;

  if (!id || !name || !email || !startTime) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  await prisma.appointment.update({
    where: { id: Number(id) },
    data: {
      name,
      email,
      phone: phone || null,
      startTime: new Date(startTime),
      endTime: new Date(
        new Date(startTime).getTime() + 30 * 60 * 1000
      ),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");

  if (!idParam) {
    return NextResponse.json(
      { error: "Missing appointment id." },
      { status: 400 }
    );
  }

  await prisma.appointment.delete({
    where: { id: Number(idParam) },
  });

  return NextResponse.json({ ok: true });
}
