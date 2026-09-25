import { CalendarSync, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CalendarSync className="text-primary size-5" />
          <span className="hidden sm:inline">UniBG → Google Calendar</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/configs/new">
              <Plus /> Nuova configurazione
            </Link>
          </Button>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Esci">
              <LogOut />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
