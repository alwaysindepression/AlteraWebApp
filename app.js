const tg = window.Telegram?.WebApp;
const API_URL = window.ALTERA_API_URL ||
  "https://bot-1789213141-7968-kaydzhe-mind.bothost.tech";
const $ = (id) => document.getElementById(id);
const catalogNode = $("catalog");
const statusNode = $("status");
const checkoutNode = $("checkout");
const quantityNode = $("quantity");
let categories = [];
let cart = loadCart();
let selected = null;
let quantity = 1;
let checkoutMode = "single";
let activePromo = null;
let depositProvider = "xrocket";
let depositPollTimer = null;
let previousCartCount = 0;

tg?.ready();
tg?.expand();
$("checkout-close").addEventListener("click", closeCheckout);
$("quantity-minus").addEventListener("click", () => changeQuantity(-1));
$("quantity-plus").addEventListener("click", () => changeQuantity(1));
$("pay-balance").addEventListener("click", () => submitPurchase("balance"));
$("pay-xrocket").addEventListener("click", () => submitPurchase("xrocket"));
$("pay-stars").addEventListener("click", () => submitPurchase("stars"));
$("cart-checkout").addEventListener("click", () => openCartCheckout());
$("promo-apply").addEventListener("click", () => applyPromo($("promo-input"), $("promo-status")));
$("checkout-promo-apply").addEventListener("click", () => applyPromo($("checkout-promo"), $("checkout-promo-status")));
$("search").addEventListener("input", renderCatalog);
$("category-filter").addEventListener("change", renderCatalog);
$("sort").addEventListener("change", renderCatalog);
$("history-sort").addEventListener("change", loadHistory);
document.querySelectorAll(".amount-option").forEach((button) => button.addEventListener("click", () => {
  $("deposit-amount").value = button.dataset.amount;
  document.querySelectorAll(".amount-option").forEach((option) => option.classList.toggle("active", option === button));
}));
document.querySelectorAll(".provider-option").forEach((button) => button.addEventListener("click", () => {
  depositProvider = button.dataset.provider;
  document.querySelectorAll(".provider-option").forEach((option) => option.classList.toggle("active", option === button));
  $("deposit-submit").textContent = `Пополнить через ${depositProvider === "stars" ? "Telegram Stars" : "xRocket"}`;
}));
$("deposit-submit").addEventListener("click", startDeposit);
document.body.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;
  copyText(copyButton.dataset.copy)
    .then(() => showToast("Ссылка скопирована"))
    .catch(() => showToast("Не удалось скопировать ссылку", "error"));
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.body.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton && !viewButton.classList.contains("tab")) showView(viewButton.dataset.view);
});
catalogNode.addEventListener("click", handleCatalogClick);
$("cart-list").addEventListener("click", handleCartClick);
checkoutNode.addEventListener("click", (event) => {
  if (event.target === checkoutNode) closeCheckout();
});

function headers() {
  const result = { "Content-Type": "application/json" };
  const initData = getTelegramInitData();
  if (initData) result["X-Telegram-Init-Data"] = initData;
  return result;
}

function getTelegramInitData() {
  return tg?.initData || window.Telegram?.WebApp?.initData || "";
}

async function waitForTelegramInitData(timeout = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const initData = getTelegramInitData();
    if (initData) return initData;
    window.Telegram?.WebApp?.ready();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "";
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== viewId;
    view.classList.toggle("active-view", view.id === viewId);
  });
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  if (viewId === "cart-view") renderCart();
  if (viewId === "history-view") loadHistory();
  if (viewId === "profile-view") loadProfile();
}

