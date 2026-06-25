"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENT_ORDER, AGENTS, runningVerb } from "@/lib/agents";
import { PIPELINE_TITLES, ventureProgress } from "@/lib/pipeline";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { BridgeData } from "@/lib/useBridgeData";
import type { Artifact, Task, Venture } from "@/lib/types";
import { ActivityFeed } from "./ActivityFeed";
import { WorkGrid } from "./WorkGrid";
import { CommsPanel } from "./CommsPanel";
import { ColumnHeader } from "./ui";

/* compact labels for the pipeline rail (mirrors PIPELINE_TITLES order) */
const STEP_SHORT = [
  "Brief",
  "Validation",
  "Market scan",
  "MVP spec",
  "Go-to-market",
  "Landing copy",
  "Risks",
];

/* ---------- small primitives ---------- */
function StatusChip({ status }: { status: Venture["status"] }) {
  const cfg: Record<Venture["status"], { color: string; label: string }> = {
    active: { color: "var(--ok)", label: "ACTIVE" },
    paused: { color: "var(--signal)", label: "PAUSED" },
    archived: { color: "var(--faint)", label: "ARCHIVED" },
  };
  const c = cfg[status] ?? cfg.archived;
  return (
    <span
      className="mono inline-flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.16em]"
      style={{ color: c.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-display text-[24px] leading-[0.9] tracking-[-0.02em] tabular-nums"
        style={{ color: accent ? "var(--signal-bright)" : "var(--fg-strong)" }}
      >
        {value}
      </span>
      <span className="eyebrow text-[9px]">{label}</span>
    </div>
  );
}

/* ---------- company switcher ---------- */
function CompanySwitcher({
  ventures,
  current,
  onSwitch,
}: {
  ventures: Venture[];
  current: Venture;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="focus-ring inline-flex max-w-[230px] items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 transition-colors hover:border-line-2 hover:bg-panel-2 sm:max-w-[280px]"
      >
        <span className="mono hidden text-[9px] tracking-[0.14em] text-faint sm:inline">
          COMPANY
        </span>
        <span className="truncate text-[12.5px] font-medium text-fg">{current.title}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 z-50 mt-1.5 w-[300px] rounded-lg border border-line-2 bg-panel-2 p-1"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <div className="mono px-2 py-1.5 text-[9px] tracking-[0.16em] text-faint">
              SWITCH COMPANY · {ventures.length}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {ventures.map((v) => {
                const sel = v.id === current.id;
                const p = ventureProgress(v.phase);
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => {
                      onSwitch(v.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                      sel ? "bg-elevated" : "hover:bg-elevated/60"
                    }`}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          v.status === "active" ? "var(--ok)" : "var(--faint)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-fg-strong">
                        {v.title}
                      </span>
                      <span className="mono text-[9.5px] tracking-[0.04em] text-faint">
                        P{v.phase} · {p.done}/{p.total} steps · {v.status}
                      </span>
                    </span>
                    {sel && (
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0 text-signal">
                        <path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- pipeline rail — the build, step by step ---------- */
function PipelineRail({
  venture,
  artifacts,
  running,
  onOpen,
}: {
  venture: Venture;
  artifacts: Artifact[];
  running: Task[];
  onOpen: (a: Artifact) => void;
}) {
  const p = ventureProgress(venture.phase);
  const runningTitles = new Set(running.map((t) => t.title));
  // artifacts arrive newest-first; first match per title is the latest deliverable
  const latestByTitle = (title: string) => artifacts.find((a) => a.title === title);

  return (
    <div className="relative z-10 shrink-0 border-b border-line bg-ink-deep/50">
      <div className="flex items-center gap-2 px-5 pt-2.5 sm:px-7">
        <span aria-hidden className="block h-3 w-[3px] rounded-full" style={{ background: "var(--signal)" }} />
        <span className="eyebrow">Build Pipeline</span>
        <span className="mono text-[10px] tabular-nums text-faint">
          {p.done}/{p.total}
          {p.deepening > 0 && <span className="text-signal-bright"> · +{p.deepening} deeper</span>}
        </span>
      </div>
      <div className="scroll-x flex items-stretch gap-2 px-5 pb-3 pt-2 sm:px-7">
        {PIPELINE_TITLES.map((title, i) => {
          const done = i < p.done;
          const isRunning = runningTitles.has(title) && !done;
          const art = done ? latestByTitle(title) : undefined;
          const state = isRunning ? "running" : done ? "done" : "upcoming";
          const color =
            state === "done"
              ? "var(--signal)"
              : state === "running"
                ? "var(--signal-bright)"
                : "var(--line-2)";
          const clickable = state === "done" && !!art;
          return (
            <button
              key={title}
              type="button"
              disabled={!clickable}
              onClick={clickable && art ? () => onOpen(art) : undefined}
              className={`group relative flex min-w-[116px] flex-1 flex-col gap-1.5 rounded-[8px] border px-2.5 py-2 text-left transition-colors ${
                clickable ? "focus-ring cursor-pointer hover:border-line-2 hover:bg-panel/60" : "cursor-default"
              } ${state === "running" ? "border-signal-line bg-[var(--signal-soft)]" : "border-line bg-panel/30"}`}
            >
              <div className="flex items-center justify-between">
                <span className="mono text-[9px] tabular-nums text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {state === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color }}>
                    <path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : state === "running" ? (
                  <span className="spinner" style={{ width: 11, height: 11 }} />
                ) : (
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                )}
              </div>
              <span
                className={`text-[11.5px] font-medium leading-tight ${
                  state === "upcoming" ? "text-dim" : "text-fg-strong"
                }`}
              >
                {STEP_SHORT[i]}
              </span>
              <span className="h-[3px] w-full overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: state === "upcoming" ? "0%" : state === "running" ? "55%" : "100%",
                    background: color,
                    animation: state === "running" ? "breathe 1.4s ease-in-out infinite" : undefined,
                  }}
                />
              </span>
            </button>
          );
        })}
        {p.deepening > 0 && (
          <div className="flex min-w-[92px] flex-col items-center justify-center gap-1 rounded-[8px] border border-signal-line/60 bg-[var(--signal-soft)] px-2.5 py-2">
            <span className="font-display text-[18px] leading-none tracking-[-0.02em] text-signal-bright">
              +{p.deepening}
            </span>
            <span className="mono text-[8.5px] tracking-[0.12em] text-faint">DEEPER WORK</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- scoped agent roster — what each agent is doing for THIS company ---------- */
function CockpitRoster({
  tasks,
  artifacts,
}: {
  tasks: Task[];
  artifacts: Artifact[];
}) {
  const working = AGENT_ORDER.filter((a) =>
    tasks.some((t) => t.status === "running" && t.agent === a),
  ).length;

  return (
    <section className="flex flex-col">
      <ColumnHeader
        label="Agent Roster"
        accent="var(--agent-scout)"
        right={
          <span className="mono text-[10px] tracking-[0.08em] text-faint">
            {working}/{AGENT_ORDER.length} on this company
          </span>
        }
      />
      <div className="divide-y divide-line/60">
        {AGENT_ORDER.map((name) => {
          const m = AGENTS[name];
          const run = tasks.find((t) => t.status === "running" && t.agent === name);
          const last = artifacts.find((a) => a.agent === name);
          const shipped = artifacts.filter((a) => a.agent === name).length;
          const busy = !!run;
          return (
            <div
              key={name}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel/40"
            >
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: busy ? "var(--ok)" : "var(--faint)",
                    boxShadow: busy ? "0 0 0 3px var(--ok-soft)" : undefined,
                    animation: busy ? "breathe 2s ease-in-out infinite" : undefined,
                  }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold" style={{ color: m.color }}>
                    {m.name}
                  </span>
                  <span className="mono text-[9px] tracking-[0.14em] text-faint">{m.code}</span>
                </div>
                <p className="truncate text-[11px] leading-tight text-dim">
                  {busy ? (
                    <>
                      <span className="text-signal">{runningVerb(run!.title, name)} </span>
                      <span className="text-muted">{run!.title}…</span>
                    </>
                  ) : last ? (
                    <>
                      <span className="text-faint">last delivered </span>
                      <span className="text-muted">{last.title}</span>
                    </>
                  ) : (
                    <span className="text-faint">no work on this company yet</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span
                  className="mono text-[9px] font-medium tracking-[0.14em]"
                  style={{ color: busy ? "var(--ok)" : "var(--faint)" }}
                >
                  {busy ? "WORKING" : "READY"}
                </span>
                {shipped > 0 && (
                  <span className="mono text-[9px] tabular-nums text-faint">{shipped} shipped</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   COCKPIT — one company, one dense mission-control surface
   ============================================================ */
export function CockpitView({
  data,
  venture,
  onHome,
  onSwitch,
  onOpenArtifact,
}: {
  data: BridgeData;
  venture: Venture;
  onHome: () => void;
  onSwitch: (id: string) => void;
  onOpenArtifact: (a: Artifact) => void;
}) {
  const now = useNow(1000);
  const vid = venture.id;

  const tasks = useMemo(
    () => data.tasks.filter((t) => t.venture_id === vid),
    [data.tasks, vid],
  );
  const artifacts = useMemo(
    () => data.artifacts.filter((a) => a.venture_id === vid),
    [data.artifacts, vid],
  );
  const messages = useMemo(
    () => data.messages.filter((m) => m.venture_id === vid),
    [data.messages, vid],
  );

  const running = useMemo(() => tasks.filter((t) => t.status === "running"), [tasks]);
  const workingCount = new Set(running.map((t) => t.agent)).size;
  const p = ventureProgress(venture.phase);

  const lastTs = useMemo(() => {
    const ts = [...tasks, ...artifacts, ...messages]
      .map((r) =>
        new Date(
          ("completed_at" in r && r.completed_at) || r.created_at,
        ).getTime(),
      )
      .filter((n) => !Number.isNaN(n));
    return ts.length ? Math.max(...ts) : null;
  }, [tasks, artifacts, messages]);

  return (
    <div className="flex min-h-screen flex-col bg-ink lg:h-screen lg:overflow-hidden">
      {/* ---------- header: name · thesis · status ---------- */}
      <header className="relative z-30 shrink-0 border-b border-line bg-panel/30">
        <div className="flex items-center justify-between gap-4 border-b border-line/70 px-5 py-2.5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onHome}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-2 hover:text-fg"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7 2.5L3.5 6 7 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </button>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <div className="hidden items-center gap-[3px] sm:flex" aria-hidden>
              {AGENT_ORDER.map((a) => (
                <span key={a} className="h-3.5 w-[3px] rounded-full" style={{ background: AGENTS[a].color }} />
              ))}
            </div>
            <span className="font-display hidden text-[15px] font-semibold tracking-[-0.01em] text-fg-strong sm:inline">
              Bridge
            </span>
            <span className="eyebrow hidden md:inline">Company Cockpit</span>
          </div>
          <CompanySwitcher ventures={data.ventures} current={venture} onSwitch={onSwitch} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 px-5 py-3.5 sm:px-7">
          <div className="min-w-0 max-w-[64ch]">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusChip status={venture.status} />
              <span aria-hidden className="h-3 w-px bg-line" />
              <span className="mono text-[10px] tracking-[0.14em] text-faint">
                PHASE {venture.phase} · {p.stage === "build" ? "BUILDING" : "DEEPENING"}
              </span>
              {running[0] && (
                <span className="mono inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-signal">
                  <span className="spinner" style={{ width: 9, height: 9 }} />
                  {running.length} running
                </span>
              )}
            </div>
            <h1 className="font-display mt-1.5 text-[clamp(21px,2.4vw,31px)] font-semibold leading-[1.06] tracking-[-0.02em] text-fg-strong">
              {venture.title}
            </h1>
            <p className="font-display mt-1.5 line-clamp-2 text-[14px] italic leading-snug text-muted">
              {venture.seed_prompt || venture.title}
            </p>
          </div>
          <div className="flex items-end gap-6 sm:gap-7">
            <Stat label="Pipeline" value={`${p.done}/${p.total}`} />
            <Stat label="Deliverables" value={String(artifacts.length)} />
            <Stat label="Agents live" value={`${workingCount}/${AGENT_ORDER.length}`} accent />
            <Stat
              label="Last move"
              value={lastTs ? relativeTime(new Date(lastTs).toISOString(), now) : "—"}
            />
          </div>
        </div>
      </header>

      {/* ---------- the build, step by step ---------- */}
      <PipelineRail venture={venture} artifacts={artifacts} running={running} onOpen={onOpenArtifact} />

      {/* ---------- operations floor, scoped to this company ---------- */}
      <main className="relative flex min-h-0 flex-1 flex-col bg-ink">
        <div className="ops-ambient" />
        <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[clamp(290px,21vw,348px)_minmax(0,1fr)_clamp(336px,25vw,408px)]">
          <ActivityFeed tasks={tasks} isNew={data.isNew} />

          <WorkGrid artifacts={artifacts} isNew={data.isNew} onOpen={onOpenArtifact} />

          <div className="flex min-h-0 flex-col bg-ink">
            <div className="shrink-0 border-b border-line">
              <CockpitRoster tasks={tasks} artifacts={artifacts} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <CommsPanel messages={messages} isNew={data.isNew} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
