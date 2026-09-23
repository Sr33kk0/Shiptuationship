import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogIn from "@/components/LogIn";
import { SESSION_COOKIE } from "@/lib/session";

// The step between the front page and the app; anyone already logged in goes straight to the dashboard.
export default async function Page() {
  if ((await cookies()).has(SESSION_COOKIE)) redirect("/dashboard");
  return <LogIn />;
}
