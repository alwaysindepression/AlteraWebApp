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
let pendingPayment = null;
let favoriteItems = [];
let checkoutReturnFocus = null;
let purchasePollTimer = null;
let purchaseExpiryTimer = null;
let currentBalance = null;
let checkoutRequestKey = null;

tg?.ready();
tg?.expand();
applyTheme(localStorage.getItem("altera-theme") || "telegram");
tg?.onEvent?.("themeChanged", () => {
  if ((localStorage.getItem("altera-theme") || "telegram") === "telegram") applyTheme("telegram");
});
$("checkout-close").addEventListener("click", closeCheckout);
$("quantity-minus").addEventListener("click", () => changeQuantity(-1));
$("quantity-plus").addEventListener("click", () => changeQuantity(1));
$("pay-balance").addEventListener("click", () => submitPurchase("balance"));
$("pay-xrocket").addEventListener("click", () => submitPurchase("xrocket"));
$("pay-stars").addEventListener("click", () => submitPurchase("stars"));
$("waiting-open").addEventListener("click", () => pendingPayment && openPaymentLink(pendingPayment.pay_url));
$("waiting-copy").addEventListener("click", () => pendingPayment && copyText(pendingPayment.pay_url)
  .then(() => showToast("Ссылка скопирована")).catch(() => showToast("Не удалось скопировать ссылку", "error")));
