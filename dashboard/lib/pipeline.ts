import type { ArtifactType } from "./types";

/** The core build pipeline, in order. Mirrors backend/agents.py PIPELINE. */
export const PIPELINE_TITLES = [
  "Opportunity brief",
  "Demand & validation",
  "Market & competitor scan",
  "MVP product spec",
  "Go-to-market plan",
  "Landing page copy",
  "Risks & next moves",
] as const;

export const PIPELINE_LEN = PIPELINE_TITLES.length; // 7
export const DEEPEN_LEN = 8;

export interface VentureProgress {
  done: number;
  total: number;
  pct: number;
  deepening: number;
  stage: "build" | "deep";
  label: string;
}

/** phase = number of completed steps. After PIPELINE_LEN, the team keeps deepening. */
export function ventureProgress(phase: number): VentureProgress {
  const done = Math.min(phase, PIPELINE_LEN);
  const deepening = Math.max(0, phase - PIPELINE_LEN);
  const stage = phase < PIPELINE_LEN ? "build" : "deep";
  const label =
    stage === "build"
      ? PIPELINE_TITLES[Math.min(phase, PIPELINE_LEN - 1)]
      : `Deep dive ×${deepening}`;
  return { done, total: PIPELINE_LEN, pct: done / PIPELINE_LEN, deepening, stage, label };
}

/** Compact uppercase chip label for an artifact type. */
export const ARTIFACT_TYPE_LABEL: Record<ArtifactType, string> = {
  brief: "Brief",
  validation: "Validation",
  market_scan: "Market Scan",
  product_spec: "Product Spec",
  gtm: "Go-To-Market",
  copy: "Copy",
  risks: "Risks",
  deep_dive: "Deep Dive",
  pricing: "Pricing",
  competitor_teardown: "Teardown",
  content: "Content",
  experiment: "Experiment",
  operating_plan: "Ops Plan",
  partnerships: "Partnerships",
  metrics: "Metrics",
};

export function artifactTypeLabel(type: string): string {
  return (
    ARTIFACT_TYPE_LABEL[type as ArtifactType] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
