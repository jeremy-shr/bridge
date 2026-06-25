"use client";

import { AnimatePresence, motion } from "framer-motion";
import { agentColor, AgentLabel, ColumnHeader, EmptyState, TypeChip } from "./ui";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { Artifact } from "@/lib/types";

function preview(body: string): string {
  return body
    .replace(/^\s*#{1,6}.*$/m, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ArtifactCard({
  artifact,
  flash,
  onOpen,
  now,
}: {
  artifact: Artifact;
  flash: boolean;
  onOpen: () => void;
  now: number;
}) {
  const c = agentColor(artifact.agent);
  const pv = preview(artifact.body || "");
  return (
    <motion.button
      layout
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex flex-col gap-2.5 overflow-hidden rounded-[10px] border border-line bg-panel p-3.5 pl-4 text-left transition-[transform,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-2 hover:bg-panel-2 focus-ring ${
        flash ? "flash" : ""
      }`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* author spine */}
      <span
        aria-hidden
        className="absolute inset-y-2.5 left-0 w-[2.5px] rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: c }}
      />
      {/* author glow on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-[0.1] blur-2xl transition-opacity duration-200 group-hover:opacity-25"
        style={{ background: c }}
      />
      <div className="flex items-center justify-between">
        <AgentLabel agent={artifact.agent} />
        <time className="mono text-[10px] tabular-nums text-faint">
          {relativeTime(artifact.created_at, now)}
        </time>
      </div>

      <h3 className="font-display line-clamp-2 text-[16px] font-medium leading-[1.18] tracking-[-0.01em] text-fg-strong">
        {artifact.title}
      </h3>

      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted">
        {pv || (
          <span className="italic text-faint">Awaiting written content…</span>
        )}
      </p>

      <div className="mt-1 flex items-center justify-between">
        <TypeChip type={artifact.type} />
        <span className="mono inline-flex items-center gap-1 text-[9.5px] tracking-[0.14em] text-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          OPEN
          <span aria-hidden>→</span>
        </span>
      </div>
    </motion.button>
  );
}

export function WorkGrid({
  artifacts,
  isNew,
  onOpen,
}: {
  artifacts: Artifact[];
  isNew: (id: string) => boolean;
  onOpen: (a: Artifact) => void;
}) {
  const now = useNow(15000);
  return (
    <section className="flex min-h-0 flex-col bg-ink">
      <ColumnHeader
        label="The Work"
        count={artifacts.length}
        right={
          <span className="mono text-[10px] tracking-[0.1em] text-faint">
            body of work · newest first
          </span>
        }
      />
      <div className="scroll min-h-0 flex-1 p-3.5">
        {artifacts.length === 0 ? (
          <EmptyState
            glyph="❖"
            title="No artifacts yet"
            sub="Briefs, market scans, specs, and GTM plans accumulate here as a living wall of work."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {artifacts.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  flash={isNew(a.id)}
                  now={now}
                  onOpen={() => onOpen(a)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
