const SESSION_KEY = "outlook_admin_session";
const SHARE_PREFIX = "/share/";
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:3066" : "";

const state = {
  mode: location.pathname.startsWith(SHARE_PREFIX) ? "share" : "admin",
  sessionToken: localStorage.getItem(SESSION_KEY) || "",
  admin: null,
  accounts: [],
  shares: [],
  currentEmails: [],
  share: null,
};

const els = {
  authSection: document.getElementById("authSection"),
  workspaceSection: document.getElementById("workspaceSection"),
  status: document.getElementById("status"),
  heroTag: document.getElementById("heroTag"),
  heroTitle: document.getElementById("heroTitle"),
  heroDesc: document.getElementById("heroDesc"),
  logoutBtn: document.getElementById("logoutBtn"),
  accountList: document.getElementById("accountList"),
  accountCount: document.getElementById("accountCount"),
  adminMeta: document.getElementById("adminMeta"),
  selectionMeta: document.getElementById("selectionMeta"),
  emailList: document.getElementById("emailList"),
  resultMeta: document.getElementById("resultMeta"),
  resultMetaTop: document.getElementById("resultMetaTop"),
  toast: document.getElementById("toast"),
  progressWrap: document.getElementById("progressWrap"),
  progressText: document.getElementById("progressText"),
  progressPercent: document.getElementById("progressPercent"),
  progressBar: document.getElementById("progressBar"),
  importModal: document.getElementById("importModal"),
  importText: document.getElementById("importText"),
  importPreview: document.getElementById("importPreview"),
  shareModal: document.getElementById("shareModal"),
  shareName: document.getElementById("shareName"),
  shareSelection: document.getElementById("shareSelection"),
  shareList: document.getElementById("shareList"),
  shareCount: document.getElementById("shareCount"),
  detailModal: document.getElementById("detailModal"),
  detailSubject: document.getElementById("detailSubject"),
  detailMeta: document.getElementById("detailMeta"),
  detailBody: document.getElementById("detailBody"),
  searchKeyword: document.getElementById("searchKeyword"),
  searchSender: document.getElementById("searchSender"),
  fetchLimit: document.getElementById("fetchLimit"),
  toggleImap: document.getElementById("toggleImap"),
  toggleGraph: document.getElementById("toggleGraph"),
};

bindEvents();
boot();

function bindEvents() {
  document.getElementById("loginBtn").addEventListener("click", loginAdmin);
  document.getElementById("loginUsername").addEventListener("keydown", submitLoginOnEnter);
  document.getElementById("loginPassword").addEventListener("keydown", submitLoginOnEnter);
  document.getElementById("openImport").addEventListener("click", () => toggleModal(els.importModal, true));
  document.getElementById("closeImport").addEventListener("click", () => toggleModal(els.importModal, false));
  document.getElementById("cancelImport").addEventListener("click", () => toggleModal(els.importModal, false));
  document.getElementById("confirmImport").addEventListener("click", importAccounts);
  document.getElementById("clearAll").addEventListener("click", clearAllAccounts);
  document.getElementById("fetchSelected").addEventListener("click", () => startFetch(true));
  document.getElementById("fetchAll").addEventListener("click", () => startFetch(false));
  document.getElementById("closeDetail").addEventListener("click", () => toggleModal(els.detailModal, false));
  document.getElementById("createShare").addEventListener("click", openShareModal);
  document.getElementById("closeShareModal").addEventListener("click", () => toggleModal(els.shareModal, false));
  document.getElementById("cancelShare").addEventListener("click", () => toggleModal(els.shareModal, false));
  document.getElementById("confirmShare").addEventListener("click", createShare);
  els.logoutBtn.addEventListener("click", logoutAdmin);
  els.importText.addEventListener("input", renderImportPreview);

  [els.importModal, els.shareModal, els.detailModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        toggleModal(modal, false);
      }
    });
  });
}

async function boot() {
  renderImportPreview();
  if (state.mode === "share") {
    await bootShareMode();
    return;
  }

  if (!state.sessionToken) {
    renderAdminMode();
    return;
  }

  try {
    const data = await api("/api/admin/me");
    state.admin = data.admin;
    await loadAdminWorkspace();
    renderAdminMode();
  } catch (error) {
    clearSession();
    renderAdminMode();
    toast(normalizeError(error));
  }
}

