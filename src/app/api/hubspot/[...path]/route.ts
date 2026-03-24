import { NextRequest, NextResponse } from "next/server";

const HUBSPOT_BASE = "https://api.hubapi.com";

const ALLOWED_PREFIXES = [
  "/crm/v3/properties/",
  "/crm/v3/pipelines/",
  "/crm/v3/owners",
  "/crm/v3/objects/",
  "/automation/v4/flows",
  "/marketing/v3/forms",
  "/crm/v3/lists",
  "/settings/v3/users",
];

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const hubspotPath = "/" + path.join("/");

  if (!isAllowed(hubspotPath)) {
    return NextResponse.json({ error: "Path not allowed", path: hubspotPath }, { status: 403 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetUrl = HUBSPOT_BASE + hubspotPath + url.search;

  const fetchOpts: RequestInit = {
    method: req.method,
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
  };

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      const body = await req.text();
      if (body) fetchOpts.body = body;
    } catch (e) {}
  }

  try {
    const hubspotRes = await fetch(targetUrl, fetchOpts);
    const data = await hubspotRes.text();
    let jsonData;
    try { jsonData = JSON.parse(data); } catch { jsonData = { raw: data }; }
    return NextResponse.json(jsonData, { status: hubspotRes.status });
  } catch (error: any) {
    return NextResponse.json({ error: "Proxy error", message: error.message }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
