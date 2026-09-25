"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resolvePendingAction } from "@/app/actions/configs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PendingCourse } from "@/lib/db/schema";

export function PendingCourses({ id, pending }: { id: string; pending: PendingCourse[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  if (pending.length === 0) return null;

  const resolve = (decision: "approve" | "reject") =>
    start(async () => {
      const r = await resolvePendingAction(id, [...checked], decision);
      if (!r.ok) return void toast.error(r.error);
      toast.success(decision === "approve" ? "Aggiunti: saranno sincronizzati al prossimo giro" : "Esclusi");
      setChecked(new Set());
      router.refresh();
    });

  return (
    <Alert>
      <Sparkles />
      <AlertTitle>Nuovi insegnamenti disponibili</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>Non vengono sincronizzati finché non li approvi.</span>
        <div className="grid gap-1.5">
          {pending.map((p) => (
            <div key={p.code} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`p-${p.code}`}
                checked={checked.has(p.code)}
                onCheckedChange={(v) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.add(p.code);
                    else next.delete(p.code);
                    return next;
                  })
                }
              />
              <label htmlFor={`p-${p.code}`} className="text-foreground cursor-pointer">
                {p.name}
              </label>
              <span className="font-mono text-xs opacity-70">{p.code}</span>
              {p.required !== null && <Badge variant="outline">{p.required ? "Obbligatorio" : "Consigliato"}</Badge>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || checked.size === 0} onClick={() => resolve("approve")}>
            Aggiungi selezionati
          </Button>
          <Button size="sm" variant="outline" disabled={busy || checked.size === 0} onClick={() => resolve("reject")}>
            Escludi selezionati
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
