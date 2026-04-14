// Vercel serverless function: proxies Claude chat requests so the API key
// stays server-side. Set ANTHROPIC_API_KEY in the Vercel project env vars.
//
// Frontend POSTs { system, messages, model?, max_tokens? }
// We forward to Anthropic's Messages API and return the JSON as-is.

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // GET → health check. Visit /api/coach in the browser to confirm the
  // function is live and the env var is wired up, without burning any tokens.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasKey: !!process.env.ANTHROPIC_API_KEY,
      keyPreview: process.env.ANTHROPIC_API_KEY
        ? process.env.ANTHROPIC_API_KEY.slice(0, 7) + "…" + process.env.ANTHROPIC_API_KEY.slice(-4)
        : null,
      node: process.version,
      region: process.env.VERCEL_REGION || null,
      deployedAt: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set on the server. Add it in Vercel → Project Settings → Environment Variables, then redeploy.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const payload = {
    model: body.model || "claude-sonnet-4-5",
    max_tokens: body.max_tokens || 1500,
    system: body.system || "",
    messages: Array.isArray(body.messages) ? body.messages : [],
  };

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).send(text);
  } catch (e) {
    return res.status(502).json({ error: "Upstream request failed: " + (e && e.message ? e.message : String(e)) });
  }
}
