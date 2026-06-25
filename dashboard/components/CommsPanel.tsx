"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { Message } from "@/lib/types";
import { ColumnHeader, EmptyState } from "./ui";

function WhatsAppGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1.01-2.41.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.59.82 2.01.89 2.16.07.14.12.31.02.51-.1.2-.15.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.29-.13.58.17.29.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.42.29.14.45.12.62-.07.17-.2.71-.83.9-1.11.19-.29.38-.24.64-.14.27.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.71-.17 1.39Z" />
    </svg>
  );
}

function MessageRow({ message, now, flash }: { message: Message; now: number; flash: boolean }) {
  const time = relativeTime(message.created_at, now);

  if (message.direction === "system") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2 px-2 py-1.5"
      >
        <span className="h-px flex-1 bg-line/70" />
        <span className="mono text-[9.5px] tracking-[0.06em] text-dim">{message.body}</span>
        <span className="h-px flex-1 bg-line/70" />
      </motion.div>
    );
  }

  const out = message.direction === "out";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-1 ${out ? "items-end" : "items-start"}`}
    >
      <div className="mono flex items-center gap-1.5 px-1 text-[9px] tracking-[0.12em] text-faint">
        {out ? (
          <span className="inline-flex items-center gap-1 text-ok">
            <WhatsAppGlyph className="h-2.5 w-2.5" /> AGENT
          </span>
        ) : (
          <span className="text-signal">YOU · IDEA IN</span>
        )}
        <span aria-hidden>·</span>
        <span className="tabular-nums">{time}</span>
      </div>
      <div
        className={`max-w-[86%] rounded-[13px] px-3 py-2 text-[12.5px] leading-relaxed ${
          out ? "bubble-out rounded-br-[4px]" : "bubble-in rounded-bl-[4px]"
        } ${flash ? "flash" : ""}`}
      >
        {message.body}
      </div>
    </motion.div>
  );
}

export function CommsPanel({
  messages,
  isNew,
}: {
  messages: Message[];
  isNew: (id: string) => boolean;
}) {
  const now = useNow(15000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = messages.length;
  const inbound = messages.filter((m) => m.direction === "in").length;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [count]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <ColumnHeader
        label="Comms"
        count={count}
        accent="var(--ok)"
        right={
          <span className="mono inline-flex items-center gap-1.5 text-[10px] tracking-[0.06em] text-faint">
            <WhatsAppGlyph className="h-3.5 w-3.5 text-ok" />
            WhatsApp
            {inbound > 0 && (
              <span className="text-dim">
                · <span className="text-signal">{inbound}</span> ideas in
              </span>
            )}
          </span>
        }
      />
      <div ref={scrollRef} className="scroll min-h-0 flex-1 px-3 py-3">
        {count === 0 ? (
          <EmptyState
            glyph="◌"
            title="Channel quiet"
            sub="Ideas you text in and the agents' milestone pings appear here as a live thread."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} now={now} flash={isNew(m.id)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
