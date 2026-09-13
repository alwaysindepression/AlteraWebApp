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

tg?.ready();
tg?.expand();
$("checkout-close").addEventListener("click", closeCheckout);
$("quantity-minus").addEventListener("click", () => changeQuantity(-1));
$("quantity-plus").addEventListener("click", () => changeQuantity(1));
$("pay-balance").addEventListener("click", () => submitPurchase("balance"));
$("pay-xrocket").addEventListener("click", () => submitPurchase("xrocket"));
$("cart-checkout").addEventListener("click", () => openCartCheckout());
$("promo-apply").addEventListener("click", () => applyPromo($("promo-input"), $("promo-status")));
$("checkout-promo-apply").addEventListener("click", () => applyPromo($("checkout-promo"), $("checkout-promo-status")));
$("search").addEventListener("input", renderCatalog);
$("category-filter").addEventListener("change", renderCatalog);
$("sort").addEventListener("change", renderCatalog);
$("history-sort").addEventListener("change", loadHistory);
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
  if (tg?.initData) result["X-Telegram-Init-Data"] = tg.initData;
  return result;
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
    setStatus("Товар добавлен в корзину");
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
      return;
    }
    activePromo = result;
    $("checkout-promo").value = code;
    $("promo-input").value = code;
    output.textContent = result.message;
    updateCheckout();
  } catch (error) {
    output.textContent = error.message;
  }
}

function submitPurchase(payment) {
  if (!tg) { setStatus("Откройте Web App внутри Telegram для покупки."); return; }
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
  $("cart-count").textContent = cart.reduce((sum, line) => sum + line.quantity, 0);
}

function baseCartTotal() {
  return cart.reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? lineTotal(item, line.quantity) : 0);
  }, 0);
}

async function loadProfile() {
  if (!tg?.initData) {
    $("profile-card").innerHTML = `<div class="empty-state">Профиль доступен при открытии приложения из Telegram.</div>`;
    return;
  }
  try {
    const data = await api("/api/profile");
    const user = data.user || {};
    $("profile-card").innerHTML = `<div class="profile-main"><div class="profile-avatar">${escapeHtml((user.first_name || user.username || "?").slice(0, 1).toUpperCase())}</div><div><h3>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь")}</h3><span>${user.username ? "@" + escapeHtml(user.username) : "ID " + user.id}</span></div></div>
      <div class="stats"><div><strong>${Number(data.balance).toFixed(2)}</strong><span>USDT на балансе</span></div><div><strong>${data.purchases || 0}</strong><span>товаров куплено</span></div><div><strong>${data.referrals?.count || 0}</strong><span>рефералов</span></div></div>`;
  } catch (error) { $("profile-card").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}

async function loadHistory() {
  if (!tg?.initData) { $("history-status").textContent = "История доступна при открытии приложения из Telegram."; return; }
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
function plural(value, one, few, many) { const n = Math.abs(value) % 100; return (n % 10 === 1 && n !== 11) ? one : (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n >= 20)) ? few : many; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function loadCart() { try { return JSON.parse(localStorage.getItem("altera-cart") || "[]").filter((line) => line && Number(line.id) > 0 && Number(line.quantity) > 0); } catch { return []; } }
function saveCart() { localStorage.setItem("altera-cart", JSON.stringify(cart)); }

async function loadCatalog() {
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
