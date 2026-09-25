"use client";

import { Loader2, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteConfigAction,
  dryRunAction,
  pauseConfigAction,
  resumeConfigAction,
  syncNowAction,
  teardownConfigAction,
  type DryRunData,
} from "@/app/actions/configs";
import { PlanList, PlanSummary } from "@/components/sync/plan-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  id: string;
  status: "draft" | "active" | "paused" | "error";
  calendarName: string | null;
  syncedCount: number;
};

export function SyncControls({ id, status, calendarName, syncedCount }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plan, setPlan] = useState<DryRunData | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);

  const openPlan = async () => {
    setPlanOpen(true);
    setPlan(null);
    setPlanLoading(true);
    const r = await dryRunAction(id);
    setPlanLoading(false);
    if (r.ok) setPlan(r.data);
    else {
      toast.error(r.error);
      setPlanOpen(false);
    }
  };

  const apply = (force = false) =>
    start(async () => {
      const r = await syncNowAction(id, { force });
      setPlanOpen(false);
      if (!r.ok) return void toast.error(r.error);
      router.push(`/configs/${id}${r.data.runId ? `?run=${r.data.runId}` : ""}`);
      router.refresh();
    });

  const simple = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error(r.error);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "draft" && (
        <Button onClick={openPlan} disabled={pending}>
          <RefreshCw /> Sincronizza ora
        </Button>
      )}
      {status === "active" || status === "error" ? (
        <Button variant="outline" disabled={pending} onClick={() => simple(() => pauseConfigAction(id), "In pausa")}>
          <Pause /> Pausa
        </Button>
      ) : status === "paused" ? (
        <Button variant="outline" disabled={pending} onClick={() => simple(() => resumeConfigAction(id), "Ripresa")}>
          <Play /> Riprendi
        </Button>
      ) : null}
      <Button asChild variant="outline">
        <Link href={`/configs/${id}/edit`}>
          <Pencil /> Modifica selezione
        </Link>
      </Button>

      {syncedCount > 0 ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>
              <Trash2 /> Disattiva e rimuovi eventi
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disattivare e rimuovere gli eventi?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno eliminati da &quot;{calendarName}&quot; tutti gli eventi creati da questa configurazione (anche
                quelli passati), riconosciuti dal marcatore unibg-sync. I tuoi altri eventi non vengono toccati.
                L&apos;operazione non si può annullare.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={() =>
                  start(async () => {
                    const r = await teardownConfigAction(id);
                    if (r.ok) toast.success(`${r.data.deleted} eventi eliminati`);
                    else toast.error(r.error);
                    router.refresh();
                  })
                }
              >
                Elimina eventi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" disabled={pending}>
              <Trash2 /> Elimina configurazione
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare la configurazione?</AlertDialogTitle>
              <AlertDialogDescription>
                Non ci sono eventi sul calendario. Verranno eliminati anche i log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  start(async () => {
                    const r = await deleteConfigAction(id);
                    if (!r.ok) return void toast.error(r.error);
                    router.push("/");
                    router.refresh();
                  })
                }
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sincronizza ora</DialogTitle>
            <DialogDescription>
              Anteprima delle azioni (dry-run): nulla è ancora stato scritto su Google.
            </DialogDescription>
          </DialogHeader>
          {planLoading && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Scarico l&apos;orario e calcolo le differenze…
            </p>
          )}
          {plan && (
            <div className="grid gap-3">
              {plan.anomaly && (
                <Alert variant="destructive">
                  <AlertTitle>Anomalia: {plan.anomaly.message}</AlertTitle>
                  <AlertDescription>
                    La sincronizzazione automatica non applica queste modifiche. Puoi forzarle se sei sicuro che
                    l&apos;orario sia corretto.
                  </AlertDescription>
                </Alert>
              )}
              <PlanSummary summary={plan.summary} />
              <PlanList plan={plan.plan} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              Chiudi
            </Button>
            {plan?.anomaly ? (
              <Button variant="destructive" disabled={pending} onClick={() => apply(true)}>
                Applica comunque
              </Button>
            ) : (
              <Button disabled={pending || !plan || plan.plan.length === 0} onClick={() => apply(false)}>
                {pending && <Loader2 className="animate-spin" />} Applica
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
