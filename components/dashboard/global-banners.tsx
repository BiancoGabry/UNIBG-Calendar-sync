import { CalendarPlus, ServerCrash } from "lucide-react";
import Link from "next/link";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AcademicYear } from "@/lib/easystaff/combo";
import { DismissNewYearButton } from "./dismiss-new-year-button";
import { GoogleBanner, type GoogleInfo } from "./google-banner";

type Props = {
  google: GoogleInfo;
  newYear: AcademicYear | null;
  workerAlive: boolean;
  hasActive: boolean;
};

export function GlobalBanners({ google, newYear, workerAlive, hasActive }: Props) {
  return (
    <div className="grid gap-3">
      <GoogleBanner google={google} />
      {newYear && (
        <Alert>
          <CalendarPlus />
          <AlertTitle>È disponibile l&apos;A.A. {newYear.label}</AlertTitle>
          <AlertDescription>
            Vuoi aggiornare la configurazione? Crea una nuova configurazione per il nuovo anno.
          </AlertDescription>
          <AlertAction className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/configs/new">Configura</Link>
            </Button>
            <DismissNewYearButton />
          </AlertAction>
        </Alert>
      )}
      {hasActive && !workerAlive && (
        <Alert>
          <ServerCrash />
          <AlertTitle>Worker non attivo</AlertTitle>
          <AlertDescription>
            Nessun segnale dal worker negli ultimi 20 minuti: la sincronizzazione automatica non sta girando. Avvia{" "}
            <code>pnpm worker</code> o il servizio <code>worker</code> di Docker.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
