const SESSION_KEY = "outlook_admin_session";
const APP_KEY = "outlook_current_app";
const SHARE_PREFIX = "/share/";
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:3066" : "";
const APP_OPTIONS = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "grok", label: "Grok" },
  { key: "other", label: "其他" },
];

const state = {
  mode: location.pathname.startsWith(SHARE_PREFIX) ? "share" : "admin",
  view: "mail",
  sessionToken: localStorage.getItem(SESSION_KEY) || "",
  admin: null,
  accounts: [],
  shares: [],
  currentEmails: [],
  currentApp: localStorage.getItem(APP_KEY) || "chatgpt",
  share: null,
  renewShareId: "",
  billing: {
    tab: "checkout",
    plan: "chatgptplusplan",
    uiMode: "custom",
    region: "US",
  },
};

const BILLING_ORIGIN_MAP = {
  chatgpt_mobile_android: "安卓 App（Google Play）",
  chatgpt_mobile_ios: "iOS App（Apple 内购）",
  chatgpt_web: "网页（Stripe 信用卡）",
  chatgpt_web_stripe: "网页（Stripe 信用卡）",
  chatgpt_web_apple_pay: "网页（Apple Pay）",
  chatgpt_web_paypal: "网页（PayPal）",
  chatgpt_desktop: "桌面客户端",
};

const BILLING_PLAN_MAP = {
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro",
  team: "ChatGPT Team",
  free: "Free",
  chatgptplusplan: "ChatGPT Plus",
  chatgptproplan: "ChatGPT Pro",
  chatgptteamplan: "ChatGPT Team",
};

const BILLING_PROCESSOR_MAP = {
  a001: "Stripe（网页信用卡）",
  b001: "Apple（iOS 内购）",
  c001: "Google Play（安卓内购）",
};

