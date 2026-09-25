import { AlertTriangle, CalendarX } from "lucide-react";
import { notFound } from "next/navigation";
import { Stat } from "@/components/dashboard/config-card";
import { ChangeLog } from "@/components/dashboard/change-log";
import { GoogleBanner } from "@/components/dashboard/google-banner";
import { PendingCourses } from "@/components/dashboard/pending-courses";
import { RunProgress } from "@/components/dashboard/run-progress";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { SyncControls } from "@/components/dashboard/sync-controls";
import { PageTitle } from "@/components/layout/page-title";
import { SchedulePreview } from "@/components/preview/schedule-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { configLogs, configOverview, configSnapshot, dashboardData } from "@/lib/dashboard";
import { date, dateTime } from "@/lib/sync/format";

export default async function ConfigPage(props: PageProps<"/configs/[id]">) {
  const { id } = await props.params;
  const { run } = await props.searchParams;
  const overview = configOverview(id);
  if (!overview) notFound();
  const { config, stats, lastRun, showAnomalyBanner } = overview;
  const { google, worker } = dashboardData();
  const logs = configLogs(id);
  const snapshot = configSnapshot(id)
    .filter((e) => e.status !== "removed")
    .map((e) => e.lesson)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const runId = typeof run === "string" ? Number(run) : lastRun?.status === "running" ? lastRun.id : null;

  return (
    <div className="grid gap-6">
      <PageTitle
        back="/"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {config.courseLabel} <StatusBadge config={config} />
          </span>
        }
        subtitle={`A.A. ${config.aaLabel} · ${config.curricula.map((c) => c.label).join(", ")}`}
      />

      <SyncControls id={id} status={config.status} calendarName={config.calendarName} syncedCount={stats.synced} />

      {runId !== null && Number.isFinite(runId) && <RunProgress runId={runId} />}

      <GoogleBanner google={google} />
      {config.status === "error" && config.lastError && (
        <Alert variant="destructive">
          <CalendarX />
          <AlertTitle>Sincronizzazione bloccata</AlertTitle>
          <AlertDescription>
            {config.lastError}
            {google.email && ` Service account: ${google.email}.`} Il worker riprova a ogni giro; puoi anche premere
            &quot;Sincronizza ora&quot;.
          </AlertDescription>
        </Alert>
      )}
      {showAnomalyBanner && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{config.consecutiveAnomalies} anomalie consecutive</AlertTitle>
          <AlertDescription>
            {config.lastAnomaly}. Le modifiche sospette non vengono applicate. Controlla l&apos;orario sul portale: se è
            corretto, usa &quot;Sincronizza ora&quot; → &quot;Applica comunque&quot;.
          </AlertDescription>
        </Alert>
      )}
      <PendingCourses id={id} pending={config.pendingCourses} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Calendario" value={config.calendarName ?? "—"} color={config.calendarColor} />
          <Stat label="Ultima esecuzione" value={config.lastRunAt ? dateTime(config.lastRunAt) : "mai"} />
          <Stat
            label="Prossima esecuzione"
            value={
              config.status !== "active" ? "—" : worker?.nextRunAt ? dateTime(worker.nextRunAt) : "worker non attivo"
            }
          />
          <Stat label="Ultimo aggiornamento orario" value={config.fileDate ?? "—"} />
          <Stat
            label="Periodo coperto"
            value={
              config.windowStart && config.windowEnd
                ? `${date(config.windowStart)} – ${date(new Date(Date.parse(config.windowEnd) - 1))}`
                : "—"
            }
          />
          <Stat label="Lezioni sincronizzate" value={String(stats.synced)} />
          <Stat label="Annullate" value={String(stats.cancelled)} />
          <Stat label="Modificate (7 giorni)" value={String(stats.changedLastWeek)} />
          {config.periods && config.periods.length > 0 && (
            <p className="text-muted-foreground col-span-full text-xs">
              {config.periods
                .map(
                  (p) => `${p.label} (anno ${p.year}): ${date(p.start + "T12:00:00Z")} – ${date(p.end + "T12:00:00Z")}`,
                )
                .join(" · ")}
            </p>
          )}
          {config.lastError && <p className="text-destructive col-span-full">{config.lastError}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Registro modifiche</TabsTrigger>
          <TabsTrigger value="calendar">Lezioni sincronizzate</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="mt-3">
          <ChangeLog logs={logs} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-3">
          {snapshot.length > 0 ? (
            <SchedulePreview lessons={snapshot} closures={[]} />
          ) : (
            <p className="text-muted-foreground text-sm">Ancora nessuna lezione sincronizzata.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
