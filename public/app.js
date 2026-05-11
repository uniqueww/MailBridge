const STORAGE_KEY = "outlook_accounts";
let currentEmails = [];

const els = {
  accountList: document.getElementById("accountList"),
  accountCount: document.getElementById("accountCount"),
  emailList: document.getElementById("emailList"),
  resultMeta: document.getElementById("resultMeta"),
  status: document.getElementById("status"),
  toast: document.getElementById("toast"),
  progressWrap: document.getElementById("progressWrap"),
  progressText: document.getElementById("progressText"),
  progressPercent: document.getElementById("progressPercent"),
  progressBar: document.getElementById("progressBar"),
  importModal: document.getElementById("importModal"),
  importText: document.getElementById("importText"),
  importPreview: document.getElementById("importPreview"),
  detailModal: document.getElementById("detailModal"),
  detailSubject: document.getElementById("detailSubject"),
  detailMeta: document.getElementById("detailMeta"),
  detailBody: document.getElementById("detailBody"),
};

document.getElementById("openImport").addEventListener("click", () => toggleModal(els.importModal, true));
document.getElementById("closeImport").addEventListener("click", () => toggleModal(els.importModal, false));
document.getElementById("cancelImport").addEventListener("click", () => toggleModal(els.importModal, false));
document.getElementById("confirmImport").addEventListener("click", importAccounts);
document.getElementById("clearAll").addEventListener("click", clearAll);
document.getElementById("fetchSelected").addEventListener("click", () => startFetch(true));
document.getElementById("fetchAll").addEventListener("click", () => startFetch(false));
document.getElementById("closeDetail").addEventListener("click", () => toggleModal(els.detailModal, false));
els.importText.addEventListener("input", renderImportPreview);
els.importModal.addEventListener("click", (event) => {
  if (event.target === els.importModal) toggleModal(els.importModal, false);
});
els.detailModal.addEventListener("click", (event) => {
  if (event.target === els.detailModal) toggleModal(els.detailModal, false);
});

renderAccounts();
renderImportPreview();

function getAccounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function renderAccounts() {
  const accounts = getAccounts();
  els.accountCount.textContent = String(accounts.length);

  if (accounts.length === 0) {
    els.accountList.innerHTML = '<div class="muted">暂无邮箱</div>';
    return;
  }

  els.accountList.innerHTML = accounts.map((account) => `
    <label class="account-item">
      <input type="checkbox" data-id="${account.id}">
      <span title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</span>
      <button class="icon-btn" data-delete="${account.id}" type="button">×</button>
    </label>
  `).join("");

  els.accountList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteAccount(button.dataset.delete);
    });
  });

  els.accountList.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", () => {
      box.closest(".account-item")?.classList.toggle("selected", box.checked);
    });
  });
}

function renderImportPreview() {
  const text = els.importText.value.trim();
  if (!text) {
    els.importPreview.textContent = "支持 1 到 4 个短横线作为分隔符。";
    return;
  }

  const { accounts, errors } = parseImportText(text);
  els.importPreview.textContent = `识别 ${accounts.length} 个有效账号，${errors.length} 个错误。`;
}

function parseImportText(text) {
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

    const [email, password, clientId, refreshToken] = parts;
    if (!email.includes("@")) {
      errors.push(`第 ${index + 1} 行邮箱格式错误`);
      return;
    }

    accounts.push({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      email,
      password,
      clientId,
      refreshToken,
    });
  });

  return { accounts, errors };
}

function importAccounts() {
  const text = els.importText.value.trim();
  if (!text) {
    toast("请输入导入内容");
    return;
  }

  const { accounts, errors } = parseImportText(text);
  if (errors.length > 0) {
    toast(errors.join("；"));
  }

  const existing = getAccounts();
  const existingEmails = new Set(existing.map((item) => item.email.toLowerCase()));
  const unique = accounts.filter((item) => !existingEmails.has(item.email.toLowerCase()));

  if (unique.length === 0) {
    toast("没有可导入的新邮箱");
    return;
  }

  saveAccounts([...existing, ...unique]);
  els.importText.value = "";
  renderImportPreview();
  renderAccounts();
  toggleModal(els.importModal, false);
  toast(`成功导入 ${unique.length} 个邮箱`);
}