async function bootShareMode() {
  const shareId = location.pathname.slice(SHARE_PREFIX.length);
  try {
    const data = await api(`/api/share/${shareId}`, { auth: false });
    state.share = data.share;
    renderShareMode();
  } catch (error) {
    renderShareMode();
    els.emailList.className = "email-list empty";
    els.emailList.textContent = normalizeError(error);
    toast(normalizeError(error));
  }
}

async function loginAdmin() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!username || !password) {
    toast("请输入管理员账号和密码");
    return;
  }

  await authenticate("/api/admin/login", { username, password }, "登录成功");
}

async function authenticate(url, payload, successMessage) {
  try {
    const data = await api(url, {
      method: "POST",
      body: payload,
      auth: false,
    });
    saveSession(data.sessionToken);
    state.admin = data.admin;
    await loadAdminWorkspace();
    renderAdminMode();
    toast(successMessage);
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function loadAdminWorkspace() {
  const [accountsData, sharesData] = await Promise.all([
    api("/api/admin/accounts"),
    api("/api/admin/shares"),
  ]);
  state.accounts = accountsData.accounts || [];
  state.shares = sharesData.shares || [];
}

function renderAdminMode() {
  const isLoggedIn = Boolean(state.admin);
  els.authSection.classList.toggle("hidden", isLoggedIn);
  els.workspaceSection.classList.toggle("hidden", !isLoggedIn);
  els.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  els.heroTag.textContent = "管理员后台";
  els.heroTitle.textContent = "Outlook 邮件工作台";
  els.heroDesc.textContent = "管理员可保存邮箱到服务器，并将一个或多个邮箱打包生成免登录分享地址。";
  setStatus(isLoggedIn ? `管理员 ${state.admin.username}` : "请登录管理员");

  if (!isLoggedIn) {
    els.emailList.className = "email-list empty";
    els.emailList.textContent = "登录后可对自己的邮箱执行取件。";
    els.resultMeta.textContent = "暂无结果";
    if (els.resultMetaTop) {
      els.resultMetaTop.textContent = "请先登录";
    }
    return;
  }

  els.adminMeta.textContent = `${state.admin.username} 的邮箱池，共 ${state.accounts.length} 个邮箱。`;
  renderAccounts();
  renderShares();
  updateSelectionMeta(false);
}

function renderShareMode() {
  els.authSection.classList.add("hidden");
  els.workspaceSection.classList.remove("hidden");
  els.logoutBtn.classList.add("hidden");
  document.getElementById("openImport").classList.add("hidden");
  document.getElementById("createShare").classList.add("hidden");
  document.getElementById("clearAll").classList.add("hidden");
  document.getElementById("fetchSelected").classList.add("hidden");
  document.getElementById("sharePanel").classList.add("hidden");

  els.heroTag.textContent = "免登录分享";
  els.heroTitle.textContent = (state.share && state.share.name) || "共享邮箱取件";
  els.heroDesc.textContent = state.share
    ? `来自管理员 ${state.share.adminUsername}，打开即可使用分享内邮箱取件。`
    : "分享不存在或已失效。";
  setStatus(state.share ? "分享已加载" : "分享不可用");

  state.accounts = (((state.share && state.share.accountIds) || [])).map((id, index) => ({
    id,
    email: (state.share.accountEmails || [])[index] || id,
  }));

  els.adminMeta.textContent = state.share
    ? `当前分享包含 ${state.share.accountEmails.length} 个邮箱。`
    : "当前分享没有可用邮箱。";
  renderAccounts(true);
  updateSelectionMeta(true);
}

function renderAccounts(disabled = false) {
  els.accountCount.textContent = String(state.accounts.length);

  if (state.accounts.length === 0) {
    els.accountList.innerHTML = '<div class="muted">暂无邮箱</div>';
    updateSelectionMeta(disabled);
    return;
  }

  els.accountList.innerHTML = state.accounts.map((account) => `
    <label class="account-item">
      <input type="checkbox" data-id="${account.id}" ${disabled ? "checked disabled" : ""}>
      <span class="${disabled ? "" : "account-copy"}" data-copy-email="${disabled ? "" : escapeAttr(account.email)}" title="${disabled ? escapeHtml(account.email) : `点击复制 ${escapeHtml(account.email)}`}">${escapeHtml(account.email)}</span>
      ${disabled
        ? '<span class="mini-tag">共享</span>'
        : `<button class="icon-btn" data-delete="${account.id}" type="button">×</button>`}
    </label>
  `).join("");

  if (!disabled) {
    els.accountList.querySelectorAll("[data-copy-email]").forEach((node) => {
      node.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await copyText(node.dataset.copyEmail || "", "邮箱已复制");
      });
    });

    els.accountList.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteAccount(button.dataset.delete);
      });
    });
  }

  els.accountList.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", () => {
      const item = box.closest(".account-item");
      if (item) {
        item.classList.toggle("selected", box.checked);
      }
      updateSelectionMeta(disabled);
    });
    const item = box.closest(".account-item");
    if (item) {
      item.classList.toggle("selected", box.checked);
    }
  });

  updateSelectionMeta(disabled);
}