const els = {
  authSection: document.getElementById("authSection"),
  workspaceSection: document.getElementById("workspaceSection"),
  billingSection: document.getElementById("billingSection"),
  modeSwitch: document.getElementById("modeSwitch"),
  status: document.getElementById("status"),
  heroTag: document.getElementById("heroTag"),
  heroTitle: document.getElementById("heroTitle"),
  heroDesc: document.getElementById("heroDesc"),
  logoutBtn: document.getElementById("logoutBtn"),
  accountList: document.getElementById("accountList"),
  accountCount: document.getElementById("accountCount"),
  adminMeta: document.getElementById("adminMeta"),
  selectionMeta: document.getElementById("selectionMeta"),
  accountSearch: document.getElementById("accountSearch"),
  appTabs: document.getElementById("appTabs"),
  currentAppTag: document.getElementById("currentAppTag"),
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
  shareExpires: document.getElementById("shareExpires"),
  shareSelection: document.getElementById("shareSelection"),
  renewModal: document.getElementById("renewModal"),
  renewShareName: document.getElementById("renewShareName"),
  renewExpires: document.getElementById("renewExpires"),
  shareList: document.getElementById("shareList"),
  shareCount: document.getElementById("shareCount"),
  activeAccountCount: document.getElementById("activeAccountCount"),
  usedAccountCount: document.getElementById("usedAccountCount"),
  usedSection: document.getElementById("usedSection"),
  usedAccountList: document.getElementById("usedAccountList"),
  detailModal: document.getElementById("detailModal"),
  detailSubject: document.getElementById("detailSubject"),
  detailMeta: document.getElementById("detailMeta"),
  detailBody: document.getElementById("detailBody"),
  searchKeyword: document.getElementById("searchKeyword"),
  searchSender: document.getElementById("searchSender"),
  fetchLimit: document.getElementById("fetchLimit"),
  toggleImap: document.getElementById("toggleImap"),
  toggleGraph: document.getElementById("toggleGraph"),
  billingTokenInput: document.getElementById("billingTokenInput"),
  billingTokenStatus: document.getElementById("billingTokenStatus"),
  billingCheckoutPanel: document.getElementById("billingCheckoutPanel"),
  billingSourcePanel: document.getElementById("billingSourcePanel"),
  billingRegionBlock: document.getElementById("billingRegionBlock"),
  billingTeamBlock: document.getElementById("billingTeamBlock"),
  billingCheckoutOutput: document.getElementById("billingCheckoutOutput"),
  billingSourceOutput: document.getElementById("billingSourceOutput"),
  billingGenerateButton: document.getElementById("billingGenerateButton"),
  billingSourceButton: document.getElementById("billingSourceButton"),
  billingWorkspaceName: document.getElementById("billingWorkspaceName"),
  billingSeatQuantity: document.getElementById("billingSeatQuantity"),
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
  document.getElementById("closeRenewModal").addEventListener("click", closeRenewModal);
  document.getElementById("cancelRenew").addEventListener("click", closeRenewModal);
  document.getElementById("confirmRenew").addEventListener("click", confirmRenewShare);
  els.logoutBtn.addEventListener("click", logoutAdmin);
  els.importText.addEventListener("input", renderImportPreview);
  if (els.accountSearch) {
    els.accountSearch.addEventListener("input", () => renderAccounts());
  }
  if (els.appTabs) {
    els.appTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-app-key]");
      if (!button) return;
      state.currentApp = button.dataset.appKey;
      localStorage.setItem(APP_KEY, state.currentApp);
      renderAppTabs();
      renderAccounts();
      refreshAdminSummary();
    });
  }
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.mode));
  });
  document.querySelectorAll("[data-billing-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.billing.tab = button.dataset.billingTab;
      renderBillingTabs();
    });
  });
  document.querySelectorAll("[data-billing-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.billing[button.dataset.billingChoice] = button.dataset.value;
      renderBillingChoices();
    });
  });
  document.querySelectorAll("[data-expiry-target]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button) return;
      setExpiryValue(group.dataset.expiryTarget, button.dataset.value);
    });
  });
  els.billingTokenInput.addEventListener("input", renderBillingTokenStatus);
  els.billingGenerateButton.addEventListener("click", generateBillingCheckout);
  els.billingSourceButton.addEventListener("click", queryBillingSource);

  [els.importModal, els.shareModal, els.renewModal, els.detailModal].forEach((modal) => {
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
  const showBilling = state.view === "billing";
  els.authSection.classList.toggle("hidden", isLoggedIn || showBilling);
  els.workspaceSection.classList.toggle("hidden", !isLoggedIn || showBilling);
  els.billingSection.classList.toggle("hidden", !showBilling);
  els.modeSwitch.classList.remove("hidden");
  els.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  renderModeTabs();

  if (showBilling) {
    els.heroTag.textContent = "订阅工具";
    els.heroTitle.textContent = "ChatGPT 订阅工具";
    els.heroDesc.textContent = "粘贴 Access Token，生成订阅链接或查询订阅来源。";
    setStatus("Token 本地解析");
    renderBillingTabs();
    renderBillingChoices();
    renderBillingTokenStatus();
    return;
  }

  els.heroTag.textContent = "管理员后台";
  els.heroTitle.textContent = "MailBridge 邮件桥";
  els.heroDesc.textContent = "管理员可保存邮箱到服务器，并将一个或多个邮箱打包生成免登录分享地址。";
  setStatus(isLoggedIn ? `管理员 ${state.admin.username}` : "请登录管理员");

  if (!isLoggedIn) {
    if (els.accountSearch) {
      els.accountSearch.classList.remove("hidden");
      els.accountSearch.value = "";
    }
    if (els.appTabs) {
      els.appTabs.closest(".app-filter").classList.add("hidden");
    }
    if (els.usedSection) {
      els.usedSection.classList.add("hidden");
    }
    els.emailList.className = "email-list empty";
    els.emailList.textContent = "登录后可对自己的邮箱执行取件。";
    els.resultMeta.textContent = "暂无结果";
    if (els.resultMetaTop) {
      els.resultMetaTop.textContent = "请先登录";
    }
    return;
  }

  if (els.accountSearch) {
    els.accountSearch.value = "";
  }
  els.adminMeta.textContent = buildAdminMetaText();
  renderAccounts();
  renderShares();
  updateSelectionMeta(false);
}

function renderShareMode() {
  els.authSection.classList.add("hidden");
  els.workspaceSection.classList.remove("hidden");
  els.billingSection.classList.add("hidden");
  els.modeSwitch.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  document.getElementById("openImport").classList.add("hidden");
  document.getElementById("createShare").classList.add("hidden");
  document.getElementById("clearAll").classList.add("hidden");
  document.getElementById("fetchSelected").classList.add("hidden");
  document.getElementById("sharePanel").classList.add("hidden");
  if (els.accountSearch) {
    els.accountSearch.classList.add("hidden");
  }
  if (els.appTabs) {
    els.appTabs.closest(".app-filter").classList.add("hidden");
  }
  if (els.usedSection) {
    els.usedSection.classList.add("hidden");
  }

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

function switchView(view) {
  if (state.mode === "share") {
    return;
  }
  state.view = view === "billing" ? "billing" : "mail";
  renderAdminMode();
}

function renderModeTabs() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.view);
  });
}

