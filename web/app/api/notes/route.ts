import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/data";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = Number(form.get("id"));
  const note = String(form.get("note") ?? "").slice(0, 20000);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sql = db();
  await sql`
    insert into activity_notes (activity_id, note) values (${id}, ${note})
    on conflict (activity_id) do update set note = excluded.note, updated_at = now()
  `;
  return NextResponse.redirect(new URL(`/activity/${id}`, req.url), 303);
}
