"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENTS, agentMeta } from "@/lib/agents";
import { ventureProgress } from "@/lib/pipeline";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { BridgeData } from "@/lib/useBridgeData";
import type { Artifact, Task, Venture } from "@/lib/types";
import { DiscoveryHero } from "./DiscoveryHero";

interface VentureStats {
  venture: Venture;
  artifactCount: number;
  lastArtifact?: Artifact;
  workingAgents: string[];
  running: Task[];
  lastTs: number | null;
}

function CompanyCard({
  stats,
  now,
  onOpen,
}: {
  stats: VentureStats;
  now: number;
  onOpen: () => void;
}) {
  const { venture: v, artifactCount, workingAgents, running, lastArtifact, lastTs } = stats;
  const p = ventureProgress(v.phase);
  const live = running.length > 0;

  return (
    <motion.button
      layout
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="focus-ring-paper group relative flex flex-col gap-3 overflow-hidden rounded-[14px] border border-paper-line bg-paper-edge/80 p-4 text-left shadow-[var(--shadow-paper)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-paper-line-2 hover:shadow-[0_18px_40px_-22px_oklch(0.32_0.03_70_/_0.6)]"
    >
      {/* status spine */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-full"
        style={{ background: live ? "var(--ok-deep)" : "var(--signal-deep)", opacity: live ? 0.9 : 0.5 }}
      />

      <div className="flex items-center justify-between gap-2 pl-1.5">
        <span
          className="mono inline-flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.14em]"
          style={{ color: live ? "var(--ok-deep)" : "var(--paper-ink-3)" }}
        >
          <span
            className={live ? "live-dot" : "inline-block h-1.5 w-1.5 rounded-full"}
            style={live ? undefined : { background: "var(--paper-line-2)" }}
          />
          {live ? "LIVE" : v.status.toUpperCase()}
        </span>
        <span className="mono text-[9.5px] tabular-nums text-paper-faint">
          {lastTs ? `${relativeTime(new Date(lastTs).toISOString(), now)} ago` : "new"}
        </span>
      </div>

      <div className="pl-1.5">
        <h3 className="font-display line-clamp-2 text-[18px] font-semibold leading-[1.12] tracking-[-0.015em] text-paper-ink">
          {v.title}
        </h3>
        <p className="font-display mt-1.5 line-clamp-2 text-[13px] italic leading-snug text-paper-ink-3">
          {v.seed_prompt || v.title}
        </p>
      </div>

      {/* live line — what's happening now */}
      <div className="flex min-h-[18px] items-center gap-2 pl-1.5 text-[11.5px]">
        {running[0] ? (
          <>
            <span className="spinner spinner-paper" style={{ width: 10, height: 10 }} />
            <span className="min-w-0 truncate text-paper-ink-2">
              <span className="font-semibold" style={{ color: agentMeta(running[0].agent).color }}>
                {running[0].agent}
              </span>{" "}
              · {running[0].title}
            </span>
          </>
        ) : lastArtifact ? (
          <span className="min-w-0 truncate text-paper-ink-3">
            <span className="text-paper-faint">latest · </span>
            {lastArtifact.title}
          </span>
        ) : (
          <span className="text-paper-faint">queued — awaiting first deliverable</span>
        )}
      </div>

      {/* progress */}
      <div className="flex items-center gap-2 pl-1.5">
        <div className="flex h-1.5 flex-1 gap-[2px]">
          {Array.from({ length: p.total }).map((_, i) => (
            <span
              key={i}
              className="h-full flex-1 rounded-full"
              style={{ background: i < p.done ? "var(--signal-deep)" : "var(--paper-line-2)" }}
            />
          ))}
        </div>
        <span className="mono shrink-0 text-[9.5px] uppercase tracking-[0.08em] text-paper-ink-3">
          {p.stage === "build" ? p.label : `Deepening ×${p.deepening}`}
        </span>
      </div>

      {/* footer — roster presence + body of work + enter */}
      <div className="mt-0.5 flex items-center justify-between gap-2 border-t border-paper-line/70 pt-2.5 pl-1.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            {(Object.keys(AGENTS) as (keyof typeof AGENTS)[]).map((name) => {
              const on = workingAgents.includes(name);
              return (
                <span
                  key={name}
                  title={`${name}${on ? " · working" : ""}`}
                  className="h-2 w-2 rounded-full transition-opacity"
                  style={{ background: AGENTS[name].color, opacity: on ? 1 : 0.28 }}
                />
              );
            })}
          </div>
          <span className="mono text-[10px] tabular-nums text-paper-ink-3">
            {artifactCount} {artifactCount === 1 ? "artifact" : "artifacts"}
          </span>
        </div>
        <span className="mono inline-flex items-center gap-1 text-[9.5px] font-semibold tracking-[0.12em] text-signal-deep transition-transform duration-200 group-hover:translate-x-0.5">
          ENTER COCKPIT
          <span aria-hidden>→</span>
        </span>
      </div>
    </motion.button>
  );
}

export function HomeView({
  data,
  onSelectVenture,
}: {
  data: BridgeData;
  onSelectVenture: (id: string) => void;
}) {
  const now = useNow(1000);

  const stats: VentureStats[] = useMemo(() => {
    const byVenture = data.ventures.map((v) => {
      const vTasks = data.tasks.filter((t) => t.venture_id === v.id);
      const vArtifacts = data.artifacts.filter((a) => a.venture_id === v.id);
      const running = vTasks.filter((t) => t.status === "running");
      const ts = [...vTasks, ...vArtifacts]
        .map((r) => new Date(("completed_at" in r && r.completed_at) || r.created_at).getTime())
        .filter((n) => !Number.isNaN(n));
      return {
        venture: v,
        artifactCount: vArtifacts.length,
        lastArtifact: vArtifacts[0],
        workingAgents: Array.from(new Set(running.map((t) => t.agent))),
        running,
        lastTs: ts.length ? Math.max(...ts) : null,
      };
    });
    // active + live first, then by most recent activity
    return byVenture.sort((a, b) => {
      const ra = a.running.length > 0 ? 1 : 0;
      const rb = b.running.length > 0 ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return (b.lastTs ?? 0) - (a.lastTs ?? 0);
    });
  }, [data.ventures, data.tasks, data.artifacts]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* keep the multi-company discovery hero, intake, and WhatsApp as the studio landing */}
      <DiscoveryHero data={data} />

      {/* the portfolio — every company, pick one to open its cockpit */}
      <section className="paper relative flex-1 border-t border-paper-line-2/50">
        <div className="relative z-10 px-5 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="block h-3.5 w-[3px] rounded-full bg-signal-deep" />
              <span className="eyebrow-paper">Portfolio</span>
              <span className="mono text-[11px] tabular-nums text-paper-ink-3">
                {data.ventures.length}
              </span>
            </div>
            <span className="mono hidden text-[10px] tracking-[0.1em] text-paper-faint sm:inline">
              select a company to open its cockpit
            </span>
          </div>

          {stats.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-paper-line-2/70 px-6 py-16 text-center">
              <p className="font-display text-[18px] italic text-paper-ink-3">
                No companies yet
              </p>
              <p className="mono mt-2 text-[11px] tracking-[0.04em] text-paper-faint">
                Text an idea in and the team spins up a company to build it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {stats.map((s) => (
                  <CompanyCard
                    key={s.venture.id}
                    stats={s}
                    now={now}
                    onOpen={() => onSelectVenture(s.venture.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