function renderBillingTabs() {
  document.querySelectorAll("[data-billing-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.billingTab === state.billing.tab);
  });
  els.billingCheckoutPanel.classList.toggle("hidden", state.billing.tab !== "checkout");
  els.billingSourcePanel.classList.toggle("hidden", state.billing.tab !== "source");
}

function renderBillingChoices() {
  document.querySelectorAll("[data-billing-choice]").forEach((button) => {
    button.classList.toggle("active", state.billing[button.dataset.billingChoice] === button.dataset.value);
  });
  const isTeam = state.billing.plan === "chatgptteamplan";
  els.billingRegionBlock.classList.toggle("hidden", isTeam);
  els.billingTeamBlock.classList.toggle("hidden", !isTeam);
}

function renderBillingTokenStatus() {
  const parsed = parseBillingToken(els.billingTokenInput.value);
  if (!els.billingTokenInput.value.trim()) {
    els.billingTokenStatus.className = "token-status muted";
    els.billingTokenStatus.textContent = "请在上方输入内容";
    return;
  }
  if (!parsed.ok) {
    els.billingTokenStatus.className = "token-status";
    els.billingTokenStatus.innerHTML = `<span class="token-badge bad">${escapeHtml(parsed.error)}</span>`;
    return;
  }

  const pieces = [`<span class="token-badge good">已识别 · ${parsed.source === "json" ? "Session JSON" : "Access Token"}</span>`];
  if (parsed.meta && parsed.meta.email) pieces.push(`<span class="token-badge">${escapeHtml(parsed.meta.email)}</span>`);
  if (parsed.meta && parsed.meta.planType) pieces.push(`<span class="token-badge">${escapeHtml(parsed.meta.planType)}</span>`);
  if (parsed.meta && parsed.meta.expires) pieces.push(`<span class="token-badge">${escapeHtml(formatDate(parsed.meta.expires, true))}</span>`);
  els.billingTokenStatus.className = "token-status";
  els.billingTokenStatus.innerHTML = pieces.join(" ");
}

