// @ts-check
/** @type {any} */
const api = window.inventoryAPI;

let currentView = 'dashboard';
let allCategories = [];
let allProducts = [];
let debounceTimer = null;
let pendingDeleteFn = null;
let productViewMode = 'table';

// Sorting state
let sortColumn = 'name';
let sortDirection = 'asc';

// Pending undo state
let pendingUndo = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSidebar();
  setupNavigation();
  setupModalCloseHandlers();
  setupProductForm();
  setupCategoryForm();
  setupStockForm();
  setupFilters();
  setupTopLevelButtons();
  setupTableDelegation();
  setupSorting();
  setupViewToggle();
  setupHistoryDateFilter();
  setupMenuCommands();

  await loadCategories();
  await loadDashboard();

  requestAnimationFrame(() => {
    $$('.view.active').forEach(v => v.classList.add('visible'));
  });
});

// ─── Theme ─────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ims-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeLabel(saved);

  $('#theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ims-theme', next);
    updateThemeLabel(next);
    redrawChartIfVisible();
  });
}

function updateThemeLabel(theme) {
  const label = $('#theme-label');
  if (label) label.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
}

// ─── Sidebar Collapse ──────────────────────────────────
function initSidebar() {
  const sidebar = $('#sidebar');
  const saved = localStorage.getItem('ims-sidebar-collapsed');
  if (saved === 'true') sidebar.classList.add('collapsed');

  $('#sidebar-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('ims-sidebar-collapsed', sidebar.classList.contains('collapsed'));
  });
}

// ─── Navigation ────────────────────────────────────────
function setupNavigation() {
  $$('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (!view || view === currentView) return;
      switchView(view);
    });
  });
}

function switchView(view) {
  $$('.view.active').forEach(v => { v.classList.remove('visible'); });

  setTimeout(() => {
    currentView = view;
    $$('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === view + '-view'));

    requestAnimationFrame(() => {
      $$('.view.active').forEach(v => v.classList.add('visible'));
    });

    if (view === 'dashboard') loadDashboard();
    else if (view === 'products') loadProducts();
    else if (view === 'categories') loadCategoriesView();
  }, 120);
}

// ─── Modal System ──────────────────────────────────────
function openModal(modal) {
  $$('.modal').forEach(m => m.style.display = 'none');
  modal.style.display = 'block';
  $('#modal-overlay').classList.add('open');
  const first = modal.querySelector('input:not([type=hidden]), select');
  if (first) setTimeout(() => first.focus(), 50);
}

function closeAllModals() {
  $('#modal-overlay').classList.remove('open');
  $$('.modal').forEach(m => m.style.display = 'none');
  pendingDeleteFn = null;
}

function setupModalCloseHandlers() {
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) closeAllModals();
  });
  $$('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });
}

// ─── Toast (with undo support) ─────────────────────────
function showToast(message, type = 'info', opts = {}) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  if (opts.undo) {
    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', () => {
      if (opts.onUndo) opts.onUndo();
      toast.remove();
    });
    toast.appendChild(undoBtn);

    setTimeout(() => {
      if (toast.parentElement) {
        if (opts.onExpire) opts.onExpire();
        toast.style.animation = 'toastOut 250ms ease forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  } else {
    toast.classList.add('auto-dismiss');
    toast.textContent = message;
    setTimeout(() => toast.remove(), 3000);
  }

  $('#toast-container').appendChild(toast);
}

// ─── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
  const skeleton = $('#dashboard-skeleton');
  const content = $('#dashboard-content');
  skeleton.style.display = '';
  content.style.display = 'none';

  try {
    const [stats, chartData] = await Promise.all([
      api.getDashboardStats(),
      api.getChartData(14),
    ]);
    $('#stat-total-products').textContent = stats.total_products.toLocaleString();
    $('#stat-inventory-value').textContent = formatCurrency(stats.total_inventory_value);
    $('#stat-low-stock').textContent = stats.low_stock_count.toLocaleString();
    $('#stat-realized-profit').textContent = formatCurrency(stats.total_realized_profit);
    $('#stat-units-sold').textContent = stats.total_units_sold.toLocaleString();
    $('#stat-revenue').textContent = formatCurrency(stats.total_revenue);
    $('#stat-cogs').textContent = formatCurrency(stats.total_cogs);
    renderRecentMovements(stats.recent_movements);
    drawMovementChart(chartData);

    skeleton.style.display = 'none';
    content.style.display = '';
  } catch (err) {
    skeleton.style.display = 'none';
    content.style.display = '';
    showToast('Failed to load dashboard', 'error');
  }
}

