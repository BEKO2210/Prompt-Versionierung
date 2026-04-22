// Branded ID types. They are structurally strings, but TypeScript treats
// them as nominally distinct so that `PromptId` cannot be accidentally used
// where `VersionId` is expected.

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type ProjectId       = Brand<string, "ProjectId">;
export type PromptId        = Brand<string, "PromptId">;
export type BranchId        = Brand<string, "BranchId">;
export type VersionId       = Brand<string, "VersionId">;
export type TestCaseId      = Brand<string, "TestCaseId">;
export type DatasetId       = Brand<string, "DatasetId">;
export type ModelProfileId  = Brand<string, "ModelProfileId">;
export type RunId           = Brand<string, "RunId">;
export type EvaluationId    = Brand<string, "EvaluationId">;
export type RubricId        = Brand<string, "RubricId">;
export type TagId           = Brand<string, "TagId">;
export type NoteId          = Brand<string, "NoteId">;
export type DecisionId      = Brand<string, "DecisionId">;
export type SuggestionId    = Brand<string, "SuggestionId">;
export type ComparisonId    = Brand<string, "ComparisonId">;
export type LineageEdgeId   = Brand<string, "LineageEdgeId">;

export const asProjectId      = (s: string) => s as ProjectId;
export const asPromptId       = (s: string) => s as PromptId;
export const asBranchId       = (s: string) => s as BranchId;
export const asVersionId      = (s: string) => s as VersionId;
export const asTestCaseId     = (s: string) => s as TestCaseId;
export const asDatasetId      = (s: string) => s as DatasetId;
export const asModelProfileId = (s: string) => s as ModelProfileId;
export const asRunId          = (s: string) => s as RunId;
export const asEvaluationId   = (s: string) => s as EvaluationId;
export const asRubricId       = (s: string) => s as RubricId;
export const asTagId          = (s: string) => s as TagId;
export const asNoteId         = (s: string) => s as NoteId;
export const asDecisionId     = (s: string) => s as DecisionId;
export const asSuggestionId   = (s: string) => s as SuggestionId;
export const asComparisonId   = (s: string) => s as ComparisonId;
export const asLineageEdgeId  = (s: string) => s as LineageEdgeId;