function clearAll() {
  if (getAccounts().length === 0) {
    toast("没有可清空的数据");
    return;
  }
  if (!window.confirm("确定清空全部邮箱吗？")) {
    return;
  }
  saveAccounts([]);
  renderAccounts();
  toast("已清空全部邮箱");
}

function deleteAccount(id) {
  saveAccounts(getAccounts().filter((item) => item.id !== id));
  renderAccounts();
  toast("已删除邮箱");
}

function getSelectedAccounts() {
  const ids = [...els.accountList.querySelectorAll('input[type="checkbox"]:checked')].map((box) => box.dataset.id);
  return getAccounts().filter((item) => ids.includes(item.id));
}

async function startFetch(selectedOnly) {
  const accounts = selectedOnly ? getSelectedAccounts() : getAccounts();
  if (accounts.length === 0) {
    toast(selectedOnly ? "请先勾选邮箱" : "请先导入邮箱");
    return;
  }

  const useImap = document.getElementById("toggleImap").checked;
  const useGraph = document.getElementById("toggleGraph").checked;
  if (!useImap && !useGraph) {
    toast("请至少勾选一个协议");
    return;
  }

  const options = {
    keyword: document.getElementById("searchKeyword").value.trim(),
    sender: document.getElementById("searchSender").value.trim(),
    limit: Number(document.getElementById("fetchLimit").value || 10),
  };

  const allEmails = [];
  const protocolCount = Number(useImap) + Number(useGraph);
  const total = accounts.length * protocolCount;
  let done = 0;

  setStatus("取件中...");
  setProgress(true, 0, "开始取件...");

  for (const account of accounts) {
    const tasks = [];
    if (useGraph) tasks.push(fetchProtocol("/api/fetch-graph", account, options, "Graph"));
    if (useImap) tasks.push(fetchProtocol("/api/fetch-imap", account, options, "IMAP"));

    const settled = await Promise.all(tasks);
    for (const result of settled) {
      done += 1;
      const percent = Math.round((done / total) * 100);
      setProgress(true, percent, `${account.email} ${result.label} 完成`);
      if (result.success) {
        result.emails.forEach((mail) => {
          mail._account = account.email;
          allEmails.push(mail);
        });
      } else {
        toast(`${account.email} ${result.label}: ${result.error}`);
      }
    }
  }

  currentEmails = deduplicate(allEmails).sort((a, b) => new Date(b.date) - new Date(a.date));
  renderEmails(currentEmails);
  setProgress(false, 100, "完成");
  setStatus("就绪");
  toast(`取件完成，共 ${currentEmails.length} 封`);
}

async function fetchProtocol(url, account, options, label) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      clientId: account.clientId,
      refreshToken: account.refreshToken,
      ...options,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    return { success: false, label, error: data.error || "请求失败" };
  }
  return { success: true, label, emails: data.emails || [] };
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

function renderEmails(emails) {
  if (emails.length === 0) {
    els.emailList.className = "email-list empty";
    els.emailList.textContent = "没有匹配到邮件。";
    els.resultMeta.textContent = "共 0 封";
    return;
  }

  els.emailList.className = "email-list";
  els.resultMeta.textContent = `共 ${emails.length} 封`;
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
  const mail = currentEmails[index];
  if (!mail) return;

  els.detailSubject.textContent = mail.subject || "(无主题)";
  els.detailMeta.textContent = `${mail.fromName || ""} ${mail.from || ""} · ${formatDate(mail.date, true)} · ${mail.protocol.toUpperCase()} · ${mail._account || ""}`;
  els.detailBody.innerHTML = mail.bodyHtml
    ? `<iframe sandbox="allow-same-origin" srcdoc="${escapeAttr(mail.bodyHtml)}"></iframe>`
    : `<pre>${escapeHtml(mail.bodyText || mail.bodyPreview || "(无正文)")}</pre>`;
  toggleModal(els.detailModal, true);
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
  return date.toLocaleString("zh-CN", full ? undefined : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
