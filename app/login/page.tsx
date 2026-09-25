import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { getSession } from "@/lib/auth/server";

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getSession()) redirect("/");
  const { next } = await props.searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <LoginCard next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
