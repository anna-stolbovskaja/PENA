// QVAC — On-device receipt OCR (Tesseract.js) + natural language query engine
// All processing happens locally in the browser — no server, no API calls

let tesseractWorker = null;
let tesseractLoading = false;

async function initOCR() {
  if (tesseractWorker || tesseractLoading) return tesseractWorker;
  tesseractLoading = true;
  try {
    const Tesseract = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm');
    tesseractWorker = await Tesseract.createWorker('spa+eng', 1, {
      logger: () => {},
    });
    tesseractLoading = false;
    return tesseractWorker;
  } catch (err) {
    console.error('QVAC OCR init error:', err.message);
    tesseractLoading = false;
    return null;
  }
}

async function parseReceipt(imageBlobOrUrl) {
  try {
    const worker = await initOCR();
    if (!worker) {
      return { error: 'OCR engine unavailable', payee: '', amount: 0, category: 'Otros', date: new Date().toISOString().split('T')[0] };
    }
    const { data } = await worker.recognize(imageBlobOrUrl);
    return extractReceiptData(data.text);
  } catch (err) {
    console.error('QVAC parseReceipt error:', err.message);
    return { error: err.message, payee: '', amount: 0, category: 'Otros', date: new Date().toISOString().split('T')[0] };
  }
}

function extractReceiptData(rawText) {
  const text = rawText || '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract amount: look for currency patterns
  let amount = 0;
  const amountPatterns = [
    /(?:total|importe|suma|total\s+a\s*pagar)[:\s]*\$?\s*(\d+[.,]?\d*)/i,
    /\$\s*(\d+[.,]\d{2})\s*$/,
    /(\d+[.,]\d{2})\s*(?:usd|usdt|dolar)/i,
  ];
  for (const pattern of amountPatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }
    if (amount > 0) break;
  }
  if (amount === 0) {
    // Fallback: find the largest number that looks like a price
    let maxNum = 0;
    for (const line of lines) {
      const nums = line.matchAll(/\$?\s*(\d+[.,]\d{2})/g);
      for (const n of nums) {
        const val = parseFloat(n[1].replace(',', '.'));
        if (val > maxNum) maxNum = val;
      }
    }
    amount = maxNum;
  }

  // Extract payee: usually the first non-numeric line
  let payee = '';
  for (const line of lines.slice(0, 5)) {
    if (!line.match(/^\d/) && line.length > 3 && !line.match(/^(fecha|date|tel|fono|teléfono|ruc|nit|cuit|cif)/i)) {
      payee = line.substring(0, 50);
      break;
    }
  }
  if (!payee && lines.length > 0) payee = lines[0].substring(0, 50);

  // Extract date
  let date = new Date().toISOString().split('T')[0];
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  for (const line of lines) {
    const m = line.match(datePattern);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      break;
    }
  }

  // Categorize
  const category = categorizeExpense(payee + ' ' + lines.join(' '));

  return { payee, amount: Math.round(amount * 100) / 100, category, date, rawText: text };
}

function categorizeExpense(text) {
  const t = (text || '').toLowerCase();
  const categories = {
    'Transporte': ['bus', 'autobus', 'autobús', 'transport', 'combustible', 'gasolina', 'gas', 'ruta', 'viaje', 'taxi', 'uber'],
    'Tifo': ['tifo', 'bandera', 'pancarta', 'pintura', 'tela', 'imprenta', 'impresion', 'impresión', 'banner', 'cartel'],
    'Equipos': ['ferreteria', 'ferretería', 'material', 'herramienta', 'graderia', 'gradería', 'equipo', 'construccion', 'construcción'],
    'Comida': ['carniceria', 'carnicería', 'supermercado', 'bar', 'restaurante', 'comida', 'bebida', 'agua', 'snack', 'mercado', 'panaderia', 'panadería'],
    'Entradas': ['estadio', 'entrada', 'ticket', 'abono', 'acceso', 'puerta'],
    'Caridad': ['caridad', 'donacion', 'donación', 'beneficencia', 'ayuda', 'solidaridad'],
  };
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => t.includes(kw))) return cat;
  }
  return 'Otros';
}

