"use client";

import { CalendarSync, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginCard({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: null });
  return (
    <Card className="w-full max-w-sm">
      <form action={action}>
        <CardHeader>
          <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
            <CalendarSync className="size-5" />
          </div>
          <CardTitle>UniBG Orari → Google Calendar</CardTitle>
          <CardDescription>App personale: inserisci la password.</CardDescription>
        </CardHeader>
        <CardContent className="mt-4 grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
          <input type="hidden" name="next" value={next ?? "/"} />
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Entra
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
