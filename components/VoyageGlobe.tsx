"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeInstance } from "globe.gl";
import { legColor, legKey, portName, type Leg } from "@/lib/ports";
import type { Pt } from "@/lib/seaRoutes";
import { useTheme } from "@/lib/theme";

// Country shapes for the globe: the copy that ships with three-globe (installed with globe.gl), read from its CDN so it stays out of the bundle.
const LAND = "https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/country-polygons/ne_110m_admin_0_countries.geojson";

interface Port {
  name: string;
  lat: number;
  lng: number;
}
interface Route {
  key: string; // the leg's legKey
  from: Port;
  to: Port;
  path: Pt[]; // [lng, lat], port to port along the shipping lanes
  color: string;
}
// What /api/sea-routes answers for each leg
type Found = { from: Pt | null; to: Pt | null; path: Pt[] | null; nm: number | null };

// The middle of all the ports, so the camera faces the whole route. Averaged as 3D points, so a Pacific crossing doesn't centre on Africa.
function centre(ports: Port[]) {
  const r = Math.PI / 180;
  let [x, y, z] = [0, 0, 0];
  for (const p of ports) {
    x += Math.cos(p.lat * r) * Math.cos(p.lng * r);
    y += Math.cos(p.lat * r) * Math.sin(p.lng * r);
    z += Math.sin(p.lat * r);
  }
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lng: Math.atan2(y, x) / r };
}

interface Props {
  legs: Leg[]; // voyageLegs() of the voyage's emails
  loading: boolean;
  selected: string | null; // legKey of the leg picked in the list: its route stands out and the emails below show only its own
  onSelect: (key: string | null) => void;
}

