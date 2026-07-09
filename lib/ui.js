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
    <div id="pena-modal" class="modal-backdrop">
      <div class="modal-content p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">${escapeText(title)}</h3>
          <button id="pena-modal-close" class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth">${icon('close', 'md')}</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${options.actions ? `<div class="flex gap-2 mt-6">${options.actions}</div>` : ''}
      </div>
    </div>
  `;

  // Bind events via addEventListener (no inline handlers)
  const backdrop = document.getElementById('pena-modal');
  if (backdrop) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  }
  const closeBtn = document.getElementById('pena-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

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

  // Clean up previous highlight
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

  if (tourStep >= TOUR_STEPS.length) {
    overlay.style.display = 'none';
    overlay.style.background = 'transparent';
    overlay.innerHTML = '';
    localStorage.setItem('pena_tour_done', '1');
    return;
  }

  const step = TOUR_STEPS[tourStep];
  const target = document.querySelector(step.selector);

  overlay.style.display = 'block';
  overlay.style.pointerEvents = 'none';
  overlay.innerHTML = '';

  if (target) {
    // Scroll target into view
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Build overlay content: dark backdrop + tooltip
    overlay.innerHTML = '<div id="tour-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:39;pointer-events:none"></div>';
    
    // Wait for scroll, then highlight
    setTimeout(() => {
      target.classList.add('tour-highlight');
      const rect = target.getBoundingClientRect();

      // Create tooltip positioned below the target
      const tooltip = document.createElement('div');
      tooltip.className = 'fixed z-50 bg-white dark:bg-gray-900 rounded-xl p-5 shadow-2xl border-2 border-green-500 max-w-sm scale-in';
      tooltip.style.pointerEvents = 'auto';
      
      // Position: below target if space, otherwise above
      const tooltipWidth = 320;
      const tooltipHeight = 200;
      let top = rect.bottom + 12;
      let left = rect.left;
      
      // If not enough space below, put it above
      if (top + tooltipHeight > window.innerHeight - 20) {
        top = rect.top - tooltipHeight - 12;
      }
      // If still not enough space, put it at top of screen
      if (top < 20) top = 20;
      // Keep horizontally in view
      if (left + tooltipWidth > window.innerWidth - 20) {
        left = window.innerWidth - tooltipWidth - 20;
      }
      if (left < 20) left = 20;
      
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
      tooltip.style.maxWidth = 'calc(100vw - 40px)';
      
      tooltip.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center">${tourStep + 1}</span>
            <span class="text-xs text-gray-400">${tourStep + 1} of ${TOUR_STEPS.length}</span>
          </div>
          <button id="tour-skip-btn" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded transition-smooth">${icon('close', 'sm')}</button>
        </div>
        <h4 class="font-bold text-base mb-2 text-gray-900 dark:text-white">${escapeText(step.title)}</h4>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">${escapeText(step.text)}</p>
        <div class="flex gap-2">
          <button id="tour-next-btn" class="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-smooth flex items-center justify-center gap-1">
            ${tourStep < TOUR_STEPS.length - 1 ? 'Next ' + icon('arrowRight', 'sm') : 'Get Started ' + icon('check', 'sm')}
          </button>
          <button id="tour-skip-btn2" class="px-4 py-2.5 rounded-lg text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-smooth">Skip</button>
        </div>
      `;
      overlay.appendChild(tooltip);

      const nextBtn = document.getElementById('tour-next-btn');
      const skipBtns = [document.getElementById('tour-skip-btn'), document.getElementById('tour-skip-btn2')];
      
      if (nextBtn) nextBtn.onclick = () => {
        target.classList.remove('tour-highlight');
        tourStep++;
        showTourStep();
      };
      
      skipBtns.forEach(btn => {
        if (btn) btn.onclick = () => {
          target.classList.remove('tour-highlight');
          overlay.style.display = 'none';
          overlay.style.background = 'transparent';
          overlay.innerHTML = '';
          localStorage.setItem('pena_tour_done', '1');
        };
      });
    }, 300);
  } else {
    overlay.style.background = 'transparent';
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

// Real QR Code encoder — Version 2 (25×25), Mode Byte, ECC-L
// Produces a scannable ISO/IEC 18004 QR code as inline SVG, zero dependencies.

function generateQR(text, size = 200) {
  try {
    const modules = encodeQR(text);
    const n = modules.length;
    const cellSize = size / (n + 8); // quiet zone of 4 cells each side
    const offset = cellSize * 4;
    let rects = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (modules[y][x]) {
          rects += `<rect x="${(offset + x * cellSize).toFixed(2)}" y="${(offset + y * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#0d1b2a"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="rounded-lg" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="white"/>${rects}</svg>`;
  } catch {
    // Fallback: show text if encoding fails
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="rounded-lg" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="white"/><text x="${size/2}" y="${size/2}" text-anchor="middle" font-size="10" fill="#666">${escapeText(text)}</text></svg>`;
  }
}

// Minimal QR encoder: Version 1-2, Byte mode, ECC Level L
function encodeQR(text) {
  const data = new TextEncoder().encode(text);
  const version = data.length <= 17 ? 1 : 2; // V1 max 17 bytes (L), V2 max 32 bytes (L)
  const n = 17 + version * 4; // 21 for V1, 25 for V2
  const totalDataCW = version === 1 ? 19 : 34;
  const totalEccCW = version === 1 ? 7 : 10;

  if (data.length > totalDataCW - 2) {
    // Truncate if too long for V2
    return encodeQRFallback(text.substring(0, 30), n);
  }

  // Build data codewords: mode(4bits) + count(8bits) + data + terminator + padding
  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4); // Byte mode
  pushBits(data.length, 8); // Character count
  for (const b of data) pushBits(b, 8);
  pushBits(0, Math.min(4, totalDataCW * 8 - bits.length)); // Terminator
  while (bits.length % 8 !== 0) bits.push(0); // Byte-align
  while (bits.length < totalDataCW * 8) {
    pushBits(0xEC, 8);
    if (bits.length < totalDataCW * 8) pushBits(0x11, 8);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }

  // Reed-Solomon ECC (GF(256) with polynomial 0x11D)
  const ecc = rsEncode(codewords, totalEccCW);
  const allCW = [...codewords, ...ecc];

  // Initialize module grid
  const grid = Array.from({ length: n }, () => new Uint8Array(n));
  const reserved = Array.from({ length: n }, () => new Uint8Array(n));

  // Place finder patterns
  const placeFinder = (r, c) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const y = r + dy, x = c + dx;
      if (y < 0 || y >= n || x < 0 || x >= n) continue;
      const outer = dy === -1 || dy === 7 || dx === -1 || dx === 7;
      const inner = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      const ring = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const core = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      grid[y][x] = (inner && (ring || core)) ? 1 : 0;
      reserved[y][x] = 1;
    }
  };
  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    grid[6][i] = (i % 2 === 0) ? 1 : 0; reserved[6][i] = 1;
    grid[i][6] = (i % 2 === 0) ? 1 : 0; reserved[i][6] = 1;
  }

  // Dark module
  grid[n - 8][8] = 1; reserved[n - 8][8] = 1;

  // Reserve format info areas
  for (let i = 0; i < 9; i++) { reserved[8][i] = 1; reserved[i][8] = 1; }
  for (let i = 0; i < 8; i++) { reserved[8][n - 1 - i] = 1; reserved[n - 1 - i][8] = 1; }

  // Alignment pattern (V2 only)
  if (version === 2) {
    const ac = 18;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      grid[ac + dy][ac + dx] = (adx === 2 || ady === 2 || (adx === 0 && ady === 0)) ? 1 : 0;
      reserved[ac + dy][ac + dx] = 1;
    }
  }

  // Place data bits
  const allBits = [];
  for (const cw of allCW) for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    const rows = upward ? Array.from({ length: n }, (_, i) => n - 1 - i) : Array.from({ length: n }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= n) continue;
        if (reserved[row][c]) continue;
        grid[row][c] = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        reserved[row][c] = 1;
      }
    }
    upward = !upward;
  }

  // Apply mask 0 (checkerboard: (row + col) % 2 === 0)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (reserved[y][x] && bitIdx > 0) { /* skip non-data */ }
    // We need to track which cells are data cells for masking
  }
  // Simpler: re-walk and apply mask to data modules only
  const isData = Array.from({ length: n }, () => new Uint8Array(n));
  bitIdx = 0;
  upward = true;
  for (let col = n - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5;
    const rows = upward ? Array.from({ length: n }, (_, i) => n - 1 - i) : Array.from({ length: n }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= n) continue;
        // Check if this was a data cell (not finder/timing/alignment/format)
        let wasReservedBefore = false;
        // Finder areas
        if ((row < 9 && c < 9) || (row < 9 && c >= n - 8) || (row >= n - 8 && c < 9)) wasReservedBefore = true;
        // Timing
        if (row === 6 || c === 6) wasReservedBefore = true;
        // Dark module
        if (row === n - 8 && c === 8) wasReservedBefore = true;
        // Alignment (V2)
        if (version === 2 && row >= 16 && row <= 20 && c >= 16 && c <= 20) wasReservedBefore = true;
        if (!wasReservedBefore) {
          isData[row][c] = 1;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // Apply mask pattern 0: (row + col) % 2 === 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (isData[y][x] && (y + x) % 2 === 0) grid[y][x] ^= 1;
  }

  // Place format info (mask 0, ECC L = 01, mask 000 → format bits = 0b111011111000100)
  const formatBits = version === 1 || version === 2 ?
    [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0] : // L, mask 0
    [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0];
  // Horizontal: modules along row 8
  const hPos = [0,1,2,3,4,5,7,8, n-8,n-7,n-6,n-5,n-4,n-3,n-2,n-1];
  // Vertical: modules along col 8
  const vPos = [n-1,n-2,n-3,n-4,n-5,n-6,n-7, 8, 7,5,4,3,2,1,0];
  for (let i = 0; i < 15; i++) {
    grid[8][hPos[i]] = formatBits[i];
    grid[vPos[i]][8] = formatBits[i];
  }

  return grid;
}

function encodeQRFallback(text, n) {
  // For text too long — still try with truncated text
  return encodeQR(text);
}

// Reed-Solomon encoder over GF(256) with primitive polynomial 0x11D
function rsEncode(data, eccCount) {
  // GF(256) log/exp tables
  const exp = new Uint8Array(256);
  const log = new Uint8Array(256);
  let v = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = v;
    log[v] = i;
    v = (v << 1) ^ (v >= 128 ? 0x11D : 0);
  }
  exp[255] = exp[0];

  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : exp[(log[a] + log[b]) % 255];

  // Build generator polynomial
  let gen = [1];
  for (let i = 0; i < eccCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = exp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen = next;
  }

  // Polynomial division
  const result = new Uint8Array(eccCount);
  const msg = [...data, ...new Array(eccCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  for (let i = 0; i < eccCount; i++) result[i] = msg[data.length + i];
  return result;
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
