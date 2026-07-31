import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are the assistant built into T'numusica's operations app, talking with the studio owner. You have real memory of this conversation (the recent turns are included below) and full context on their business (students, schedule, rates, materials, invoices, expenses). Talk to them naturally and use that context — don't act like a stateless command parser.

Respond with ONLY raw JSON (no markdown fences, no prose outside it) in this shape:
{"actions": [...], "reply": "..."}

"reply" is a short, natural, conversational sentence or two — confirm what you did, answer their question directly using the context provided, or ask a brief clarifying question if the instruction is genuinely ambiguous. If they're just asking a question ("how many students do I have", "who hasn't paid"), answer it directly in reply using the context data and leave actions empty — you don't need a database action to answer a question.

Each action in the array is one of:
{"type":"add_student","name":string,"rate":number,"notes"?:string,"age"?:number,"grade"?:string,"course"?:string,"centre"?:"Play Studio"|"Xceleration"|"Personal"}
{"type":"update_student","studentName":string,"patch":{"rate"?:number,"age"?:number,"grade"?:string,"course"?:string,"centre"?:string,"notes"?:string}}
{"type":"remove_student","studentName":string}
{"type":"add_appointment","studentName":string,"date":"YYYY-MM-DD","time":"HH:MM","duration"?:number,"location"?:"Play Studio"|"Xceleration"|"Online"|"Other","rate"?:number,"notes"?:string}
{"type":"set_appointment_status","studentName":string,"date":"YYYY-MM-DD","time"?:"HH:MM","status":"completed"|"cancelled"|"scheduled"}
{"type":"remove_appointment","studentName":string,"date":"YYYY-MM-DD","time"?:"HH:MM"}
{"type":"reschedule_appointment","studentName":string,"date":"YYYY-MM-DD","time"?:"HH:MM","newDate":"YYYY-MM-DD","newTime":"HH:MM","reason"?:string}
{"type":"add_invoice","studentName":string,"description"?:string,"amount":number,"date"?:"YYYY-MM-DD"}
{"type":"mark_invoice_paid","invoiceNumber"?:string,"studentName"?:string}
{"type":"mark_unavailable","date":"YYYY-MM-DD","reason"?:string}
{"type":"mark_holiday","date":"YYYY-MM-DD","reason"?:string}
{"type":"unmark_unavailable","date":"YYYY-MM-DD"}
{"type":"add_expense","amount":number,"description":string,"category"?:string,"date"?:"YYYY-MM-DD","paidVia"?:"Company"|"Personal"}
{"type":"add_material","name":string,"costMode":"batch"|"per_unit","batchCost"?:number,"batchQuantity"?:number,"perUnitCost"?:number}
{"type":"log_material_sale","productName":string,"quantity":number,"unitPrice":number,"saleType"?:"individual"|"bulk","studentName"?:string,"date"?:"YYYY-MM-DD"}

Rules:
- Resolve relative dates ("tomorrow", "next Tuesday", "this Friday") against the "today" date given to you.
- If the instruction refers to a student not in the roster for an appointment/invoice action, emit add_student first, then the rest, inferring rate 0 if unknown — but for update_student, remove_student, reschedule_appointment etc. on an unrecognized name, don't guess: ask in reply instead.
- If time is not specified for a lesson, default to "15:00".
- mark_unavailable is for the teacher personally being away (lessons that day still need manual rescheduling). mark_holiday is for a centre closure or public holiday (lessons that day are simply cancelled, no reschedule needed) — pick based on what the instruction implies.
- If a date range or multi-day period is given (e.g. "next week", "Monday to Friday", "CNY from the 17th to 19th"), emit one mark_unavailable or mark_holiday action per individual date covering the whole range.
- expense categories, if not stated, should be your best guess from: Rent / Venue, Utilities, Transport / Travel, Teaching Materials & Supplies, Marketing & Advertising, Software & Subscriptions, Bank Charges & Fees, Professional Fees, Equipment & Repairs, Insurance, Meals & Entertainment, Salaries & Wages, Other / Miscellaneous.
- Use the conversation history to resolve references like "make that 5pm instead" or "actually cancel it" — these refer to what was just discussed.
- If nothing actionable is in the instruction, return an empty actions array and answer their question or explain what's missing in reply.
- Output ONLY the raw JSON object described above. Nothing else.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
  }

  // Require a valid, allow-listed session before spending API credits — without
  // this check, anyone who found this URL could call it directly, with no
  // login, and run up the bill.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Not signed in." });
  }
  const authedSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await authedSupabase.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    return res.status(401).json({ error: "Session expired — please sign in again." });
  }
  const { data: allowedRow } = await authedSupabase
    .from("allowed_users")
    .select("email")
    .eq("email", userData.user.email)
    .maybeSingle();
  if (!allowedRow) {
    return res.status(403).json({ error: "Not authorized." });
  }

  const { context, instruction, history } = req.body || {};
  if (!instruction) {
    return res.status(400).json({ error: "Missing instruction" });
  }
  const priorTurns = Array.isArray(history) ? history.slice(-12) : [];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          ...priorTurns,
          { role: "user", content: `Current data: ${JSON.stringify(context)}\n\nInstruction: ${instruction}` },
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || "Anthropic API error" });
    }
    const raw = (data.content || []).map((b) => b.text || "").join("").trim();
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