// The top of a voyage's page: a globe with the shortest sea route of each leg (port of loading -> port of discharge),
// and the legs as buttons beside it. The server geocodes the ports and finds the routes (lib/seaRoutes.ts).
export default function VoyageGlobe({ legs, loading, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const key = legs.map((l) => `${l.pol}>${l.pod}`).join("|"); // ask again only when the legs change, not on every 30s refresh
  const [found, setFound] = useState<{ key: string; legs?: Found[] }>({ key: "" });

  useEffect(() => {
    if (!legs.length) return;
    let alive = true;
    fetch(`/api/sea-routes?${new URLSearchParams(legs.flatMap((l) => [["from", l.pol], ["to", l.pod]]))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(
        (data: Found[]) => alive && setFound({ key, legs: data }),
        () => alive && setFound({ key }),
      );
    return () => {
      alive = false;
    };
    // legs is represented by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const answered = legs.length > 0 && found.key === key ? found.legs ?? null : undefined; // undefined: still asking, null: the request failed
  const routes: Route[] = [];
  const missing = new Set<string>();
  legs.forEach((l, i) => {
    const f = answered?.[i];
    if (!f) return;
    if (!f.from) missing.add(l.pol);
    if (!f.to) missing.add(l.pod);
    if (f.from && f.to && !f.path) missing.add(`${portName(l.pol)} → ${portName(l.pod)} (no sea route)`);
    if (f.from && f.to && f.path) routes.push({ key: legKey(l), from: { name: portName(l.pol), lng: f.from[0], lat: f.from[1] }, to: { name: portName(l.pod), lng: f.to[0], lat: f.to[1] }, path: f.path, color: legColor(i) });
  });
  const busy = loading || (legs.length > 0 && answered === undefined);
  const message = answered === null ? "Couldn't find the sea routes. Check your connection and reload." : !legs.length ? "No validated route yet. It appears once this voyage has a validated SI/BL comparison." : "Couldn't place these ports on the map.";
  const count = legs.length === 1 ? "1 leg" : `${legs.length} legs`;

  return (
    <section className="panel voyage-map fade-up" style={{ "--d": "0.06s" } as React.CSSProperties}>
      {routes.length > 0 ? <Globe routes={routes} active={hovered ?? selected} focus={selected} /> : <div className="voyage-globe">{busy ? <div className="skel geo-skel" /> : <p className="bars-empty geo-msg">{message}</p>}</div>}

      <div className="voyage-legs">
        <h3 className="card-title">Route</h3>
        <p className="bars-note">{busy ? "Finding sea routes…" : legs.length ? `${count} from validated documents, by the shortest sea route. Pick one to see only its emails.` : "Ports come from validated comparisons only"}</p>
        {legs.length > 0 && (
          <ol>
            {legs.map((l, i) => {
              const nm = answered?.[i]?.nm;
              const key = legKey(l);
              return (
                <li key={key}>
                  <button
                    className="leg"
                    aria-pressed={selected === key}
                    style={{ "--leg": legColor(i) } as React.CSSProperties}
                    onClick={() => onSelect(selected === key ? null : key)}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(key)}
                    onBlur={() => setHovered(null)}
                  >
                    <span>
                      <i className="legend-dot" style={{ background: legColor(i) }} />
                      <b>{portName(l.pol)}</b>
                      <span className="muted"> → </span>
                      <b>{portName(l.pod)}</b>
                    </span>
                    <small>
                      {nm != null && <>{nm.toLocaleString("en-US")} nm · </>}
                      {l.emails.length === 1 ? "1 email" : `${l.emails.length} emails`}: {l.emails.join(", ")}
                    </small>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {missing.size > 0 && <p className="voyage-unplaced">Not on the map: {[...missing].join("; ")}</p>}
      </div>
    </section>
  );
}

// `active`: the route to make stand out (hovered or picked in the list); `focus`: the picked one, which the camera turns to.
function Globe({ routes, active, focus }: { routes: Route[]; active: string | null; focus: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<GlobeInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const theme = useTheme(); // colours come from the scheme's CSS, so a switch repaints the globe

  // globe.gl needs the browser (WebGL), so it is loaded here rather than imported at the top
  useEffect(() => {
    const el = box.current!;
    let alive = true;
    let g: GlobeInstance | undefined;
    const ro = new ResizeObserver(([e]) => g?.width(e.contentRect.width).height(e.contentRect.height));
    Promise.all([import("globe.gl"), fetch(LAND).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))]).then(
      ([{ default: Globe }, land]) => {
        if (!alive) return;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        g = new Globe(el, { animateIn: !still })
          .width(el.clientWidth)
          .height(el.clientHeight)
          .backgroundColor("rgba(0,0,0,0)")
          .polygonsData(land.features)
          .polygonAltitude(0.004)
          .polygonSideColor(() => "rgba(0,0,0,0)")
          .pathPoints("path")
          .pathPointLat((p: Pt) => p[1])
          .pathPointLng((p: Pt) => p[0])
          .pathPointAlt(0.006) // just above the land, so a port up a river isn't hidden under its country
          .pathDashLength(still ? 1 : 0.04)
          .pathDashGap(still ? 0 : 0.012)
          .pathDashAnimateTime(still ? 0 : 20000)
          .htmlElement((d) => {
            const el = document.createElement("div");
            el.className = "globe-port";
            el.appendChild(document.createElement("span")).textContent = (d as Port).name;
            return el;
          });
        g.controls().enableZoom = false; // the page scrolls under the wheel instead of the globe zooming
        ro.observe(el);
        setGlobe(() => g!); // the instance is itself a function, so it must not be handed to setState as an updater
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      ro.disconnect();
      g?._destructor();
    };
  }, []);

  useEffect(() => {
    if (!globe) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    globe.globeMaterial().color.set(v("--surface"));
    globe.atmosphereColor(v("--blue")).polygonCapColor(() => v("--map-land")).polygonStrokeColor(() => v("--edge-2"));
  }, [globe, theme]);

  const key = routes.map((r) => `${r.from.lat},${r.from.lng}>${r.to.lat},${r.to.lng}:${r.color}`).join("|"); // redraw only when the legs change, not on every poll
  const portsOf = (list: Route[]) => [...new Map(list.flatMap((r) => [r.from, r.to]).map((p) => [`${p.lat},${p.lng}`, p])).values()];
  // routes is represented by `key` in the three effects below
  useEffect(() => {
    globe?.pathsData(routes).htmlElementsData(portsOf(routes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe, key]);

  // the other routes fade to a quarter so the active one stands out ("40" is the alpha of a #rrggbbaa colour)
  useEffect(() => {
    globe
      ?.pathColor((r: object) => (!active || (r as Route).key === active ? (r as Route).color : `${(r as Route).color}40`))
      .pathStroke((r: object) => ((r as Route).key === active ? 3.5 : 2));
  }, [globe, key, active]);

  useEffect(() => {
    const shown = routes.filter((r) => r.key === focus);
    globe?.pointOfView({ ...centre(portsOf(shown.length ? shown : routes)), altitude: 1.9 }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe, key, focus]);

  return (
    <div className="voyage-globe" aria-hidden="true">
      <div ref={box} className="voyage-canvas" />
      {!globe && !failed && <div className="skel geo-skel" />}
      {failed && <p className="bars-empty geo-msg">Couldn&apos;t load the globe. Check your connection and reload.</p>}
    </div>
  );
}