function renderShares() {
  els.shareCount.textContent = String(state.shares.length);

  if (state.shares.length === 0) {
    els.shareList.className = "share-list empty";
    els.shareList.textContent = "选中邮箱后生成分享地址，普通用户可免登录访问。";
    return;
  }

  els.shareList.className = "share-list";
  els.shareList.innerHTML = state.shares.map((share) => `
    <article class="share-card">
      <div class="share-top">
        <div>
          <div class="share-name">${escapeHtml(share.name)}</div>
          <div class="muted">${share.accountEmails.map(escapeHtml).join("、")}</div>
        </div>
        <span class="proto">${share.accountIds.length} 个邮箱</span>
      </div>
      <div class="share-format">${escapeHtml(buildShareText(share))}</div>
      <div class="share-actions">
        <button class="btn ghost share-copy" type="button" data-id="${share.id}">复制分享信息</button>
        <button class="btn ghost share-open" type="button" data-url="${escapeAttr(share.url)}">打开链接</button>
        <button class="btn ghost share-delete" type="button" data-id="${share.id}">删除分享</button>
      </div>
    </article>
  `).join("");

  els.shareList.querySelectorAll(".share-copy").forEach((button) => {
    button.addEventListener("click", () => {
      const share = state.shares.find((item) => item.id === button.dataset.id);
      if (share) {
        copyShareText(share);
      }
    });
  });
  els.shareList.querySelectorAll(".share-open").forEach((button) => {
    button.addEventListener("click", () => window.open(button.dataset.url, "_blank"));
  });
  els.shareList.querySelectorAll(".share-delete").forEach((button) => {
    button.addEventListener("click", () => deleteShare(button.dataset.id));
  });
}

function refreshAdminSummary() {
  if (state.mode === "admin" && state.admin) {
    els.adminMeta.textContent = `${state.admin.username} 的邮箱池，共 ${state.accounts.length} 个邮箱。`;
  }
}

function updateSelectionMeta(disabled) {
  if (!els.selectionMeta) {
    return;
  }

  if (disabled) {
    els.selectionMeta.textContent = `当前分享包含 ${state.accounts.length} 个邮箱`;
    return;
  }

  const count = getSelectedAccountIds().length;
  els.selectionMeta.textContent = count > 0 ? `当前已勾选 ${count} 个邮箱` : "当前未勾选邮箱";
}

function renderImportPreview() {
  const text = els.importText.value.trim();
  if (!text) {
    els.importPreview.textContent = "支持 1 到 4 个短横线作为分隔符。";
    return;
  }

  const { accounts, errors } = parseImportPreview(text);
  els.importPreview.textContent = `识别 ${accounts.length} 个有效账号，${errors.length} 个错误。`;
}

function parseImportPreview(text) {
  const accounts = [];
  const errors = [];

  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

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

    if (!parts[0].includes("@")) {
      errors.push(`第 ${index + 1} 行邮箱格式错误`);
      return;
    }

    accounts.push(parts[0]);
  });

  return { accounts, errors };
}

