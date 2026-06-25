"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";
import { buildDemoData, startDemoStream } from "./demo";
import type {
  AgentName,
  Artifact,
  ConnectionStatus,
  Message,
  TableName,
  Task,
  Venture,
} from "./types";

const TABLES: TableName[] = ["ventures", "tasks", "artifacts", "messages"];
const CAP = 300; // keep newest N rows per feed table

type Row = Venture | Task | Artifact | Message;

interface Store {
  ventures: Map<string, Venture>;
  tasks: Map<string, Task>;
  artifacts: Map<string, Artifact>;
  messages: Map<string, Message>;
}

function emptyStore(): Store {
  return {
    ventures: new Map(),
    tasks: new Map(),
    artifacts: new Map(),
    messages: new Map(),
  };
}

function ascByCreated<T extends { created_at: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at < b.created_at
        ? -1
        : 1,
  );
}
function descByCreated<T extends { created_at: string; id: string }>(rows: T[]): T[] {
  return ascByCreated(rows).reverse();
}

function capMap<T extends { created_at: string; id: string }>(map: Map<string, T>) {
  if (map.size <= CAP) return;
  const oldestFirst = ascByCreated([...map.values()]);
  for (let i = 0; i < oldestFirst.length - CAP; i++) {
    map.delete(oldestFirst[i].id);
  }
}

export interface BridgeData {
  status: ConnectionStatus;
  ventures: Venture[];
  tasks: Task[];
  artifacts: Artifact[];
  messages: Message[];
  counts: {
    ventures: number;
    artifacts: number;
    tasksDone: number;
    tasksRunning: number;
  };
  workingAgents: Set<AgentName>;
  startedAt: number | null;
  isNew: (id: string) => boolean;
}

export function useBridgeData(): BridgeData {
  const store = useRef<Store>(emptyStore());
  const newIds = useRef<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const apply = useCallback((table: TableName, row: Row, flash = true) => {
    const map = store.current[table] as unknown as Map<string, Row>;
    const isNew = !map.has(row.id);
    map.set(row.id, row);
    if (isNew) {
      capMap(map);
      if (flash) {
        newIds.current.add(row.id);
        const id = row.id;
        const t = setTimeout(() => {
          newIds.current.delete(id);
          force();
        }, 2600);
        timers.current.push(t);
      }
    }
    force();
  }, []);

  useEffect(() => {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const demo = process.env.NEXT_PUBLIC_DEMO === "1" || params.has("demo");

    // --- demo mode: seed a snapshot, then simulate realtime ---
    if (demo) {
      const seed = buildDemoData();
      seed.ventures.forEach((r) => apply("ventures", r, false));
      seed.tasks.forEach((r) => apply("tasks", r, false));
      seed.artifacts.forEach((r) => apply("artifacts", r, false));
      seed.messages.forEach((r) => apply("messages", r, false));
      setStatus("demo");
      const stop = startDemoStream(seed, (table, r) => apply(table, r, true));
      return () => {
        stop();
        timers.current.forEach(clearTimeout);
      };
    }

    // --- no creds: clean empty states, no crash ---
    if (!isSupabaseConfigured || !supabase) {
      setStatus("empty");
      return;
    }

    // --- live: initial fetch + realtime (INSERT + UPDATE) on all four tables ---
    const sb = supabase; // non-null past the guard above
    let cancelled = false;
    setStatus("connecting");

    (async () => {
      try {
        const [v, t, a, m] = await Promise.all([
          sb.from("ventures").select("*").order("created_at", { ascending: true }),
          sb.from("tasks").select("*").order("created_at", { ascending: false }).limit(CAP),
          sb.from("artifacts").select("*").order("created_at", { ascending: false }).limit(CAP),
          sb.from("messages").select("*").order("created_at", { ascending: false }).limit(CAP),
        ]);
        if (cancelled) return;
        (v.data as Venture[] | null)?.forEach((r) => apply("ventures", r, false));
        (t.data as Task[] | null)?.forEach((r) => apply("tasks", r, false));
        (a.data as Artifact[] | null)?.forEach((r) => apply("artifacts", r, false));
        (m.data as Message[] | null)?.forEach((r) => apply("messages", r, false));
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    // The SDK's postgres_changes generics are over-narrow; type the channel loosely.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let channel: any = sb.channel("bridge-realtime");
    for (const table of TABLES) {
      for (const event of ["INSERT", "UPDATE"] as const) {
        channel = channel.on(
          "postgres_changes",
          { event, schema: "public", table },
          (payload: { new: Row }) => apply(table, payload.new, true),
        );
      }
    }
    channel.subscribe((s: string) => {
      if (s === "SUBSCRIBED") setStatus("live");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT")
        setStatus((prev) => (prev === "live" ? "live" : "error"));
    });
    const sub = channel;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      sb.removeChannel(sub);
    };
  }, [apply]);

  // ---- derived snapshot (cheap at this scale) ----
  const ventures = ascByCreated([...store.current.ventures.values()]);
  const tasks = descByCreated([...store.current.tasks.values()]);
  const artifacts = descByCreated([...store.current.artifacts.values()]);
  const messages = ascByCreated([...store.current.messages.values()]);

  let tasksDone = 0;
  let tasksRunning = 0;
  const workingAgents = new Set<AgentName>();
  for (const t of tasks) {
    if (t.status === "done") tasksDone++;
    else if (t.status === "running") {
      tasksRunning++;
      workingAgents.add(t.agent);
    }
  }

  let startedAt: number | null = null;
  const allCreated = [
    ...ventures,
    ...tasks,
    ...artifacts,
    ...messages,
  ].map((r) => new Date(r.created_at).getTime());
  for (const ms of allCreated) {
    if (!Number.isNaN(ms) && (startedAt === null || ms < startedAt)) startedAt = ms;
  }

  const isNew = useCallback((id: string) => newIds.current.has(id), []);

  return {
    status,
    ventures,
    tasks,
    artifacts,
    messages,
    counts: {
      ventures: ventures.length,
      artifacts: artifacts.length,
      tasksDone,
      tasksRunning,
    },
    workingAgents,
    startedAt,
    isNew,
  };
}
