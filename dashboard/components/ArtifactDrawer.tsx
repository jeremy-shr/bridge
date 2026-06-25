"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clockTime, relativeTime } from "@/lib/format";
import { artifactTypeLabel } from "@/lib/pipeline";
import type { Artifact } from "@/lib/types";
import { AgentLabel, TypeChip } from "./ui";

export function ArtifactDrawer({
  artifact,
  ventureTitle,
  onClose,
}: {
  artifact: Artifact | null;
  ventureTitle?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = artifact !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {artifact && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-ink-deep/72 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="relative flex h-full w-full max-w-[660px] flex-col border-l border-line-2 bg-panel"
            style={{ boxShadow: "var(--shadow-pop)" }}
            initial={{ x: 48, opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* signal rule */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: "linear-gradient(90deg, var(--signal), transparent 70%)" }}
            />
            <header className="shrink-0 border-b border-line bg-panel-2/60 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <AgentLabel agent={artifact.agent} />
                  <TypeChip type={artifact.type} />
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="focus-ring -mr-1 grid h-7 w-7 place-items-center rounded text-dim transition-colors hover:bg-elevated hover:text-fg"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <h2 className="font-display mt-3 text-[24px] font-semibold leading-[1.1] tracking-[-0.015em] text-fg-strong">
                {artifact.title}
              </h2>
              <div className="mono mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-faint">
                {ventureTitle && (
                  <>
                    <span className="text-signal">{ventureTitle}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>{clockTime(artifact.created_at)}</span>
                <span aria-hidden>·</span>
                <span>{relativeTime(artifact.created_at)} ago</span>
              </div>
            </header>

            <div className="scroll min-h-0 flex-1 px-6 py-6">
              {artifact.body && artifact.body.trim() ? (
                <div className="md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
                    }}
                  >
                    {artifact.body}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-line py-16 text-center">
                  <span
                    className="font-display text-3xl text-line-2"
                    style={{ animation: "breathe 3.6s ease-in-out infinite" }}
                  >
                    ❖
                  </span>
                  <div className="text-[13px] font-medium text-muted">
                    No written content yet
                  </div>
                  <p className="mono max-w-[42ch] text-[11px] leading-relaxed text-faint">
                    {artifact.agent} logged this {artifactTypeLabel(artifact.type)},
                    but the written body hasn&rsquo;t been attached. It will render
                    here the moment the agent writes it.
                  </p>
                </div>
              )}
              <div className="mono mt-10 flex items-center gap-2 border-t border-line pt-3 text-[9.5px] tracking-[0.08em] text-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-signal/60" />
                ARTIFACT · {artifact.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
