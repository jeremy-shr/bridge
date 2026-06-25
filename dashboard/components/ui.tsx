import { agentMeta } from "@/lib/agents";
import { artifactTypeLabel } from "@/lib/pipeline";
import { pad } from "@/lib/format";
import type { AgentName } from "@/lib/types";

export function agentColor(agent: string): string {
  return agentMeta(agent).color;
}

export function AgentDot({
  agent,
  working = false,
  size = 7,
}: {
  agent: AgentName | string;
  working?: boolean;
  size?: number;
}) {
  const c = agentColor(agent);
  return (
    <span
      aria-hidden
      style={{
        background: c,
        width: size,
        height: size,
        boxShadow: working
          ? `0 0 0 3px color-mix(in oklch, ${c} 24%, transparent)`
          : `0 0 0 2px color-mix(in oklch, ${c} 16%, transparent)`,
      }}
      className="inline-block shrink-0 rounded-full"
    />
  );
}

/** Agent attribution for dark surfaces. */
export function AgentLabel({
  agent,
  className = "",
}: {
  agent: AgentName | string;
  className?: string;
}) {
  const m = agentMeta(agent);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <AgentDot agent={agent} />
      <span
        className="text-[11px] font-semibold tracking-[0.01em]"
        style={{ color: m.color }}
      >
        {m.name}
      </span>
    </span>
  );
}

export function TypeChip({
  type,
  tone = "ink",
}: {
  type: string;
  tone?: "ink" | "paper";
}) {
  const cls =
    tone === "paper"
      ? "border-paper-line-2/70 bg-paper-3/60 text-paper-ink-2"
      : "border-line bg-ink-deep text-muted";
  return (
    <span
      className={`mono rounded-[3px] border px-1.5 py-[1.5px] text-[9.5px] font-medium uppercase tracking-[0.14em] ${cls}`}
    >
      {artifactTypeLabel(type)}
    </span>
  );
}

/** Dark ops-grid column header: accent tick · eyebrow · count · right slot. */
export function ColumnHeader({
  label,
  count,
  accent = "var(--signal)",
  right,
}: {
  label: string;
  count?: number;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="col-head">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="block h-3.5 w-[3px] rounded-full"
          style={{ background: accent }}
        />
        <span className="eyebrow text-fg-strong/90">{label}</span>
        {count !== undefined && (
          <span className="mono text-[11px] tabular-nums text-faint">
            {pad(count)}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({
  title,
  sub,
  glyph = "◇",
}: {
  title: string;
  sub?: string;
  glyph?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div
        className="font-display text-3xl text-line-2"
        style={{ animation: "breathe 3.6s ease-in-out infinite" }}
      >
        {glyph}
      </div>
      <div className="text-[12.5px] font-medium tracking-[0.02em] text-muted">
        {title}
      </div>
      {sub && (
        <div className="mono max-w-[34ch] text-[11px] leading-relaxed text-faint">
          {sub}
        </div>
      )}
    </div>
  );
}
