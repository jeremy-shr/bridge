import type { AgentName } from "./types";

export interface AgentMeta {
  name: AgentName;
  /** short label for compact UI */
  short: string;
  /** 3-letter monospace tag */
  code: string;
  /** css color reference, used inline for data-driven tinting */
  color: string;
  /** one-line remit, mirrors the backend roster */
  role: string;
  /** present-continuous fallback verb */
  verb: string;
}

export const AGENT_ORDER: AgentName[] = [
  "Chief of Staff",
  "Scout",
  "Analyst",
  "Builder",
  "Strategist",
];

export const AGENTS: Record<AgentName, AgentMeta> = {
  "Chief of Staff": {
    name: "Chief of Staff",
    short: "Chief",
    code: "COS",
    color: "var(--agent-chief)",
    role: "Frames the problem, sets priorities, keeps the venture coherent.",
    verb: "framing",
  },
  Scout: {
    name: "Scout",
    short: "Scout",
    code: "SCT",
    color: "var(--agent-scout)",
    role: "Finds problems worth solving and validates real demand.",
    verb: "validating",
  },
  Analyst: {
    name: "Analyst",
    short: "Analyst",
    code: "ANL",
    color: "var(--agent-analyst)",
    role: "Maps the landscape and sizes the opportunity.",
    verb: "mapping",
  },
  Builder: {
    name: "Builder",
    short: "Builder",
    code: "BLD",
    color: "var(--agent-builder)",
    role: "Specs the MVP, names it, and writes the build plan.",
    verb: "building",
  },
  Strategist: {
    name: "Strategist",
    short: "Strategist",
    code: "STR",
    color: "var(--agent-strategist)",
    role: "Designs positioning, channels, and the first-customer plan.",
    verb: "drafting",
  },
};

export function agentMeta(name: string): AgentMeta {
  return (
    AGENTS[name as AgentName] ?? {
      name: name as AgentName,
      short: name,
      code: name.slice(0, 3).toUpperCase(),
      color: "var(--muted)",
      role: "",
      verb: "working on",
    }
  );
}

/** Reads well in the live feed: "Analyst is mapping Market & competitor scan…" */
const TITLE_VERB: Record<string, string> = {
  "Opportunity brief": "framing",
  "Demand & validation": "pressure-testing",
  "Market & competitor scan": "mapping",
  "MVP product spec": "speccing",
  "Go-to-market plan": "drafting",
  "Landing page copy": "writing",
  "Risks & next moves": "weighing",
  "Channel playbook": "drafting",
  "Pricing & packaging": "modeling",
  "Competitor teardown": "tearing down",
  "Two-week content calendar": "planning",
  "Next validation experiment": "designing",
  "Week-1 operating plan": "planning",
  "Distribution & partnerships": "sourcing",
  "North-star & metrics": "defining",
};

export function runningVerb(title: string, agent: string): string {
  return TITLE_VERB[title] ?? agentMeta(agent).verb;
}
