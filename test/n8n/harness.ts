// Runs the JavaScript of an n8n Code node outside n8n, with just the globals these workflows use.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Item {
  json: Record<string, any>;
  binary?: Record<string, any>;
}
export interface Workflow {
  nodes: { name: string; type: string; parameters: Record<string, any>; credentials?: Record<string, unknown> }[];
  connections: Record<string, Record<string, ({ node: string }[] | null)[]>>;
  pinData?: Record<string, unknown>;
}

const dir = fileURLToPath(new URL("../../n8n/", import.meta.url)); // the exported workflows at the repo root
export const workflows: Record<string, Workflow> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(dir + f, "utf8"))]),
);

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<any>;
export const compile = (code: string) => new AsyncFunction("$input", "$json", "$", code);

// `$input` / `$json` are the given items (the first one for per-item nodes), `$(name)` reads `nodes[name]`.
export function codeNode(workflow: string, name: string) {
  const code = workflows[workflow].nodes.find((n) => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`No Code node "${name}" in ${workflow}`);
  const fn = compile(code);
  return (input: Item | Item[], nodes: Record<string, Item | Item[]> = {}): Promise<any> => {
    const ref = (v: Item | Item[]) => {
      const list = [v].flat();
      return { item: list[0], first: () => list[0], last: () => list.at(-1), all: () => list, itemMatching: (i: number) => list[i] };
    };
    const items = [input].flat();
    const $ = (node: string) => {
      if (!(node in nodes)) throw new Error(`Test gave no output for node "${node}"`);
      return ref(nodes[node]);
    };
    const helpers = {
      prepareBinaryData: async (buffer: Buffer, fileName: string, mimeType: string) => ({ data: buffer.toString("base64"), fileName, mimeType }),
      getBinaryDataBuffer: async (i: number, key: string) => Buffer.from(items[i].binary![key].data, "base64"),
    };
    return fn.call({ helpers }, ref(items), items[0].json, $);
  };
}
