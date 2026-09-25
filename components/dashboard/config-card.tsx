import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConfigOverview } from "@/lib/dashboard";
import { dateTime } from "@/lib/sync/format";
import { StatusBadge } from "./status-badge";

export function ConfigCard({ overview }: { overview: ConfigOverview }) {
  const { config, stats } = overview;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {config.courseLabel}
          <StatusBadge config={config} />
        </CardTitle>
        <CardDescription>
          A.A. {config.aaLabel} · {config.curricula.map((c) => c.label).join(", ")}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={config.status === "draft" ? `/configs/${config.id}/edit` : `/configs/${config.id}`}>
              {config.status === "draft" ? "Completa" : "Dettagli"} <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Calendario" value={config.calendarName ?? "—"} color={config.calendarColor} />
        <Stat label="Ultima esecuzione" value={config.lastRunAt ? dateTime(config.lastRunAt) : "mai"} />
        <Stat label="Lezioni sincronizzate" value={String(stats.synced)} />
        <Stat label="Modifiche (7 giorni)" value={String(stats.changedLastWeek)} />
        {config.pendingCourses.length > 0 && (
          <p className="col-span-full text-amber-700 dark:text-amber-400">
            {config.pendingCourses.length} nuovi insegnamenti disponibili da approvare
          </p>
        )}
        {config.lastError && <p className="text-destructive col-span-full">{config.lastError}</p>}
      </CardContent>
    </Card>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="flex items-center gap-1.5 truncate font-medium">
        {color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
