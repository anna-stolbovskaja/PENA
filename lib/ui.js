// PEÑA — UI Components: Modals, Toasts, Tour, Charts, QR, Sortable Tables

import { icon } from './icons.js';

// ═══════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════

function showModal(title, bodyHTML, options = {}) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const close = () => {
    const el = document.getElementById('pena-modal');
    if (el) {
      el.classList.add('fade-in');
      el.style.opacity = '0';
      setTimeout(() => container.innerHTML = '', 200);
    }
  };

  container.innerHTML = `
    <div id="pena-modal" class="modal-backdrop" onclick="if(event.target===this)document.getElementById('modal-container').innerHTML=''">
      <div class="modal-content p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">${escapeText(title)}</h3>
          <button onclick="document.getElementById('modal-container').innerHTML=''" class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth">${icon('close', 'md')}</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${options.actions ? `<div class="flex gap-2 mt-6">${options.actions}</div>` : ''}
      </div>
    </div>
  `;
  return { close, container };
}

function closeModal() {
  const container = document.getElementById('modal-container');
  if (container) container.innerHTML = '';
}

function escapeText(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════

const toastIcons = {
  success: icon('check', 'md'),
  error: icon('alert', 'md'),
  info: icon('info', 'md'),
  p2p: icon('wifi', 'md'),
};

function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900',
    p2p: 'bg-blue-600 text-white',
  };

  const toast = document.createElement('div');
  toast.className = `toast-item flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${colors[type] || colors.info}`;
  toast.innerHTML = `${toastIcons[type] || toastIcons.info}<span>${escapeText(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
// TOUR
// ═══════════════════════════════════════════════════════════════

const TOUR_STEPS = [
  { selector: '[data-tour="balance"]', title: 'Treasury Balance', text: 'This shows the current USDt balance, total members, and connected peers. The balance updates in real-time as contributions and expenses happen.' },
  { selector: '[data-tour="tabs"]', title: 'Navigation', text: 'Switch between Audit Feed, Proposals, Balance, Reports, NL Query, P2P Sync, and Help. On mobile, these appear as bottom navigation buttons.' },
  { selector: '[data-tour="actions"]', title: 'Quick Actions', text: 'Contribute funds to the treasury or create a spending proposal. All actions are signed with your wallet and synced across peers.' },
  { selector: '[data-tour="feed"]', title: 'Audit Feed', text: 'Every transaction is recorded here — contributions, proposals, approvals, and executions. This is the transparent, immutable ledger visible to all members.' },
  { selector: '[data-tour="p2p"]', title: 'P2P Sync', text: 'Open this app in another browser tab to see real-time P2P synchronization. No server required — all data syncs directly between devices.' },
];

let tourStep = 0;

function startTour() {
  tourStep = 0;
  showTourStep();
}

function showTourStep() {
  const overlay = document.getElementById('tour-overlay');
  if (!overlay) return;

  if (tourStep >= TOUR_STEPS.length) {
    overlay.style.display = 'none';
    localStorage.setItem('pena_tour_done', '1');
    return;
  }

  const step = TOUR_STEPS[tourStep];
  const target = document.querySelector(step.selector);

  overlay.style.display = 'block';
  overlay.innerHTML = '';

  if (target) {
    target.classList.add('tour-highlight');
    const rect = target.getBoundingClientRect();

    const tooltip = document.createElement('div');
    tooltip.className = 'fixed z-50 bg-white dark:bg-gray-900 rounded-xl p-5 shadow-2xl border border-gray-200 dark:border-gray-800 max-w-xs scale-in pointer-events-auto';
    tooltip.style.top = tourStep === 0 ? '20px' : '20px';
    tooltip.style.left = '20px';
    tooltip.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-green-600">${tourStep + 1} / ${TOUR_STEPS.length}</span>
        <button onclick="document.getElementById('tour-overlay').style.display='none'" class="text-gray-400 hover:text-gray-600">${icon('close', 'sm')}</button>
      </div>
      <h4 class="font-bold mb-2">${escapeText(step.title)}</h4>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${escapeText(step.text)}</p>
      <div class="flex gap-2">
        <button id="tour-next" class="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-smooth">${tourStep < TOUR_STEPS.length - 1 ? 'Next' : 'Done'}</button>
        <button id="tour-skip" class="px-4 py-2 rounded-lg text-gray-500 text-sm">Skip</button>
      </div>
    `;
    overlay.appendChild(tooltip);
    overlay.classList.remove('pointer-events-none');

    document.getElementById('tour-next').onclick = () => {
      target.classList.remove('tour-highlight');
      tourStep++;
      showTourStep();
    };
    document.getElementById('tour-skip').onclick = () => {
      target.classList.remove('tour-highlight');
      overlay.style.display = 'none';
      overlay.classList.add('pointer-events-none');
      localStorage.setItem('pena_tour_done', '1');
    };
  } else {
    // Target not found, skip
    tourStep++;
    showTourStep();
  }
}

