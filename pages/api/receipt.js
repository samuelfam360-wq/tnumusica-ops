import { createClient } from "@supabase/supabase-js";

const RECEIPT_SYSTEM_PROMPT = `You read a photo of a receipt or invoice and extract structured data for a small business's expense tracker.

Output ONLY raw JSON, no markdown fences, no prose outside the JSON, in this exact shape:
{"merchant": string|null, "amount": number|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "category": string, "notes": string}

Rules:
- "amount" is the final total paid, as a plain number (no currency symbol).
- "date" must be in YYYY-MM-DD format. If the year is ambiguous, assume the most recent plausible year.
- "category" must be exactly one of: "Rent / Venue", "Utilities", "Transport / Travel", "Teaching Materials & Supplies", "Marketing & Advertising", "Software & Subscriptions", "Bank Charges & Fees", "Professional Fees", "Equipment & Repairs", "Insurance", "Meals & Entertainment", "Salaries & Wages", "Other / Miscellaneous" — pick the closest match.
- "notes" is one short sentence only if something is unclear or you had to guess (e.g. "Amount partly obscured, please verify"). Otherwise an empty string.
- If the image isn't a receipt/invoice at all, or is unreadable, set merchant/amount/date/time to null, category to "Other / Miscellaneous", and explain briefly in notes.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
  }

  // Same auth guard as /api/ai — only signed-in, allow-listed users can trigger a paid API call.
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

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing file" });
  }
  const isPdf = mediaType === "application/pdf";

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
        max_tokens: 500,
        system: RECEIPT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              isPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
                : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: "Extract the receipt data as specified." },
            ],
          },
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
