"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { checkGoogleAction } from "@/app/actions/google";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type GoogleInfo = { email: string | null; status: "ok" | "invalid_credentials"; message: string | null };

/** Shown when the service account key is missing/unreadable or rejected by Google. */
export function GoogleBanner({ google }: { google: GoogleInfo }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (google.email && google.status === "ok") return null;

  const check = () =>
    start(async () => {
      const r = await checkGoogleAction();
      if (r.ok) toast.success(`Credenziali valide (${r.data.email})`);
      else toast.error(r.error);
      router.refresh();
    });

  return (
    <Alert variant="destructive">
      <KeyRound />
      <AlertTitle>
        {google.email ? "Google rifiuta le credenziali del service account" : "Chiave del service account non valida"}
      </AlertTitle>
      <AlertDescription>
        {google.email
          ? `${google.message ?? "invalid_grant"}. La sincronizzazione è in pausa: crea una nuova chiave JSON, sostituisci il file e riavvia web e worker.`
          : "Controlla GOOGLE_SERVICE_ACCOUNT_KEY_FILE / GOOGLE_SERVICE_ACCOUNT_JSON e riavvia."}
      </AlertDescription>
      <AlertAction>
        <Button size="sm" onClick={check} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Verifica credenziali
        </Button>
      </AlertAction>
    </Alert>
  );
}
