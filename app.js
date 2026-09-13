const tg = window.Telegram?.WebApp;
const API_URL = "https://bot-1789213141-7968-kaydzhe-mind.bothost.tech";
const catalogNode = document.getElementById("catalog");
const statusNode = document.getElementById("status");
const searchNode = document.getElementById("search");
const checkoutNode = document.getElementById("checkout");
const checkoutName = document.getElementById("checkout-name");
const checkoutPrice = document.getElementById("checkout-price");
const checkoutTotal = document.getElementById("checkout-total");
const quantityNode = document.getElementById("quantity");
let categories = [];
let selected = null;
let quantity = 1;

tg?.ready();
tg?.expand();
document.getElementById("close").addEventListener("click", () => tg?.close());
document.getElementById("checkout-close").addEventListener("click", closeCheckout);
document.getElementById("quantity-minus").addEventListener("click", () => changeQuantity(-1));
document.getElementById("quantity-plus").addEventListener("click", () => changeQuantity(1));
document.getElementById("pay-balance").addEventListener("click", () => submitPurchase("balance"));
document.getElementById("pay-xrocket").addEventListener("click", () => submitPurchase("xrocket"));

function render() {
  const query = searchNode.value.trim().toLowerCase();
  const visible = categories.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(query)
  );
  catalogNode.innerHTML = visible.map((item) => `
    <article class="card">
      <h2>${escapeHtml(item.name)}</h2>
      <p>${escapeHtml(item.description || "Описание отсутствует")}</p>
      <div class="meta">
        <div>
          <div class="price">${Number(item.price).toFixed(2)} USDT</div>
          <div class="stock">В наличии: ${item.stock}</div>
        </div>
        <button class="buy" data-id="${item.id}" ${item.stock < 1 ? "disabled" : ""}>Выбрать</button>
      </div>
    </article>
  `).join("");
  statusNode.textContent = visible.length ? "" : "Ничего не найдено";
}

function openCheckout(category) {
  selected = category;
  quantity = 1;
  catalogNode.hidden = true;
  searchNode.hidden = true;
  statusNode.hidden = true;
  checkoutNode.hidden = false;
  checkoutName.textContent = category.name;
  checkoutPrice.textContent = `${Number(category.price).toFixed(2)} USDT за штуку`;
  updateCheckout();
}

function closeCheckout() {
  checkoutNode.hidden = true;
  catalogNode.hidden = false;
  searchNode.hidden = false;
  statusNode.hidden = false;
  selected = null;
}

function changeQuantity(delta) {
  if (!selected) return;
  quantity = Math.max(1, Math.min(Number(selected.stock), quantity + delta));
  updateCheckout();
}

function updateCheckout() {
  quantityNode.textContent = quantity;
  checkoutTotal.textContent = `Итого: ${(Number(selected.price) * quantity).toFixed(2)} USDT`;
}

function submitPurchase(payment) {
  if (!selected || !tg) {
    statusNode.textContent = "Откройте Web App внутри Telegram для покупки.";
    return;
  }
  const total = (Number(selected.price) * quantity).toFixed(2);
  tg.showPopup({
    title: "Подтверждение покупки",
    message: `${selected.name}\n${quantity} шт. — ${total} USDT`,
    buttons: [
      { id: "confirm", type: "default", text: "Подтвердить" },
      { id: "cancel", type: "cancel", text: "Отмена" }
    ]
  }, (buttonId) => {
    if (buttonId !== "confirm") return;
    tg.sendData(JSON.stringify({
      action: "purchase",
      cat_id: selected.id,
      quantity,
      payment,
    }));
    tg.close();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

searchNode.addEventListener("input", render);
catalogNode.addEventListener("click", (event) => {
  const button = event.target.closest(".buy");
  if (!button) return;
  const category = categories.find((item) => String(item.id) === button.dataset.id);
  if (category) openCheckout(category);
});

fetch(`${API_URL}/api/catalog`)
  .then((response) => {
    if (!response.ok) throw new Error("catalog");
    return response.json();
  })
  .then((data) => {
    categories = data.categories || [];
    render();
  })
  .catch(() => {
    statusNode.textContent = "Не удалось загрузить каталог.";
  });
