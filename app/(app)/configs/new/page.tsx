import { PageTitle } from "@/components/layout/page-title";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SetupWizard } from "@/components/wizard/setup-wizard";
import { serviceAccountEmail } from "@/lib/google/service-account";
import { emptyWizardState, loadYears } from "@/lib/wizard-state";

export default async function NewConfigPage() {
  const { years, error } = await loadYears();
  return (
    <div className="grid gap-6">
      <PageTitle title="Nuova configurazione" back="/" />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Portale UniBG non raggiungibile</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <SetupWizard
          years={years}
          initial={emptyWizardState(years)}
          initialExcluded={[]}
          hasEvents={false}
          accountEmail={serviceAccountEmail()}
        />
      )}
    </div>
  );
}
