import { notFound } from "next/navigation";
import { PageTitle } from "@/components/layout/page-title";
import { SetupWizard } from "@/components/wizard/setup-wizard";
import { STEPS } from "@/components/wizard/types";
import { serviceAccountEmail } from "@/lib/google/service-account";
import { loadYears, wizardStateFromConfig } from "@/lib/wizard-state";

const STEP_NAMES: Record<string, number> = {
  corso: 0,
  insegnamenti: 1,
  anteprima: 2,
  calendar: 3,
  calendario: 3,
  opzioni: 4,
};

export default async function EditConfigPage(props: PageProps<"/configs/[id]/edit">) {
  const { id } = await props.params;
  const { step } = await props.searchParams;
  const loaded = wizardStateFromConfig(id);
  if (!loaded) notFound();
  const { years } = await loadYears();
  const raw = typeof step === "string" ? step : "";
  const initialStep = STEP_NAMES[raw] ?? (Number.isInteger(Number(raw)) ? Math.min(Number(raw), STEPS.length - 1) : 1);
  const yearList = years.length ? years : [{ value: loaded.state.aa, label: loaded.state.aaLabel }];

  return (
    <div className="grid gap-6">
      <PageTitle title="Modifica configurazione" subtitle={loaded.state.courseLabel} back={`/configs/${id}`} />
      <SetupWizard
        years={yearList}
        initial={loaded.state}
        initialExcluded={loaded.excluded}
        initialStep={initialStep}
        hasEvents={loaded.hasEvents}
        accountEmail={serviceAccountEmail()}
      />
    </div>
  );
}
