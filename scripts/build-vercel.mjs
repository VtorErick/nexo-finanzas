import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const clientDirectory = new URL("../dist/client/", import.meta.url);
const outputDirectory = new URL("../dist/vercel/", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("vercel-static", `${Date.now()}`);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(clientDirectory, outputDirectory, { recursive: true });

const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("https://nexo-finanzas.vercel.app/", {
    headers: {
      accept: "text/html",
      host: "nexo-finanzas.vercel.app",
      "x-forwarded-proto": "https",
    },
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) throw new Error(`No se pudo prerenderizar Nexo: ${response.status}`);
await writeFile(new URL("index.html", outputDirectory), await response.text(), "utf8");
