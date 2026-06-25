export type AgentName =
  | "Chief of Staff"
  | "Scout"
  | "Analyst"
  | "Builder"
  | "Strategist";

export type VentureStatus = "active" | "paused" | "archived";
export type TaskStatus = "running" | "done" | "failed";
export type MessageDirection = "in" | "out" | "system";

export type ArtifactType =
  | "brief"
  | "validation"
  | "market_scan"
  | "product_spec"
  | "gtm"
  | "copy"
  | "risks"
  | "deep_dive"
  | "pricing"
  | "competitor_teardown"
  | "content"
  | "experiment"
  | "operating_plan"
  | "partnerships"
  | "metrics";

export interface Venture {
  id: string;
  title: string;
  seed_prompt: string | null;
  status: VentureStatus;
  phase: number;
  created_at: string;
}

export interface Task {
  id: string;
  venture_id: string | null;
  agent: AgentName;
  title: string;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface Artifact {
  id: string;
  venture_id: string | null;
  agent: AgentName;
  type: ArtifactType | string;
  title: string;
  body: string;
  created_at: string;
}

export interface Message {
  id: string;
  venture_id: string | null;
  direction: MessageDirection;
  channel: string;
  body: string;
  created_at: string;
}

export type TableName = "ventures" | "tasks" | "artifacts" | "messages";
export type ConnectionStatus = "connecting" | "live" | "demo" | "empty" | "error";
