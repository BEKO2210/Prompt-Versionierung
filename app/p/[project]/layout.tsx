import { notFound } from "next/navigation";
import { getProjectBySlug } from "../../../src/services/projectService";
import { defaultContext } from "../../../src/services/context";
import type { ReactNode } from "react";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  try {
    await getProjectBySlug(defaultContext(), project);
  } catch {
    notFound();
  }
  return <>{children}</>;
}