async function generateBillingCheckout() {
  const parsed = parseBillingToken(els.billingTokenInput.value);
  if (!parsed.ok) {
    showOutputError(els.billingCheckoutOutput, parsed.error);
    return;
  }

  els.billingCheckoutOutput.classList.add("hidden");
  setButtonLoading(els.billingGenerateButton, true, "正在生成链接...");
  try {
    const data = await api("/api/subscription/checkout", {
      method: "POST",
      body: {
        accessToken: parsed.accessToken,
        planName: state.billing.plan,
        uiMode: state.billing.uiMode,
        region: state.billing.region,
        workspaceName: els.billingWorkspaceName.value,
        seatQuantity: Number(els.billingSeatQuantity.value),
      },
      auth: false,
    });
    showBillingCheckoutResult(data.link, data.raw || data);
  } catch (error) {
    showOutputError(els.billingCheckoutOutput, normalizeError(error));
  } finally {
    setButtonLoading(els.billingGenerateButton, false, "生成订阅链接");
  }
}

async function queryBillingSource() {
  const parsed = parseBillingToken(els.billingTokenInput.value);
  if (!parsed.ok) {
    showOutputError(els.billingSourceOutput, parsed.error);
    return;
  }

  els.billingSourceOutput.classList.add("hidden");
  setButtonLoading(els.billingSourceButton, true, "正在查询...");
  try {
    const data = await api("/api/subscription/check", {
      method: "POST",
      body: { accessToken: parsed.accessToken },
      auth: false,
    });
    const info = extractBillingAccountInfo(data);
    if (!info) {
      showOutputError(els.billingSourceOutput, "响应中未找到 accounts.default，可能账号异常或 Token 已失效");
      return;
    }
    showBillingSourceResult(info, data);
  } catch (error) {
    showOutputError(els.billingSourceOutput, normalizeError(error));
  } finally {
    setButtonLoading(els.billingSourceButton, false, "查询订阅来源");
  }
}

function parseBillingToken(input) {
  const value = input.trim();
  if (!value) return { ok: false, error: "请输入内容" };
  if (value.startsWith("{")) {
    try {
      const data = JSON.parse(value);
      const accessToken = typeof data.accessToken === "string" ? data.accessToken : "";
      if (!accessToken.startsWith("eyJ")) {
        return { ok: false, error: "JSON 中未找到有效的 accessToken 字段" };
      }
      return {
        ok: true,
        accessToken,
        source: "json",
        meta: {
          email: data && data.user && data.user.email,
          planType: data && data.account && data.account.planType,
          expires: data && data.expires,
        },
      };
    } catch {
      return { ok: false, error: "JSON 解析失败，请检查是否粘贴完整" };
    }
  }
  if (value.startsWith("eyJ") && value.split(".").length === 3) {
    return { ok: true, accessToken: value, source: "raw" };
  }
  return { ok: false, error: "格式不识别：请粘贴完整 session JSON，或以 eyJ 开头的 Access Token" };
}

function extractBillingAccountInfo(data) {
  const account = data && data.accounts && data.accounts.default;
  if (!account) return null;
  const processors = [];
  const processorMap = (account.account && account.account.processor) || {};
  Object.entries(processorMap).forEach(([key, value]) => {
    if (value && (value.has_transaction_history || value.has_customer_object)) processors.push(key);
  });
  return {
    accountId: (account.account && account.account.account_id) || "-",
    planType: (account.account && account.account.plan_type) || "-",
    hasActiveSubscription: Boolean(account.entitlement && account.entitlement.has_active_subscription),
    subscriptionPlan: account.entitlement && account.entitlement.subscription_plan,
    subscriptionId: account.entitlement && account.entitlement.subscription_id,
    expiresAt: account.entitlement && account.entitlement.expires_at,
    renewsAt: account.entitlement && account.entitlement.renews_at,
    cancelsAt: (account.entitlement && account.entitlement.cancels_at) || null,
    billingCurrency: account.entitlement && account.entitlement.billing_currency,
    purchaseOriginPlatform: account.last_active_subscription && account.last_active_subscription.purchase_origin_platform,
    processors,
    isDelinquent: account.account && account.account.is_delinquent,
  };
}

