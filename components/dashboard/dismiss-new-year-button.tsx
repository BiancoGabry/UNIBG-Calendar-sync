"use client";

import { useTransition } from "react";
import { dismissNewYearAction } from "@/app/actions/configs";
import { Button } from "@/components/ui/button";

export function DismissNewYearButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await dismissNewYearAction()))}
    >
      Non ora
    </Button>
  );
}
