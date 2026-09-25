import { AlertTriangle, CircleX, Info } from "lucide-react";
import type { SyncLogRow } from "@/lib/db/repo";
import { dateTime } from "@/lib/sync/format";
import { cn } from "@/lib/utils";

const ICON = { info: Info, warn: AlertTriangle, error: CircleX } as const;

export function ChangeLog({ logs }: { logs: SyncLogRow[] }) {
  if (logs.length === 0) return <p className="text-muted-foreground text-sm">Nessuna voce nel registro.</p>;
  return (
    <ol className="divide-y rounded-lg border">
      {logs.map((l) => {
        const Icon = ICON[l.level];
        return (
          <li key={l.id} className="flex gap-3 px-3 py-2 text-sm">
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                l.level === "info" && "text-muted-foreground",
                l.level === "warn" && "text-amber-600 dark:text-amber-400",
                l.level === "error" && "text-destructive",
              )}
            />
            <span className="flex-1">{l.message}</span>
            <time className="text-muted-foreground shrink-0 text-xs tabular-nums">{dateTime(l.at)}</time>
          </li>
        );
      })}
    </ol>
  );
}
