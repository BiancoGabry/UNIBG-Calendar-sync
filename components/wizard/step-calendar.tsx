"use client";

import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { connectCalendarAction, listCalendarsAction, type CalendarsData } from "@/app/actions/google";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WizardState } from "./types";

type Props = {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  locked: boolean;
  accountEmail: string | null;
};

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <code className="bg-muted rounded px-1.5 py-0.5 text-xs break-all">{email}</code>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copia email"
        onClick={async () => {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </span>
  );
}

export function StepCalendar({ state, update, locked, accountEmail }: Props) {
  const [data, setData] = useState<CalendarsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const fetchCalendars = useCallback(
    () => listCalendarsAction().then((r) => (r.ok ? setData(r.data) : setError(r.error))),
    [],
  );
  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);
  const reload = () => {
    setError(null);
    setData(null);
    fetchCalendars();
  };

  const connect = async () => {
    setConnecting(true);
    setConnectError(null);
    const r = await connectCalendarAction(calendarId);
    setConnecting(false);
    if (!r.ok) return setConnectError(r.error);
    toast.success(`Accesso in scrittura verificato su "${r.data.summary}"`);
    setCalendarId("");
    setData((d) => d && { ...d, calendars: [...d.calendars.filter((c) => c.id !== r.data.id), r.data] });
    update({ calendarId: r.data.id, calendarName: r.data.summary, calendarColor: r.data.backgroundColor });
  };

  return (
    <div className="grid gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Impossibile leggere i calendari del service account</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {locked && (
        <Alert>
          <AlertTitle>Calendario bloccato</AlertTitle>
          <AlertDescription>
            Ci sono già eventi sincronizzati su &quot;{state.calendarName}&quot;. Per cambiare calendario usa prima
            &quot;Disattiva e rimuovi eventi&quot; dalla dashboard.
          </AlertDescription>
        </Alert>
      )}

      {!locked && (
        <div className="grid gap-3 rounded-lg border p-4 text-sm">
          <div className="font-medium">Aggiungi un calendario</div>
          <ol className="text-muted-foreground list-inside list-decimal space-y-1">
            <li>
              In Google Calendar apri <em>Impostazioni e condivisione</em> del calendario →{" "}
              <em>Condividi con persone specifiche</em> → aggiungi{" "}
              {accountEmail ? <CopyEmail email={accountEmail} /> : "l'email del service account"} con il permesso{" "}
              <strong>Apportare modifiche agli eventi</strong>.
            </li>
            <li>
              Nella stessa pagina, sezione <em>Integra calendario</em>, copia l&apos;<strong>ID calendario</strong> (es.{" "}
              <code className="text-xs">abc123…@group.calendar.google.com</code>) e incollalo qui.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md flex-1"
              placeholder="ID calendario"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && calendarId.trim().length >= 3 && connect()}
            />
            <Button onClick={connect} disabled={connecting || calendarId.trim().length < 3}>
              {connecting && <Loader2 className="animate-spin" />} Aggiungi e verifica
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            La verifica crea un evento di prova invisibile (1 gennaio 2000) e lo cancella subito.
          </p>
          {connectError && <p className="text-destructive">{connectError}</p>}
        </div>
      )}

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Label>Calendario di destinazione</Label>
          <Button variant="ghost" size="icon-xs" onClick={reload} aria-label="Ricarica">
            <RefreshCw />
          </Button>
        </div>
        <Select
          value={state.calendarId ?? undefined}
          disabled={!data || locked}
          onValueChange={(id) => {
            const c = data?.calendars.find((x) => x.id === id);
            update({ calendarId: id, calendarName: c?.summary ?? id, calendarColor: c?.backgroundColor ?? null });
          }}
        >
          <SelectTrigger className="w-full max-w-md">
            {!data && !error ? (
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Caricamento…
              </span>
            ) : (
              <SelectValue
                placeholder={data?.calendars.length ? "Scegli un calendario" : "Nessun calendario: aggiungine uno"}
              />
            )}
          </SelectTrigger>
          <SelectContent>
            {data?.calendars.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="size-3 rounded-full" style={{ backgroundColor: c.backgroundColor ?? "#888" }} />
                {c.summary}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Calendari condivisi con il service account con permesso di modifica. L&apos;app tocca solo gli eventi che crea
          (marcati &quot;unibg-sync&quot;): i tuoi eventi restano intatti.
        </p>
      </div>
    </div>
  );
}