function renderRecentMovements(movements) {
  const container = $('#recent-movements-list');
  if (!movements || movements.length === 0) {
    container.innerHTML = '<div class="empty-state-sm">No activity yet. Stock movements will appear here.</div>';
    return;
  }
  container.innerHTML = movements.map(m => {
    const typeClass = m.type.toLowerCase();
    const typeLabels = { IN: 'IN', OUT: 'OUT', ADJUST: 'ADJ' };
    const actionLabels = { IN: 'Stock In', OUT: 'Stock Out', ADJUST: 'Adjusted' };
    return `
      <div class="activity-item">
        <div class="activity-badge ${typeClass}">${typeLabels[m.type]}</div>
        <div class="activity-info">
          <div class="activity-product">${escapeHtml(m.product_name)}</div>
          <div class="activity-detail">${actionLabels[m.type]}: ${m.quantity} units${m.note ? ' — ' + escapeHtml(m.note) : ''}</div>
        </div>
        <div class="activity-time">${formatTimeAgo(m.created_at)}</div>
      </div>
    `;
  }).join('');
}

// ─── Canvas Chart ──────────────────────────────────────
let lastChartData = null;

function redrawChartIfVisible() {
  if (currentView === 'dashboard' && lastChartData) {
    drawMovementChart(lastChartData);
  }
}

