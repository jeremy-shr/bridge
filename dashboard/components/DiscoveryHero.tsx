"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AGENTS, AGENT_ORDER, agentMeta, runningVerb } from "@/lib/agents";
import { ventureProgress } from "@/lib/pipeline";
import { clockTime, formatUptime, relativeTime } from "@/lib/format";
import type { BridgeData } from "@/lib/useBridgeData";
import type { ConnectionStatus, Message, Venture } from "@/lib/types";
import { useNow } from "@/lib/useNow";

/* ---------- live / connection state, legible on paper ---------- */
function StatusFlag({ status }: { status: ConnectionStatus }) {
  if (status === "live" || status === "demo") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="live-dot" />
        <span className="mono text-[12px] font-semibold tracking-[0.16em] text-ok-deep">
          LIVE
        </span>
        {status === "demo" && (
          <span className="mono rounded-[3px] border border-paper-line-2/70 px-1.5 py-[1px] text-[9px] tracking-[0.16em] text-paper-ink-3">
            SIMULATED
          </span>
        )}
      </span>
    );
  }
  const map: Record<string, { color: string; label: string }> = {
    connecting: { color: "var(--signal-deep)", label: "LINKING" },
    error: { color: "var(--fail)", label: "SIGNAL LOST" },
    empty: { color: "var(--paper-ink-3)", label: "STANDBY" },
  };
  const cfg = map[status] ?? map.empty;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          background: cfg.color,
          animation:
            status === "connecting" ? "breathe 1.2s ease-in-out infinite" : undefined,
        }}
      />
      <span
        className="mono text-[12px] font-semibold tracking-[0.16em]"
        style={{ color: cfg.color }}
      >
        {cfg.label}
      </span>
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-display text-[30px] leading-[0.9] tracking-[-0.02em] tabular-nums"
        style={{ color: accent ? "var(--signal-deep)" : "var(--paper-ink)" }}
      >
        {value}
      </span>
      <span className="eyebrow-paper text-[9.5px]">{label}</span>
    </div>
  );
}

/* ---------- one "idea in development" intake card ---------- */
function IntakeCard({
  venture,
  sourced,
  now,
}: {
  venture: Venture;
  sourced: boolean;
  now: number;
}) {
  const p = ventureProgress(venture.phase);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-[10px] border border-paper-line bg-paper-edge/70 p-2.5 shadow-[var(--shadow-paper)]"
    >
      <div className="flex items-center justify-between">
        <span className="mono inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-paper-ink-3">
          {sourced ? (
            <>
              <WhatsAppGlyph className="h-3 w-3 text-ok-deep" />
              texted in
            </>
          ) : (
            <>
              <span className="text-signal-deep">✳</span> seeded
            </>
          )}
        </span>
        <span className="mono text-[9.5px] tabular-nums text-paper-faint">
          {relativeTime(venture.created_at, now)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 font-display text-[14px] italic leading-snug text-paper-ink">
        {venture.seed_prompt || venture.title}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex h-1 flex-1 gap-[2px]">
          {Array.from({ length: p.total }).map((_, i) => (
            <span
              key={i}
              className="h-full flex-1 rounded-full"
              style={{
                background:
                  i < p.done ? "var(--signal-deep)" : "var(--paper-line-2)",
              }}
            />
          ))}
        </div>
        <span className="mono shrink-0 text-[9px] uppercase tracking-[0.1em] text-paper-ink-3">
          {p.stage === "build" ? p.label : `Deepening ×${p.deepening}`}
        </span>
      </div>
    </motion.div>
  );
}

function WhatsAppGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1.01-2.41.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.59.82 2.01.89 2.16.07.14.12.31.02.51-.1.2-.15.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.29-.13.58.17.29.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.42.29.14.45.12.62-.07.17-.2.71-.83.9-1.11.19-.29.38-.24.64-.14.27.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.71-.17 1.39Z" />
    </svg>
  );
}

