import { Suspense } from "react";
import Shipments from "@/components/Shipments";

export default function Page() {
  return (
    <Suspense>
      <Shipments />
    </Suspense>
  );
}
