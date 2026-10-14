import { NextResponse } from "next/server";
import { requireUser, apiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    await prisma.user.update({ where: { id: user.id }, data: { youtubeTokens: null } });
    return NextResponse.json({ connected: false });
  } catch (error) { return apiError(error); }
}
