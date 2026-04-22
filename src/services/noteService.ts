import { z } from "zod";
import { ValidationError } from "../domain/errors";
import type { ServiceContext } from "./context";

export const CreateNoteSchema = z.object({
  versionId: z.string(),
  kind: z.enum(["observation", "issue", "idea", "warning"]).default("observation"),
  body: z.string().min(1).max(4000),
  author: z.string().max(80).optional().nullable(),
});

export async function createNote(
  ctx: ServiceContext,
  input: z.infer<typeof CreateNoteSchema>,
) {
  const parsed = CreateNoteSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.promptNote.create({
    data: {
      versionId: parsed.data.versionId,
      kind: parsed.data.kind,
      body: parsed.data.body,
      author: parsed.data.author ?? ctx.actor ?? null,
    },
  });
}

export async function listNotes(ctx: ServiceContext, versionId: string) {
  return ctx.prisma.promptNote.findMany({
    where: { versionId },
    orderBy: { createdAt: "desc" },
  });
}
