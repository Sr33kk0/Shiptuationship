import { Suspense } from "react";
import Emails from "@/components/Emails";

export default function Page() {
  return (
    <Suspense>
      <Emails />
    </Suspense>
  );
}