// Natural language query engine
// Parses user queries and returns answers from the local ledger state
function queryLedger(state, query) {
  try {
    const q = (query || '').toLowerCase().trim();
    if (!q) return 'Escribe una consulta. Ej: "saldo", "transporte", "quien contribuyó más"';

    const executed = state.proposals.filter(p => p.status === 'executed');
    const pending = state.proposals.filter(p => p.status === 'pending');
    const totalIn = state.contributions.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const totalOut = executed.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    // Balance / saldo
    if (q.match(/saldo|balance|cuanto.*hay|cuánto.*hay/)) {
      return `Saldo actual: ${state.balance} USD₮\nEntradas totales: ${totalIn} USD₮\nSalidas totales: ${totalOut} USD₮\nTransacciones: ${state.contributions.length + state.executions.length}`;
    }

    // Member / integrante
    if (q.match(/miembro|integrante|member|quien.*grupo|quién.*grupo/)) {
      return `Miembros del grupo: ${state.members.length}\n${state.members.map(m => `• ${m.name} (${m.role})`).join('\n')}`;
    }

    // Who contributed most
    if (q.match(/quien.*contribuy|quién.*contribuy|quien.*aport|quién.*aport|top.*contrib/)) {
      const byMember = {};
      for (const c of state.contributions) {
        const m = state.members.find(m => m.id === c.memberId);
        const name = m ? m.name : 'Unknown';
        byMember[name] = (byMember[name] || 0) + (Number(c.amount) || 0);
      }
      const sorted = Object.entries(byMember).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return 'Sin contribuciones registradas';
      return `Contribuciones por miembro:\n${sorted.map(([name, amt], i) => `${i + 1}. ${name}: ${amt} USD₮`).join('\n')}`;
    }

    // Pending proposals
    if (q.match(/pendiente|pending|sin.*aprobar/)) {
      if (pending.length === 0) return 'Sin propuestas pendientes';
      return `Propuestas pendientes: ${pending.length}\n${pending.map(p => `• ${p.payee}: ${p.amount} USD₮ — ${p.approvals.length}/${state.threshold || 2} aprobaciones`).join('\n')}`;
    }

    // Category breakdown
    if (q.match(/categoria|categoría|breakdown|desglose|gasto.*por/)) {
      const cats = {};
      for (const p of executed) {
        const cat = p.category || 'Otros';
        cats[cat] = (cats[cat] || 0) + (Number(p.amount) || 0);
      }
      const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return 'Sin gastos registrados';
      return `Gastos por categoría:\n${sorted.map(([cat, amt]) => `• ${cat}: ${amt} USD₮`).join('\n')}`;
    }

    // Transporte
    if (q.match(/bus|autobus|autobús|transporte|combustible|viaje/)) {
      const items = executed.filter(p => (p.category || '').toLowerCase().includes('transporte') || (p.purpose || '').toLowerCase().match(/bus|autobus|transport|viaje/));
      const total = items.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (items.length === 0) return 'Sin gastos en transporte';
      return `Gastos en transporte: ${total} USD₮ en ${items.length} propuestas\n${items.map(p => `• ${p.payee}: ${p.amount} USD₮ — ${p.purpose}`).join('\n')}`;
    }

    // Tifo
    if (q.match(/tifo|bandera|pancarta/)) {
      const items = executed.filter(p => (p.category || '').toLowerCase().includes('tifo') || (p.purpose || '').toLowerCase().match(/tifo|bandera|pancarta|tela/));
      const total = items.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (items.length === 0) return 'Sin gastos en tifo';
      return `Gastos en tifo: ${total} USD₮ en ${items.length} propuestas\n${items.map(p => `• ${p.payee}: ${p.amount} USD₮`).join('\n')}`;
    }

    // Comida
    if (q.match(/comida|bar|restaurante|mercado/)) {
      const items = executed.filter(p => (p.category || '').toLowerCase().includes('comida'));
      const total = items.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (items.length === 0) return 'Sin gastos en comida';
      return `Gastos en comida: ${total} USD₮ en ${items.length} propuestas`;
    }

    // Last / recent
    if (q.match(/ultimo|último|recente|reciente/)) {
      const all = [
        ...state.contributions.map(c => ({ ts: c.ts, text: `Contribución: ${c.amount} USD₮` })),
        ...state.executions.map(e => {
          const p = state.proposals.find(p => p.id === e.proposalId);
          return { ts: e.ts, text: `Pago ejecutado: ${p ? p.amount : 0} USD₮ a ${p ? p.payee : ''}` };
        }),
      ].sort((a, b) => b.ts - a.ts).slice(0, 5);
      if (all.length === 0) return 'Sin actividad reciente';
      return `Actividad reciente:\n${all.map(a => `• ${a.text}`).join('\n')}`;
    }

    // Help / default
    return `Consultas disponibles:\n• "saldo" — balance de la tesorería\n• "transporte" — gastos en transporte\n• "tifo" — gastos en tifo\n• "quien contribuyó más" — ranking de aportes\n• "categorías" — desglose de gastos\n• "pendientes" — propuestas sin aprobar\n• "miembros" — lista del grupo\n• "último" — actividad reciente`;
  } catch (err) {
    console.error('QVAC queryLedger error:', err.message);
    return 'Error procesando la consulta. Intenta de nuevo.';
  }
}

export {
  parseReceipt,
  queryLedger,
  initOCR,
  categorizeExpense,
};
