import { redirect } from "next/navigation";
import LogIn from "@/components/LogIn";
import { currentModerator } from "@/lib/session";

// The step between the front page and the app; anyone already logged in goes straight to the dashboard.
export default async function Page() {
  if (await currentModerator()) redirect("/dashboard");
  return <LogIn />;
}