function drawMovementChart(data) {
  lastChartData = data;
  const canvas = $('#movement-chart');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = Math.floor(rect.width) || 800;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--chart-grid').trim();
  const labelColor = style.getPropertyValue('--chart-label').trim();
  const greenColor = style.getPropertyValue('--green').trim();
  const redColor = style.getPropertyValue('--red').trim();

  const padL = 48, padR = 16, padT = 10, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  if (!data || data.length === 0) {
    ctx.fillStyle = labelColor;
    ctx.font = '13px ' + style.getPropertyValue('--font').trim();
    ctx.textAlign = 'center';
    ctx.fillText('No movement data available', W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(4, ...data.map(d => Math.max(d.stock_in, d.stock_out)));
  const niceMax = Math.ceil(maxVal / 4) * 4;

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y-axis labels
  ctx.fillStyle = labelColor;
  ctx.font = '10px ' + style.getPropertyValue('--font').trim();
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(niceMax * i / 4);
    const y = padT + chartH - (chartH * i / 4);
    ctx.fillText(val.toString(), padL - 8, y + 3);
  }

  // Bars
  const n = data.length;
  const groupW = chartW / n;
  const barW = Math.max(3, Math.min(16, groupW * 0.32));
  const gap = 3;

  data.forEach((d, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const hIn = (d.stock_in / niceMax) * chartH;
    const hOut = (d.stock_out / niceMax) * chartH;

    // Stock In bar
    if (d.stock_in > 0) {
      ctx.fillStyle = greenColor;
      ctx.globalAlpha = 0.8;
      roundRect(ctx, cx - barW - gap / 2, padT + chartH - hIn, barW, hIn, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Stock Out bar
    if (d.stock_out > 0) {
      ctx.fillStyle = redColor;
      ctx.globalAlpha = 0.8;
      roundRect(ctx, cx + gap / 2, padT + chartH - hOut, barW, hOut, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // X-axis labels
    ctx.fillStyle = labelColor;
    ctx.font = '9px ' + style.getPropertyValue('--font').trim();
    ctx.textAlign = 'center';
    const label = formatChartDate(d.day);
    ctx.fillText(label, cx, H - padB + 16);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < 1) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function formatChartDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Categories ────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await api.getCategories();
    populateCategoryDropdowns();
  } catch (err) {
    showToast('Failed to load categories', 'error');
  }
}

function populateCategoryDropdowns() {
  const filterSelect = $('#filter-category');
  const formSelect = $('#product-category');
  const filterVal = filterSelect ? filterSelect.value : '';

  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">All Categories</option>';
    for (const cat of allCategories) {
      filterSelect.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
    }
    filterSelect.value = filterVal;
  }
  if (formSelect) {
    formSelect.innerHTML = '<option value="">-- None --</option>';
    for (const cat of allCategories) {
      formSelect.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
    }
  }
}

async function loadCategoriesView() {
  const skeleton = $('#categories-skeleton');
  const tableWrap = $('#categories-table-wrap');
  skeleton.style.display = '';
  tableWrap.style.display = 'none';

  await loadCategories();
  const tbody = $('#categories-tbody');
  const empty = $('#categories-empty');

  skeleton.style.display = 'none';
  tableWrap.style.display = '';

  if (allCategories.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    empty.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <p>No categories yet</p>
      <span>Organize your products by creating your first category</span>
      <div class="empty-action"><button class="btn btn-primary btn-sm" id="empty-add-category">Add Category</button></div>
    `;
    const addBtn = $('#empty-add-category');
    if (addBtn) addBtn.addEventListener('click', () => {
      $('#category-modal-title').textContent = 'Add Category';
      $('#category-submit-btn').textContent = 'Add Category';
      $('#category-id').value = '';
      $('#category-name').value = '';
      openModal($('#category-modal'));
    });
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = allCategories.map(cat => `
    <tr>
      <td>${escapeHtml(cat.name)}</td>
      <td>${formatDate(cat.created_at)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-icon" title="Edit" data-action="edit-category" data-id="${cat.id}" data-name="${escapeAttr(cat.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" title="Delete" data-action="delete-category" data-id="${cat.id}" data-name="${escapeAttr(cat.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function setupCategoryForm() {
  $('#category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#category-id').value;
    const name = $('#category-name').value.trim();
    if (!name) return;

    try {
      if (id) {
        await api.updateCategory(parseInt(id), name);
        showToast('Category updated', 'success');
      } else {
        await api.addCategory(name);
        showToast('Category added', 'success');
      }
      closeAllModals();
      await loadCategories();
      if (currentView === 'categories') await loadCategoriesView();
      if (currentView === 'dashboard') await loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to save category', 'error');
    }
  });
}

function openEditCategoryModal(id, name) {
  $('#category-modal-title').textContent = 'Edit Category';
  $('#category-submit-btn').textContent = 'Update Category';
  $('#category-id').value = id;
  $('#category-name').value = name;
  openModal($('#category-modal'));
}

function openDeleteCategoryConfirm(id, name) {
  $('#confirm-message').textContent = `Delete category "${name}"? Products in this category will become uncategorized. This action cannot be undone.`;
  pendingDeleteFn = async () => {
    closeAllModals();
    let deleted = false;
    showToast(`Category "${name}" deleted`, 'success', {
      undo: true,
      onUndo: () => { deleted = false; showToast('Deletion cancelled', 'info'); },
      onExpire: async () => {
        if (deleted === false) return;
        try {
          await api.deleteCategory(id);
          await loadCategories();
          await refreshCurrentView();
        } catch (err) {
          showToast(err.message || 'Failed to delete', 'error');
          await refreshCurrentView();
        }
      },
    });
    deleted = true;
    try {
      await api.deleteCategory(id);
      await loadCategories();
      await refreshCurrentView();
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };
  openModal($('#confirm-modal'));
}

// ─── Products ──────────────────────────────────────────
async function loadProducts() {
  const skeleton = $('#products-skeleton');
  const tableWrap = $('#products-table-wrap');
  const cardWrap = $('#products-card-wrap');
  skeleton.style.display = '';
  tableWrap.style.display = 'none';
  cardWrap.style.display = 'none';

  try {
    const filters = getFilters();
    allProducts = await api.getProducts(filters);
    sortProducts();
    renderProducts();
  } catch (err) {
    showToast('Failed to load products', 'error');
  } finally {
    skeleton.style.display = 'none';
    if (productViewMode === 'table') tableWrap.style.display = '';
    else cardWrap.style.display = '';
  }
}

function getFilters() {
  const search = $('#search-input').value.trim();
  const catVal = $('#filter-category').value;
  const lowStock = $('#filter-low-stock').checked;
  return {
    search: search || undefined,
    category_id: catVal ? parseInt(catVal) : undefined,
    low_stock: lowStock || undefined,
  };
}

function sortProducts() {
  const col = sortColumn;
  const dir = sortDirection === 'asc' ? 1 : -1;

  allProducts.sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderProducts() {
  if (productViewMode === 'table') {
    renderProductsTable(allProducts);
  } else {
    renderProductsCards(allProducts);
  }
  updateRowCount(allProducts.length);
}

function renderProductsTable(products) {
  const tbody = $('#products-tbody');
  const empty = $('#products-empty');
  const tfoot = $('#products-tfoot');

  if (products.length === 0) {
    tbody.innerHTML = '';
    tfoot.style.display = 'none';
    empty.style.display = 'flex';
    renderProductsEmptyState(empty);
    return;
  }
  empty.style.display = 'none';
  tfoot.style.display = '';

  let sumQty = 0, sumInvValue = 0, sumSold = 0, sumProfit = 0;

  tbody.innerHTML = products.map(p => {
    const isLow = p.quantity < p.min_quantity;
    sumQty += p.quantity;
    sumInvValue += p.inventory_value;
    sumSold += p.units_sold;
    sumProfit += p.realized_profit;
    return `
      <tr class="${isLow ? 'low-stock' : ''}">
        <td>
          <div class="product-name-cell">
            <span>${escapeHtml(p.name)}${isLow ? '<span class="low-stock-badge">LOW</span>' : ''}</span>
            <span class="product-unit">${escapeHtml(p.unit)}</span>
          </div>
        </td>
        <td>${escapeHtml(p.sku || '—')}</td>
        <td>${escapeHtml(p.category_name || '—')}</td>
        <td class="num">${p.quantity}</td>
        <td class="num">${formatCurrency(p.cost_per_unit)}</td>
        <td class="num">${formatCurrency(p.selling_price_per_unit)}</td>
        <td class="num">${formatCurrency(p.inventory_value)}</td>
        <td class="num">${p.units_sold}</td>
        <td class="num">${formatCurrency(p.realized_profit)}</td>
        <td class="num">${p.min_quantity}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon stock-in" title="Stock In" data-action="stock-in" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-qty="${p.quantity}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon stock-out" title="Stock Out" data-action="stock-out" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-qty="${p.quantity}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="btn-icon" title="History" data-action="history" data-id="${p.id}" data-name="${escapeAttr(p.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button class="btn-icon" title="Edit" data-action="edit-product" data-id="${p.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Delete" data-action="delete-product" data-id="${p.id}" data-name="${escapeAttr(p.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  $('#sum-qty').textContent = sumQty.toLocaleString();
  $('#sum-inv-value').textContent = formatCurrency(sumInvValue);
  $('#sum-sold').textContent = sumSold.toLocaleString();
  $('#sum-profit').textContent = formatCurrency(sumProfit);
}

function renderProductsCards(products) {
  const container = $('#products-cards');
  const empty = $('#products-card-empty');

  if (products.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    renderProductsEmptyState(empty);
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = products.map(p => {
    const isLow = p.quantity < p.min_quantity;
    return `
      <div class="product-card ${isLow ? 'low-stock' : ''}">
        <div class="card-top">
          <div>
            <div class="card-title">${escapeHtml(p.name)}${isLow ? ' <span class="low-stock-badge">LOW</span>' : ''}</div>
            <div class="card-sku">${escapeHtml(p.sku || 'No SKU')} · ${escapeHtml(p.unit)}</div>
          </div>
          ${p.category_name ? `<span class="card-category">${escapeHtml(p.category_name)}</span>` : ''}
        </div>
        <div class="card-stats">
          <div class="card-stat-item"><span class="card-stat-label">In Stock</span><span class="card-stat-val">${p.quantity}</span></div>
          <div class="card-stat-item"><span class="card-stat-label">Price</span><span class="card-stat-val">${formatCurrency(p.selling_price_per_unit)}</span></div>
          <div class="card-stat-item"><span class="card-stat-label">Inv. Value</span><span class="card-stat-val">${formatCurrency(p.inventory_value)}</span></div>
          <div class="card-stat-item"><span class="card-stat-label">Profit</span><span class="card-stat-val">${formatCurrency(p.realized_profit)}</span></div>
        </div>
        <div class="card-actions">
          <button class="btn-icon stock-in" title="Stock In" data-action="stock-in" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-qty="${p.quantity}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="btn-icon stock-out" title="Stock Out" data-action="stock-out" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-qty="${p.quantity}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="btn-icon" title="History" data-action="history" data-id="${p.id}" data-name="${escapeAttr(p.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <button class="btn-icon" title="Edit" data-action="edit-product" data-id="${p.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" title="Delete" data-action="delete-product" data-id="${p.id}" data-name="${escapeAttr(p.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderProductsEmptyState(container) {
  const hasCats = allCategories.length > 0;
  container.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    <p>No products found</p>
    <span>${hasCats ? 'Add your first product to get started' : 'Create a category first, then add products'}</span>
    <div class="empty-action">
      ${hasCats
        ? '<button class="btn btn-primary btn-sm" id="empty-add-product">Add Product</button>'
        : '<button class="btn btn-primary btn-sm" id="empty-add-cat-first">Create Category</button>'}
    </div>
  `;
  const addProd = container.querySelector('#empty-add-product');
  const addCat = container.querySelector('#empty-add-cat-first');
  if (addProd) addProd.addEventListener('click', openAddProductModal);
  if (addCat) addCat.addEventListener('click', () => {
    $('#category-modal-title').textContent = 'Add Category';
    $('#category-submit-btn').textContent = 'Add Category';
    $('#category-id').value = '';
    $('#category-name').value = '';
    openModal($('#category-modal'));
  });
}

function updateRowCount(count) {
  const rc = $('#row-count');
  if (rc) rc.textContent = count > 0 ? `Showing ${count} product${count !== 1 ? 's' : ''}` : '';
}

// ─── Column Sorting ────────────────────────────────────
function setupSorting() {
  $$('#products-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'asc';
      }
      updateSortIndicators();
      sortProducts();
      renderProducts();
    });
  });
  updateSortIndicators();
}

function updateSortIndicators() {
  $$('#products-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ─── Card / Table View Toggle ──────────────────────────
function setupViewToggle() {
  const saved = localStorage.getItem('ims-view-mode');
  if (saved === 'card') productViewMode = 'card';
  updateViewToggleIcons();

  $('#view-toggle').addEventListener('click', () => {
    productViewMode = productViewMode === 'table' ? 'card' : 'table';
    localStorage.setItem('ims-view-mode', productViewMode);
    updateViewToggleIcons();

    const tableWrap = $('#products-table-wrap');
    const cardWrap = $('#products-card-wrap');
    if (productViewMode === 'table') {
      cardWrap.style.display = 'none';
      tableWrap.style.display = '';
    } else {
      tableWrap.style.display = 'none';
      cardWrap.style.display = '';
    }
    renderProducts();
  });
}

function updateViewToggleIcons() {
  const gridIcon = $('#view-toggle .icon-grid');
  const listIcon = $('#view-toggle .icon-list');
  if (productViewMode === 'table') {
    gridIcon.style.display = '';
    listIcon.style.display = 'none';
  } else {
    gridIcon.style.display = 'none';
    listIcon.style.display = '';
  }
}

// ─── Event Delegation for Table Actions ────────────────
function setupTableDelegation() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    const name = btn.dataset.name || '';
    const qty = parseInt(btn.dataset.qty) || 0;

    switch (action) {
      case 'stock-in': openStockModal(id, 'IN', name, qty); break;
      case 'stock-out': openStockModal(id, 'OUT', name, qty); break;
      case 'history': openHistoryModal(id, name); break;
      case 'edit-product': openEditProductModal(id); break;
      case 'delete-product': openDeleteProductConfirm(id, name); break;
      case 'edit-category': openEditCategoryModal(id, name); break;
      case 'delete-category': openDeleteCategoryConfirm(id, name); break;
    }
  });
}

// ─── Product Form ──────────────────────────────────────
function setupProductForm() {
  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#product-id').value;
    const data = {
      name: $('#product-name').value.trim(),
      sku: $('#product-sku').value.trim() || null,
      category_id: $('#product-category').value ? parseInt($('#product-category').value) : null,
      cost_per_unit: parseFloat($('#product-cost').value) || 0,
      selling_price_per_unit: parseFloat($('#product-sell').value) || 0,
      min_quantity: parseInt($('#product-min-qty').value) || 0,
      unit: $('#product-unit').value.trim() || 'pcs',
    };

    if (!data.name) {
      showToast('Product name is required', 'error');
      return;
    }

    try {
      if (id) {
        await api.updateProduct(parseInt(id), data);
        showToast('Product updated', 'success');
      } else {
        const initialQty = parseInt($('#product-initial-qty').value) || 0;
        await api.addProduct({ ...data, initial_quantity: initialQty });
        showToast('Product added', 'success');
      }
      closeAllModals();
      await refreshCurrentView();
    } catch (err) {
      showToast(err.message || 'Failed to save product', 'error');
    }
  });
}

function openAddProductModal() {
  $('#product-modal-title').textContent = 'Add Product';
  $('#product-submit-btn').textContent = 'Add Product';
  $('#product-id').value = '';
  $('#product-form').reset();
  $('#product-unit').value = 'pcs';
  $('#product-cost').value = '0';
  $('#product-sell').value = '0';
  $('#product-min-qty').value = '0';
  $('#product-initial-qty').value = '0';
  $('#initial-qty-group').style.display = '';
  openModal($('#product-modal'));
}

async function openEditProductModal(id) {
  try {
    const products = await api.getProducts();
    const p = products.find(x => x.id === id);
    if (!p) return showToast('Product not found', 'error');

    $('#product-modal-title').textContent = 'Edit Product';
    $('#product-submit-btn').textContent = 'Update Product';
    $('#product-id').value = p.id;
    $('#product-name').value = p.name;
    $('#product-sku').value = p.sku || '';
    $('#product-category').value = p.category_id || '';
    $('#product-cost').value = p.cost_per_unit;
    $('#product-sell').value = p.selling_price_per_unit;
    $('#product-min-qty').value = p.min_quantity;
    $('#product-unit').value = p.unit;
    $('#initial-qty-group').style.display = 'none';
    openModal($('#product-modal'));
  } catch (err) {
    showToast('Failed to load product', 'error');
  }
}

function openDeleteProductConfirm(id, name) {
  $('#confirm-message').textContent = `Delete product "${name}"? All stock data and movement history will be permanently removed.`;
  pendingDeleteFn = async () => {
    closeAllModals();
    try {
      await api.deleteProduct(id);
      await refreshCurrentView();
      showToast(`Product "${name}" deleted`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };
  openModal($('#confirm-modal'));
}

// ─── Stock Movements ───────────────────────────────────
function openStockModal(productId, type, name, currentQty) {
  const titles = { IN: 'Stock In', OUT: 'Stock Out' };
  const submitLabels = { IN: 'Add Stock', OUT: 'Remove Stock' };
  $('#stock-modal-title').textContent = titles[type] || type;
  $('#stock-submit-btn').textContent = submitLabels[type] || 'Confirm';
  $('#stock-product-id').value = productId;
  $('#stock-type').value = type;
  $('#stock-product-info').textContent = `${name} — Current stock: ${currentQty} units`;
  $('#stock-quantity').value = '';
  $('#stock-note').value = '';
  $('#stock-quantity-label').textContent = 'Quantity';
  $('#stock-quantity').min = '1';
  openModal($('#stock-modal'));
}

function setupStockForm() {
  $('#stock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = parseInt($('#stock-product-id').value);
    const type = $('#stock-type').value;
    const quantity = parseInt($('#stock-quantity').value);
    const note = $('#stock-note').value.trim() || undefined;

    if (isNaN(quantity) || quantity < 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }
    if ((type === 'IN' || type === 'OUT') && quantity <= 0) {
      showToast('Quantity must be at least 1', 'error');
      return;
    }

    try {
      if (type === 'IN') {
        await api.stockIn(productId, quantity, note);
        showToast(`Added ${quantity} units to stock`, 'success');
      } else {
        await api.stockOut(productId, quantity, note);
        showToast(`Removed ${quantity} units from stock`, 'success');
      }
      closeAllModals();
      await refreshCurrentView();
    } catch (err) {
      showToast(err.message || 'Stock operation failed', 'error');
    }
  });
}

// ─── Movement History with Date Filtering ──────────────
let historyProductId = null;
let historyProductName = '';

function setupHistoryDateFilter() {
  $('#history-filter-btn').addEventListener('click', () => {
    if (historyProductId) loadHistoryData(historyProductId, historyProductName);
  });
  $('#history-clear-btn').addEventListener('click', () => {
    $('#history-start-date').value = '';
    $('#history-end-date').value = '';
    if (historyProductId) loadHistoryData(historyProductId, historyProductName);
  });
}

async function openHistoryModal(productId, name) {
  historyProductId = productId;
  historyProductName = name;
  $('#history-modal-title').textContent = `Movement History — ${name}`;
  $('#history-start-date').value = '';
  $('#history-end-date').value = '';
  await loadHistoryData(productId, name);
  openModal($('#history-modal'));
}

async function loadHistoryData(productId) {
  const tbody = $('#history-tbody');
  const empty = $('#history-empty');
  const startDate = $('#history-start-date').value || undefined;
  const endDate = $('#history-end-date').value || undefined;

  try {
    const movements = await api.getMovements(productId, startDate, endDate);
    if (movements.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = startDate || endDate
        ? 'No movements found in this date range.'
        : 'No movements recorded for this product.';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = movements.map(m => `
        <tr>
          <td><span class="movement-badge ${m.type.toLowerCase()}">${m.type}</span></td>
          <td class="num">${m.quantity}</td>
          <td>${escapeHtml(m.note || '—')}</td>
          <td>${formatDate(m.created_at)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Failed to load history', 'error');
  }
}

// ─── Filters ───────────────────────────────────────────
function setupFilters() {
  $('#search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadProducts(), 300);
  });
  $('#filter-category').addEventListener('change', () => loadProducts());
  $('#filter-low-stock').addEventListener('change', () => loadProducts());
}

// ─── Top-Level Buttons ─────────────────────────────────
function setupTopLevelButtons() {
  $('#btn-add-product').addEventListener('click', openAddProductModal);

  $('#btn-add-category').addEventListener('click', () => {
    $('#category-modal-title').textContent = 'Add Category';
    $('#category-submit-btn').textContent = 'Add Category';
    $('#category-id').value = '';
    $('#category-name').value = '';
    openModal($('#category-modal'));
  });

  $('#confirm-delete-btn').addEventListener('click', () => {
    if (pendingDeleteFn) pendingDeleteFn();
  });

  $('#sidebar-export').addEventListener('click', async () => {
    try {
      const result = await api.exportExcel();
      if (result.success) showToast(result.message, 'success');
      else if (result.message !== 'Export cancelled') showToast(result.message, 'info');
    } catch (err) {
      showToast('Export failed', 'error');
    }
  });

  $('#sidebar-import').addEventListener('click', async () => {
    try {
      const result = await api.importFile();
      if (!result.success && result.message === 'Import cancelled') return;

      const body = $('#import-result-body');
      if (result.success) {
        body.innerHTML = `
          <div class="import-summary">
            <span class="stat created">Created: ${result.created}</span>
            <span class="stat updated">Updated: ${result.updated}</span>
          </div>
          <p style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(result.message)}</p>
        `;
        await loadCategories();
        await refreshCurrentView();
      } else {
        let html = `<p style="color: var(--red); font-weight: 500; margin-bottom: 10px;">${escapeHtml(result.message)}</p>`;
        if (result.errors && result.errors.length > 0) {
          html += '<div class="import-errors">';
          for (const err of result.errors) html += `<p>${escapeHtml(err)}</p>`;
          html += '</div>';
        }
        body.innerHTML = html;
      }
      openModal($('#import-modal'));
    } catch (err) {
      showToast('Import failed', 'error');
    }
  });

  // Backup
  $('#sidebar-backup').addEventListener('click', async () => {
    try {
      const result = await api.backupDatabase();
      if (result.success) showToast(result.message, 'success');
      else if (result.message !== 'Backup cancelled') showToast(result.message, 'error');
    } catch (err) {
      showToast('Backup failed', 'error');
    }
  });

  // Restore
  $('#sidebar-restore').addEventListener('click', async () => {
    try {
      const result = await api.restoreDatabase();
      if (result.success) {
        showToast(result.message, 'success');
        await loadCategories();
        await refreshCurrentView();
      } else if (result.message !== 'Restore cancelled') {
        showToast(result.message, 'error');
      }
    } catch (err) {
      showToast('Restore failed', 'error');
    }
  });
}

// ─── Menu Commands (keyboard shortcuts from hidden native menu + custom titlebar) ──
function setupMenuCommands() {
  // Handle keyboard shortcut commands forwarded from the hidden native menu
  if (api.onMenuCommand) {
    api.onMenuCommand((cmd) => runMenuCommand(cmd));
  }

  // Custom titlebar dropdown menus
  setupTitlebarMenus();

  // Window controls
  $('#tb-minimize').addEventListener('click', () => api.winMinimize());
  $('#tb-maximize').addEventListener('click', () => api.winMaximize());
  $('#tb-close').addEventListener('click', () => api.winClose());
}

function runMenuCommand(cmd) {
  closeTitlebarMenus();
  switch (cmd) {
    case 'menu-import': $('#sidebar-import').click(); break;
    case 'menu-export': $('#sidebar-export').click(); break;
    case 'menu-backup': $('#sidebar-backup').click(); break;
    case 'menu-restore': $('#sidebar-restore').click(); break;
    case 'menu-view-dashboard': switchView('dashboard'); break;
    case 'menu-view-products': switchView('products'); break;
    case 'menu-view-categories': switchView('categories'); break;
    case 'menu-toggle-theme': $('#theme-toggle').click(); break;
    case 'menu-toggle-sidebar': $('#sidebar-toggle').click(); break;
      case 'menu-about': openModal($('#about-modal')); break;
    case 'win-close': api.winClose(); break;
    case 'reload': location.reload(); break;
    case 'fullscreen': document.documentElement.requestFullscreen?.(); break;
    case 'edit-undo': document.execCommand('undo'); break;
    case 'edit-redo': document.execCommand('redo'); break;
    case 'edit-cut': document.execCommand('cut'); break;
    case 'edit-copy': document.execCommand('copy'); break;
    case 'edit-paste': document.execCommand('paste'); break;
    case 'edit-selectall': document.execCommand('selectAll'); break;
  }
}

let openMenu = null;

function setupTitlebarMenus() {
  const menus = $$('.tb-menu');

  menus.forEach(menu => {
    const btn = menu.querySelector('.tb-menu-btn');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.classList.contains('open')) {
        closeTitlebarMenus();
      } else {
        closeTitlebarMenus();
        menu.classList.add('open');
        openMenu = menu;
      }
    });

    btn.addEventListener('mouseenter', () => {
      if (openMenu && openMenu !== menu) {
        closeTitlebarMenus();
        menu.classList.add('open');
        openMenu = menu;
      }
    });
  });

  // Dropdown item clicks
  $$('.tb-item[data-cmd]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      runMenuCommand(item.dataset.cmd);
    });
  });

  // Close menus on outside click
  document.addEventListener('click', () => closeTitlebarMenus());
}

function closeTitlebarMenus() {
  $$('.tb-menu.open').forEach(m => m.classList.remove('open'));
  openMenu = null;
}

// ─── View Refresh Helper ───────────────────────────────
async function refreshCurrentView() {
  if (currentView === 'dashboard') await loadDashboard();
  else if (currentView === 'products') await loadProducts();
  else if (currentView === 'categories') await loadCategoriesView();
}

// ─── Utilities ─────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

function formatCurrency(num) {
  if (num == null || isNaN(num)) return '0.00';
  return Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
