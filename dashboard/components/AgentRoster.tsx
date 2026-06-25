"use client";

import { AGENTS, AGENT_ORDER } from "@/lib/agents";
import type { AgentName } from "@/lib/types";
import { ColumnHeader } from "./ui";

export function AgentRoster({ workingAgents }: { workingAgents: Set<AgentName> }) {
  const activeCount = AGENT_ORDER.filter((a) => workingAgents.has(a)).length;
  return (
    <section className="flex flex-col">
      <ColumnHeader
        label="Agent Roster"
        accent="var(--agent-scout)"
        right={
          <span className="mono text-[10px] tracking-[0.08em] text-faint">
            {activeCount}/{AGENT_ORDER.length} working
          </span>
        }
      />
      <div className="divide-y divide-line/60">
        {AGENT_ORDER.map((name) => {
          const m = AGENTS[name];
          const working = workingAgents.has(name);
          return (
            <div
              key={name}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel/40"
            >
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: working ? "var(--ok)" : "var(--faint)",
                    boxShadow: working ? "0 0 0 3px var(--ok-soft)" : undefined,
                    animation: working ? "breathe 2s ease-in-out infinite" : undefined,
                  }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[12.5px] font-semibold tracking-[0.005em]"
                    style={{ color: m.color }}
                  >
                    {m.name}
                  </span>
                  <span className="mono text-[9px] tracking-[0.14em] text-faint">{m.code}</span>
                </div>
                <p className="truncate text-[11px] leading-tight text-faint">{m.role}</p>
              </div>
              <span
                className="mono text-[9px] font-medium tracking-[0.16em]"
                style={{ color: working ? "var(--ok)" : "var(--faint)" }}
              >
                {working ? "WORKING" : "IDLE"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
