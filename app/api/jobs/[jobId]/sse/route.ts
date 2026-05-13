/**
 * GET /api/jobs/[jobId]/sse
 * Server-Sent Events stream for real-time stage progress.
 * Reads from Redis pub/sub and the progress list.
 */
import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { createRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  // Verify Firebase token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];
  
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (error) {
    console.error("[sse] Token verification failed:", error);
    return new Response("Unauthorized", { status: 401 });
  }

  // Find user by Firebase UID
  const currentUser = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (!currentUser) {
    return new Response("User not found. Please sign in again.", { status: 401 });
  }

  const { jobId } = await params;

  // Verify the job belongs to this user
  const video = await prisma.video.findUnique({ where: { jobId } });
  if (!video || video.userId !== currentUser.id) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const redis = createRedisConnection();
      const subscriber = createRedisConnection();

      let closed = false;

      function send(data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      }

      // Send a heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return clearInterval(heartbeat);
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 15000);

      // First, replay all existing progress events
      const existing = await redis.lrange(`progress:${jobId}`, 0, -1);
      for (const entry of existing) {
        send(entry);
      }

      // Check if already completed/failed
      const currentVideo = await prisma.video.findUnique({ where: { jobId } });
      if (
        currentVideo?.status === "completed" ||
        currentVideo?.status === "failed"
      ) {
        send(JSON.stringify({ type: "done", status: currentVideo.status }));
        clearInterval(heartbeat);
        await redis.quit();
        await subscriber.quit();
        controller.close();
        return;
      }

      // Subscribe to real-time updates
      await subscriber.subscribe(`progress-channel:${jobId}`);

      subscriber.on("message", async (_channel: string, message: string) => {
        send(message);

        // Check for completion
        try {
          const update = JSON.parse(message);
          if (update.name === "complete" || update.status === "error") {
            // Give a moment for the last event to flush
            setTimeout(async () => {
              closed = true;
              clearInterval(heartbeat);
              await redis.quit();
              await subscriber.quit();
              try {
                controller.close();
              } catch {
                // already closed
              }
            }, 500);
          }
        } catch {
          // ignore parse errors
        }
      });

      // Handle client disconnect
      req.signal.addEventListener("abort", async () => {
        closed = true;
        clearInterval(heartbeat);
        await redis.quit();
        await subscriber.quit();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