$("waiting-check").addEventListener("click", () => pendingPayment && checkPurchasePayment(true));
$("product-back").addEventListener("click", () => showView("catalog-view"));
$("how-it-works-button").addEventListener("click", () => {
  $("how-it-works-modal").hidden = false;
  $("how-it-works-close").focus();
});
$("how-it-works-close").addEventListener("click", () => { $("how-it-works-modal").hidden = true; });
$("how-it-works-modal").addEventListener("click", (event) => {
  if (event.target === $("how-it-works-modal")) $("how-it-works-modal").hidden = true;
});
$("cart-checkout").addEventListener("click", () => openCartCheckout());
$("cart-bar-open").addEventListener("click", () => openCartCheckout());
$("refresh-catalog").addEventListener("click", () => {
  haptic("light");
  loadCatalog();
  showToast("Каталог обновляется");
});
$("promo-apply").addEventListener("click", () => applyPromo($("promo-input"), $("promo-status")));
$("checkout-promo-apply").addEventListener("click", () => applyPromo($("checkout-promo"), $("checkout-promo-status")));
$("search").addEventListener("input", renderCatalog);
$("category-filter").addEventListener("change", renderCatalog);
$("sort").addEventListener("change", renderCatalog);
$("stock-filter").addEventListener("change", renderCatalog);
$("popular-queries").addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (button) { $("search").value = button.dataset.query; renderCatalog(); }
});
$("reset-filters").addEventListener("click", () => {
  $("search").value = "";
  $("category-filter").value = "all";
  $("sort").value = "default";
  $("stock-filter").value = "all";
  saveCatalogFilters();
  renderCatalog();
});
$("history-date-filter").addEventListener("change", loadHistory);
$("favorites-sort").addEventListener("change", loadFavorites);
$("favorites-stock-filter").addEventListener("change", loadFavorites);
$("cart-clear").addEventListener("click", () => {
  if (!cart.length || !window.confirm("Очистить корзину?")) return;
  cart = [];
  saveCart();
  renderCart();
  showToast("Корзина очищена");
});
$("favorites-buy-all").addEventListener("click", () => {
  const available = favoriteItems.filter((item) => item.stock > 0);
  if (!available.length) return showToast("В избранном нет товаров в наличии", "error");
  available.forEach((item) => addToCart(item.id));
  showView("cart-view");
  showToast("Доступные товары добавлены в корзину");
});
$("success-close").addEventListener("click", closeSuccess);
$("success-history").addEventListener("click", () => { closeSuccess(); showView("history-view"); });
$("success-copy").addEventListener("click", () => copyText($("success-items").textContent).then(() => showToast("Товар скопирован")));
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
document.body.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;
  copyText(copyButton.dataset.copy)
    .then(() => showToast("Ссылка скопирована"))
    .catch(() => showToast("Не удалось скопировать ссылку", "error"));
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => {
  const mode = button.dataset.themeChoice;
  localStorage.setItem("altera-theme", mode);
  applyTheme(mode);
}));
document.body.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton && !viewButton.classList.contains("tab")) showView(viewButton.dataset.view);
  const repeatButton = event.target.closest("[data-repeat-cat]");
  if (repeatButton) {
    const item = categories.find((entry) => String(entry.id) === repeatButton.dataset.repeatCat);
    if (item && item.stock > 0) { showView("catalog-view"); openCheckout(item); }
    else showToast("Товар закончился", "error");
  }
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) toggleFavorite(Number(favoriteButton.dataset.favoriteId), favoriteButton);
  const notifyButton = event.target.closest("[data-favorite-notify]");
  if (notifyButton) toggleFavoriteNotification(notifyButton);
  const orderAction = event.target.closest("[data-order-action]");
  if (orderAction) {
    if (orderAction.dataset.orderAction === "support") {
      showToast(`Напишите в поддержку бота и укажите заказ ${orderAction.dataset.orderNumber || ""}`);
    } else if (orderAction.dataset.orderAction === "receive") {
      try {
        const result = await api("/api/history/item", { method: "POST", body: JSON.stringify({ history_id: Number(orderAction.dataset.historyId) }) });
        showSuccessScreen(orderAction.dataset.orderNumber, result.item);
      } catch (error) { showToast(error.message, "error"); }
    } else if (orderAction.dataset.orderAction === "copy") {
      try {
        const result = await api("/api/history/item", { method: "POST", body: JSON.stringify({ history_id: Number(orderAction.dataset.historyId) }) });
        await copyText(result.item || "");
        showToast("Товар скопирован");
      } catch (error) { showToast(error.message, "error"); }
    }
  }
});
catalogNode.addEventListener("click", handleCatalogClick);
$("product-detail").addEventListener("click", handleCatalogClick);
$("favorites-list").addEventListener("click", handleCatalogClick);
$("cart-list").addEventListener("click", handleCartClick);
checkoutNode.addEventListener("click", (event) => {
  if (event.target === checkoutNode) closeCheckout();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("how-it-works-modal").hidden) {
    $("how-it-works-modal").hidden = true;
    return;
  }
  if (checkoutNode.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeCheckout();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...checkoutNode.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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

function openPaymentLink(url) {
  if (!url) throw new Error("Ссылка на оплату недоступна");
  if (/^https:\/\/t\.me\//i.test(url) && tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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
  $("how-it-works-button").hidden = viewId !== "catalog-view";
  $("cart-bar").hidden = viewId !== "catalog-view" || !cart.some((line) => line.quantity > 0);
  const activeView = document.getElementById(viewId);
  activeView?.setAttribute("tabindex", "-1");
  activeView?.focus({ preventScroll: true });
  if (viewId === "cart-view") renderCart();
  if (viewId === "history-view") loadHistory();
  if (viewId === "profile-view") loadProfile();
  if (viewId === "favorites-view") loadFavorites();
}

function applyTheme(mode) {
  const theme = mode === "telegram"
    ? (tg?.colorScheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"))
    : mode;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === mode);
  });
}

async function openProductPage(item) {
  rememberViewed(item.id);
  showView("product-view");
  const node = $("product-detail");
  node.innerHTML = `<div class="skeleton skeleton-product"></div>`;
  try {
    const data = await api(`/api/product?cat_id=${encodeURIComponent(item.id)}`);
    const product = data.product || item;
    const rating = Number(product.rating || 0);
    const reviews = product.reviews || [];
    const productName = (product.name || "").toUpperCase();
    const productImage = product.group === "gy_1970" && productName.includes("ПОД ГК")
      ? `<img src="./assets/gosuslugi-key-logo.jpg" alt="Логотип Госуслуг под ГК">`
      : product.group === "gy_1970"
        ? `<img src="./assets/gosuslugi-logo.jpg" alt="Логотип Госуслуг">`
      : productName.includes("TELE2")
        ? `<img src="./assets/t2-logo.jpg" alt="Логотип T2">`
        : productName.includes("BEELINE")
          ? `<img src="./assets/beeline-logo.jpg" alt="Логотип Билайн">`
          : productName.includes("MEGAFON")
            ? `<img src="./assets/megafon-logo.jpg" alt="Логотип МегаФона">`
          : productName.includes("YOTA")
            ? `<img src="./assets/yota-logo.jpg" alt="Логотип YOTA">`
          : productName.includes("ТБАНК") || productName.includes("TBANK")
            ? `<img src="./assets/tbank-logo.jpg" alt="Логотип Т-Банка">`
          : product.group === "l0gu_1970"
          ? `<img src="./assets/mts-logo.jpg" alt="Логотип МТС">`
          : escapeHtml((product.name || "A").slice(0, 1).toUpperCase());
    node.innerHTML = `
      <div class="product-hero">
        <div class="product-image">${productImage}</div>
        <div><p class="eyebrow">${escapeHtml(groupTitle(product.group || "other"))}</p>
          <h1 id="product-title">${escapeHtml(product.name)}</h1>
          <div class="product-rating">${rating ? `★ ${rating.toFixed(1)}` : "Новый товар"} <span>· ${Number(product.reviews_count || reviews.length)} отзывов</span></div>
        </div>
      </div>
      <div class="product-price-row"><strong>${Number(product.price).toFixed(2)} USDT</strong><span>${product.stock > 0 ? `${product.stock} шт. в наличии` : "Нет в наличии"}</span></div>
      <div class="product-updated">Обновлено: ${formatDate(product.updated_at || product.created_at || "")}<button class="text-button" id="product-share" type="button">Поделиться</button></div>
      <div class="product-badges"><span class="badge">Моментальная выдача</span>${product.stock < 1 ? `<span class="badge badge-warning">Нет в наличии</span>` : ""}</div>
      <section class="product-section product-description-section"><h2>Описание</h2><div class="product-description is-collapsed"><p>${escapeHtml(product.description || "Описание отсутствует.")}</p></div><button class="description-toggle" type="button" aria-expanded="false">Показать полностью</button></section>
      <section class="product-section"><h2>Как это работает</h2><ol><li>Выберите количество и способ оплаты.</li><li>После подтверждения платежа товар выдаётся автоматически.</li><li>Данные заказа сохраняются в разделе «Покупки».</li></ol></section>
      <section class="product-section"><h2>Ограничения</h2><p class="product-warning">Проверьте описание товара перед оплатой. Цифровые товары после выдачи возврату не подлежат, кроме случаев ошибки выдачи.</p></section>
      <section class="product-section"><h2>Отзывы</h2>${reviews.length ? reviews.map((review) => `<p class="review-line">★ ${Number(review.rating)} ${escapeHtml(review.text || "")}</p>`).join("") : `<p class="muted">Отзывов пока нет.</p>`}<div class="review-form"><label>Ваша оценка <select id="review-rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></label><textarea id="review-text" maxlength="1000" placeholder="Расскажите о товаре"></textarea><button id="review-submit" class="secondary-button" type="button">Оставить отзыв</button><p id="review-status" class="form-status"></p></div></section>
      <div class="product-actions"><button id="product-buy" class="primary-button" ${product.stock < 1 ? "disabled" : ""}>Купить снова</button><button id="product-cart" class="secondary-button" ${product.stock < 1 ? "disabled" : ""}>В корзину</button></div>
      <section class="product-section"><h2>Похожие товары</h2><div class="similar-products">${categories.filter((entry) => entry.id !== product.id && entry.group === product.group).slice(0, 3).map(cardTemplate).join("") || `<p class="muted">Похожих товаров пока нет.</p>`}</div></section>`;
    $("product-buy").addEventListener("click", () => openCheckout(product));
    $("product-cart").addEventListener("click", () => { addToCart(product.id); showToast("Товар добавлен в корзину"); });
    $("product-share").addEventListener("click", async () => {
      const shareData = { title: product.name, text: `${product.name} — ${Number(product.price).toFixed(2)} USDT` };
      try {
        if (navigator.share) await navigator.share(shareData);
        else await copyText(`${product.name} — ${Number(product.price).toFixed(2)} USDT`);
        showToast(navigator.share ? "Ссылка отправлена" : "Информация скопирована");
      } catch (error) { if (error.name !== "AbortError") showToast("Не удалось поделиться", "error"); }
    });
    const descriptionToggle = node.querySelector(".description-toggle");
    const description = node.querySelector(".product-description");
    descriptionToggle.addEventListener("click", () => {
      const expanded = description.classList.toggle("is-expanded");
      description.classList.toggle("is-collapsed", !expanded);
      descriptionToggle.setAttribute("aria-expanded", String(expanded));
      descriptionToggle.textContent = expanded ? "Свернуть описание" : "Показать полностью";
    });
    $("review-submit").addEventListener("click", async () => {
      const button = $("review-submit");
      button.disabled = true;
      try {
        const result = await api("/api/reviews", { method: "POST", body: JSON.stringify({ cat_id: product.id, rating: Number($("review-rating").value), text: $("review-text").value }) });
        $("review-status").textContent = result.message;
        loadReviews(product.id);
      } catch (error) { $("review-status").textContent = error.message; }
      finally { button.disabled = false; }
    });
  } catch (error) {
    node.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderCatalog() {
  const query = $("search").value.trim().toLowerCase();
  const group = $("category-filter").value;
  const stockFilter = $("stock-filter").value;
  const sort = $("sort").value;
  saveCatalogFilters();
  let visible = categories.filter((item) =>
    (group === "all" || (item.group || "other") === group) &&
    (stockFilter !== "in-stock" || item.stock > 0) &&
    matchesSearch(item, query)
  );
  visible.sort((a, b) => {
    if (sort === "price-asc") return Number(a.price) - Number(b.price);
    if (sort === "price-desc") return Number(b.price) - Number(a.price);
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "stock") return Number(b.stock) - Number(a.stock);
    if (sort === "rating") return Number(b.rating) - Number(a.rating);
    return Number(a.id) - Number(b.id);
  });
  const groups = new Map();
  visible.forEach((item) => {
    const key = item.group || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const popular = [...visible].sort((a, b) => Number(b.reviews_count || 0) - Number(a.reviews_count || 0)).slice(0, 3);
  const newItems = [...visible].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 3);
  const viewedIds = getViewedIds();
  const recentlyViewed = viewedIds.map((id) => categories.find((item) => item.id === id)).filter(Boolean).slice(0, 3);
  const boughtIds = JSON.parse(localStorage.getItem("altera-bought-before") || "[]");
  const boughtBefore = boughtIds.map((id) => categories.find((item) => item.id === id)).filter(Boolean).slice(0, 3);
  const featured = (title, items) => items.length ? `<section class="featured-section"><div class="section-heading"><h2>${title}</h2></div><div class="group-items">${items.map(cardTemplate).join("")}</div></section>` : "";
  const categoryView = group !== "all"
    ? `<section class="catalog-group"><h2 class="group-title">${escapeHtml(groupTitle(group))}</h2><div class="group-items">${visible.map(cardTemplate).join("")}</div></section>`
    : featured("Для вас", recentlyViewed.length ? recentlyViewed : popular) + featured("Вы покупали", boughtBefore) + featured("Популярное", popular) + featured("Новинки", newItems) + [...groups.entries()].map(([key, items]) => `
    <section class="catalog-group">
      <h2 class="group-title">${escapeHtml(groupTitle(key))}</h2>
      <div class="group-items">${items.map(cardTemplate).join("")}</div>
    </section>
  `).join("");
  catalogNode.innerHTML = visible.length ? categoryView : `<div class="empty-state catalog-empty"><strong>Ничего не нашли</strong><span>Попробуйте изменить запрос или сбросить фильтры.</span><button class="secondary-button" data-reset-filters type="button">Сбросить фильтры</button></div>`;
  statusNode.hidden = true;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const normalize = (value) => String(value || "").toLocaleLowerCase("ru-RU")
    .normalize("NFKC").replace(/[ё]/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const text = normalize(`${item.name || ""} ${item.description || ""}`);
  const words = text.split(/\s+/).filter(Boolean);
  return normalize(query).split(/\s+/).filter(Boolean).every((word) =>
    text.includes(word) || words.some((token) => fuzzyWordMatch(word, token))
  );
}
function fuzzyWordMatch(query, token) {
  if (query === token) return true;
  const distanceLimit = query.length < 5 ? 1 : Math.max(1, Math.ceil(query.length * .3));
  if (levenshtein(query, token) <= distanceLimit) return true;
  // Also accept a dropped/extra character, a common mobile keyboard typo.
  const [shorter, longer] = query.length <= token.length ? [query, token] : [token, query];
  let index = 0;
  for (const char of shorter) {
    index = longer.indexOf(char, index);
    if (index < 0) return false;
    index += 1;
  }
  return longer.length - shorter.length <= 2;
}
function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const value = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = value; }
  }
  return row[b.length];
}
function getViewedIds() { try { return JSON.parse(localStorage.getItem("altera-viewed") || "[]"); } catch { return []; } }
function rememberViewed(id) { localStorage.setItem("altera-viewed", JSON.stringify([id, ...getViewedIds().filter((value) => value !== id)].slice(0, 8))); }

function renderCatalogSkeleton(count = 6) {
  catalogNode.innerHTML = `<div class="skeleton-grid">${Array.from({ length: count }, () => `
    <article class="card skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-short"></div><div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-price"></div><div class="skeleton skeleton-buttons"></div>
    </article>`).join("")}</div>`;
    statusNode.hidden = false;
    statusNode.textContent = "Загрузка каталога...";
}

function cardTemplate(item) {
  const rating = Number(item.rating || 0);
  const reviews = Number(item.reviews_count || 0);
  const badges = (item.badges || []).slice(0, 2).map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join("");
  return `<article class="card" data-product-id="${item.id}" tabindex="0" aria-label="${escapeHtml(item.name)}">
    <div class="card-top"><span class="pill">${escapeHtml(groupTitle(item.group || "other"))}</span><button class="favorite-button ${item.favorite ? "is-favorite" : ""}" data-favorite-id="${item.id}" aria-label="${item.favorite ? "Удалить из избранного" : "Добавить в избранное"}">${item.favorite ? "♥" : "♡"}</button><span class="stock ${item.stock > 0 ? "stock-available" : "stock-empty"}">${item.stock > 0 ? `В наличии · ${item.stock} шт.` : "Нет в наличии"}</span></div>
    ${badges ? `<div class="badges">${badges}</div>` : ""}
    <h2>${escapeHtml(item.name)}</h2>
    <p class="description">${escapeHtml(item.description || "Моментальная выдача после оплаты")}</p>
    <div class="product-rating" aria-label="Рейтинг ${rating.toFixed(1)} из 5">${rating ? `★ ${rating.toFixed(1)}` : "Новый товар"} <span>· ${reviews} отзывов</span></div>
    <div class="meta"><div class="price">${Number(item.price).toFixed(2)} <small>USDT</small></div>
      <div class="card-actions"><button class="details" data-id="${item.id}">Подробнее</button>${item.stock > 0 ? `<button class="cart-add" data-id="${item.id}">В корзину</button>` : ""}<button class="buy" data-id="${item.id}" ${item.stock < 1 ? "disabled" : ""}>${item.stock < 1 ? "Нет в наличии" : "Купить"}</button></div>
    </div>
  </article>`;
}

function groupTitle(group) {
  return { l0gu_1970: "Мобильные операторы", gy_1970: "Госуслуги", tbank: "Банковские аккаунты", other: "Другие товары" }[group] || group;
}

function handleCatalogClick(event) {
  if (event.target.closest("[data-reset-filters]")) {
    $("reset-filters").click();
    return;
  }
  if (event.target.closest("[data-favorite-id]")) return;
  const button = event.target.closest("button[data-id]");
  const card = event.target.closest("[data-product-id]");
  const itemId = button?.dataset.id || card?.dataset.productId;
  const item = categories.find((entry) => String(entry.id) === itemId)
    || favoriteItems.find((entry) => String(entry.id) === itemId);
  if (!item) return;
  if (!button) { openProductPage(item); return; }
  if (button.classList.contains("cart-add")) {
    addToCart(item.id);
    haptic("light");
    button.classList.add("is-added");
    button.textContent = "Добавлено ✓";
    button.closest(".card")?.classList.add("cart-added");
    setTimeout(() => {
      button.classList.remove("is-added");
      button.textContent = "В корзину";
      button.closest(".card")?.classList.remove("cart-added");
    }, 1200);
    showToast("Товар добавлен в корзину");
  } else if (button.classList.contains("details")) openProductPage(item);
  else openCheckout(item);
}

function openCheckout(item) {
  checkoutReturnFocus = document.activeElement;
  checkoutRequestKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  selected = item;
  checkoutMode = "single";
  quantity = 1;
  $("checkout-promo").value = activePromo?.code || "";
  $("checkout-promo-status").textContent = activePromo?.message || "";
  $("quantity-controls").hidden = false;
  $("checkout-name").textContent = item.name;
  $("checkout-price").textContent = `${Number(item.price).toFixed(2)} USDT за штуку · в наличии ${item.stock}`;
  $("checkout-description").textContent = item.description || "Описание отсутствует";
  $("payment-waiting").hidden = true;
  $("payment-options").hidden = false;
  pendingPayment = null;
  loadReviews(item.id);
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
  if (currentBalance === null) loadProfile().then(updateCheckout);
  requestAnimationFrame(() => $("checkout-close").focus());
}

function openCartCheckout() {
  if (!cart.length) return;
  const unavailable = cart.some((line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return !item || item.stock < 1 || line.quantity > item.stock;
  });
  if (unavailable) return showToast("Уберите недоступные товары из корзины", "error");
  selected = null;
  checkoutReturnFocus = document.activeElement;
  checkoutRequestKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  $("payment-waiting").hidden = true;
  $("payment-options").hidden = false;
  pendingPayment = null;
  checkoutNode.hidden = false;
  document.body.classList.add("checkout-open");
  updateCheckout();
  if (currentBalance === null) loadProfile().then(updateCheckout);
  requestAnimationFrame(() => $("checkout-close").focus());
}

function closeCheckout() {
  if (purchasePollTimer) clearInterval(purchasePollTimer);
  if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
  purchasePollTimer = null;
  purchaseExpiryTimer = null;
  pendingPayment = null;
  checkoutNode.hidden = true;
  document.body.classList.remove("checkout-open");
  selected = null;
  checkoutRequestKey = null;
  if (checkoutReturnFocus?.focus) checkoutReturnFocus.focus();
  checkoutReturnFocus = null;
}

async function loadReviews(catId) {
  const node = $("checkout-reviews");
  node.innerHTML = "<span class=\"muted\">Загрузка отзывов...</span>";
  try {
    const data = await api(`/api/reviews?cat_id=${encodeURIComponent(catId)}`);
    const rating = data.count ? `★ ${Number(data.rating).toFixed(1)} · ${data.count} отзывов` : "Отзывов пока нет";
    node.innerHTML = `<strong>${rating}</strong>` + (data.reviews?.length
      ? data.reviews.slice(0, 3).map((review) => `<p>★ ${Number(review.rating)} ${escapeHtml(review.text)}</p>`).join("")
      : "");
  } catch {
    node.textContent = "Отзывы временно недоступны.";
  }
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
  const total = base * (1 - discount / 100);
  $("checkout-total").textContent = `Итого: ${total.toFixed(2)} USDT`;
  const balance = Number(currentBalance);
  const hasBalance = Number.isFinite(balance);
  $("checkout-balance").textContent = hasBalance
    ? `Баланс: ${balance.toFixed(2)} USDT`
    : "Баланс: загрузка...";
  $("checkout-shortage").hidden = !hasBalance || balance >= total;
  if (hasBalance && balance < total) {
    $("checkout-shortage").textContent = `Не хватает ${(total - balance).toFixed(2)} USDT`;
  }
  $("pay-balance").disabled = hasBalance && balance < total;
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
      haptic("success");
      return;
    }
    activePromo = result;
    $("checkout-promo").value = code;
    $("promo-input").value = code;
    output.textContent = result.message;
    updateCheckout();
    showToast("Промокод применён");
    haptic("success");
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
  }, async (buttonId) => {
    if (buttonId !== "confirm") return;
    haptic("medium");
    const payload = {
      action: "purchase",
      payment,
      idempotency_key: checkoutRequestKey
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
    const payButtons = ["pay-balance", "pay-xrocket", "pay-stars"]
      .map((id) => $(id)).filter(Boolean);
    payButtons.forEach((button) => {
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    });
    try {
      if (!await waitForTelegramInitData()) {
        $("favorites-status").hidden = false;
        throw new Error("Откройте приложение из Telegram");
      }
      const result = await api("/api/purchase", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (result.provider === "balance" && result.status === "paid") {
        cart = checkoutMode === "cart" ? [] : cart;
        saveCart();
        closeCheckout();
        loadProfile();
        loadHistory();
        const itemText = (result.items || []).map((item) => item.data).join("\n");
        showSuccessScreen(result.order_number, itemText);
        haptic("success");
        return;
      }
      if (result.provider === "xrocket" && result.pay_url) {
        pendingPayment = result;
        showPaymentWaiting(result);
        showToast("Счёт xRocket создан");
        openPaymentLink(result.pay_url);
        pollPurchasePayment();
        return;
      }

      if (result.provider === "stars" && result.invoice_link) {
        if (!tg.openInvoice) throw new Error("Telegram Stars недоступны в этом клиенте");
        tg.openInvoice(result.invoice_link, (invoiceStatus) => {
          if (invoiceStatus === "paid") {
            closeCheckout();
            showSuccessScreen(result.order_number, "Товар будет доступен в истории покупок после подтверждения.");
            loadProfile();
            loadHistory();
            haptic("success");
          } else if (invoiceStatus === "cancelled" || invoiceStatus === "failed") {
            showToast("Оплата отменена", "error");
          }
        });
        return;
      }
      throw new Error("Сервер не вернул данные платежа");
    } catch (error) {
      showToast(error.message, "error");
      setStatus(error.message);
    } finally {
      payButtons.forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      });
    }
  });
}

