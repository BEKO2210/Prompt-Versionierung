import type { PrismaClient } from "@prisma/client";
import { prisma } from "../adapters/db/prisma";

// Service context — every service function takes this as its first arg.
// In tests we pass a separate PrismaClient (e.g. pointing at :memory:).
// In production code paths, `defaultContext()` returns the singleton.

export interface ServiceContext {
  prisma: PrismaClient;
  // Optional principal identifier (future auth).
  actor?: string | undefined;
  now: () => Date;
}

export function defaultContext(overrides: Partial<ServiceContext> = {}): ServiceContext {
  return {
    prisma,
    now: () => new Date(),
    ...overrides,
  };
}
