// Abstraction over LLM providers. Services talk to this, not to the SDK.

export interface ModelCallRequest {
  prompt: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }> | null;
  modelId: string;
  temperature: number;
  maxTokens: number;
}

export interface ModelCallResult {
  rawOutput: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  costEstimate?: number | null;
}

export interface ModelAdapter {
  readonly provider: string;
  call(req: ModelCallRequest): Promise<ModelCallResult>;
}
