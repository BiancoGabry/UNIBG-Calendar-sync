"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlanSummary } from "@/components/sync/plan-list";
import { Progress } from "@/components/ui/progress";

type RunRow = {
  id: number;
  status: "running" | "ok" | "partial" | "anomaly" | "error" | "skipped";
  total: number;
  done: number;
  failed: number;
  counts: Record<string, number> | null;
  error: string | null;
};

/** Polls /api/runs/[id] while a sync is running (first sync ≈ 200 events). */
export function RunProgress({ runId }: { runId: number }) {
  const router = useRouter();
  const [run, setRun] = useState<RunRow | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (res.ok) {
          const row = (await res.json()) as RunRow;
          if (stop) return;
          setRun(row);
          if (row.status !== "running") {
            router.refresh();
            return;
          }
        }
      } catch {
        // retry on next tick
      }
      if (!stop) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (!run) return null;
  const pct =
    run.total > 0 ? Math.round(((run.done + run.failed) / run.total) * 100) : run.status === "running" ? 0 : 100;
  return (
    <div className="grid gap-2 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        {run.status === "running" && <Loader2 className="size-4 animate-spin" />}
        {run.status === "running"
          ? run.total > 0
            ? `Sincronizzazione in corso: ${run.done + run.failed} di ${run.total}`
            : "Scarico l'orario…"
          : run.status === "ok"
            ? "Sincronizzazione completata"
            : run.status === "partial"
              ? `Completata con ${run.failed} errori (verranno ritentati)`
              : run.status === "anomaly"
                ? "Anomalia rilevata: nessuna modifica applicata"
                : run.status === "skipped"
                  ? "Sincronizzazione saltata"
                  : "Sincronizzazione fallita"}
      </div>
      <Progress value={pct} />
      {run.error && <p className="text-destructive text-sm">{run.error}</p>}
      {(run.status === "ok" || run.status === "partial") && run.counts && <PlanSummary summary={run.counts} />}
    </div>
  );
}