function shouldShowTour() {
  return !localStorage.getItem('pena_tour_done');
}

// ═══════════════════════════════════════════════════════════════
// CHARTS (SVG-based, no dependencies)
// ═══════════════════════════════════════════════════════════════

function barChart(data, options = {}) {
  const { width = 400, height = 200, color = '#00a86b' } = options;
  if (!data || data.length === 0) return '<p class="text-sm text-gray-400 text-center py-8">No data</p>';

  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = (width - 40) / data.length;
  const chartHeight = height - 40;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * chartHeight;
    const x = 20 + i * barWidth + 4;
    const y = chartHeight - h + 10;
    return `<rect x="${x}" y="${y}" width="${barWidth - 8}" height="${h}" rx="4" fill="${color}" opacity="0.85">
      <animate attributeName="height" from="0" to="${h}" dur="0.6s" fill="freeze"/>
      <animate attributeName="y" from="${chartHeight + 10}" to="${y}" dur="0.6s" fill="freeze"/>
    </rect>`;
  }).join('');

  const labels = data.map((d, i) => {
    const x = 20 + i * barWidth + barWidth / 2;
    return `<text x="${x}" y="${height - 5}" text-anchor="middle" font-size="10" fill="#9ca3af">${escapeText(String(d.label || '').substring(0, 8))}</text>`;
  }).join('');

  const values = data.map((d, i) => {
    const x = 20 + i * barWidth + barWidth / 2;
    const h = (d.value / max) * chartHeight;
    const y = chartHeight - h + 2;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" fill="#6b7280">${d.value}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">${bars}${labels}${values}</svg>`;
}

function donutChart(data, options = {}) {
  const { size = 180 } = options;
  if (!data || data.length === 0) return '<p class="text-sm text-gray-400 text-center py-8">No data</p>';

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colors = ['#00a86b', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  const radius = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 24;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const fraction = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulative + fraction) * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = fraction > 0.5 ? 1 : 0;
    const color = colors[i % colors.length];

    return `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round">
      <animate attributeName="stroke-dasharray" from="0 999" to="${fraction * 2 * Math.PI * radius} 999" dur="0.8s" fill="freeze"/>
    </path>`;
  }).join('');

  const legend = data.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(0);
    const color = colors[i % colors.length];
    return `<div class="flex items-center gap-2 text-xs"><span class="w-3 h-3 rounded-full" style="background:${color}"></span><span>${escapeText(d.label)}</span><span class="font-medium">${d.value} (${pct}%)</span></div>`;
  }).join('');

  return `<div class="flex flex-col sm:flex-row items-center gap-4"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="flex-shrink-0"><circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}" opacity="0.3"/>${segments}<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="22" font-weight="bold" fill="currentColor">${total}</text><text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="#9ca3af">Total</text></svg><div class="space-y-2 flex-1">${legend}</div></div>`;
}