function renderCatalog() {
  const query = $("search").value.trim().toLowerCase();
  const group = $("category-filter").value;
  const sort = $("sort").value;
  let visible = categories.filter((item) =>
    (group === "all" || (item.group || "other") === group) &&
    `${item.name} ${item.description}`.toLowerCase().includes(query)
  );
  visible.sort((a, b) => {
    if (sort === "price-asc") return Number(a.price) - Number(b.price);
    if (sort === "price-desc") return Number(b.price) - Number(a.price);
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "stock") return Number(b.stock) - Number(a.stock);
    return Number(a.id) - Number(b.id);
  });
  const groups = new Map();
  visible.forEach((item) => {
    const key = item.group || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  catalogNode.innerHTML = [...groups.entries()].map(([key, items]) => `
    <section class="catalog-group">
      <h2 class="group-title">${escapeHtml(groupTitle(key))}</h2>
      <div class="group-items">${items.map(cardTemplate).join("")}</div>
    </section>
  `).join("");
  statusNode.textContent = visible.length ? `${visible.length} ${plural(visible.length, "товар", "товара", "товаров")}` : "Ничего не найдено";
}

function renderCatalogSkeleton(count = 6) {
  catalogNode.innerHTML = `<div class="skeleton-grid">${Array.from({ length: count }, () => `
    <article class="card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-short"></div><div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-price"></div><div class="skeleton skeleton-buttons"></div>
    </article>`).join("")}</div>`;
  statusNode.textContent = "Загрузка каталога...";
}

function cardTemplate(item) {
  return `<article class="card">
    <div class="card-top"><span class="pill">${escapeHtml(groupTitle(item.group || "other"))}</span><span class="stock">${item.stock} шт.</span></div>
    <h2>${escapeHtml(item.name)}</h2>
    <div class="meta"><div class="price">${Number(item.price).toFixed(2)} <small>USDT</small></div>
      <div class="card-actions"><button class="cart-add" data-id="${item.id}" ${item.stock < 1 ? "disabled" : ""}>В корзину</button><button class="buy" data-id="${item.id}" ${item.stock < 1 ? "disabled" : ""}>Купить</button></div>
    </div>
  </article>`;
}

function groupTitle(group) {
  return { l0gu_1970: "Мобильные операторы", gy_1970: "Госуслуги", tbank: "Банковские аккаунты", other: "Другие товары" }[group] || group;
}

function handleCatalogClick(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const item = categories.find((entry) => String(entry.id) === button.dataset.id);
  if (!item) return;
  if (button.classList.contains("cart-add")) {
    addToCart(item.id);
    button.classList.add("is-added");
    button.textContent = "Добавлено ✓";
    button.closest(".card")?.classList.add("cart-added");
    setTimeout(() => {
      button.classList.remove("is-added");
      button.textContent = "В корзину";
      button.closest(".card")?.classList.remove("cart-added");
    }, 1200);
    showToast("Товар добавлен в корзину");
  } else openCheckout(item);
}

function openCheckout(item) {
  selected = item;
  checkoutMode = "single";
  quantity = 1;
  $("checkout-promo").value = activePromo?.code || "";
  $("checkout-promo-status").textContent = activePromo?.message || "";
  $("quantity-controls").hidden = false;
  $("checkout-name").textContent = item.name;
  $("checkout-price").textContent = `${Number(item.price).toFixed(2)} USDT за штуку · в наличии ${item.stock}`;
  $("checkout-description").textContent = item.description || "Описание отсутствует";
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
}

function openCartCheckout() {
  if (!cart.length) return;
  selected = null;
  checkoutMode = "cart";
  $("checkout-promo").value = activePromo?.code || "";
  $("checkout-promo-status").textContent = activePromo?.message || "";
  $("quantity-controls").hidden = true;
  $("checkout-name").textContent = "Ваша корзина";
  $("checkout-price").textContent = `${cart.length} ${plural(cart.length, "позиция", "позиции", "позиций")}`;
  $("checkout-description").textContent = cart.map((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return `${item?.name || "Товар"} × ${line.quantity}`;
  }).join("\n");
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
}

function closeCheckout() {
  checkoutNode.hidden = true;
  document.body.classList.remove("checkout-open");
  selected = null;
}

function changeQuantity(delta) {
  if (!selected) return;
  quantity = Math.max(1, Math.min(Number(selected.stock), quantity + delta));
  updateCheckout();
}

function checkoutLines() {
  return checkoutMode === "cart" ? cart : [{ id: selected.id, quantity }];
}

function lineTotal(item, count) {
  const subtotal = Number(item.price) * count;
  return count >= 10 ? subtotal * .8 : subtotal;
}

function baseCheckoutTotal() {
  return checkoutLines().reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? lineTotal(item, line.quantity) : 0);
  }, 0);
}

