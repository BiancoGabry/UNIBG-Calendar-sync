import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SyncConfig } from "@/lib/db/repo";

const MAP: Record<SyncConfig["status"], { label: string; className: string }> = {
  active: { label: "Attiva", className: "bg-emerald-600 text-white dark:bg-emerald-500" },
  paused: { label: "In pausa", className: "bg-amber-500 text-white" },
  error: { label: "Errore", className: "bg-destructive text-white" },
  draft: { label: "Bozza", className: "" },
};

export function StatusBadge({
  config,
}: {
  config: Pick<SyncConfig, "status" | "pauseReason" | "consecutiveAnomalies">;
}) {
  const s = MAP[config.status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={config.status === "draft" ? "outline" : "default"} className={cn(s.className)}>
        {s.label}
        {config.status === "paused" && config.pauseReason === "google" ? " · Google" : ""}
      </Badge>
      {config.consecutiveAnomalies > 0 && (
        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
          {config.consecutiveAnomalies} anomalie
        </Badge>
      )}
    </span>
  );
}
