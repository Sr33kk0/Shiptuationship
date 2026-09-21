import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Landing from "@/components/Landing";
import { SESSION_COOKIE } from "@/lib/session";

// The front page for visitors who are not logged in; anyone already logged in goes straight to the dashboard.
export default async function Page() {
  if ((await cookies()).has(SESSION_COOKIE)) redirect("/dashboard");
  return <Landing />;
}
