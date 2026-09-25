import { Badge } from "@/components/ui/badge";
import type { PlanPreviewItem } from "@/lib/sync/run";

export const ACTION_LABELS: Record<string, string> = {
  insert: "Nuove",
  patch: "Modificate",
  cancelled: "Annullate",
  restored: "Ripristinate",
  reappeared: "Ricomparse",
  markRemoved: "Rimosse",
  move: "Spostate",
  delete: "Eliminate",
  refresh: "Riscritte (opzioni)",
};

export function PlanSummary({ summary }: { summary: Record<string, number> }) {
  const entries = Object.entries(summary).filter(([, n]) => n > 0);
  if (entries.length === 0)
    return <p className="text-muted-foreground text-sm">Nessuna modifica: il calendario è già allineato.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, n]) => (
        <Badge key={k} variant="secondary">
          {ACTION_LABELS[k] ?? k}: {n}
        </Badge>
      ))}
    </div>
  );
}

export function PlanList({ plan, limit = 200 }: { plan: PlanPreviewItem[]; limit?: number }) {
  const visible = plan.filter((p) => p.kind !== "move" || p.message);
  if (visible.length === 0) return null;
  return (
    <ul className="max-h-80 space-y-1 overflow-auto rounded-md border p-2 text-sm">
      {visible.slice(0, limit).map((p, i) => (
        <li key={`${p.eventId}-${i}`} className="flex gap-2">
          <span className="text-muted-foreground w-24 shrink-0 text-xs leading-5">
            {ACTION_LABELS[p.kind] ?? p.kind}
          </span>
          <span>{p.message}</span>
        </li>
      ))}
      {visible.length > limit && <li className="text-muted-foreground text-xs">… e altre {visible.length - limit}</li>}
    </ul>
  );
}
