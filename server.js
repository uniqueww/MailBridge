const express = require("express");
const https = require("https");
const path = require("path");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const crypto = require("crypto");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

const app = express();
const port = Number(process.env.PORT || 3066);
const host = process.env.HOST || "127.0.0.1";
const dataDir = path.join(__dirname, "data");
const storeFile = path.join(dataDir, "store.json");
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const builtInAdminUsername = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
const builtInAdminPassword = String(process.env.ADMIN_PASSWORD || "admin123456");

const sessions = new Map();
let storeCache = null;

app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  const store = await loadStore();
  res.json({ ok: true, admins: store.admins.length });
});

app.post("/api/admin/register", async (req, res) => {
  res.status(403).json({
    success: false,
    error: "当前版本已关闭管理员注册，请使用内置管理员登录",
  });
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    validateRequired({ username, password }, ["username", "password"]);

    const normalizedUsername = normalizeUsername(username);
    const store = await loadStore();
    const admin = store.admins.find((item) => item.username === normalizedUsername);
    if (!admin || !verifyPassword(password, admin)) {
      throw new Error("账号或密码错误");
    }

    const session = createSession(admin.id);
    res.json({
      success: true,
      admin: sanitizeAdmin(admin),
      sessionToken: session.token,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.get("/api/admin/me", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    res.json({
      success: true,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  const token = readSessionToken(req);
  if (token) {
    sessions.delete(token);
  }
  res.json({ success: true });
});

app.get("/api/admin/accounts", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    res.json({
      success: true,
      accounts: admin.accounts || [],
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/admin/accounts/import", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      throw new Error("请输入导入内容");
    }

    const { accounts, errors } = parseImportText(text);
    const existingEmails = new Set((admin.accounts || []).map((item) => item.email.toLowerCase()));
    const unique = accounts.filter((item) => !existingEmails.has(item.email.toLowerCase()));

    admin.accounts = [...(admin.accounts || []), ...unique];
    await persistAdmin(admin);

    res.json({
      success: true,
      imported: unique.length,
      skipped: accounts.length - unique.length,
      errors,
      accounts: admin.accounts,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.delete("/api/admin/accounts/:accountId", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const accountId = req.params.accountId;
    const before = admin.accounts.length;
    admin.accounts = admin.accounts.filter((item) => item.id !== accountId);
    if (admin.accounts.length === before) {
      throw new Error("邮箱不存在");
    }

    admin.shares = (admin.shares || []).map((share) => ({
      ...share,
      accountIds: share.accountIds.filter((id) => id !== accountId),
    })).filter((share) => share.accountIds.length > 0);

    await persistAdmin(admin);
    res.json({
      success: true,
      accounts: admin.accounts,
      shares: serializeShares(admin, req),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.delete("/api/admin/accounts", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    admin.accounts = [];
    admin.shares = [];
    await persistAdmin(admin);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.get("/api/admin/shares", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    res.json({
      success: true,
      shares: serializeShares(admin, req),
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/admin/shares", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const { accountIds, name = "" } = req.body || {};
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      throw new Error("请至少选择一个邮箱");
    }

    const uniqueIds = [...new Set(accountIds.map(String))];
    const ownedIds = new Set((admin.accounts || []).map((item) => item.id));
    if (uniqueIds.some((id) => !ownedIds.has(id))) {
      throw new Error("包含未授权的邮箱");
    }

    const share = {
      id: createId(),
      name: String(name || "").trim() || `分享 ${new Date().toLocaleString("zh-CN")}`,
      accountIds: uniqueIds,
      createdAt: new Date().toISOString(),
    };

    admin.shares = [share, ...(admin.shares || [])];
    await persistAdmin(admin);

    res.json({
      success: true,
      share: serializeShare(share, admin, req),
      shares: serializeShares(admin, req),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.delete("/api/admin/shares/:shareId", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const before = admin.shares.length;
    admin.shares = admin.shares.filter((item) => item.id !== req.params.shareId);
    if (admin.shares.length === before) {
      throw new Error("分享不存在");
    }
    await persistAdmin(admin);
    res.json({
      success: true,
      shares: serializeShares(admin, req),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/admin/fetch", async (req, res) => {
  try {
    const admin = await requireAdmin(req);
    const accounts = pickAccountsByIds(admin.accounts, req.body && req.body.accountIds);
    const result = await fetchForAccounts(accounts, req.body || {});
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.get("/api/share/:shareId", async (req, res) => {
  try {
    const { admin, share } = await requireShare(req.params.shareId);
    res.json({
      success: true,
      share: serializeSharePublic(share, admin, req),
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.post("/api/share/:shareId/fetch", async (req, res) => {
  try {
    const { admin, share } = await requireShare(req.params.shareId);
    const accounts = pickAccountsByIds(admin.accounts, share.accountIds);
    const result = await fetchForAccounts(accounts, req.body || {});
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: normalizeError(error),
    });
  }
});

app.get("/share/:shareId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

module.exports = { app };

if (require.main === module) {
  ensureStore().then(() => {
    app.listen(port, host, () => {
      console.log(`Outlook local fetch running at http://${host}:${port}`);
    });
  }).catch((error) => {
    console.error("Failed to initialize store:", error);
    process.exit(1);
  });
}

async function fetchForAccounts(accounts, payload) {
  if (!accounts || accounts.length === 0) {
    throw new Error("没有可取件的邮箱");
  }

  const useImap = payload.useImap !== false;
  const useGraph = payload.useGraph !== false;
  if (!useImap && !useGraph) {
    throw new Error("请至少选择一个协议");
  }

  const keyword = String(payload.keyword || "").trim();
  const sender = String(payload.sender || "").trim();
  const limit = clamp(payload.limit, 1, 30);
  const results = [];
  const errors = [];

  for (const account of accounts) {
    const tasks = [];
    if (useGraph) {
      tasks.push(
        fetchGraphForAccount(account, { keyword, sender, limit }).catch((error) => ({
          protocol: "graph",
          error: normalizeError(error),
        })),
      );
    }
    if (useImap) {
      tasks.push(
        fetchImapForAccount(account, { keyword, sender, limit: clamp(limit, 1, 10) }).catch((error) => ({
          protocol: "imap",
          error: normalizeError(error),
        })),
      );
    }

    const settled = await Promise.all(tasks);
    for (const item of settled) {
      if (item.error) {
        errors.push({
          email: account.email,
          protocol: item.protocol,
          error: item.error,
        });
        continue;
      }

      item.emails.forEach((mail) => {
        results.push({
          ...mail,
          _account: account.email,
        });
      });
    }
  }

  return {
    count: deduplicate(results).length,
    emails: deduplicate(results).sort((a, b) => new Date(b.date) - new Date(a.date)),
    errors,
  };
}

async function fetchGraphForAccount(account, options) {
  const accessToken = await exchangeMicrosoftRefreshToken({
    clientId: account.clientId,
    refreshToken: account.refreshToken,
  });
  const emails = await fetchGraphMessages({
    email: account.email,
    accessToken,
    ...options,
  });
  return {
    protocol: "graph",
    emails,
  };
}

async function fetchImapForAccount(account, options) {
  const accessToken = await exchangeMicrosoftRefreshToken({
    clientId: account.clientId,
    refreshToken: account.refreshToken,
    scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
  });
  const emails = await fetchImapMessages({
    email: account.email,
    accessToken,
    ...options,
  });
  return {
    protocol: "imap",
    emails,
  };
}

function pickAccountsByIds(accounts, accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return accounts || [];
  }
  const idSet = new Set(accountIds.map(String));
  return (accounts || []).filter((item) => idSet.has(item.id));
}

async function requireAdmin(req) {
  const token = readSessionToken(req);
  if (!token) {
    throw new Error("请先登录管理员账号");
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    throw new Error("登录已过期，请重新登录");
  }

  session.expiresAt = Date.now() + sessionTtlMs;
  const store = await loadStore();
  const admin = store.admins.find((item) => item.id === session.adminId);
  if (!admin) {
    sessions.delete(token);
    throw new Error("管理员不存在");
  }
  return admin;
}

async function requireShare(shareId) {
  const store = await loadStore();
  for (const admin of store.admins) {
    const share = (admin.shares || []).find((item) => item.id === shareId);
    if (share) {
      return { admin, share };
    }
  }
  throw new Error("分享不存在或已失效");
}

function readSessionToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return String(req.headers["x-session-token"] || "").trim();
}

function createSession(adminId) {
  const token = createId();
  const session = {
    adminId,
    token,
    expiresAt: Date.now() + sessionTtlMs,
  };
  sessions.set(token, session);
  return session;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash };
}

function verifyPassword(password, admin) {
  const passwordHash = crypto.scryptSync(password, admin.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(passwordHash, "hex"), Buffer.from(admin.passwordHash, "hex"));
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    createdAt: admin.createdAt,
    accountCount: admin.accounts.length,
    shareCount: admin.shares.length,
  };
}

function serializeShares(admin, req) {
  return (admin.shares || []).map((share) => serializeShare(share, admin, req));
}

function serializeShare(share, admin, req) {
  const accountMap = new Map((admin.accounts || []).map((item) => [item.id, item]));
  const sharedAccounts = share.accountIds.map((id) => accountMap.get(id)).filter(Boolean);
  return {
    id: share.id,
    name: share.name,
    createdAt: share.createdAt,
    accountIds: share.accountIds,
    accountEmails: sharedAccounts.map((account) => account.email),
    accountPasswords: sharedAccounts.map((account) => account.password || ""),
    url: buildShareUrl(req, share.id),
  };
}

function serializeSharePublic(share, admin, req) {
  const serialized = serializeShare(share, admin, req);
  return {
    ...serialized,
    adminUsername: admin.username,
  };
}

function buildShareUrl(req, shareId) {
  return `${req.protocol}://${req.get("host")}/share/${shareId}`;
}

async function persistAdmin(admin) {
  const store = await loadStore();
  const index = store.admins.findIndex((item) => item.id === admin.id);
  if (index === -1) {
    throw new Error("管理员不存在");
  }
  store.admins[index] = admin;
  await saveStore(store);
}

async function ensureStore() {
  if (!existsSync(dataDir)) {
    await fs.mkdir(dataDir, { recursive: true });
  }
  if (!existsSync(storeFile)) {
    await fs.writeFile(storeFile, JSON.stringify({ admins: [] }, null, 2), "utf8");
  }
}

async function loadStore() {
  if (storeCache) {
    return storeCache;
  }
  await ensureStore();
  const text = await fs.readFile(storeFile, "utf8");
  storeCache = JSON.parse(text || '{"admins":[]}');
  if (!storeCache.admins) {
    storeCache.admins = [];
  }
  await ensureBuiltInAdmin(storeCache);
  return storeCache;
}

async function saveStore(store) {
  storeCache = store;
  await ensureStore();
  await fs.writeFile(storeFile, JSON.stringify(store, null, 2), "utf8");
}

async function ensureBuiltInAdmin(store) {
  if (!Array.isArray(store.admins)) {
    store.admins = [];
  }

  if (store.admins.length > 0) {
    return;
  }

  const credentials = hashPassword(builtInAdminPassword);
  store.admins.push({
    id: createId(),
    username: builtInAdminUsername,
    salt: credentials.salt,
    passwordHash: credentials.passwordHash,
    createdAt: new Date().toISOString(),
    accounts: [],
    shares: [],
  });
  await saveStore(store);
}

function parseImportText(text) {
  const accounts = [];
  const errors = [];

  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parts = null;
    for (let dashCount = 4; dashCount >= 1; dashCount -= 1) {
      const separator = "-".repeat(dashCount);
      const testParts = trimmed.split(separator).map((part) => part.trim());
      if (testParts.length === 4 && testParts.every(Boolean)) {
        parts = testParts;
        break;
      }
    }

    if (!parts) {
      errors.push(`第 ${index + 1} 行格式错误`);
      return;
    }

    const [email, password, clientId, refreshToken] = parts;
    if (!email.includes("@")) {
      errors.push(`第 ${index + 1} 行邮箱格式错误`);
      return;
    }

    accounts.push({
      id: createId(),
      email,
      password,
      clientId,
      refreshToken,
      createdAt: new Date().toISOString(),
    });
  });

  return { accounts, errors };
}

function validateRequired(payload, keys) {
  for (const key of keys) {
    if (!payload[key] || typeof payload[key] !== "string") {
      throw new Error(`缺少必要字段: ${key}`);
    }
  }
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (username.length < 3) {
    throw new Error("管理员账号至少 3 个字符");
  }
  return username;
}

async function exchangeMicrosoftRefreshToken({ clientId, refreshToken, scope }) {
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: "http://localhost",
    scope: scope || "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
  });

  const { statusCode, data } = await requestJson("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (statusCode < 200 || statusCode >= 300 || !data.access_token) {
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

  const graphResponse = await requestJson(url, { headers });
  const data = graphResponse.data;
  if (graphResponse.statusCode < 200 || graphResponse.statusCode >= 300) {
    throw new Error((data && data.error && data.error.message) || "Graph 邮件读取失败");
  }

  return (data.value || []).map((item) => ({
    protocol: "graph",
    subject: item.subject || "(无主题)",
    from: item.from && item.from.emailAddress ? item.from.emailAddress.address || "" : "",
    fromName: item.from && item.from.emailAddress ? item.from.emailAddress.name || "" : "",
    date: item.receivedDateTime,
    bodyPreview: item.bodyPreview || "",
    bodyHtml: item.body && item.body.contentType === "html" ? item.body.content || "" : "",
    bodyText: item.body && item.body.contentType === "text" ? item.body.content || "" : "",
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
        from: readPath(parsed, ["from", "value", 0, "address"]) || readPath(message, ["envelope", "from", 0, "address"]) || "",
        fromName: readPath(parsed, ["from", "value", 0, "name"]) || readPath(message, ["envelope", "from", 0, "name"]) || "",
        date: readDateIso(parsed.date) || readDateIso(message.internalDate) || new Date().toISOString(),
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

function deduplicate(emails) {
  const seen = new Map();
  for (const email of emails) {
    const key = email.messageId || `${email.subject}-${email.date}-${email.from}`;
    if (!seen.has(key) || email.protocol === "graph") {
      seen.set(key, email);
    }
  }
  return [...seen.values()];
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

function readPath(target, pathList) {
  let current = target;
  for (const key of pathList) {
    if (current == null) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readDateIso(value) {
  return value && typeof value.toISOString === "function" ? value.toISOString() : "";
}

function createId() {
  return crypto.randomBytes(16).toString("hex");
}

function requestJson(targetUrl, options) {
  const url = typeof targetUrl === "string" ? new URL(targetUrl) : targetUrl;

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options && options.method ? options.method : "GET",
      headers: options && options.headers ? options.headers : {},
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode || 500,
            data: raw ? JSON.parse(raw) : {},
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);

    if (options && options.body) {
      request.write(options.body);
    }
    request.end();
  });
}
