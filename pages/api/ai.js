const SYSTEM_PROMPT = `You are the command interpreter for a solo piano teacher's operations app (T'numusica).
The user will give you a plain-English instruction. Translate it into a JSON object with an "actions" array and a short "reply" string (one sentence confirming what you did, plain language, no markdown).

Each action is one of:
{"type":"add_student","name":string,"rate":number,"notes"?:string}
{"type":"update_rate","studentName":string,"rate":number}
{"type":"remove_student","studentName":string}
{"type":"add_appointment","studentName":string,"date":"YYYY-MM-DD","time":"HH:MM","duration"?:number,"location"?:"Play Studio"|"Xecleration"|"Online"|"Other","rate"?:number}
{"type":"set_appointment_status","studentName":string,"date":"YYYY-MM-DD","time"?:"HH:MM","status":"completed"|"cancelled"|"scheduled"}
{"type":"remove_appointment","studentName":string,"date":"YYYY-MM-DD","time"?:"HH:MM"}
{"type":"add_invoice","studentName":string,"description"?:string,"amount":number,"date"?:"YYYY-MM-DD"}
{"type":"mark_invoice_paid","invoiceNumber"?:string,"studentName"?:string}

Rules:
- Resolve relative dates ("tomorrow", "next Tuesday", "this Friday") against the "today" date given to you.
- If the instruction refers to a student not in the roster, still emit add_student first, then the rest, inferring rate 0 if unknown.
- If time is not specified for a lesson, default to "15:00".
- If nothing actionable is in the instruction, return an empty actions array and a reply explaining what's missing or answering their question using the data given.
- Output ONLY raw JSON: {"actions":[...],"reply":"..."}. No markdown fences, no prose outside the JSON.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
  }

  const { context, instruction } = req.body || {};
  if (!instruction) {
    return res.status(400).json({ error: "Missing instruction" });
  }

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
          { role: "user", content: `Context: ${JSON.stringify(context)}\n\nInstruction: ${instruction}` },
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