function showPaymentWaiting(result) {
  $("payment-waiting").hidden = false;
  $("payment-options").hidden = true;
  $("waiting-order").textContent = result.order_number
    ? `Заказ ${result.order_number} · ${Number(result.amount || 0).toFixed(2)} USDT`
    : "Счёт xRocket создан";
  $("payment-qr").src = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(result.pay_url)}`;
  $("waiting-amount").textContent = `${Number(result.amount || 0).toFixed(2)} USDT`;
  $("waiting-status").textContent = "Проверяем оплату автоматически...";
  $("waiting-indicator").textContent = "● Проверка каждые 4 секунды";
  const createdAt = Date.now();
  const expiresAt = createdAt + 30 * 60 * 1000;
  if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
  purchaseExpiryTimer = setInterval(() => {
    const remaining = Math.max(0, expiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    $("waiting-expiry").textContent = remaining
      ? `Счёт действует ещё ${minutes}:${String(seconds).padStart(2, "0")}`
      : "Срок счёта истёк";
    if (!remaining) {
      clearInterval(purchaseExpiryTimer);
      $("waiting-indicator").textContent = "● Счёт больше не принимается";
      $("waiting-check").disabled = true;
    }

  }, 1000);
  $("waiting-check").disabled = false;
  $("waiting-check").classList.remove("is-loading");
  $("waiting-expiry").textContent = "Счёт действует 30 минут";
}

function showSuccessScreen(orderNumber, itemText) {
  closeCheckout();
  $("success-order").textContent = orderNumber ? `Заказ ${orderNumber} оплачен и выдан.` : "Заказ оплачен.";
  $("success-items").textContent = itemText || "Товар доступен в разделе «Покупки».";
  $("purchase-success").hidden = false;
  $("success-close").focus();
}

function closeSuccess() {
  $("purchase-success").hidden = true;
}

async function checkPurchasePayment(manual = false) {
  if (!pendingPayment?.invoice_id) return false;
  const status = $("waiting-status");
  const checkButton = $("waiting-check");
  let terminal = false;
  if (manual) {
    status.textContent = "Проверяем оплату...";
    checkButton.disabled = true;
    checkButton.classList.add("is-loading");
  }
  try {
    const result = await api(`/api/purchase/status?invoice_id=${encodeURIComponent(pendingPayment.invoice_id)}`);
    if (result.status === "paid" || result.status === "fulfilled") {
      status.textContent = `Оплата подтверждена. Заказ ${result.order_number || ""} выдан.`;
      showToast("Оплата подтверждена");
      pendingPayment = null;
      if (purchasePollTimer) clearInterval(purchasePollTimer);
      if (purchaseExpiryTimer) clearInterval(purchaseExpiryTimer);
      loadHistory();
      loadCatalog();
      haptic("success");
      return true;
    }
    if (result.status === "expired" || result.status === "cancelled") {
      status.textContent = "Счёт просрочен. Создайте новый заказ.";
      $("waiting-indicator").textContent = "● Счёт закрыт";
      $("waiting-check").disabled = true;
      terminal = true;
      return true;
    }
    if (manual) status.textContent = "Оплата ещё не поступила.";
  } catch (error) {
    if (manual) status.textContent = error.message;
  } finally {
    if (manual) {
      checkButton.disabled = terminal;
      checkButton.classList.remove("is-loading");
    }
  }
  return false;
}

function pollPurchasePayment() {
  let attempts = 0;
  if (purchasePollTimer) clearInterval(purchasePollTimer);
  purchasePollTimer = setInterval(async () => {
    if (!pendingPayment || ++attempts > 90) {
      clearInterval(purchasePollTimer);
      purchasePollTimer = null;
      if (pendingPayment) $("waiting-status").textContent = "Проверка остановлена. Нажмите «Проверить оплату».";
      return;
    }
    if (await checkPurchasePayment()) {
      clearInterval(purchasePollTimer);
      purchasePollTimer = null;
    }
  }, 4000);
}

function addToCart(id, count = 1) {
  const item = categories.find((entry) => entry.id === id);
  if (!item) return;
  const line = cart.find((entry) => entry.id === id);
  if (!item.stock) return showToast("Товар закончился", "error");
  if (line) line.quantity = Math.min(item.stock, line.quantity + count);
  else cart.push({ id, quantity: Math.min(item.stock, count), price: Number(item.price) });
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
    const unavailable = item.stock < 1;
    const priceChanged = line.price != null && Number(line.price) !== Number(item.price);
    const stockChanged = item.stock > 0 && line.quantity > item.stock;
    return `<article class="cart-line ${unavailable ? "is-unavailable" : ""}"><div><strong>${escapeHtml(item.name)}</strong><span>${Number(item.price).toFixed(2)} USDT</span>${priceChanged ? `<em class="cart-warning">Цена изменилась с ${Number(line.price).toFixed(2)} USDT</em>` : ""}${stockChanged ? `<em class="cart-warning">Доступно только ${item.stock} шт.</em>` : ""}${unavailable ? `<em class="cart-warning">Нет в наличии</em>` : ""}</div>
      <div class="cart-controls"><button data-action="minus" data-id="${item.id}" aria-label="Уменьшить количество">−</button><b>${line.quantity}</b><button data-action="plus" data-id="${item.id}" ${unavailable ? "disabled" : ""} aria-label="Увеличить количество">+</button><button class="remove" data-action="remove" data-id="${item.id}">Удалить</button></div></article>`;
  }).join("");
  const hasItems = cart.length > 0;
  $("cart-empty").hidden = hasItems;
  $("cart-summary").hidden = !hasItems;
  const baseTotal = cart.reduce((sum, line) => {
    const item = categories.find((entry) => entry.id === line.id);
    return sum + (item ? Number(item.price) * line.quantity : 0);
  }, 0);
  const total = baseCartTotal();
  $("cart-total").innerHTML = `${total.toFixed(2)} USDT${baseTotal > total ? ` <small class="saving">Экономия ${(baseTotal - total).toFixed(2)} USDT</small>` : ""}`;
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  $("cart-count").textContent = count;
  $("cart-count").hidden = count < 1;
  $("cart-bar").hidden = count < 1 || !$("catalog-view").classList.contains("active-view");
  $("cart-bar-count").textContent = count;
  $("cart-bar-total").textContent = `${baseCartTotal().toFixed(2)} USDT`;
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
    return sum + (item && item.stock > 0 ? lineTotal(item, Math.min(line.quantity, item.stock)) : 0);
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
    currentBalance = Number(data.balance);
    const user = data.user || {};
    const photoUrl = String(user.photo_url || "").trim();
    const avatarFallback = escapeHtml((user.first_name || user.username || "?").slice(0, 1).toUpperCase());
    const avatar = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${avatarFallback}</span>`
      : avatarFallback;
    const adminBadge = data.is_admin ? `<span class="admin-badge">Admin</span>` : "";
    $("profile-card").innerHTML = `<div class="profile-main"><div class="profile-avatar">${avatar}</div><div class="profile-identity"><h3>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь")}</h3><div class="profile-username"><span>${user.username ? "@" + escapeHtml(user.username) : "ID " + user.id}</span>${adminBadge}</div></div></div>
      <div class="stats"><div><strong>${Number(data.balance).toFixed(2)}</strong><span>USDT на балансе</span></div><div><strong>${data.purchases || 0}</strong><span>товаров куплено</span></div><div><strong>${Number(data.total_spent || 0).toFixed(2)}</strong><span>USDT потрачено</span></div><div><strong>${data.referrals?.count || 0}</strong><span>рефералов</span></div></div><p class="profile-date">Регистрация: ${formatDate(data.created_at)}</p>`;
    const referrals = data.referrals || {};
    const referralLink = referrals.link || "";
    $("referral-card").innerHTML = `<div class="profile-card-heading"><strong>Реферальная программа</strong><span>Получайте 10% с покупок друзей</span></div>
      <div class="referral-link"><code>${escapeHtml(referralLink || "Ссылка недоступна")}</code><button class="copy-button" type="button" data-copy="${escapeHtml(referralLink)}" ${referralLink ? "" : "disabled"}>Копировать</button></div>
      <div class="referral-stats"><div><strong>${Number(referrals.count || 0)}</strong><span>рефералов</span></div><div><strong>${Number(referrals.earnings || 0).toFixed(2)}</strong><span>заработано USDT</span></div></div>`;
  } catch (error) {
    currentBalance = null;
    $("profile-card").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    $("referral-card").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadHistory() {
  if (!await waitForTelegramInitData()) { $("history-status").textContent = "История доступна при открытии приложения из Telegram."; return; }
  $("history-status").textContent = "Загрузка...";
  try {
    const days = $("history-date-filter").value;
    const data = await api(`/api/history?limit=100&sort=newest&status=all&days=${encodeURIComponent(days)}`);
    const bought = [];
    $("history-list").innerHTML = data.history?.length ? data.history.map((entry) => {
      const status = entry.status || "delivered";
      if (entry.cat_id && (status === "delivered" || status === "fulfilled")) bought.push(entry.cat_id);
      const method = entry.payment_method === "xrocket" ? "xRocket" : entry.payment_method === "stars" ? "Telegram Stars" : "Баланс";
      return `<article class="history-item"><div><strong>${escapeHtml(entry.product)}</strong><span>${escapeHtml(entry.item_preview || "Товар выдан")}</span><span class="history-meta"><b>${escapeHtml(entry.order_number || "Заказ")}</b> · ${method} · ${Number(entry.amount || 0).toFixed(2)} USDT</span></div><div class="history-actions"><time>${formatDate(entry.date)}</time><span class="order-status status-${escapeHtml(status)}">${statusLabel(status)}</span><div class="history-buttons"><button class="text-button" data-order-action="receive" data-history-id="${entry.id}" data-order-number="${escapeHtml(entry.order_number || "")}" ${status === "fulfilled" || status === "delivered" ? "" : "disabled"}>Получить товар</button><button class="text-button" data-order-action="copy" data-history-id="${entry.id}" ${status === "fulfilled" || status === "delivered" ? "" : "disabled"}>Скопировать товар</button><button class="text-button" data-repeat-cat="${entry.cat_id || ""}" ${entry.cat_id ? "" : "disabled"}>Повторить покупку</button><button class="text-button support-button" data-order-action="support" data-order-number="${escapeHtml(entry.order_number || "")}">Проблема с заказом</button></div></div></article>`;
    }).join("") : `<div class="empty-state">Покупок пока нет.</div>`;
    localStorage.setItem("altera-bought-before", JSON.stringify([...new Set(bought)].slice(0, 12)));
    $("history-status").textContent = data.history?.length ? `${data.history.length} записей` : "";
  } catch (error) { $("history-status").textContent = error.message; }
}

async function loadFavorites() {
  if (!await waitForTelegramInitData()) {
    $("favorites-status").textContent = "Избранное доступно при открытии приложения из Telegram.";
    $("favorites-list").innerHTML = "";
    return;
  }
  $("favorites-status").hidden = false;
  $("favorites-status").textContent = "Загрузка...";
  try {
    const data = await api("/api/favorites");
    favoriteItems = data.favorites || [];
    const stockFilter = $("favorites-stock-filter").value;
    const sort = $("favorites-sort").value;
    const visible = favoriteItems.filter((item) => stockFilter !== "in-stock" || item.stock > 0).sort((a, b) => {
      if (sort === "price-asc") return Number(a.price) - Number(b.price);
      if (sort === "price-desc") return Number(b.price) - Number(a.price);
      return Number(b.id) - Number(a.id);
    });
    $("favorites-list").innerHTML = visible.length
      ? `<div class="group-items">${visible.map((item) => `${cardTemplate({...item, favorite: true, description: "Сохранённый товар"})}
        <div class="favorite-notifications">
          <button type="button" class="notification-toggle ${item.notify_price ? "active" : ""}" data-favorite-notify="price" data-id="${item.id}" aria-pressed="${item.notify_price ? "true" : "false"}">Цена ${item.notify_price ? "включена" : "выключена"}</button>
          <button type="button" class="notification-toggle ${item.notify_stock ? "active" : ""}" data-favorite-notify="stock" data-id="${item.id}" aria-pressed="${item.notify_stock ? "true" : "false"}">Наличие ${item.notify_stock ? "включено" : "выключено"}</button>
        </div>`).join("")}</div>`
      : `<div class="empty-state">Сохранённых товаров пока нет.<br>Нажмите ♡ в карточке товара.</div>`;
    $("favorites-status").hidden = visible.length > 0;
    $("favorites-status").textContent = visible.length ? "" : "Нет подходящих товаров";
  } catch (error) { $("favorites-status").hidden = false; $("favorites-status").textContent = error.message; }
}

async function toggleFavorite(catId, button) {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const isFavorite = button.classList.contains("is-favorite");
  button.disabled = true;
  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ cat_id: catId, remove: isFavorite }),
    });
    const item = categories.find((entry) => entry.id === catId);
    if (item) item.favorite = !isFavorite;
    button.classList.toggle("is-favorite", !isFavorite);
    button.textContent = isFavorite ? "♡" : "♥";
    button.setAttribute("aria-label", isFavorite ? "Добавить в избранное" : "Удалить из избранного");
    showToast(isFavorite ? "Удалено из избранного" : "Добавлено в избранное");
    if (document.querySelector("#favorites-view.active-view")) loadFavorites();
  } catch (error) { showToast(error.message, "error"); }
  finally { button.disabled = false; }
}

