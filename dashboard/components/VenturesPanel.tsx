"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ventureProgress } from "@/lib/pipeline";
import type { Venture } from "@/lib/types";
import { ColumnHeader, EmptyState } from "./ui";

function StatusChip({ status }: { status: Venture["status"] }) {
  const cfg: Record<Venture["status"], { color: string; label: string }> = {
    active: { color: "var(--ok)", label: "ACTIVE" },
    paused: { color: "var(--signal)", label: "PAUSED" },
    archived: { color: "var(--faint)", label: "ARCHIVED" },
  };
  const c = cfg[status] ?? cfg.archived;
  return (
    <span
      className="mono inline-flex items-center gap-1.5 text-[9px] font-medium tracking-[0.14em]"
      style={{ color: c.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

function VentureRow({ venture, running }: { venture: Venture; running: boolean }) {
  const p = ventureProgress(venture.phase);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="border-b border-line/60 px-4 py-3 transition-colors hover:bg-panel/40"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-fg-strong">
          {venture.title}
        </h3>
        <StatusChip status={venture.status} />
      </div>

      <div className="mt-2.5 flex items-center gap-[3px]">
        {Array.from({ length: p.total }).map((_, i) => {
          const filled = i < p.done;
          const active = i === p.done && running && p.stage === "build";
          return (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: filled
                  ? "var(--signal)"
                  : active
                    ? "var(--signal-bright)"
                    : "var(--line)",
                animation: active ? "breathe 1.4s ease-in-out infinite" : undefined,
              }}
            />
          );
        })}
        {p.deepening > 0 && (
          <span className="mono ml-1 text-[9px] font-medium tracking-wide text-signal-bright">
            +{p.deepening}
          </span>
        )}
      </div>

      <div className="mono mt-1.5 flex items-center justify-between text-[10px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          {running && <span className="spinner" style={{ width: 9, height: 9 }} />}
          <span className="text-dim">{p.label}</span>
        </span>
        <span className="tabular-nums">
          P{venture.phase} · {p.done}/{p.total}
        </span>
      </div>
    </motion.div>
  );
}

export function VenturesPanel({
  ventures,
  runningVentureIds,
}: {
  ventures: Venture[];
  runningVentureIds: Set<string>;
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <ColumnHeader label="Ventures" count={ventures.length} accent="var(--agent-builder)" />
      <div className="scroll min-h-0 flex-1">
        {ventures.length === 0 ? (
          <EmptyState
            glyph="◇"
            title="No ventures yet"
            sub="Text in an idea and the team spins up a venture to build it."
          />
        ) : (
          <AnimatePresence initial={false}>
            {ventures.map((v) => (
              <VentureRow key={v.id} venture={v} running={runningVentureIds.has(v.id)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
