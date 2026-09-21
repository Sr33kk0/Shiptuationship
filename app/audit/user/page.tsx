import { Suspense } from "react";
import AuditLog from "@/components/AuditLog";

export default function Page() {
  return (
    <Suspense>
      <AuditLog source="user" />
    </Suspense>
  );
}