async function toggleFavoriteNotification(button) {
  if (!await waitForTelegramInitData()) {
    showToast("Откройте приложение из Telegram", "error");
    return;
  }
  const catId = Number(button.dataset.id);
  const field = button.dataset.favoriteNotify === "price" ? "notify_price" : "notify_stock";
  const currentlyEnabled = button.getAttribute("aria-pressed") === "true";
  button.disabled = true;
  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({ cat_id: catId, [field]: !currentlyEnabled }),
    });
    button.setAttribute("aria-pressed", String(!currentlyEnabled));
    button.classList.toggle("active", !currentlyEnabled);
    button.textContent = field === "notify_price"
      ? `Цена ${!currentlyEnabled ? "включена" : "выключена"}`
      : `Наличие ${!currentlyEnabled ? "включено" : "выключено"}`;
    showToast(!currentlyEnabled ? "Уведомления включены" : "Уведомления выключены");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function statusLabel(status) {
  return ({
    created: "Создан",
    pending: "Ожидает оплаты",
    paid: "Оплачен",
    fulfilled: "Товар выдан",
    delivered: "Товар выдан",
    failed: "Ошибка выдачи",
    refunded: "Возврат",
    cancelled: "Возврат",
    expired: "Возврат",
  })[status] || "Статус уточняется";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setStatus(message) { statusNode.textContent = message; }
function haptic(style = "light") { try { tg?.HapticFeedback?.impactOccurred(style); } catch {} }
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
  submit.classList.add("is-loading");
  submit.setAttribute("aria-busy", "true");
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
      openPaymentLink(result.pay_url);
      status.textContent = "Ожидаем оплату xRocket...";
      pollDeposit(result.invoice_id, amount);
    }
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.classList.remove("is-loading");
    submit.removeAttribute("aria-busy");
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
    restoreCatalogFilters();
    const data = await api("/api/catalog");
    categories = data.categories || [];
    $("product-suggestions").innerHTML = categories
      .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
      .join("");
    const popularQueries = data.popular_queries || [...categories].sort((a, b) => Number(b.reviews_count || 0) - Number(a.reviews_count || 0)).slice(0, 5).map((item) => item.name);
    $("popular-queries").innerHTML = popularQueries.map((query) => `<button type="button" class="query-chip" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join("");
    const groups = [...new Set(categories.map((item) => item.group || "other"))];
    $("category-filter").innerHTML = `<option value="all">Все категории</option>` + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(groupTitle(group))}</option>`).join("");
    const savedCategory = $("category-filter").dataset.savedValue;
    if (savedCategory && groups.includes(savedCategory)) $("category-filter").value = savedCategory;
    cart = cart.filter((line) => categories.some((item) => item.id === line.id));
    cart.forEach((line) => { const item = categories.find((entry) => entry.id === line.id); if (item.stock > 0) line.quantity = Math.min(line.quantity, item.stock); });
    saveCart();
    renderCatalog();
    renderCart();
  } catch { statusNode.hidden = false; statusNode.textContent = "Не удалось загрузить каталог."; }
}

loadCatalog();
loadProfile();

function saveCatalogFilters() {
  localStorage.setItem("altera-catalog-filters", JSON.stringify({
    search: $("search").value,
    category: $("category-filter").value,
    sort: $("sort").value,
    stock: $("stock-filter").value
  }));
}

function restoreCatalogFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem("altera-catalog-filters") || "{}");
    $("search").value = saved.search || "";
    $("sort").value = saved.sort || "default";
    $("stock-filter").value = saved.stock || "all";
    if (saved.category) $("category-filter").dataset.savedValue = saved.category;
  } catch {
    localStorage.removeItem("altera-catalog-filters");
  }
}
