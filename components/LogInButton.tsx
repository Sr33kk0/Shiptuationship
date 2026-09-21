"use client";

import { logIn } from "@/lib/session";

export default function LogInButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button className={className} onClick={logIn}>
      {children}
    </button>
  );
}