/* ---------- "from your phone": the WhatsApp source bubble ---------- */
function PhoneBubble({ message, now }: { message: Message; now: number }) {
  const out = message.direction === "out";
  return (
    <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[90%] rounded-[12px] border px-2.5 py-1.5 text-[12px] leading-snug ${
          out
            ? "rounded-br-[3px] border-[oklch(0.6_0.12_150_/_0.4)] bg-[oklch(0.74_0.13_150_/_0.18)] text-paper-ink"
            : "rounded-bl-[3px] border-paper-line-2/80 bg-paper-edge text-paper-ink"
        }`}
      >
        {message.body}
      </div>
      <span className="mono mt-0.5 px-1 text-[8.5px] tracking-[0.1em] text-paper-faint">
        {out ? "agent" : "you"} · {relativeTime(message.created_at, now)}
      </span>
    </div>
  );
}

export function DiscoveryHero({ data }: { data: BridgeData }) {
  const now = useNow(1000);
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setClock(clockTime(new Date().toISOString()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { ventures, tasks, messages, artifacts, counts, workingAgents, startedAt } =
    data;

  const ventureById = new Map(ventures.map((v) => [v.id, v]));
  const active = ventures.filter((v) => v.status === "active");
  const developing = active.length || ventures.length;
  const running = tasks.filter((t) => t.status === "running").slice(0, 2);

  // newest ideas first
  const newest = [...ventures].reverse().slice(0, 2);
  const sourcedVentureIds = new Set(
    messages.filter((m) => m.direction === "in" && m.venture_id).map((m) => m.venture_id),
  );

  // the WhatsApp source thread — latest inbound idea + latest agent ping-back
  const chat = messages.filter((m) => m.direction === "in" || m.direction === "out");
  const phone = chat.slice(-3);

  const uptime = startedAt ? formatUptime(now - startedAt) : "--:--:--";

  // live wire — the company's recent thinking, as a marquee
  const wire = artifacts.slice(0, 12).map((a) => ({
    id: a.id,
    agent: a.agent,
    title: a.title,
    venture: a.venture_id ? ventureById.get(a.venture_id)?.title : undefined,
  }));

  return (
    <header className="paper relative z-20 shrink-0 border-b border-paper-line-2/60">
      <div className="relative z-10 px-5 pt-3 sm:px-8">
        {/* masthead */}
        <div className="flex items-center justify-between gap-4 border-b border-paper-line/70 pb-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-[3px]" aria-hidden>
              {AGENT_ORDER.map((a) => (
                <span
                  key={a}
                  className="h-4 w-[3px] rounded-full"
                  style={{ background: AGENTS[a].color }}
                />
              ))}
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-[24px] font-semibold leading-none tracking-[-0.01em] text-paper-ink">
                Bridge
              </span>
              <span className="eyebrow-paper hidden text-[10px] sm:inline">
                Autonomous Venture Studio
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <StatusFlag status={data.status} />
            <span className="hidden h-4 w-px bg-paper-line-2/70 sm:block" />
            <div className="hidden items-baseline gap-1.5 sm:flex">
              <span className="eyebrow-paper text-[9px]">Local</span>
              <span className="mono text-[12.5px] tabular-nums text-paper-ink-2">
                {clock ?? "--:--:--"}
              </span>
            </div>
            <span className="hidden h-4 w-px bg-paper-line-2/70 md:block" />
            <div className="hidden items-baseline gap-1.5 md:flex">
              <span className="eyebrow-paper text-[9px]">Uptime</span>
              <span className="mono text-[12.5px] tabular-nums text-paper-ink-2">
                {uptime}
              </span>
            </div>
          </div>
        </div>

        {/* discovery composition */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 py-4 lg:grid-cols-12">
          {/* left — the live discovery statement */}
          <div className="flex flex-col lg:col-span-7">
            <span className="eyebrow-paper inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-deep" />
              Live Discovery
            </span>
            <h1
              className="rise mt-2 font-display text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.04] tracking-[-0.02em] text-paper-ink"
              style={{ animationDelay: "60ms" }}
            >
              {developing > 0 ? (
                <>
                  Developing{" "}
                  <span className="italic text-signal-deep">
                    {developing} {developing === 1 ? "idea" : "ideas"}
                  </span>{" "}
                  into companies — right now.
                </>
              ) : (
                <>
                  Listening for the{" "}
                  <span className="italic text-signal-deep">next idea</span> worth
                  building.
                </>
              )}
            </h1>

            {/* what's being worked this second */}
            <div className="mt-3.5 flex flex-col gap-1.5">
              {running.length > 0 ? (
                running.map((t) => {
                  const m = agentMeta(t.agent);
                  const v = t.venture_id ? ventureById.get(t.venture_id) : undefined;
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 text-[13px]">
                      <span className="spinner spinner-paper" style={{ width: 11, height: 11 }} />
                      <span className="min-w-0 truncate">
                        <span className="font-semibold" style={{ color: m.color }}>
                          {t.agent}
                        </span>{" "}
                        <span className="text-paper-ink-2">
                          is {runningVerb(t.title, t.agent)}
                        </span>{" "}
                        <span className="font-medium text-paper-ink">{t.title}</span>
                        {v && (
                          <span className="text-paper-ink-3"> · {v.title}</span>
                        )}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-2.5 text-[13px] text-paper-ink-2">
                  <span className="h-2 w-2 rounded-full bg-paper-line-2" />
                  The team is between moves — listening for the next idea.
                </div>
              )}
            </div>

            {/* live figures — anchored to a baseline rule */}
            <div
              className="rise mt-auto flex items-end gap-7 border-t border-paper-line/70 pt-4"
              style={{ animationDelay: "200ms" }}
            >
              <Stat label="Ventures in motion" value={String(counts.ventures)} accent />
              <Stat label="Artifacts produced" value={String(counts.artifacts)} />
              <Stat
                label="Agents thinking"
                value={`${workingAgents.size}/${AGENT_ORDER.length}`}
              />
              <div className="ml-auto hidden flex-col items-end gap-1 self-end xl:flex">
                <span className="font-display text-[30px] leading-[0.9] tracking-[-0.02em] tabular-nums text-paper-ink">
                  {counts.tasksDone}
                </span>
                <span className="eyebrow-paper text-[9.5px]">Tasks shipped</span>
              </div>
            </div>
          </div>

          {/* right — intake + the phone */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-5">
            {/* idea intake */}
            <div className="flex flex-col">
              <span className="eyebrow-paper mb-2.5">Idea Intake</span>
              <div className="flex flex-col gap-2.5">
                <AnimatePresence initial={false}>
                  {newest.length > 0 ? (
                    newest.map((v) => (
                      <IntakeCard
                        key={v.id}
                        venture={v}
                        sourced={sourcedVentureIds.has(v.id)}
                        now={now}
                      />
                    ))
                  ) : (
                    <div className="rounded-[10px] border border-dashed border-paper-line-2/70 px-3 py-5 text-center">
                      <p className="mono text-[10.5px] tracking-[0.04em] text-paper-ink-3">
                        Listening for the first idea
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* from your phone — WhatsApp as a first-class source */}
            <div className="flex flex-col">
              <span className="eyebrow-paper mb-2.5 inline-flex items-center gap-1.5">
                <WhatsAppGlyph className="h-3.5 w-3.5 text-ok-deep" />
                From Your Phone
              </span>
              <div className="flex flex-1 flex-col justify-between gap-2 rounded-[12px] border border-paper-line bg-[linear-gradient(180deg,var(--paper-edge),var(--paper-2))] p-2.5 shadow-[var(--shadow-paper)]">
                <div className="flex flex-col gap-2">
                  {phone.length > 0 ? (
                    phone.map((m) => <PhoneBubble key={m.id} message={m} now={now} />)
                  ) : (
                    <p className="mono py-3 text-center text-[10.5px] text-paper-ink-3">
                      Text an idea to start a venture
                    </p>
                  )}
                </div>
                <div className="mono flex items-center gap-1.5 border-t border-paper-line/70 pt-2 text-[9px] tracking-[0.1em] text-paper-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok-deep" />
                  WHATSAPP · IDEAS IN, PINGS OUT
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* live wire — the seam between intake desk and ops floor */}
      <div className="relative z-10 flex items-stretch border-t border-paper-line/70 bg-paper-2/60">
        <div className="flex shrink-0 items-center gap-2 border-r border-paper-line-2/60 px-4 py-1.5">
          <span className="live-dot" />
          <span className="mono text-[9.5px] font-semibold tracking-[0.18em] text-paper-ink-2">
            LIVE WIRE
          </span>
        </div>
        <div className="ticker-mask min-w-0 flex-1 overflow-hidden py-1.5">
          {wire.length > 0 ? (
            <div className="ticker-track">
              {[...wire, ...wire].map((w, i) => {
                const m = agentMeta(w.agent);
                return (
                  <span
                    key={`${w.id}-${i}`}
                    className="mono inline-flex items-center gap-2 px-5 text-[11px] text-paper-ink-2"
                    aria-hidden={i >= wire.length}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: m.color }}
                    />
                    <span className="font-semibold text-paper-ink">{w.agent}</span>
                    <span className="text-paper-ink-3">{w.title}</span>
                    {w.venture && (
                      <span className="text-paper-faint">— {w.venture}</span>
                    )}
                    <span className="px-2 text-paper-line-2">/</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="mono px-5 py-2 text-[11px] text-paper-ink-3">
              Awaiting the first signal from the team…
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
