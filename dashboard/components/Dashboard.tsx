"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBridgeData } from "@/lib/useBridgeData";
import type { Artifact } from "@/lib/types";
import { HomeView } from "./HomeView";
import { CockpitView } from "./CockpitView";
import { ArtifactDrawer } from "./ArtifactDrawer";

export function Dashboard() {
  const data = useBridgeData();
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [ventureId, setVentureId] = useState<string | null>(null);

  // Reflect the open company in the URL (?v=<id>) so refresh/back/forward and
  // share-links work — while preserving any existing params (e.g. ?demo=1).
  useEffect(() => {
    const read = () =>
      setVentureId(new URLSearchParams(window.location.search).get("v"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const navigate = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("v", id);
    else params.delete("v");
    const qs = params.toString();
    window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
    setVentureId(id);
    setSelected(null); // close any open drawer when changing screens
  }, []);

  const venture = useMemo(
    () => (ventureId ? data.ventures.find((v) => v.id === ventureId) ?? null : null),
    [ventureId, data.ventures],
  );

  const selectedVentureTitle = selected
    ? data.ventures.find((v) => v.id === selected.venture_id)?.title
    : undefined;

  return (
    <>
      {venture ? (
        <CockpitView
          data={data}
          venture={venture}
          onHome={() => navigate(null)}
          onSwitch={(id) => navigate(id)}
          onOpenArtifact={setSelected}
        />
      ) : (
        <HomeView data={data} onSelectVenture={(id) => navigate(id)} />
      )}

      <ArtifactDrawer
        artifact={selected}
        ventureTitle={selectedVentureTitle}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
