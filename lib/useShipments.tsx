"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Shipment } from "./shipments";

interface State {
  shipments: Shipment[];
  setShipments: Dispatch<SetStateAction<Shipment[]>>;
  loadState: "loading" | "ready" | "error";
}

const Ctx = createContext<State | null>(null);

// One fetch + poll for the whole app, so moving between pages shows the data straight away instead of reloading it.
// ponytail: 30s poll; swap for SSE/onSnapshot if latency matters.
export function ShipmentsProvider({ children }: { children: ReactNode }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadState, setLoadState] = useState<State["loadState"]>("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/emails");
        if (!res.ok) throw new Error(await res.text());
        const data: Shipment[] = await res.json();
        if (!alive) return;
        setShipments(data);
        setLoadState("ready");
      } catch {
        if (alive) setLoadState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const poll = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  return <Ctx.Provider value={{ shipments, setShipments, loadState }}>{children}</Ctx.Provider>;
}

export function useShipments() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShipments must be used inside <ShipmentsProvider>");
  return v;
}
