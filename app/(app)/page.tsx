import { CalendarSync, Plus } from "lucide-react";
import Link from "next/link";
import { ConfigCard } from "@/components/dashboard/config-card";
import { GlobalBanners } from "@/components/dashboard/global-banners";
import { PageTitle } from "@/components/layout/page-title";
import { Button } from "@/components/ui/button";
import { dashboardData } from "@/lib/dashboard";

export default function DashboardPage() {
  const data = dashboardData();
  return (
    <div className="grid gap-6">
      <PageTitle title="Dashboard" subtitle={data.google.email ? `Service account: ${data.google.email}` : undefined} />
      <GlobalBanners
        google={data.google}
        newYear={data.newYear}
        workerAlive={data.workerAlive}
        hasActive={data.configs.some((c) => c.config.status === "active")}
      />
      {data.configs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <CalendarSync className="text-muted-foreground size-8" />
          <p className="font-medium">Nessuna configurazione</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Scegli corso, anno e insegnamenti: le lezioni verranno scritte sul tuo calendario Google e aggiornate ogni
            15 minuti.
          </p>
          <Button asChild>
            <Link href="/configs/new">
              <Plus /> Nuova configurazione
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {data.configs.map((o) => (
            <ConfigCard key={o.config.id} overview={o} />
          ))}
        </div>
      )}
    </div>
  );
}