function updateCheckout() {
  if (checkoutMode === "single") quantityNode.textContent = quantity;
  const base = baseCheckoutTotal();
  const discount = activePromo?.promo_type === "percent" ? Number(activePromo.amount) : 0;
  $("checkout-total").textContent = `Итого: ${(base * (1 - discount / 100)).toFixed(2)} USDT`;
}

async function applyPromo(input, output) {
  const code = input.value.trim().toUpperCase();
  if (!code) { output.textContent = "Введите промокод."; return; }
  output.textContent = "Проверяем...";
  try {
    const result = await api("/api/promo", { method: "POST", body: JSON.stringify({ code }) });
    if (result.promo_type === "fixed") {
      activePromo = null;
      output.textContent = result.message;
      input.value = "";
      loadProfile();
      showToast("Промокод применён");
      return;
    }
    activePromo = result;
    $("checkout-promo").value = code;
    $("promo-input").value = code;
    output.textContent = result.message;
    updateCheckout();
    showToast("Промокод применён");
  } catch (error) {
    output.textContent = error.message;
  }
}

function submitPurchase(payment) {
  if (!tg) { setStatus("Откройте Web App внутри Telegram для покупки."); return; }
  if (payment === "stars" && checkoutMode === "cart") {
    $("checkout-promo-status").textContent = "Telegram Stars доступны для одного товара. Для корзины используйте баланс или xRocket.";
    return;
  }
  const lines = checkoutLines();
  if (!lines.length || lines.some((line) => !categories.find((item) => item.id === line.id))) return;
  const amount = (baseCheckoutTotal() * (1 - (activePromo?.amount || 0) / 100)).toFixed(2);
  tg.showPopup({
    title: "Подтверждение покупки",
    message: `${checkoutMode === "cart" ? "Корзина" : selected.name}\n${amount} USDT`,
    buttons: [{ id: "confirm", type: "default", text: "Подтвердить" }, { id: "cancel", type: "cancel", text: "Отмена" }]
  }, (buttonId) => {
    if (buttonId !== "confirm") return;
    const payload = {
      action: "purchase",
      payment
    };
    if (checkoutMode === "single") {
      // Keep the legacy fields for containers that have not restarted yet.
      payload.cat_id = Number(lines[0].id);
      payload.quantity = Number(lines[0].quantity);
      payload.items = [{ cat_id: payload.cat_id, quantity: payload.quantity }];
    } else {
      payload.items = lines.map((line) => ({
        cat_id: Number(line.id),
        quantity: Number(line.quantity)
      }));
    }
    if (activePromo?.promo_type === "percent") payload.promo_code = activePromo.code;
    tg.sendData(JSON.stringify(payload));
    tg.close();
  });
}

function addToCart(id, count = 1) {
  const item = categories.find((entry) => entry.id === id);
  if (!item) return;
  const line = cart.find((entry) => entry.id === id);
  if (line) line.quantity = Math.min(item.stock, line.quantity + count);
  else cart.push({ id, quantity: Math.min(item.stock, count) });
  saveCart();
  renderCart();
}

function handleCartClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const line = cart.find((entry) => entry.id === id);
  const item = categories.find((entry) => entry.id === id);
  if (!line || !item) return;
  if (button.dataset.action === "plus") line.quantity = Math.min(item.stock, line.quantity + 1);
  if (button.dataset.action === "minus") line.quantity -= 1;
  if (button.dataset.action === "remove" || line.quantity < 1) cart = cart.filter((entry) => entry.id !== id);
  saveCart();
  renderCart();
}

function renderCart() {
  const list = $("cart-list");
  list.innerHTML = cart.map((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    if (!item) return "";
    return `<article class="cart-line"><div><strong>${escapeHtml(item.name)}</strong><span>${Number(item.price).toFixed(2)} USDT</span></div>
      <div class="cart-controls"><button data-action="minus" data-id="${item.id}">−</button><b>${line.quantity}</b><button data-action="plus" data-id="${item.id}">+</button><button class="remove" data-action="remove" data-id="${item.id}">Удалить</button></div></article>`;
  }).join("");
  const hasItems = cart.length > 0;
  $("cart-empty").hidden = hasItems;
  $("cart-summary").hidden = !hasItems;
  $("cart-total").textContent = `${baseCartTotal().toFixed(2)} USDT`;
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  $("cart-count").textContent = count;
  if (count !== previousCartCount) {
    const countNode = $("cart-count");
    countNode.classList.remove("count-pop");
    void countNode.offsetWidth;
    countNode.classList.add("count-pop");
    previousCartCount = count;
  }
}

function baseCartTotal() {
  return cart.reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? lineTotal(item, line.quantity) : 0);
  }, 0);
}

