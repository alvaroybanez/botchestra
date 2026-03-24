import { ExecuteRunRequestSchema } from "@botchestra/shared";

const WORKER_NAME = "@botchestra/browser-executor" as const;

export class BrowserLeaseDO {
  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(): Promise<Response> {
    return Response.json({ error: "not_implemented" }, { status: 501 });
  }
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function routeRequest(request: Request) {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/health") {
    return Response.json({ status: "ok" }, { status: 200 });
  }

  if (request.method === "POST" && pathname === "/execute-run") {
    void ExecuteRunRequestSchema;
    void WORKER_NAME;
    return Response.json({ error: "not_implemented" }, { status: 501 });
  }

  return notFound();
}

const worker = {
  async fetch(request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
    return routeRequest(request);
  },
};

export default worker;
