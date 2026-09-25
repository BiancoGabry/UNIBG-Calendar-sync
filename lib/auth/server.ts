import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function getSession(): Promise<{ user: "owner" } | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** For pages and server actions: redirects to /login without a valid session. */
export async function requireSession(): Promise<{ user: "owner" }> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