function lineChart(data, options = {}) {
  const { width = 400, height = 180, color = '#00a86b' } = options;
  if (!data || data.length < 2) return '<p class="text-sm text-gray-400 text-center py-8">Need at least 2 data points</p>';

  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const chartHeight = height - 40;
  const stepX = (width - 40) / (data.length - 1);

  const points = data.map((d, i) => {
    const x = 20 + i * stepX;
    const y = chartHeight - ((d.value - min) / range) * chartHeight + 10;
    return { x, y, value: d.value, label: d.label };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${chartHeight + 10} L ${points[0].x} ${chartHeight + 10} Z`;

  const dots = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"><animate attributeName="r" from="0" to="3" dur="0.3s" begin="0.5s" fill="freeze"/></circle>`).join('');
  const labels = points.map(p => `<text x="${p.x}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#9ca3af">${escapeText(String(p.label || '').substring(0, 6))}</text>`).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg"><path d="${areaD}" fill="${color}" opacity="0.1"/><path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"><animate attributeName="stroke-dasharray" from="0 9999" to="9999 0" dur="1s" fill="freeze"/></path>${dots}${labels}</svg>`;
}

// ═══════════════════════════════════════════════════════════════
// SORTABLE TABLE
// ═══════════════════════════════════════════════════════════════

function sortableTable(headers, rows, options = {}) {
  const tableId = options.id || 'sortable-table-' + Math.random().toString(36).substring(2, 8);
  const headerHTML = headers.map((h, i) => {
    const sortable = h.sortable !== false;
    return `<th class="sortable px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 ${sortable ? 'cursor-pointer' : ''}" data-sort-key="${i}" data-table="${tableId}">
      ${escapeText(h.label)}${sortable ? '<span class="sort-arrow">▼</span>' : ''}
    </th>`;
  }).join('');

  const rowHTML = rows.map(row => {
    return `<tr class="border-t border-gray-100 dark:border-gray-800">${row.map(cell => `<td class="px-3 py-2 text-xs">${typeof cell === 'string' ? escapeText(cell) : cell}</td>`).join('')}</tr>`;
  }).join('');

  return `
    <div class="table-wrapper overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table class="w-full" id="${tableId}" data-rows='${JSON.stringify(rows.map(r => r.map(c => typeof c === 'string' ? c : '')))}'>
        <thead class="bg-gray-50 dark:bg-gray-800/50">${headerHTML}</thead>
        <tbody>${rowHTML}</tbody>
      </table>
    </div>
  `;
}

function attachSortable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll('th.sortable');
  let currentSort = { key: -1, dir: 'asc' };

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = parseInt(th.dataset.sortKey, 10);
      if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { key, dir: 'asc' };
      }

      headers.forEach(h => h.querySelector('.sort-arrow')?.classList.remove('active'));
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) {
        arrow.classList.add('active');
        arrow.textContent = currentSort.dir === 'asc' ? '▲' : '▼';
      }

      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const av = a.children[key]?.textContent?.trim() || '';
        const bv = b.children[key]?.textContent?.trim() || '';
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return currentSort.dir === 'asc' ? an - bn : bn - an;
        return currentSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// QR CODE (simple SVG-based, no dependency)
// ═══════════════════════════════════════════════════════════════

function generateQR(text, size = 200) {
  // Simple QR placeholder — in production use a QR library
  // For now, generate a visual pattern from the text hash
  const hash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const cells = 21;
  const cellSize = size / cells;
  let rects = '';

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const val = ((hash >> ((x * 7 + y * 3) % 31)) & 1) === 1;
      // Corner markers
      const isCorner = (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
      if (isCorner) {
        const cx = x < 7 ? 3 : cells - 4;
        const cy = y < 7 ? 3 : cells - 4;
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        const dist = Math.max(dx, dy);
        if (dist === 3 || dist === 2) continue; // white border
        if (dist <= 3) { rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0d1b2a"/>`; continue; }
      }
      if (val) {
        rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0d1b2a"/>`;
      }
    }
  }

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="rounded-lg" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="white"/>${rects}</svg>`;
}

// ═══════════════════════════════════════════════════════════════
// COPY TO CLIPBOARD
// ═══════════════════════════════════════════════════════════════

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export {
  showModal,
  closeModal,
  showToast,
  startTour,
  shouldShowTour,
  barChart,
  donutChart,
  lineChart,
  sortableTable,
  attachSortable,
  generateQR,
  copyToClipboard,
  escapeText,
};
