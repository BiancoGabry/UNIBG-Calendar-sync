import { AppHeader } from "@/components/layout/app-header";
import { requireSession } from "@/lib/auth/server";

// Every page here reads the session, the DB and the portal: never prerender at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
