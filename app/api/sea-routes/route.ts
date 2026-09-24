import { geocode, seaRoute } from "@/lib/seaRoutes";

export const dynamic = "force-dynamic";

// GET /api/sea-routes?from=<POL>&to=<POD>&from=…&to=… → for each leg (in order): where both ports are, and the shortest sea
// route between them with its length in nautical miles. Positions are [lng, lat]; a port no map knows comes back null,
// and so does the route that needs it.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const [from, to] = [params.getAll("from"), params.getAll("to")];
  if (!from.length || from.length !== to.length || from.length > 20 || [...from, ...to].some((p) => !p.trim() || p.length > 200)) {
    return Response.json({ error: "Send matching from/to port pairs: up to 20, each under 200 characters" }, { status: 400 });
  }
  try {
    const legs = await Promise.all(
      from.map(async (pol, i) => {
        const [a, b] = await Promise.all([geocode(pol), geocode(to[i])]);
        const route = a && b ? await seaRoute(a, b) : null;
        return { from: a, to: b, path: route?.path ?? null, nm: route?.nm ?? null };
      }),
    );
    return Response.json(legs);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
