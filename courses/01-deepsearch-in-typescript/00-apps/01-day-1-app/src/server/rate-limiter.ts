import { db } from "~/server/db";
import { requests, users } from "~/server/db/schema";
import { eq, and, gte, count } from "drizzle-orm";

const DAILY_REQUEST_LIMIT = 1;

export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  isAdmin: boolean;
}> {
  // Get user and check admin status
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Admins bypass rate limits
  if (user.isAdmin) {
    return {
      allowed: true,
      limit: Infinity,
      remaining: Infinity,
      isAdmin: true,
    };
  }

  // Get today's start time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Count requests made today
  const [requestStats] = await db
    .select({ count: count() })
    .from(requests)
    .where(
      and(
        eq(requests.userId, userId),
        gte(requests.createdAt, todayStart)
      )
    );

  const requestCount = requestStats?.count ?? 0;
  const remaining = DAILY_REQUEST_LIMIT - requestCount;

  return {
    allowed: requestCount < DAILY_REQUEST_LIMIT,
    limit: DAILY_REQUEST_LIMIT,
    remaining: Math.max(0, remaining),
    isAdmin: false,
  };
}

export async function recordRequest(userId: string): Promise<void> {
  await db.insert(requests).values({
    userId,
  });
}