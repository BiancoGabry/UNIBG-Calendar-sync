"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { dryRunAction, type DryRunData } from "@/app/actions/configs";
import { PlanList, PlanSummary } from "@/components/sync/plan-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EVENT_COLORS, type WizardDetails, type WizardState } from "./types";

export function StepSummary({
  state,
  details,
  ensureSaved,
}: {
  state: WizardState;
  details: WizardDetails | null;
  ensureSaved: () => Promise<string | null>;
}) {
  const [plan, setPlan] = useState<DryRunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const names = new Map(
    (details?.groups ?? []).flatMap((g) => [...(g.main ? [g.main] : []), ...g.exercises]).map((i) => [i.code, i.name]),
  );
  const o = state.options;

  const preview = async () => {
    setLoading(true);
    setError(null);
    const id = await ensureSaved();
    if (!id) {
      setLoading(false);
      return;
    }
    const r = await dryRunAction(id);
    setLoading(false);
    if (r.ok) setPlan(r.data);
    else setError(r.error);
  };

  const rows: [string, string][] = [
    ["Anno accademico", state.aaLabel],
    ["Corso", state.courseLabel],
    ["Anni / percorsi", state.curricula.map((c) => c.label).join(", ")],
    ["Calendario", state.calendarName ?? "—"],
    [
      "Titolo",
      o.titlePrefix === "never"
        ? "solo nome"
        : o.titlePrefix === "always"
          ? "con tipo"
          : "tipo solo se non è una lezione",
    ],
    [
      "Promemoria",
      o.reminder.mode === "none"
        ? "nessuno"
        : o.reminder.mode === "default"
          ? "predefinito"
          : `${o.reminder.minutes} min prima`,
    ],
    ["Lezioni consigliate", o.includeRecommended ? "sì" : "no"],
    ["Colore", o.colorId ? (EVENT_COLORS.find((c) => c.id === o.colorId)?.name ?? o.colorId) : "del calendario"],
  ];

  return (
    <div className="grid gap-6">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Insegnamenti ({state.selected.length})</dt>
        <dd>
          <ul className="list-inside list-disc">
            {state.selected.map((c) => (
              <li key={c}>{names.get(c) ?? c}</li>
            ))}
          </ul>
        </dd>
      </dl>

      <div className="grid gap-3">
        <Button variant="outline" className="w-fit" onClick={preview} disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          Anteprima delle azioni (dry-run)
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {plan && (
          <div className="grid gap-2">
            {plan.anomaly && (
              <Alert variant="destructive">
                <AlertTitle>Anomalia</AlertTitle>
                <AlertDescription>{plan.anomaly.message}</AlertDescription>
              </Alert>
            )}
            <PlanSummary summary={plan.summary} />
            <PlanList plan={plan.plan} />
          </div>
        )}
      </div>
    </div>
  );
}
