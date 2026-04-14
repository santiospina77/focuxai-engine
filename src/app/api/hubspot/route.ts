import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-hubspot-token");
  const url = req.nextUrl.searchParams.get("url");
  if (!token || !url) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