async function loadProfile() {
  const initData = await waitForTelegramInitData();
  if (!initData) {
    $("profile-card").innerHTML = `<div class="empty-state">Профиль доступен при открытии приложения из Telegram.</div>`;
    $("referral-card").innerHTML = `<div class="empty-state">Реферальная программа доступна из Telegram.</div>`;
    return;
  }
  try {
    const data = await api("/api/profile");
    const user = data.user || {};
    $("profile-card").innerHTML = `<div class="profile-main"><div class="profile-avatar">${escapeHtml((user.first_name || user.username || "?").slice(0, 1).toUpperCase())}</div><div><h3>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь")}</h3><span>${user.username ? "@" + escapeHtml(user.username) : "ID " + user.id}</span></div></div>
      <div class="stats"><div><strong>${Number(data.balance).toFixed(2)}</strong><span>USDT на балансе</span></div><div><strong>${data.purchases || 0}</strong><span>товаров куплено</span></div><div><strong>${data.referrals?.count || 0}</strong><span>рефералов</span></div></div>`;
    const referrals = data.referrals || {};
    const referralLink = referrals.link || "";
    $("referral-card").innerHTML = `<div class="profile-card-heading"><strong>Реферальная программа</strong><span>Получайте 10% с покупок друзей</span></div>
      <div class="referral-link"><code>${escapeHtml(referralLink || "Ссылка недоступна")}</code><button class="copy-button" type="button" data-copy="${escapeHtml(referralLink)}" ${referralLink ? "" : "disabled"}>Копировать</button></div>
      <div class="referral-stats"><div><strong>${Number(referrals.count || 0)}</strong><span>рефералов</span></div><div><strong>${Number(referrals.earnings || 0).toFixed(2)}</strong><span>заработано USDT</span></div></div>`;
  } catch (error) {
    $("profile-card").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    $("referral-card").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadHistory() {
  if (!await waitForTelegramInitData()) { $("history-status").textContent = "История доступна при открытии приложения из Telegram."; return; }
  $("history-status").textContent = "Загрузка...";
  try {
    const data = await api(`/api/history?limit=100&sort=${$("history-sort").value}`);
    $("history-list").innerHTML = data.history?.length ? data.history.map((entry) => `<article class="history-item"><div><strong>${escapeHtml(entry.product)}</strong><span>${escapeHtml(entry.item_preview || "Товар выдан")}</span></div><time>${formatDate(entry.date)}</time></article>`).join("") : `<div class="empty-state">Покупок пока нет.</div>`;
    $("history-status").textContent = data.history?.length ? `${data.history.length} записей` : "";
  } catch (error) { $("history-status").textContent = error.message; }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setStatus(message) { statusNode.textContent = message; }
function showToast(message, type = "default") {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}
async function copyText(value) {
  if (!value) throw new Error("Ссылка недоступна");
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
async function startDeposit() {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const amount = Number($("deposit-amount").value);
  const status = $("deposit-status");
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    status.textContent = "Сумма должна быть от 1 до 10000 USDT.";
    return;
  }
  const submit = $("deposit-submit");
  submit.disabled = true;
  status.textContent = "Создаём счёт...";
  try {
    const result = await api("/api/deposit", {
      method: "POST",
      body: JSON.stringify({ amount: Number(amount.toFixed(2)), provider: depositProvider })
    });
    if (depositProvider === "stars") {
      if (!tg?.openInvoice || !result.invoice_link) throw new Error("Telegram Stars недоступны в этом клиенте.");
      tg.openInvoice(result.invoice_link, (invoiceStatus) => {
        if (invoiceStatus === "paid") {
          showToast(`Баланс пополнен на ${amount.toFixed(2)} USDT`);
          status.textContent = "Оплата подтверждена.";
          loadProfile();
        } else if (invoiceStatus === "cancelled" || invoiceStatus === "failed") {
          status.textContent = "Оплата отменена.";
        }
      });
    } else {
      tg?.openLink?.(result.pay_url);
      status.textContent = "Ожидаем оплату xRocket...";
      pollDeposit(result.invoice_id, amount);
    }
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
  }
}
function pollDeposit(invoiceId, amount) {
  clearInterval(depositPollTimer);
  let attempts = 0;
  depositPollTimer = setInterval(async () => {
    if (++attempts > 90) { clearInterval(depositPollTimer); $("deposit-status").textContent = "Время ожидания истекло."; return; }
    try {
      const result = await api(`/api/deposit/status?invoice_id=${encodeURIComponent(invoiceId)}`);
      if (result.status === "paid") {
        clearInterval(depositPollTimer);
        $("deposit-status").textContent = "Оплата подтверждена.";
        showToast(`Баланс пополнен на ${amount.toFixed(2)} USDT`);
        loadProfile();
      } else if (result.status === "expired") {
        clearInterval(depositPollTimer);
        $("deposit-status").textContent = "Счёт просрочен. Создайте новый.";
      }
    } catch (error) {
      clearInterval(depositPollTimer);
      $("deposit-status").textContent = error.message;
    }
  }, 4000);
}
function plural(value, one, few, many) { const n = Math.abs(value) % 100; return (n % 10 === 1 && n !== 11) ? one : (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n >= 20)) ? few : many; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function loadCart() { try { return JSON.parse(localStorage.getItem("altera-cart") || "[]").filter((line) => line && Number(line.id) > 0 && Number(line.quantity) > 0); } catch { return []; } }
function saveCart() { localStorage.setItem("altera-cart", JSON.stringify(cart)); }

async function loadCatalog() {
  renderCatalogSkeleton();
  try {
    const data = await api("/api/catalog");
    categories = data.categories || [];
    const groups = [...new Set(categories.map((item) => item.group || "other"))];
    $("category-filter").innerHTML = `<option value="all">Все категории</option>` + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(groupTitle(group))}</option>`).join("");
    cart = cart.filter((line) => categories.some((item) => item.id === line.id && item.stock > 0));
    cart.forEach((line) => { const item = categories.find((entry) => entry.id === line.id); line.quantity = Math.min(line.quantity, item.stock); });
    saveCart();
    renderCatalog();
    renderCart();
  } catch { statusNode.textContent = "Не удалось загрузить каталог."; }
}

loadCatalog();
loadProfile();
