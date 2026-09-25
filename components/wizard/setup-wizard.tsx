"use client";

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadCourseDetailsAction } from "@/app/actions/catalog";
import { activateConfigAction, saveConfigAction } from "@/app/actions/configs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AcademicYear } from "@/lib/easystaff/combo";
import { cn } from "@/lib/utils";
import { StepCalendar } from "./step-calendar";
import { StepCourse } from "./step-course";
import { StepOptions } from "./step-options";
import { StepPreview } from "./step-preview";
import { allItems, StepTeachings } from "./step-teachings";
import { StepSummary } from "./step-summary";
import { suggestionFor } from "./suggest";
import { detailsKey, STEPS, type WizardDetails, type WizardState } from "./types";

type Props = {
  years: AcademicYear[];
  initial: WizardState;
  initialExcluded: string[];
  initialStep?: number;
  /** Events already exist: course, curricula and calendar cannot change. */
  hasEvents: boolean;
  accountEmail: string | null;
};

const DESCRIPTIONS = [
  "Scegli anno accademico, corso di studio e uno o più anni/percorsi.",
  "Scegli gli insegnamenti che segui e i gruppi di esercitazione della tua lettera.",
  "Controlla le lezioni che verranno scritte sul calendario.",
  "Scegli su quale calendario Google scrivere le lezioni.",
  "Come devono apparire gli eventi.",
  "Ricontrolla e attiva la sincronizzazione.",
];

export function SetupWizard({ years, initial, initialExcluded, initialStep = 0, hasEvents, accountEmail }: Props) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(initial);
  const [step, setStep] = useState(initialStep);
  const [loadedDetails, setDetails] = useState<WizardDetails | null>(null);
  const [loadError, setDetailsError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const selectionInitialized = useRef(initial.selected.length > 0);

  const update = useCallback((patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch })), []);
  const key = detailsKey(state);
  const needsDetails = step >= 1 && state.courseCode !== "" && state.curricula.length > 0;
  // Only data loaded for the current course/curricula counts.
  const details = loadedDetails?.key === key ? loadedDetails : null;
  const detailsError = loadError?.key === key ? loadError.message : null;

  useEffect(() => {
    if (!needsDetails || details) return;
    let cancelled = false;
    loadCourseDetailsAction({ aa: state.aa, course: state.courseCode, curricula: state.curricula }).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setDetailsError({ key, message: r.error });
      setDetails({ ...r.data, key });
      if (!selectionInitialized.current) {
        // Default: every required main teaching + exercises of my letter.
        selectionInitialized.current = true;
        const suggestion = suggestionFor(r.data.groups, state.surnameInitial);
        const selected = r.data.groups.flatMap((g) => [
          ...(g.main && g.main.required !== false ? [g.main.code] : []),
          ...g.exercises.filter((e) => suggestion.selected.has(e.code)).map((e) => e.code),
        ]);
        setState((s) => ({ ...s, selected }));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDetails, key]);

  const ensureSaved = useCallback(async (): Promise<string | null> => {
    const all = details ? allItems(details.groups).map((i) => i.code) : initialExcluded;
    const excluded = details ? all.filter((c) => !state.selected.includes(c)) : initialExcluded;
    const r = await saveConfigAction({
      id: state.id ?? undefined,
      aa: state.aa,
      aaLabel: state.aaLabel,
      courseCode: state.courseCode,
      courseLabel: state.courseLabel,
      curricula: state.curricula,
      selectedCourses: state.selected,
      excludedCourses: excluded,
      surnameInitial: state.surnameInitial,
      calendarId: state.calendarId,
      calendarName: state.calendarName,
      calendarColor: state.calendarColor,
      options: state.options,
    });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (!state.id) setState((s) => ({ ...s, id: r.data.id }));
    return r.data.id;
  }, [details, initialExcluded, state]);

  const canNext =
    step === 0
      ? state.courseCode !== "" && state.curricula.length > 0
      : step === 1
        ? state.selected.length > 0 && details !== null
        : step === 3
          ? state.calendarId !== null
          : true;

  const next = async () => {
    if (step === 2) {
      // Save the draft before choosing the calendar, so the draft survives a reload.
      setBusy(true);
      const wasNew = state.id === null;
      const id = await ensureSaved();
      setBusy(false);
      if (!id) return;
      if (wasNew) {
        // Continue on the draft's own URL.
        router.replace(`/configs/${id}/edit?step=3`);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = async () => {
    setBusy(true);
    const id = await ensureSaved();
    if (!id) return setBusy(false);
    if (state.status === "draft") {
      const r = await activateConfigAction(id);
      setBusy(false);
      if (!r.ok) return toast.error(r.error);
      toast.success("Sincronizzazione attivata");
      router.push(`/configs/${id}${r.data.runId ? `?run=${r.data.runId}` : ""}`);
    } else {
      setBusy(false);
      toast.success("Modifiche salvate: verranno applicate al prossimo giro");
      router.push(`/configs/${id}`);
    }
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                i === step && "border-primary bg-primary text-primary-foreground",
                i < step && "hover:bg-muted",
                i > step && "text-muted-foreground",
              )}
            >
              <span className="tabular-nums">{i < step ? <Check className="size-3" /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>{DESCRIPTIONS[step]}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 0 && <StepCourse years={years} state={state} update={update} locked={hasEvents} />}
          {step > 0 &&
            step < 3 &&
            !details &&
            (detailsError ? (
              <Alert variant="destructive">
                <AlertTitle>Impossibile caricare gli insegnamenti</AlertTitle>
                <AlertDescription>{detailsError}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Scarico l&apos;orario dal portale UniBG…
              </p>
            ))}
          {step === 1 && details && <StepTeachings state={state} update={update} details={details} />}
          {step === 2 && details && <StepPreview state={state} details={details} />}
          {step === 3 && <StepCalendar state={state} update={update} locked={hasEvents} accountEmail={accountEmail} />}
          {step === 4 && <StepOptions state={state} update={update} />}
          {step === 5 && <StepSummary state={state} details={details} ensureSaved={ensureSaved} />}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          <ChevronLeft /> Indietro
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canNext || busy}>
            {busy && <Loader2 className="animate-spin" />}
            Avanti <ChevronRight />
          </Button>
        ) : (
          <Button onClick={finish} disabled={busy || !state.calendarId || state.selected.length === 0}>
            {busy && <Loader2 className="animate-spin" />}
            {state.status === "draft" ? "Salva e attiva la sincronizzazione" : "Salva modifiche"}
          </Button>
        )}
      </div>
    </div>
  );
}
