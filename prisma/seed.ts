import { prisma } from "../src/adapters/db/prisma";
import { defaultContext } from "../src/services/context";
import { createProject } from "../src/services/projectService";
import { createPrompt } from "../src/services/promptService";
import { createVersion } from "../src/services/versionService";
import { createModelProfile } from "../src/services/modelProfileService";
import { createDataset, createTestCase } from "../src/services/datasetService";

async function main() {
  const ctx = defaultContext();
  const existing = await prisma.promptProject.findFirst({ where: { slug: "demo" } });
  if (existing) {
    console.log("Seed: 'demo' project already exists, skipping.");
    return;
  }

  const project = await createProject(ctx, {
    name: "Demo",
    slug: "demo",
    description: "A seeded project showing a classifier prompt with two branches.",
  });

  const model = await createModelProfile(ctx, {
    projectId: project.id,
    name: "mock-default",
    provider: "mock",
    modelId: "claude-opus-4-7",
    defaultTemperature: 0.2,
    defaultMaxTokens: 512,
  });

  const dataset = await createDataset(ctx, {
    projectId: project.id,
    name: "support-tickets",
    description: "A handful of labelled support tickets for classification tests.",
  });
  await createTestCase(ctx, {
    datasetId: dataset.id,
    name: "billing-refund",
    inputVariables: { ticket: "I was charged twice for my subscription, please refund me." },
    expectedOutput: "billing",
    expectedKind: "contains",
  });
  await createTestCase(ctx, {
    datasetId: dataset.id,
    name: "login-issue",
    inputVariables: { ticket: "I cannot log in, the reset link never arrives." },
    expectedOutput: "account",
    expectedKind: "contains",
  });

  const prompt = await createPrompt(ctx, {
    projectId: project.id,
    name: "Ticket classifier",
    slug: "ticket-classifier",
    purpose: "Classify support tickets into { billing | account | product | other }.",
    initialVersion: {
      title: "First cut",
      body: "Classify the following support ticket into one of: billing, account, product, other.\n\nTicket:\n{{ticket}}",
      variables: [
        { name: "ticket", description: "Raw ticket text", type: "string", required: true },
      ],
    },
  });

  const head = prompt.canonicalBranch!;
  // Second version on main — add explicit output format
  await createVersion(ctx, {
    promptId: prompt.id,
    parentVersionId: head.headVersionId!,
    branchId: head.id,
    title: "With output format",
    body:
      "You are a careful, precise assistant that classifies customer-support tickets.\n\n" +
      "Classify the following support ticket into one of: billing, account, product, other.\n" +
      "Respond with a single word, lowercase, no punctuation.\n\n" +
      "Ticket:\n{{ticket}}",
    variables: [
      { name: "ticket", description: "Raw ticket text", type: "string", required: true },
    ],
    changeSummary: "Add role framing and explicit output-format rule.",
    rationale: "Short answers were drifting to multi-word explanations.",
    expectedImprovement: "Output is always a single lowercase word.",
    status: "experimental",
  });

  console.log("Seeded:", { project: project.slug, model: model.name, prompt: prompt.slug });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
