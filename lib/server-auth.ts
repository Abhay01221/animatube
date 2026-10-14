import { NextResponse } from "next/server";
import { verifyIdToken } from "./firebase-admin";
import { prisma } from "./prisma";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export async function requireUser(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new ApiError(401, "Sign in to continue");
  let decoded;
  try { decoded = await verifyIdToken(header.slice(7)); }
  catch { throw new ApiError(401, "Your session expired. Sign in again."); }
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user) throw new ApiError(401, "Account synchronization required. Sign in again.");
  return user;
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code=error&&typeof error==="object"&&"code" in error?String(error.code):undefined;
  console.error("[API] Request failed", {name:error instanceof Error ? error.name : "UnknownError",code});
  if(code==="P2021"||code==="P2022")return NextResponse.json({error:"The app database needs an update. Run npm run db:setup on the server, then try again."},{status:503});
  return NextResponse.json({ error: "Unable to complete this request. Please try again." }, { status: 500 });
}