function showBillingCheckoutResult(link, raw) {
  els.billingCheckoutOutput.className = "output";
  els.billingCheckoutOutput.innerHTML = `
    <strong>订阅链接已生成</strong>
    <div class="result-link">${escapeHtml(link)}</div>
    <div class="output-actions">
      <button class="copy-button" type="button" data-copy="${escapeAttr(link)}">复制链接</button>
      <a class="open-link" href="${escapeAttr(link)}" target="_blank" rel="noreferrer">在浏览器打开</a>
    </div>
    ${renderDetails(raw)}
  `;
  els.billingCheckoutOutput.querySelector("[data-copy]").addEventListener("click", (event) => {
    copyText(event.currentTarget.dataset.copy || "", "链接已复制");
  });
}

function showBillingSourceResult(info, raw) {
  els.billingSourceOutput.className = "output";
  els.billingSourceOutput.innerHTML = `
    <div class="details-grid">
      ${stat("订阅来源", BILLING_ORIGIN_MAP[info.purchaseOriginPlatform] || info.purchaseOriginPlatform || "未知")}
      ${stat("套餐类型", BILLING_PLAN_MAP[info.subscriptionPlan || info.planType] || info.subscriptionPlan || info.planType || "-")}
      ${stat("订阅状态", info.hasActiveSubscription ? "有效" : "无订阅 / 已失效")}
      ${stat("到期时间", info.expiresAt ? formatDate(info.expiresAt, true) : "-")}
      ${stat("续期时间", info.renewsAt ? formatDate(info.renewsAt, true) : "-")}
      ${stat("计费币种", info.billingCurrency || "-")}
      ${stat("订阅 ID", info.subscriptionId || "-")}
      ${stat("支付处理器", info.processors.length ? info.processors.map((p) => `${p} ${BILLING_PROCESSOR_MAP[p] || "未知"}`).join("；") : "-")}
    </div>
    ${info.cancelsAt ? `<p class="tip">订阅将于 ${escapeHtml(formatDate(info.cancelsAt, true))} 取消</p>` : ""}
    ${info.isDelinquent ? '<p class="tip">账号存在欠费状态</p>' : ""}
    ${renderDetails(raw)}
  `;
}

function showOutputError(target, message) {
  target.className = "output error";
  target.innerHTML = escapeHtml(message);
}

function setButtonLoading(button, loading, text) {
  button.disabled = loading;
  button.textContent = text;
}

