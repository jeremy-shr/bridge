"use client";

import { AnimatePresence, motion } from "framer-motion";
import { agentMeta, runningVerb } from "@/lib/agents";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { Task } from "@/lib/types";
import { ColumnHeader, EmptyState } from "./ui";

function elapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ok">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <path d="M4.2 7.1l1.9 1.9 3.7-3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fail">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      <path d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TaskRow({ task, now, flash }: { task: Task; now: number; flash: boolean }) {
  const m = agentMeta(task.agent);
  const running = task.status === "running";
  const failed = task.status === "failed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex items-start gap-3 border-b border-line/60 py-2.5 pl-4 pr-3.5 transition-colors ${
        running ? "bg-[var(--signal-soft)]" : "hover:bg-panel/40"
      } ${flash ? "flash" : ""}`}
    >
      {running && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ background: "var(--signal)" }}
        />
      )}
      <span className="mt-[3px] flex h-3.5 w-3.5 items-center justify-center">
        {running ? <span className="spinner" /> : failed ? <Cross /> : <Check />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          <span className="font-semibold" style={{ color: m.color }}>
            {task.agent}
          </span>{" "}
          {running ? (
            <>
              <span className="text-dim">is {runningVerb(task.title, task.agent)} </span>
              <span className="font-medium text-fg-strong">{task.title}</span>
              <span className="text-dim">…</span>
            </>
          ) : failed ? (
            <>
              <span className="text-dim">could not finish </span>
              <span className="text-muted">{task.title}</span>
            </>
          ) : (
            <>
              <span className="text-dim">delivered </span>
              <span className="text-fg">{task.title}</span>
            </>
          )}
        </p>
      </div>

      <span className="mono mt-[1px] shrink-0 text-[10px] tabular-nums">
        {running ? (
          <span className="text-signal">{elapsed(task.created_at, now)}</span>
        ) : (
          <span className="text-faint">{relativeTime(task.completed_at ?? task.created_at, now)}</span>
        )}
      </span>
    </motion.div>
  );
}

export function ActivityFeed({
  tasks,
  isNew,
}: {
  tasks: Task[];
  isNew: (id: string) => boolean;
}) {
  const now = useNow(1000);
  const running = tasks.filter((t) => t.status === "running").length;

  return (
    <section className="flex min-h-0 flex-col bg-ink">
      <ColumnHeader
        label="Live Activity"
        count={tasks.length}
        right={
          running > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner" style={{ width: 10, height: 10 }} />
              <span className="mono text-[10px] tracking-[0.08em] text-signal">
                {running} running
              </span>
            </span>
          ) : (
            <span className="mono text-[10px] tracking-[0.12em] text-faint">idle</span>
          )
        }
      />
      <div className="scroll min-h-0 flex-1">
        {tasks.length === 0 ? (
          <EmptyState
            glyph="⌁"
            title="Awaiting first signal"
            sub="Task activity from the agent team streams in here the moment work begins."
          />
        ) : (
          <AnimatePresence initial={false}>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} now={now} flash={isNew(t.id)} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
