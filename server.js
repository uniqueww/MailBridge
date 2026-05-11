import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3066);
const host = process.env.HOST || "127.0.0.1";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/fetch-graph", async (req, res) => {
  try {
    const { email, clientId, refreshToken, keyword = "", sender = "", limit = 10 } = req.body || {};
    validateRequired({ email, clientId, refreshToken }, ["email", "clientId", "refreshToken"]);

    const accessToken = await exchangeMicrosoftRefreshToken({ clientId, refreshToken });
    const emails = await fetchGraphMessages({
      email,
      accessToken,
      keyword,
      sender,
      limit: clamp(limit, 1, 30),
    });

    res.json({
      success: true,
      protocol: "graph",
      count: emails.length,
      emails,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/fetch-imap", async (req, res) => {
  try {
    const { email, clientId, refreshToken, keyword = "", sender = "", limit = 10 } = req.body || {};
    validateRequired({ email, clientId, refreshToken }, ["email", "clientId", "refreshToken"]);

    const accessToken = await exchangeMicrosoftRefreshToken({
      clientId,
      refreshToken,
      scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
    });

    const emails = await fetchImapMessages({
      email,
      accessToken,
      keyword,
      sender,
      limit: clamp(limit, 1, 10),
    });

    res.json({
      success: true,
      protocol: "imap",
      count: emails.length,
      emails,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

export { app };

if (process.argv[1] === __filename) {
  app.listen(port, host, () => {
    console.log(`Outlook local fetch running at http://${host}:${port}`);
  });
}

function validateRequired(payload, keys) {
  for (const key of keys) {
    if (!payload[key] || typeof payload[key] !== "string") {
      throw new Error(`缺少必要字段: ${key}`);
    }
  }
}

async function exchangeMicrosoftRefreshToken({ clientId, refreshToken, scope }) {
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: "http://localhost",
    scope: scope || "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
  });

  const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "刷新令牌换取 access token 失败");
  }
  return data.access_token;
}

async function fetchGraphMessages({ email, accessToken, keyword, sender, limit }) {
  const filters = [];
  if (sender) {
    filters.push(`from/emailAddress/address eq '${escapeOData(sender)}'`);
  }

  const searchParts = [];
  if (keyword) {
    searchParts.push(`"${keyword.replace(/"/g, '\\"')}"`);
  }
  if (email) {
    searchParts.push(`"${email.replace(/"/g, '\\"')}"`);
  }

  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$select", "id,subject,from,receivedDateTime,bodyPreview,body,internetMessageId");
  url.searchParams.set("$orderby", "receivedDateTime DESC");
  if (filters.length > 0) {
    url.searchParams.set("$filter", filters.join(" and "));
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Prefer: 'outlook.body-content-type="html"',
  };
  if (searchParts.length > 0) {
    headers.ConsistencyLevel = "eventual";
    url.searchParams.set("$search", searchParts.join(" "));
  }

  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Graph 邮件读取失败");
  }

  return (data.value || []).map((item) => ({
    protocol: "graph",
    subject: item.subject || "(无主题)",
    from: item.from?.emailAddress?.address || "",
    fromName: item.from?.emailAddress?.name || "",
    date: item.receivedDateTime,
    bodyPreview: item.bodyPreview || "",
    bodyHtml: item.body?.contentType === "html" ? item.body?.content || "" : "",
    bodyText: item.body?.contentType === "text" ? item.body?.content || "" : "",
    messageId: item.internetMessageId || item.id,
  }));
}

async function fetchImapMessages({ email, accessToken, keyword, sender, limit }) {
  const client = new ImapFlow({
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      accessToken,
    },
    logger: false,
  });

  const results = [];

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    const sequence = `${Math.max(1, client.mailbox.exists - 100)}:*`;

    for await (const message of client.fetch(sequence, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true,
      bodyStructure: true,
    })) {
      const parsed = await simpleParser(message.source);
      const normalized = {
        protocol: "imap",
        subject: parsed.subject || "(无主题)",
        from: parsed.from?.value?.[0]?.address || message.envelope?.from?.[0]?.address || "",
        fromName: parsed.from?.value?.[0]?.name || message.envelope?.from?.[0]?.name || "",
        date: parsed.date?.toISOString() || message.internalDate?.toISOString() || new Date().toISOString(),
        bodyPreview: (parsed.text || "").slice(0, 240),
        bodyText: parsed.text || "",
        bodyHtml: typeof parsed.html === "string" ? parsed.html : "",
        messageId: parsed.messageId || String(message.uid),
      };

      if (!matchesFilters(normalized, { keyword, sender })) {
        continue;
      }

      results.push(normalized);
    }
  } finally {
    await client.logout().catch(() => {});
  }

  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  return results.slice(0, limit);
}

function matchesFilters(mail, { keyword, sender }) {
  const senderOk = !sender || (mail.from || "").toLowerCase().includes(sender.toLowerCase());
  if (!senderOk) {
    return false;
  }

  if (!keyword) {
    return true;
  }

  const haystack = [mail.subject, mail.bodyPreview, mail.bodyText, mail.from, mail.fromName]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(keyword.toLowerCase());
}

function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}
