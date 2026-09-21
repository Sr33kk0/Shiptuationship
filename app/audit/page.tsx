import { redirect } from "next/navigation";

// the old single "Audit Logs" address
export default function Page() {
  redirect("/audit/user");
}
