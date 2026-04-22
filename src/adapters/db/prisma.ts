import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance across the Next.js dev-HMR reload cycle.
// In production (one process), this is just a module singleton.

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}