async function importAccounts() {
  const text = els.importText.value.trim();
  if (!text) {
    toast("请输入导入内容");
    return;
  }

  try {
    const data = await api("/api/admin/accounts/import", {
      method: "POST",
      body: { text },
    });
    state.accounts = data.accounts || [];
    refreshAdminSummary();
    renderAccounts();
    toggleModal(els.importModal, false);
    els.importText.value = "";
    renderImportPreview();

    const parts = [`成功导入 ${data.imported} 个邮箱`];
    if (data.skipped) {
      parts.push(`跳过 ${data.skipped} 个重复邮箱`);
    }
    if (data.errors && data.errors.length) {
      parts.push(data.errors.join("；"));
    }
    toast(parts.join("，"));
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function clearAllAccounts() {
  if (state.accounts.length === 0) {
    toast("没有可清空的数据");
    return;
  }
  if (!window.confirm("确定清空你保存到服务器的全部邮箱和分享吗？")) {
    return;
  }

  try {
    await api("/api/admin/accounts", { method: "DELETE" });
    state.accounts = [];
    state.shares = [];
    refreshAdminSummary();
    renderAccounts();
    renderShares();
    renderEmails([]);
    toast("已清空你的邮箱和分享");
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function deleteAccount(accountId) {
  try {
    const data = await api(`/api/admin/accounts/${accountId}`, { method: "DELETE" });
    state.accounts = data.accounts || [];
    state.shares = data.shares || [];
    refreshAdminSummary();
    renderAccounts();
    renderShares();
    toast("已删除邮箱");
  } catch (error) {
    toast(normalizeError(error));
  }
}

function getSelectedAccountIds() {
  return [...els.accountList.querySelectorAll('input[type="checkbox"]:checked')]
    .map((box) => box.dataset.id)
    .filter(Boolean);
}

function openShareModal() {
  const accountIds = getSelectedAccountIds();
  if (accountIds.length === 0) {
    toast("请先勾选要分享的邮箱");
    return;
  }

  const selected = state.accounts.filter((item) => accountIds.includes(item.id));
  els.shareSelection.innerHTML = selected.map((item) => `<span class="chip">${escapeHtml(item.email)}</span>`).join("");
  els.shareName.value = "";
  toggleModal(els.shareModal, true);
}

async function createShare() {
  const accountIds = getSelectedAccountIds();
  if (accountIds.length === 0) {
    toast("请先勾选要分享的邮箱");
    return;
  }

  try {
    const data = await api("/api/admin/shares", {
      method: "POST",
      body: {
        name: els.shareName.value.trim(),
        accountIds,
      },
    });
    state.shares = data.shares || [];
    renderShares();
    toggleModal(els.shareModal, false);
    await copyShareText(data.share, false);
    toast("分享已生成，信息已复制");
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function deleteShare(shareId) {
  try {
    const data = await api(`/api/admin/shares/${shareId}`, { method: "DELETE" });
    state.shares = data.shares || [];
    renderShares();
    toast("已删除分享");
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function copyShareText(share, showToast = true) {
  const text = buildShareText(share);
  await copyText(text, "分享信息已复制", showToast);
}

async function copyText(text, successMessage, showToast = true) {
  try {
    await navigator.clipboard.writeText(text);
    if (showToast) {
      toast(successMessage);
    }
  } catch {
    prompt("复制下面的内容", text);
  }
}

async function logoutAdmin() {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch {
    // Ignore logout failures and clear local session anyway.
  }
  clearSession();
  state.admin = null;
  state.accounts = [];
  state.shares = [];
  state.currentEmails = [];
  renderAdminMode();
}

async function startFetch(selectedOnly) {
  const accountIds = state.mode === "share"
    ? ((state.share && state.share.accountIds) || [])
    : selectedOnly
      ? getSelectedAccountIds()
      : state.accounts.map((item) => item.id);

  if (accountIds.length === 0) {
    toast(selectedOnly ? "请先勾选邮箱" : "没有可取件的邮箱");
    return;
  }

  const useImap = els.toggleImap.checked;
  const useGraph = els.toggleGraph.checked;
  if (!useImap && !useGraph) {
    toast("请至少勾选一个协议");
    return;
  }

  try {
    setStatus("取件中...");
    setProgress(true, 20, "正在调用邮件接口...");

    const payload = {
      accountIds,
      keyword: els.searchKeyword.value.trim(),
      sender: els.searchSender.value.trim(),
      limit: Number(els.fetchLimit.value || 10),
      useImap,
      useGraph,
    };

    const data = state.mode === "share"
      ? await api(`/api/share/${state.share.id}/fetch`, { method: "POST", body: payload, auth: false })
      : await api("/api/admin/fetch", { method: "POST", body: payload });

    state.currentEmails = data.emails || [];
    renderEmails(state.currentEmails);
    setProgress(true, 100, "完成");
    setTimeout(() => setProgress(false, 100, "完成"), 300);
    setStatus(state.mode === "share" ? "分享已加载" : `管理员 ${state.admin.username}`);

    if (data.errors && data.errors.length) {
      toast(`取件完成，共 ${state.currentEmails.length} 封；${data.errors[0].email} ${data.errors[0].protocol}: ${data.errors[0].error}`);
    } else {
      toast(`取件完成，共 ${state.currentEmails.length} 封`);
    }
  } catch (error) {
    setProgress(false, 0, "失败");
    setStatus(state.mode === "share" ? "分享已加载" : "就绪");
    toast(normalizeError(error));
  }
}

function renderEmails(emails) {
  if (emails.length === 0) {
    els.emailList.className = "email-list empty";
    els.emailList.textContent = "没有匹配到邮件。";
    els.resultMeta.textContent = "共 0 封";
    if (els.resultMetaTop) {
      els.resultMetaTop.textContent = "没有匹配结果";
    }
    return;
  }

  els.emailList.className = "email-list";
  els.resultMeta.textContent = `共 ${emails.length} 封`;
  if (els.resultMetaTop) {
    els.resultMetaTop.textContent = `最近结果 ${emails.length} 封`;
  }
  els.emailList.innerHTML = emails.map((mail, index) => `
    <article class="email-card" data-index="${index}">
      <div class="email-top">
        <span>${escapeHtml(mail.fromName || mail.from || "")} <span class="proto">${mail.protocol}</span></span>
        <span>${formatDate(mail.date)}</span>
      </div>
      <div class="email-subject">${escapeHtml(mail.subject || "(无主题)")}</div>
      <div class="email-preview">${escapeHtml((mail.bodyPreview || mail.bodyText || "").slice(0, 160))}</div>
      <div class="muted">${escapeHtml(mail._account || "")}</div>
    </article>
  `).join("");

  els.emailList.querySelectorAll("[data-index]").forEach((card) => {
    card.addEventListener("click", () => showDetail(Number(card.dataset.index)));
  });
}

function showDetail(index) {
  const mail = state.currentEmails[index];
  if (!mail) return;

  els.detailSubject.textContent = mail.subject || "(无主题)";
  els.detailMeta.textContent = `${mail.fromName || ""} ${mail.from || ""} · ${formatDate(mail.date, true)} · ${mail.protocol.toUpperCase()} · ${mail._account || ""}`;
  els.detailBody.innerHTML = mail.bodyHtml
    ? `<iframe sandbox="allow-same-origin" srcdoc="${escapeAttr(mail.bodyHtml)}"></iframe>`
    : `<pre>${escapeHtml(mail.bodyText || mail.bodyPreview || "(无正文)")}</pre>`;
  toggleModal(els.detailModal, true);
}

function saveSession(token) {
  state.sessionToken = token;
  localStorage.setItem(SESSION_KEY, token);
}

function clearSession() {
  state.sessionToken = "";
  localStorage.removeItem(SESSION_KEY);
}

async function api(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.auth === false || !state.sessionToken ? {} : { Authorization: `Bearer ${state.sessionToken}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function toggleModal(element, show) {
  element.classList.toggle("hidden", !show);
}

function setStatus(text) {
  els.status.textContent = text;
}

function setProgress(show, percent, text) {
  els.progressWrap.classList.toggle("hidden", !show);
  els.progressBar.style.width = `${percent}%`;
  els.progressPercent.textContent = `${percent}%`;
  els.progressText.textContent = text;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 3200);
}

function formatDate(value, full = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString("zh-CN", full ? undefined : {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function submitLoginOnEnter(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    loginAdmin();
  }
}

function buildShareText(share) {
  const emails = (share.accountEmails || []).filter(Boolean).join("、");
  const passwords = (share.accountPasswords || []).filter(Boolean).join("、");
  return [
    `账号：${emails}`,
    `密码：${passwords}`,
    `取件地址：${share.url || ""}`,
  ].join("\n");
}