function renderDetails(data) {
  return `
    <details>
      <summary>查看原始响应</summary>
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
}

function stat(label, value) {
  return `
    <div class="stat">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderAppTabs() {
  if (!els.appTabs) {
    return;
  }

  const app = getCurrentApp();
  els.currentAppTag.textContent = app.label;
  els.appTabs.innerHTML = APP_OPTIONS.map((item) => `
    <button class="app-tab ${item.key === app.key ? "active" : ""}" type="button" data-app-key="${escapeAttr(item.key)}">
      ${escapeHtml(item.label)}
    </button>
  `).join("");
}

function setExpiryValue(targetId, value) {
  const input = document.getElementById(targetId);
  if (!input) {
    return;
  }

  input.value = value;
  document.querySelectorAll(`[data-expiry-target="${targetId}"] [data-value]`).forEach((button) => {
    button.classList.toggle("active", button.dataset.value === value);
  });
}

function renderAccounts(disabled = false) {
  if (!disabled) {
    renderAppTabs();
    if (els.appTabs) {
      els.appTabs.closest(".app-filter").classList.remove("hidden");
    }
  }

  const allAccounts = sortAccountsByActivity(state.accounts || []);
  const appKey = getCurrentApp().key;
  const activeAccounts = disabled ? allAccounts : allAccounts.filter((account) => !isAccountUsedForApp(account, appKey));
  const usedAccounts = disabled ? [] : allAccounts.filter((account) => isAccountUsedForApp(account, appKey));
  const keyword = disabled ? "" : ((els.accountSearch && els.accountSearch.value.trim().toLowerCase()) || "");
  const filteredActive = keyword
    ? activeAccounts.filter((account) => account.email.toLowerCase().includes(keyword))
    : activeAccounts;
  const filteredUsed = keyword
    ? usedAccounts.filter((account) => account.email.toLowerCase().includes(keyword))
    : usedAccounts;

  els.accountCount.textContent = String(allAccounts.length);
  if (els.activeAccountCount) {
    els.activeAccountCount.textContent = `${activeAccounts.length}`;
  }
  if (els.usedAccountCount) {
    els.usedAccountCount.textContent = `${usedAccounts.length}`;
  }

  if (allAccounts.length === 0) {
    els.accountList.innerHTML = '<div class="muted">暂无邮箱</div>';
    if (els.usedAccountList) {
      els.usedAccountList.innerHTML = "";
    }
    if (els.usedSection) {
      els.usedSection.classList.add("hidden");
    }
    updateSelectionMeta(disabled);
    return;
  }

  els.accountList.innerHTML = filteredActive.length > 0
    ? filteredActive.map((account) => `
    <label class="account-item">
      <input type="checkbox" data-role="fetch-account" data-id="${account.id}" ${disabled ? "checked disabled" : ""}>
      <span class="${disabled ? "" : "account-copy"}" data-copy-email="${disabled ? "" : escapeAttr(account.email)}" title="${disabled ? escapeHtml(account.email) : `点击复制 ${escapeHtml(account.email)}`}">${escapeHtml(account.email)}</span>
      ${disabled
        ? '<span class="mini-tag">共享</span>'
        : `<div class="account-actions">
            <span class="last-used">${escapeHtml(formatAccountActivity(account))}</span>
            <button class="mini-action" data-mark-used="${account.id}" type="button">标记已用</button>
            <button class="icon-btn" data-delete="${account.id}" type="button">×</button>
          </div>`}
    </label>
  `).join("")
    : `<div class="muted">${keyword ? "没有匹配到待使用邮箱" : "暂无待使用邮箱"}</div>`;

  if (!disabled && els.usedAccountList && els.usedSection) {
    els.usedSection.classList.toggle("hidden", usedAccounts.length === 0);
    els.usedAccountList.innerHTML = filteredUsed.length > 0
      ? filteredUsed.map((account) => `
        <label class="account-item used-item">
          <input type="checkbox" data-role="fetch-account" data-id="${account.id}">
          <span class="account-copy" data-copy-email="${escapeAttr(account.email)}" title="点击复制 ${escapeHtml(account.email)}">${escapeHtml(account.email)}</span>
          <div class="account-actions used-actions">
            <span class="last-used">${escapeHtml(formatAppUsedAt(account, appKey))}</span>
            <span class="used-mark">已用</span>
            <button class="mini-action ghost-action" data-restore="${account.id}" type="button">恢复</button>
          </div>
        </label>
      `).join("")
      : `<div class="muted">${keyword ? "没有匹配到已使用邮箱" : "暂无已使用邮箱"}</div>`;
  }

  if (!disabled) {
    document.querySelectorAll("[data-copy-email]").forEach((node) => {
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

    els.accountList.querySelectorAll("[data-mark-used]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateAccountStatus(button.dataset.markUsed, "used", appKey);
      });
    });

    if (els.usedAccountList) {
      els.usedAccountList.querySelectorAll("[data-restore]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          updateAccountStatus(button.dataset.restore, "active", appKey);
        });
      });
    }
  }

  getAccountCheckboxes().forEach((box) => {
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
  els.shareList.innerHTML = state.shares.map((share) => {
    const status = getShareStatusMeta(share);
    return `
    <article class="share-card ${share.isActive ? "" : "share-card-inactive"}">
      <div class="share-top">
        <div>
          <div class="share-name">${escapeHtml(share.name)}</div>
          <div class="muted">${share.accountEmails.map(escapeHtml).join("、")}</div>
        </div>
        <span class="proto ${status.className}">${escapeHtml(status.label)}</span>
      </div>
      <div class="share-meta">
        <span>${share.accountIds.length} 个邮箱</span>
        <span>${escapeHtml(formatShareExpiry(share))}</span>
      </div>
      <div class="share-format">${escapeHtml(buildShareText(share))}</div>
      <div class="share-actions">
        <button class="btn ghost share-copy" type="button" data-id="${share.id}">复制分享信息</button>
        <button class="btn ghost share-open" type="button" data-url="${escapeAttr(share.url)}" ${share.isActive ? "" : "disabled"}>打开链接</button>
        <button class="btn ghost share-renew" type="button" data-id="${share.id}">${share.isActive ? "续期" : "续期并恢复"}</button>
        <button class="btn ghost share-delete" type="button" data-id="${share.id}" ${share.status === "ended" ? "disabled" : ""}>终止分享</button>
      </div>
    </article>
  `;
  }).join("");

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
  els.shareList.querySelectorAll(".share-renew").forEach((button) => {
    button.addEventListener("click", () => openRenewModal(button.dataset.id));
  });
}

function getShareStatusMeta(share) {
  if (share.status === "ended") {
    return { label: "已终止", className: "danger" };
  }
  if (share.status === "expired") {
    return { label: "已过期", className: "warning" };
  }
  return { label: "有效", className: "active" };
}

function formatShareExpiry(share) {
  if (share.endedAt) {
    return `终止于 ${formatDate(share.endedAt, true)}`;
  }
  if (!share.expiresAt) {
    return "长期有效";
  }
  return `${share.status === "expired" ? "过期于" : "有效至"} ${formatDate(share.expiresAt, true)}`;
}

function refreshAdminSummary() {
  if (state.mode === "admin" && state.admin) {
    els.adminMeta.textContent = buildAdminMetaText();
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
  const app = getCurrentApp();
  const usedCount = state.accounts.filter((account) => isAccountUsedForApp(account, app.key)).length;
  if (count > 0) {
    els.selectionMeta.textContent = `当前已勾选 ${count} 个邮箱，${app.label} 已使用 ${usedCount} 个`;
    return;
  }
  els.selectionMeta.textContent = usedCount > 0 ? `当前未勾选邮箱，${app.label} 已使用 ${usedCount} 个` : "当前未勾选邮箱";
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
  return getAccountCheckboxes()
    .filter((box) => box.checked)
    .map((box) => box.dataset.id)
    .filter(Boolean);
}

function getAccountCheckboxes() {
  return [
    ...els.accountList.querySelectorAll('input[data-role="fetch-account"]'),
    ...(els.usedAccountList ? [...els.usedAccountList.querySelectorAll('input[data-role="fetch-account"]')] : []),
  ];
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
  if (els.shareExpires) {
    setExpiryValue("shareExpires", "7");
  }
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
        expiresInDays: Number(els.shareExpires && els.shareExpires.value),
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

function openRenewModal(shareId) {
  const share = state.shares.find((item) => item.id === shareId);
  if (!share) {
    toast("分享不存在");
    return;
  }

  state.renewShareId = shareId;
  els.renewShareName.textContent = `${share.name} · ${formatShareExpiry(share)}`;
  setExpiryValue("renewExpires", "7");
  toggleModal(els.renewModal, true);
}

function closeRenewModal() {
  state.renewShareId = "";
  toggleModal(els.renewModal, false);
}

async function confirmRenewShare() {
  const shareId = state.renewShareId;
  const days = Number(els.renewExpires.value);
  if (!Number.isFinite(days) || days < 1) {
    toast("续期天数不正确");
    return;
  }

  try {
    const data = await api(`/api/admin/shares/${shareId}/renew`, {
      method: "PATCH",
      body: { expiresInDays: days },
    });
    state.shares = data.shares || [];
    renderShares();
    closeRenewModal();
    toast("分享已续期");
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function deleteShare(shareId) {
  if (!window.confirm("确定终止这个分享吗？终止后原链接将不能继续取件。")) {
    return;
  }

  try {
    const data = await api(`/api/admin/shares/${shareId}`, { method: "DELETE" });
    state.shares = data.shares || [];
    renderShares();
    toast("已终止分享");
  } catch (error) {
    toast(normalizeError(error));
  }
}

async function updateAccountStatus(accountId, status, appKey = getCurrentApp().key) {
  try {
    const data = await api(`/api/admin/accounts/${accountId}/status`, {
      method: "PATCH",
      body: { status, appKey },
    });
    state.accounts = data.accounts || [];
    refreshAdminSummary();
    renderAccounts();
    const app = getAppByKey(appKey);
    toast(status === "used" ? `已标记为 ${app.label} 已使用` : `已恢复为 ${app.label} 可用`);
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
  if (els.accountSearch) {
    els.accountSearch.value = "";
  }
  renderAdminMode();
}

async function startFetch(selectedOnly) {
  const accountIds = state.mode === "share"
    ? ((state.share && state.share.accountIds) || [])
    : selectedOnly
      ? getSelectedAccountIds()
      : sortAccountsByActivity(state.accounts)
        .map((item) => item.id);

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

    if (state.mode === "admin" && data.accounts) {
      state.accounts = data.accounts;
      refreshAdminSummary();
      renderAccounts();
    }
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
  showMailDetail(mail);
}

function showMailDetail(mail) {
  els.detailSubject.textContent = mail.subject || "(无主题)";
  els.detailMeta.textContent = `${mail.fromName || ""} ${mail.from || ""} · ${formatDate(mail.date, true)} · ${mail.protocol.toUpperCase()} · ${mail._account || ""}`;
  els.detailBody.innerHTML = mail.bodyHtml
    ? `<iframe sandbox="allow-same-origin" srcdoc="${escapeAttr(mail.bodyHtml)}"></iframe>`
    : `<pre>${escapeHtml(mail.bodyText || mail.bodyPreview || "(无正文)")}</pre>`;
  toggleModal(els.detailModal, true);
}

function buildAdminMetaText() {
  const app = getCurrentApp();
  const activeCount = state.accounts.filter((account) => !isAccountUsedForApp(account, app.key)).length;
  const usedCount = state.accounts.filter((account) => isAccountUsedForApp(account, app.key)).length;
  return `${state.admin.username} 的邮箱池，共 ${state.accounts.length} 个邮箱；当前 ${app.label} 可用 ${activeCount} 个，已使用 ${usedCount} 个。`;
}

function getCurrentApp() {
  return getAppByKey(state.currentApp);
}

function getAppByKey(key) {
  return APP_OPTIONS.find((item) => item.key === key) || APP_OPTIONS[0];
}

function isAccountUsedForApp(account, appKey) {
  const usage = account && account.appUsage && account.appUsage[appKey];
  return Boolean(usage && usage.status === "used");
}

function getAccountActivityTime(account) {
  const values = [account && account.lastUsedAt, account && account.usedAt, account && account.createdAt]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  return values.length ? Math.max(...values) : 0;
}

function sortAccountsByActivity(accounts) {
  return [...(accounts || [])].sort((a, b) => {
    const activityDiff = getAccountActivityTime(b) - getAccountActivityTime(a);
    if (activityDiff) return activityDiff;
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

function formatAccountActivity(account) {
  if (!account || !account.lastUsedAt) {
    return "未使用";
  }
  return `最近 ${formatDate(account.lastUsedAt)}`;
}

function formatAppUsedAt(account, appKey) {
  const value = account && account.appUsage && account.appUsage[appKey] && account.appUsage[appKey].usedAt;
  return value ? formatDate(value) : "已使用";
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
    `有效期：${share.expiresAt ? formatDate(share.expiresAt, true) : "长期有效"}`,
  ].join("\n");
}
