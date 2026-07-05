const STORAGE_KEY = "wifeyMoneyRecords.liquid.v1";
const SETTINGS_KEY = "wifeyMoneySettings.liquid.v1";

const defaultSettings = {
  currency: "$",
  appName: "Wifey Money",
  theme: "dark",
  lastBackupAt: ""
};

let records = [];
let settings = { ...defaultSettings };
let activeFilter = "All";
let searchTerm = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function loadData() {
  try {
    const oldData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    records = Array.isArray(oldData) ? oldData : [];
  } catch {
    records = [];
  }

  try {
    settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    settings = { ...defaultSettings };
  }

  document.documentElement.dataset.theme = settings.theme || "dark";
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function money(value) {
  return `${settings.currency || "$"}${Number(value || 0).toFixed(2)}`;
}

function signedMoney(record) {
  return `${record.type === "In" ? "+" : "-"}${money(record.amount)}`;
}

function totals() {
  const totalIn = records.filter(r => r.type === "In").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalOut = records.filter(r => r.type === "Out").reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    count: records.length,
    usedPercent: totalIn > 0 ? Math.min(100, Math.round((totalOut / totalIn) * 100)) : 0
  };
}

function sortedRecords() {
  return [...records].sort((a, b) => {
    const dateDiff = new Date(b.date || 0) - new Date(a.date || 0);
    if (dateDiff !== 0) return dateDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function filteredRecords() {
  let list = sortedRecords();

  if (activeFilter !== "All") {
    list = list.filter(r => r.type === activeFilter);
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    list = list.filter(r =>
      (r.description || "").toLowerCase().includes(q) ||
      (r.note || "").toLowerCase().includes(q) ||
      (r.date || "").toLowerCase().includes(q) ||
      (r.type || "").toLowerCase().includes(q)
    );
  }

  return list;
}

function displayDate(iso) {
  if (!iso) return "No date";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function displayDateTime(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function setPage(page) {
  $$(".page").forEach(section => section.classList.remove("active"));

  const next = $(`#page-${page}`);
  if (next) {
    next.classList.add("active");
    $("#pageTitle").textContent = next.dataset.title || "Wifey Money";
  }

  $$(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function prefillType(type) {
  const input = type === "In" ? $("#typeIn") : $("#typeOut");
  if (input) input.checked = true;
  setTimeout(() => $("#amountInput")?.focus(), 250);
}

function renderRecordList(target, list, compact = false) {
  if (!target) return;

  if (!list.length) {
    target.innerHTML = `<div class="empty-state">No records here yet.</div>`;
    return;
  }

  target.innerHTML = list.map(record => `
    <article class="record-card">
      <div>
        <h4>${escapeHTML(record.description || (record.type === "In" ? "Money added" : "Money used"))}</h4>
        <p>${displayDate(record.date)} • ${escapeHTML(record.note || record.type)}</p>
        ${compact ? "" : `<div class="record-actions"><button class="delete-record" type="button" data-delete="${record.id}">Delete</button></div>`}
      </div>
      <strong class="${record.type === "In" ? "amount-in" : "amount-out"}">${signedMoney(record)}</strong>
    </article>
  `).join("");
}

function render() {
  const t = totals();

  $("#homeBalance").textContent = money(t.balance);
  $("#homeTotalIn").textContent = money(t.totalIn);
  $("#homeTotalOut").textContent = money(t.totalOut);
  $("#homeRecordCountSmall").textContent = `${t.count} ${t.count === 1 ? "record" : "records"}`;

  $("#usedProgress").style.width = `${t.usedPercent}%`;
  $("#usedProgressText").textContent = `${t.usedPercent}% of received money used`;

  $("#currencyInput").value = settings.currency || "$";
  $("#amountCurrency").textContent = settings.currency || "$";
  $("#appNameInput").value = settings.appName || "Wifey Money";
  $("#lastBackupText").textContent = displayDateTime(settings.lastBackupAt);

  renderRecordList($("#recentList"), sortedRecords().slice(0, 4), true);
  renderRecordList($("#historyList"), filteredRecords(), false);
}

function addRecord(event) {
  event.preventDefault();

  const type = new FormData(event.currentTarget).get("type");
  const amount = Number($("#amountInput").value);
  const description = $("#descriptionInput").value.trim();
  const date = $("#dateInput").value;
  const note = $("#noteInput").value.trim();

  if (!amount || amount <= 0) {
    showToast("Enter a valid amount");
    return;
  }

  records.push({
    id: uid(),
    type,
    amount: Math.round(amount * 100) / 100,
    description,
    date,
    note,
    createdAt: Date.now()
  });

  saveRecords();
  event.currentTarget.reset();
  $("#typeOut").checked = true;
  $("#dateInput").value = todayISO();
  render();
  setPage("home");
  showToast("Record saved");
}

function deleteRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;

  const ok = confirm(`Delete this record?\n\n${record.type} ${money(record.amount)} — ${record.description || "No description"}`);
  if (!ok) return;

  records = records.filter(r => r.id !== id);
  saveRecords();
  render();
  showToast("Record deleted");
}

function undoLast() {
  if (!records.length) {
    showToast("No record to undo");
    return;
  }

  const last = sortedRecords()[0];
  const ok = confirm(`Undo latest record?\n\n${last.type} ${money(last.amount)} — ${last.description || "No description"}`);
  if (!ok) return;

  records = records.filter(r => r.id !== last.id);
  saveRecords();
  render();
  showToast("Latest record removed");
}

async function copyBalance() {
  const balance = $("#homeBalance").textContent;
  try {
    await navigator.clipboard.writeText(balance);
    showToast("Balance copied");
  } catch {
    showToast(balance);
  }
}

function exportBackup() {
  const data = {
    app: "Wifey Money Liquid Glass Local",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    records
  };

  downloadFile(
    `wifey-money-backup-${todayISO()}.json`,
    JSON.stringify(data, null, 2),
    "application/json"
  );

  settings.lastBackupAt = new Date().toISOString();
  saveSettings();
  render();
  showToast("Backup exported");
}

function exportCSV() {
  const header = ["Date", "Description", "Type", "Amount", "Net", "Note"];
  const rows = sortedRecords().map(r => [
    r.date || "",
    r.description || "",
    r.type,
    Number(r.amount || 0).toFixed(2),
    (r.type === "In" ? Number(r.amount) : -Number(r.amount)).toFixed(2),
    r.note || ""
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  downloadFile(`wifey-money-records-${todayISO()}.csv`, csv, "text/csv");
  showToast("CSV exported");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const importedRecords = Array.isArray(data.records) ? data.records : Array.isArray(data) ? data : null;

      if (!importedRecords) throw new Error("Invalid backup");

      const ok = confirm("Import backup? This will replace current records in this browser.");
      if (!ok) return;

      records = importedRecords.map(r => ({
        id: r.id || uid(),
        type: r.type === "In" ? "In" : "Out",
        amount: Math.abs(Number(r.amount || 0)),
        description: r.description || r.what || "",
        date: r.date || todayISO(),
        note: r.note || "",
        createdAt: r.createdAt || Date.now()
      })).filter(r => r.amount > 0);

      if (data.settings) {
        settings = { ...settings, ...data.settings };
      }

      saveRecords();
      saveSettings();
      render();
      setPage("home");
      showToast("Backup imported");
    } catch (error) {
      alert("Could not import backup. Make sure it is the correct JSON file.");
    }
  };
  reader.readAsText(file);
}

function initEvents() {
  $$(".nav-item").forEach(item => {
    item.addEventListener("click", () => setPage(item.dataset.page));
  });

  $$("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      setPage(button.dataset.go);
      if (button.dataset.prefill) prefillType(button.dataset.prefill);
    });
  });

  $$(".amount-chips button").forEach(button => {
    button.addEventListener("click", () => {
      $("#amountInput").value = button.dataset.amount;
      $("#amountInput").focus();
    });
  });

  $("#transactionForm").addEventListener("submit", addRecord);

  $("#historyList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete]");
    if (button) deleteRecord(button.dataset.delete);
  });

  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter;
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      render();
    });
  });

  $("#searchInput").addEventListener("input", (event) => {
    searchTerm = event.target.value;
    render();
  });

  $("#undoLastBtn").addEventListener("click", undoLast);
  $("#copyBalanceBtn").addEventListener("click", copyBalance);
  $("#exportBackupBtn").addEventListener("click", exportBackup);
  $("#exportCsvBtn").addEventListener("click", exportCSV);
  $("#importBackupInput").addEventListener("change", event => importBackup(event.target.files[0]));

  $("#saveSettingsBtn").addEventListener("click", () => {
    settings.currency = $("#currencyInput").value.trim() || "$";
    settings.appName = $("#appNameInput").value.trim() || "Wifey Money";
    saveSettings();
    render();
    showToast("Settings saved");
  });

  $("#themeToggle").addEventListener("click", () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = settings.theme;
    saveSettings();
    showToast(settings.theme === "dark" ? "Dark mode" : "Light mode");
  });

  $("#clearDataBtn").addEventListener("click", () => {
    const ok = confirm("Clear all records from this browser? Export backup first if you need them.");
    if (!ok) return;
    records = [];
    saveRecords();
    render();
    setPage("home");
    showToast("All records cleared");
  });
}

function seedDate() {
  $("#dateInput").value = todayISO();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

loadData();
seedDate();
initEvents();
render();
registerServiceWorker();
