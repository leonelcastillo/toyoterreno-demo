'use strict';
// Toyo Terreno — inventario tipo chat. Pensado para que sea muy fácil: botones grandes, preguntas de a una.

const $ = s => document.querySelector(s);
const chat = $('#chat'), panel = $('#panel'), entrada = $('#entrada');
const guardado = {
  leer(k) { try { return localStorage.getItem(k); } catch { return null; } },
  poner(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let sesion = (() => { try { return JSON.parse(guardado.leer('tt-sesion')); } catch { return null; } })();
let vozActiva = guardado.leer('tt-voz') === '1';
let ultimoN = 0, ultimoDia = '';
const vistos = new Set();
const esAdmin = () => sesion?.rol === 'admin';

// ---------------- utilidades ----------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formato = s => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
const dinero = n => '$' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const hoyStr = (d = new Date()) => d.toLocaleDateString('sv-SE');
const enc = encodeURIComponent;
class Cancelado extends Error {}

async function api(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sesion?.token || '') }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  } catch { throw new Error('No hay conexión con la computadora de la tienda. Revisa el Wi-Fi.'); }
  if (r.status === 401 && ruta !== '/api/entrar') { cerrarSesion(); throw new Cancelado(); }
  const d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(d.error || 'Algo falló');
  return d;
}

// ---------------- voz ----------------
function hablar(t) {
  if (!('speechSynthesis' in window)) return;
  const limpio = t.replace(/\*/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, '').replace(/\$/g, ' dólares ');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(limpio);
  u.lang = 'es-ES';
  const v = speechSynthesis.getVoices().find(v => /^es(-|_)(VE|419|MX|US|CO)/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^es/i.test(v.lang));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
function pintarVoz() { $('#b-voz').textContent = vozActiva ? '🔊' : '🔈'; $('#b-voz').title = vozActiva ? 'Leyendo en voz alta (tocar para apagar)' : 'Leer en voz alta'; }

// ---------------- mensajes ----------------
function etiquetaDia(d) {
  const h = hoyStr(), ay = hoyStr(new Date(Date.now() - 864e5));
  return d === h ? 'Hoy' : d === ay ? 'Ayer' : new Date(d + 'T12:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function htmlTarjeta(p, conCosto = false) {
  const c = Number(p.cantidad);
  const cls = c <= 0 ? 'cero' : c <= 2 ? 'poco' : '';
  const costo = conCosto ? ` · ${dinero(p.costo)} c/u` + (c > 0 ? ` · <span class="vale">${dinero(c * p.costo)}</span>` : '') : '';
  return `<span class="desc">${esc(p.descripcion)}</span>
    <span class="linea"><span><span class="codigo">${esc(p.codigo)}</span>${p.proveedor ? ' · ' + esc(p.proveedor) : ''}${costo}</span>
    <span class="quedan ${cls}">${c <= 0 ? 'Agotado' : 'Hay ' + c}</span></span>`;
}

function pintar(m) {
  if (vistos.has(m.id)) return;
  vistos.add(m.id);
  const t = m.t ? new Date(m.t) : new Date();
  const d = hoyStr(t);
  if (d !== ultimoDia) { ultimoDia = d; const s = document.createElement('div'); s.className = 'dia'; s.textContent = etiquetaDia(d); chat.append(s); }
  const div = document.createElement('div');
  div.className = 'msg ' + m.de + (m.productos?.length || m.facturas?.length ? ' ancho' : '');
  let h = '';
  if (m.de === 'bot') h += `<button class="hablar" aria-label="Escuchar">🔊</button>`;
  h += formato(m.texto);
  if (m.productos?.length) {
    h += '<div class="tarjetas">' + m.productos.map(p => `<button class="tarjeta" data-codigo="${esc(p.codigo)}">${htmlTarjeta(p)}</button>`).join('') + '</div>';
  }
  if (m.facturas?.length) {
    h += '<div class="tarjetas">' + m.facturas.map(f => `<div class="factura">🧾 <b>Factura ${esc(f.factura)}</b> · ${esc(f.proveedor || 'sin proveedor')} · ${esc(f.dia)}<ul>${f.items.map(i => `<li>${i.cantidad} × ${esc(i.descripcion)} <span class="codigo">${esc(i.codigo)}</span> a ${dinero(i.costo)}</li>`).join('')}</ul></div>`).join('') + '</div>';
  }
  if (m.deshacer) h += `<div class="mini"><button data-deshacer="${m.deshacer}">↩️ Me equivoqué</button></div>`;
  h += `<span class="hora">${t.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}</span>`;
  div.innerHTML = h;
  div.querySelector('.hablar')?.addEventListener('click', () => hablar(m.texto));
  const abajo = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 160;
  chat.append(div);
  if (abajo || m.de === 'yo' || m.propio) chat.scrollTop = chat.scrollHeight;
}

const porGuardar = [];
let temporizador = null;
function decir(de, texto, extra = {}) {
  const m = { id: nuevoId(), de, texto, t: new Date().toISOString(), ...extra };
  if (m.productos) m.productos = m.productos.map(p => ({ codigo: p.codigo, descripcion: p.descripcion, proveedor: p.proveedor, cantidad: p.cantidad }));
  pintar({ ...m, propio: true });
  porGuardar.push(m);
  clearTimeout(temporizador);
  temporizador = setTimeout(subirChat, 300);
  if (de === 'bot' && vozActiva) hablar(texto);
  return m;
}
const bot = (t, e) => decir('bot', t, e);
const yo = (t, e) => decir('yo', t, e);

async function subirChat() {
  if (!porGuardar.length) return;
  const lote = porGuardar.splice(0);
  try { await api('POST', '/api/chat', { mensajes: lote }); }
  catch { porGuardar.unshift(...lote); clearTimeout(temporizador); temporizador = setTimeout(subirChat, 5000); }
}

async function traerChat() {
  try {
    const l = await api('GET', '/api/chat?desde=' + ultimoN);
    for (const m of l) { pintar(m); ultimoN = Math.max(ultimoN, m.n); }
    $('#subtitulo').textContent = sesion ? `en línea · ${sesion.nombre}` : 'en línea';
    return true;
  } catch (e) {
    if (!(e instanceof Cancelado)) $('#subtitulo').textContent = '⚠️ sin conexión';
    return false;
  }
}

// ---------------- esperar respuestas ----------------
let pendiente = null;
function esperar(acepta) {
  return new Promise((resolve, reject) => {
    pendiente = { acepta, resolve: v => { pendiente = null; resolve(v); }, reject: e => { pendiente = null; reject(e); } };
  });
}
function entregar(tipo, valor) {
  if (pendiente?.acepta[tipo]) { pendiente.resolve({ tipo, valor }); return true; }
  return false;
}
function cancelarTodo() {
  if (pendiente) pendiente.reject(new Cancelado());
  panel.innerHTML = '';
  entrada.placeholder = 'Escribe aquí…';
  entrada.inputMode = 'text';
}

// Muestra botones de respuesta en el panel. opciones: [{valor, texto, clase}]
function mostrarPanel({ opciones = [], chips = [], cancelar = true, contador = null } = {}) {
  panel.innerHTML = '';
  if (contador) panel.append(contador);
  if (chips.length) {
    const c = document.createElement('div'); c.className = 'chips';
    for (const o of chips) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.texto; b.onclick = () => { yo(o.eco ?? o.texto); entregar('opcion', o.valor); }; c.append(b); }
    panel.append(c);
  }
  if (opciones.length) {
    const c = document.createElement('div'); c.className = 'opciones';
    for (const o of opciones) { const b = document.createElement('button'); b.type = 'button'; b.className = o.clase || 'gris'; b.textContent = o.texto; b.onclick = () => { if (o.eco !== null) yo(o.eco ?? o.texto); entregar('opcion', o.valor); }; c.append(b); }
    panel.append(c);
  }
  if (cancelar) { const b = document.createElement('button'); b.type = 'button'; b.className = 'cancelar'; b.textContent = '✖ Cancelar'; b.onclick = () => { yo('Cancelar'); cancelarTodo(); bot('Listo, lo dejamos así. 👍'); }; panel.append(b); }
  chat.scrollTop = chat.scrollHeight;
}

async function pedirTexto(placeholder, { chips = [], opciones = [], modo = 'text', teclado = true } = {}) {
  mostrarPanel({ chips, opciones });
  entrada.placeholder = placeholder; entrada.inputMode = modo;
  if (teclado) entrada.focus();
  try { return (await esperar({ texto: true, opcion: true })).valor; }
  finally { panel.innerHTML = ''; entrada.placeholder = 'Escribe aquí…'; entrada.inputMode = 'text'; }
}

async function elegir(opciones, chips = []) {
  entrada.blur();
  mostrarPanel({ opciones, chips });
  try { return (await esperar({ opcion: true })).valor; } finally { panel.innerHTML = ''; }
}

const confirmar = async pregunta => {
  bot(pregunta);
  return await elegir([{ valor: false, texto: '❌ NO', clase: 'rojo' }, { valor: true, texto: '✅ SÍ', clase: 'verde' }]);
};

async function pedirNumero(pregunta, { inicial = 1, min = 1, max = Infinity } = {}) {
  bot(pregunta);
  entrada.blur();
  let n = inicial;
  const caja = document.createElement('div');
  caja.innerHTML = `<div class="contador"><button type="button" class="gris" data-d="-1" aria-label="Menos">−</button><output>${n}</output><button type="button" class="gris" data-d="1" aria-label="Más">+</button></div>`;
  const out = caja.querySelector('output');
  caja.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { n = Math.max(min, Math.min(max, n + Number(b.dataset.d))); out.textContent = n; });
  const rapidos = [1, 2, 3, 4, 5, 10].filter(x => x >= min && x <= max);
  mostrarPanel({ contador: caja, chips: rapidos.map(x => ({ valor: x, texto: String(x) })), opciones: [{ valor: 'listo', texto: '✅ LISTO', clase: 'verde', eco: null }] });
  entrada.placeholder = 'o escribe el número…'; entrada.inputMode = 'numeric';
  try {
    while (true) {
      const r = await esperar({ texto: true, opcion: true });
      if (r.tipo === 'opcion') { if (r.valor === 'listo') { yo(String(n)); return n; } return r.valor; }
      const x = Number(String(r.valor).replace(',', '.'));
      if (Number.isInteger(x) && x >= min && x <= max) return x;
      bot(x > max ? `Solo hay ${max}. Escribe un número más pequeño.` : 'Escribe solo un número entero, por ejemplo *2*.');
    }
  } finally { panel.innerHTML = ''; entrada.placeholder = 'Escribe aquí…'; entrada.inputMode = 'text'; }
}

async function pedirDinero(pregunta, anterior) {
  bot(pregunta);
  const chips = anterior > 0 ? [{ valor: anterior, texto: `Igual que antes: ${dinero(anterior)}` }] : [];
  while (true) {
    const v = await pedirTexto('Ejemplo: 12.50', { chips, modo: 'decimal' });
    const x = typeof v === 'number' ? v : Number(String(v).replace(/[$\s]/g, '').replace(',', '.'));
    if (Number.isFinite(x) && x >= 0) return Math.round(x * 100) / 100;
    bot('Escribe solo el número, por ejemplo *12.50*.');
  }
}

async function elegirProducto(pregunta, { permitirNuevo = false, proveedor = '' } = {}) {
  bot(pregunta);
  while (true) {
    mostrarPanel({ chips: permitirNuevo ? [{ valor: 'nuevo', texto: '➕ Es un producto nuevo' }] : [] });
    entrada.placeholder = 'Código o nombre…'; entrada.focus();
    let r;
    try { r = await esperar({ texto: true, producto: true, opcion: true }); }
    finally { panel.innerHTML = ''; entrada.placeholder = 'Escribe aquí…'; }
    if (r.tipo === 'producto') return r.valor;
    if (r.tipo === 'opcion') { const p = await flujoNuevo({ proveedor, desdeCompra: true }); if (p) return p; bot(pregunta); continue; }
    const res = await api('GET', `/api/buscar?q=${enc(r.valor)}&limite=8`);
    if (!res.productos.length) { bot(`No encontré nada con "${r.valor}" 😕\nPrueba con otra palabra o con el código.`); continue; }
    bot((res.productos.length === 1 ? 'Encontré este.' : `Encontré ${res.total}.`) + ' *Toca el correcto* 👇' + (res.total > 8 ? '\n(Si no está, escribe más palabras.)' : ''), { productos: res.productos });
  }
}

// ---------------- flujos ----------------
let enFlujo = false;
async function correr(flujo, ...args) {
  cancelarTodo();
  await Promise.resolve();
  enFlujo = true;
  try { await flujo(...args); }
  catch (e) { if (!(e instanceof Cancelado)) bot('😕 ' + e.message); }
  finally { if (!pendiente) { enFlujo = false; panel.innerHTML = ''; } }
}

async function flujoVenta(prod) {
  if (!prod) prod = await elegirProducto('🛒 ¿Qué vendiste?\nEscribe el *código* o el *nombre*.');
  prod = await api('GET', '/api/producto/' + enc(prod.codigo));
  if (prod.cantidad <= 0) { bot(`⚠️ De *${prod.descripcion}* no queda ninguno en el sistema.\nAvísale al jefe.`, { productos: [prod] }); return; }
  const n = await pedirNumero(`¿Cuántos *${prod.descripcion}* vendiste?`, { max: prod.cantidad });
  if (!(await confirmar(`Vendiste *${n}* × ${prod.descripcion}.\n¿Está bien?`))) return bot('Listo, no anoté nada. 👍');
  const r = await api('POST', '/api/venta', { codigo: prod.codigo, cantidad: n });
  const q = r.producto.cantidad;
  bot(`✅ ¡Venta anotada!\nQuedan *${q}* de ${prod.descripcion}.` + (q === 0 ? '\n⚠️ Se acabó. Avísale al jefe.' : q <= 2 ? '\n⚠️ Quedan pocos. Avísale al jefe.' : ''), { deshacer: r.movimiento.id });
}

async function flujoCompra(prodInicial) {
  bot('📦 Vamos a anotar lo que llegó.\n¿Cuál es el *número de la factura*?');
  const f = await pedirTexto('Número de factura…', { chips: [{ valor: '', texto: 'No tiene factura' }] });
  const provs = await api('GET', '/api/proveedores');
  bot('¿Quién la mandó? (el *proveedor*)');
  const proveedor = await pedirTexto('Nombre del proveedor…', { chips: provs.slice(0, 6).map(p => ({ valor: p, texto: p })) });
  const items = [];
  let prod = prodInicial;
  while (true) {
    if (!prod) prod = await elegirProducto(items.length ? '¿Qué *otro* producto llegó?' : '¿Qué llegó? Escribe el *código* o el *nombre*.', { permitirNuevo: true, proveedor });
    const n = await pedirNumero(`¿Cuántos *${prod.descripcion}* llegaron?`);
    const costo = await pedirDinero(`¿Cuánto *costó cada uno*? 💲`, prod.costo);
    items.push({ codigo: prod.codigo, descripcion: prod.descripcion, cantidad: n, costo });
    const lista = items.map(i => `• ${i.cantidad} × ${i.descripcion} a ${dinero(i.costo)}`).join('\n');
    bot(`📝 Factura ${f || '(sin número)'} · ${proveedor}\n${lista}\n\n¿Llegó algo más?`);
    const mas = await elegir([{ valor: true, texto: '➕ SÍ, OTRO', clase: 'azul' }, { valor: false, texto: '✅ NO, TERMINAR', clase: 'verde' }]);
    if (!mas) break;
    prod = null;
  }
  const total = items.reduce((s, i) => s + i.cantidad * i.costo, 0);
  if (!(await confirmar(`Total de la factura: *${dinero(total)}*\n¿Lo guardo?`))) return bot('Listo, no anoté nada. 👍');
  const r = await api('POST', '/api/compra', { factura: f, proveedor, items });
  bot(`✅ ¡Factura anotada!\n` + r.items.map(i => `• ${i.producto.descripcion}: ahora hay *${i.producto.cantidad}*`).join('\n'), { deshacer: r.items[0].movimiento.id });
}

async function flujoNuevo({ proveedor = '', desdeCompra = false } = {}) {
  bot('➕ Producto nuevo.\n¿Cuál es el *código*?');
  const codigo = String(await pedirTexto('Código…')).trim().toUpperCase();
  if (!codigo) { bot('El código no puede estar vacío.'); return null; }
  try {
    const existe = await api('GET', '/api/producto/' + enc(codigo));
    bot('Ese código ya existe 👇', { productos: [existe] });
    return desdeCompra ? existe : null;
  } catch (e) { if (e instanceof Cancelado) throw e; }
  bot('¿Cómo se llama? Escribe la *descripción*.\nPor ejemplo: Filtro de aceite Hilux 2.7');
  const descripcion = await pedirTexto('Descripción…');
  if (!proveedor) {
    const provs = await api('GET', '/api/proveedores');
    bot('¿Quién es el *proveedor*?');
    proveedor = await pedirTexto('Proveedor…', { chips: [...provs.slice(0, 6).map(p => ({ valor: p, texto: p })), { valor: '', texto: 'No sé' }] });
  }
  if (desdeCompra) {
    const r = await api('POST', '/api/productos', { codigo, descripcion, proveedor, cantidad: 0, costo: 0 });
    bot('✅ Producto creado. Ahora anotamos cuántos llegaron.', { productos: [r.producto] });
    return r.producto;
  }
  const cantidad = await pedirNumero('¿Cuántos hay ahora en la tienda?', { inicial: 1, min: 0 });
  const costo = await pedirDinero('¿Cuánto *costó cada uno*? 💲', 0);
  if (!(await confirmar(`Voy a guardar:\n*${descripcion}*\nCódigo: ${codigo}\nProveedor: ${proveedor || '—'}\nCantidad: ${cantidad}\nCosto: ${dinero(costo)}\n¿Está bien?`))) { bot('Listo, no guardé nada. 👍'); return null; }
  const r = await api('POST', '/api/productos', { codigo, descripcion, proveedor, cantidad, costo });
  bot('✅ ¡Producto guardado!', { productos: [r.producto] });
  return r.producto;
}

async function buscarYMostrar(q) {
  const res = await api('GET', `/api/buscar?q=${enc(q)}&limite=10`);
  if (!res.productos.length && !res.facturas.length) return bot(`No encontré nada con "${q}" 😕\nPrueba con otra palabra, con el código o con el proveedor.`);
  let t = res.especial === 'poco' ? `⚠️ Se están acabando (${res.total}):` : res.productos.length ? `🔍 Encontré ${res.total}${res.aproximado ? ' parecidos' : ''}:` : '🔍 Encontré estas facturas:';
  if (res.total > 10) t += '\n(Te muestro 10. Escribe más palabras para afinar.)';
  if (res.productos.length) t += '\nToca uno para vender o anotar que llegó.';
  bot(t, { productos: res.productos, facturas: res.facturas });
}

async function menuProducto(codigo) {
  const p = await api('GET', '/api/producto/' + enc(codigo));
  bot(`*${p.descripcion}*\nHay ${p.cantidad}. ¿Qué quieres hacer?`);
  const ops = [{ valor: 'venta', texto: '🛒 VENDÍ', clase: 'verde' }, { valor: 'compra', texto: '📦 LLEGÓ', clase: 'azul' }];
  if (esAdmin()) ops.push({ valor: 'editar', texto: '✏️ CORREGIR', clase: 'naranja' });
  const v = await elegir(ops);
  if (v === 'venta') return flujoVenta(p);
  if (v === 'compra') return flujoCompra(p);
  if (v === 'editar') { const n = await editarProducto(p); if (n) bot('✏️ Corregido.', { productos: [n] }); }
}

async function flujoDeshacer(id) {
  if (!(await confirmar('¿Quieres *borrar* ese registro?\nEl inventario vuelve a como estaba antes.'))) return bot('Listo, no borré nada. 👍');
  await api('POST', '/api/deshacer/' + id);
  bot('↩️ Listo, lo borré. El inventario quedó como antes.');
}

async function mostrarValor() {
  const v = await api('GET', '/api/valor');
  let t = `💰 *Tu inventario cuesta ${miles(v.valor)}*\n${v.piezas} piezas · ${v.productos} productos` + (v.agotados ? ` · ${v.agotados} agotados` : '');
  if (v.porProveedor.length > 1) t += '\n\n*Por proveedor:*\n' + v.porProveedor.slice(0, 8).map(p => `• ${p.proveedor}: ${miles(p.valor)} (${Math.round(p.parte)}%)`).join('\n');
  if (v.masValiosos.length) t += '\n\n*Lo que más vale:*\n' + v.masValiosos.slice(0, 5).map(p => `• ${p.descripcion}: ${p.cantidad} × ${dinero(p.costo)} = ${miles(p.valor)}`).join('\n');
  if (v.sinCosto) t += `\n\n⚠️ ${v.sinCosto} con existencia pero sin costo: no suman.`;
  bot(t);
}

async function mostrarHoy() {
  const r = await api('GET', '/api/hoy');
  let t = `📊 *Lo de hoy*\n\n🛒 Vendido: *${r.piezasVendidas}* piezas\n`;
  t += r.ventas.length ? r.ventas.map(v => `• ${v.cantidad} × ${v.descripcion}`).join('\n') : '• Nada todavía';
  t += `\n\n📦 Llegó: *${r.piezasCompradas}* piezas\n`;
  t += r.compras.length ? r.compras.map(v => `• ${v.cantidad} × ${v.descripcion}`).join('\n') : '• Nada todavía';
  if (r.facturas.length) t += '\n\n🧾 Facturas: ' + r.facturas.join(', ');
  if (esAdmin()) {
    const v = await api('GET', '/api/valor');
    t += `\n\n💲 Costo de lo vendido: ${dinero(r.costoVendido)}\n💲 Costo de lo que llegó: ${dinero(r.costoComprado)}\n\n💰 *El inventario cuesta ${miles(v.valor)}* (${v.piezas} piezas)`;
  }
  bot(t);
}

// ---------------- inventario ----------------
let invPoco = false, invValor = false, invTimer = null;
const miles = dinero;

function htmlValor(v, filtro) {
  const max = v.porProveedor[0]?.valor || 1;
  return `<div class="valor">
    <div class="etq">💰 Tu inventario cuesta</div>
    <div class="total">${miles(v.valor)}</div>
    <div class="det">${v.piezas} piezas · ${v.productos} productos${v.agotados ? ` · ${v.agotados} agotados` : ''}</div>
    ${filtro ? `<div class="det">Lo que se ve abajo (${esc(filtro.texto)}): <b>${miles(filtro.valor)}</b></div>` : ''}
    ${v.sinCosto ? `<div class="aviso">⚠️ ${v.sinCosto} producto${v.sinCosto > 1 ? 's tienen' : ' tiene'} existencia pero costo $0: no suman. Corrígelos para que el total sea real.</div>` : ''}
    ${v.porProveedor.length ? `<details><summary>Por proveedor</summary>${v.porProveedor.map(p => `
      <button class="prov" data-prov="${esc(p.proveedor === 'Sin proveedor' ? '' : p.proveedor)}"><span class="fila"><span>${esc(p.proveedor)} <small style="color:var(--suave)">· ${p.piezas} pzs</small></span><b>${miles(p.valor)} · ${Math.round(p.parte)}%</b></span>
      <span class="barra"><i style="width:${Math.max(1, p.valor / max * 100)}%"></i></span></button>`).join('')}</details>` : ''}
  </div>`;
}

async function abrirInventario() {
  $('#app').hidden = true; $('#inventario').hidden = false;
  $('#b-csv').hidden = !esAdmin();
  $('#inv-orden').hidden = !esAdmin();
  await pintarInventario();
}
async function pintarInventario() {
  const q = $('#inv-buscar').value.trim();
  const lista = $('#inv-lista');
  try {
    const inv = await api('GET', '/api/inventario');
    $('#inv-resumen').textContent = `${inv.valor.productos} productos · ${inv.valor.piezas} piezas` + (esAdmin() ? ` · ${miles(inv.valor.valor)}` : '') + (inv.valor.agotados ? ` · ${inv.valor.agotados} agotados` : '');
    let ps = inv.productos;
    if (q || invPoco) ps = (await api('GET', `/api/buscar?q=${enc(invPoco && !q ? 'poco' : q)}&limite=500`)).productos;
    if (invPoco) ps = ps.filter(p => p.cantidad <= 2);
    if (invValor) ps = [...ps].sort((a, b) => b.cantidad * b.costo - a.cantidad * a.costo);
    const filtrado = q || invPoco ? { texto: [q, invPoco && 'poco stock'].filter(Boolean).join(', '), valor: ps.reduce((s, p) => s + p.cantidad * p.costo, 0) } : null;
    const cabeza = esAdmin() && inv.productos.length ? htmlValor(inv.valor, filtrado) : '';
    if (!ps.length) { lista.innerHTML = cabeza + `<p class="vacio">${inv.productos.length ? 'No encontré nada 😕' : 'Todavía no hay productos.<br>Usa ➕ NUEVO en el chat.'}</p>`; return; }
    lista.innerHTML = cabeza + ps.slice(0, 400).map(p => `<button class="tarjeta${esAdmin() ? ' editable' : ''}" data-codigo="${esc(p.codigo)}">${htmlTarjeta(p, esAdmin())}</button>`).join('') + (ps.length > 400 ? '<p class="vacio">Hay más. Escribe para buscar.</p>' : '');
  } catch (e) { if (!(e instanceof Cancelado)) lista.innerHTML = `<p class="vacio">😕 ${esc(e.message)}</p>`; }
}

function editarProducto(p) {
  const dlg = $('#editar'), f = $('#form-editar');
  $('#ed-titulo').textContent = `✏️ ${p.codigo}`;
  f.descripcion.value = p.descripcion; f.proveedor.value = p.proveedor || ''; f.cantidad.value = p.cantidad; f.costo.value = p.costo;
  dlg.showModal();
  return new Promise(ok => {
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'guardar') return ok(null);
      try { ok((await api('PUT', '/api/productos/' + enc(p.codigo), { descripcion: f.descripcion.value, proveedor: f.proveedor.value, cantidad: f.cantidad.value, costo: f.costo.value })).producto); }
      catch (e) { alert(e.message); ok(null); }
    };
  });
}

async function descargarCSV() {
  const r = await fetch('/api/exportar', { headers: { Authorization: 'Bearer ' + sesion.token } });
  if (!r.ok) return alert('No se pudo descargar');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = `inventario-${hoyStr()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- sesión ----------------
function cerrarSesion() {
  sesion = null; guardado.poner('tt-sesion', null);
  cancelarTodo();
  chat.innerHTML = ''; vistos.clear(); ultimoN = 0; ultimoDia = '';
  $('#app').hidden = true; $('#inventario').hidden = true; $('#entrar').hidden = false;
}

async function iniciarApp() {
  $('#entrar').hidden = true; $('#inventario').hidden = true; $('#app').hidden = false;
  await traerChat();
  if (!vistos.size) {
    bot(`¡Hola, ${sesion.nombre}! 👋\n\nToca un botón de abajo:\n🛒 *VENDÍ* cuando vendas algo.\n📦 *LLEGÓ* cuando llegue mercancía.\n🔍 *BUSCAR* para ver si hay algo.\n➕ *NUEVO* para un producto que no está.\n\nTambién puedes escribir el nombre o el código de un repuesto para buscarlo.`);
  }
  chat.scrollTop = chat.scrollHeight;
}

// ---------------- eventos ----------------
$('#form-entrar').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, err = $('#error-entrar');
  err.textContent = '';
  try {
    sesion = await api('POST', '/api/entrar', { usuario: f.usuario.value, clave: f.clave.value });
    guardado.poner('tt-sesion', JSON.stringify(sesion));
    f.clave.value = '';
    iniciarApp();
  } catch (e) { err.textContent = e.message; }
});

$('#barra').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = entrada.value.trim();
  if (!t) return;
  entrada.value = '';
  yo(t);
  if (entregar('texto', t)) return;
  if (esAdmin() && /^(valor|cu[aá]nto (vale|cuesta)|capital|total)\b/i.test(t)) return correr(mostrarValor);
  buscarYMostrar(t).catch(e => { if (!(e instanceof Cancelado)) bot('😕 ' + e.message); });
});

chat.addEventListener('click', async ev => {
  const tar = ev.target.closest('.tarjeta');
  if (tar) {
    const codigo = tar.dataset.codigo;
    if (pendiente?.acepta.producto) {
      try { const p = await api('GET', '/api/producto/' + enc(codigo)); yo('👉 ' + p.descripcion); entregar('producto', p); }
      catch (e) { if (!(e instanceof Cancelado)) bot('😕 ' + e.message); }
    } else correr(menuProducto, codigo);
    return;
  }
  const d = ev.target.closest('[data-deshacer]');
  if (d) correr(flujoDeshacer, Number(d.dataset.deshacer));
});

document.querySelectorAll('[data-accion]').forEach(b => b.addEventListener('click', () => {
  const a = b.dataset.accion;
  if (a === 'venta') correr(flujoVenta);
  else if (a === 'compra') correr(flujoCompra);
  else if (a === 'nuevo') correr(flujoNuevo);
  else { cancelarTodo(); bot('🔍 ¿Qué buscas?\nEscribe el *código*, el *nombre* o el *proveedor*.\nEscribe *poco* para ver lo que se está acabando.'); entrada.focus(); }
}));

$('#b-hoy').onclick = () => correr(mostrarHoy);
$('#b-inv').onclick = abrirInventario;
$('#b-volver').onclick = () => { $('#inventario').hidden = true; $('#app').hidden = false; chat.scrollTop = chat.scrollHeight; };
$('#b-csv').onclick = descargarCSV;
$('#b-salir').onclick = async () => { if (!confirm('¿Salir de la cuenta?')) return; try { await api('POST', '/api/salir'); } catch {} cerrarSesion(); };
$('#b-voz').onclick = () => { vozActiva = !vozActiva; guardado.poner('tt-voz', vozActiva ? '1' : '0'); pintarVoz(); if (vozActiva) hablar('Listo, te leo los mensajes.'); else speechSynthesis?.cancel(); };
$('#inv-buscar').addEventListener('input', () => { clearTimeout(invTimer); invTimer = setTimeout(pintarInventario, 220); });
$('#inv-poco').onclick = () => { invPoco = !invPoco; $('#inv-poco').classList.toggle('activo', invPoco); pintarInventario(); };
$('#inv-orden').onclick = () => { invValor = !invValor; $('#inv-orden').classList.toggle('activo', invValor); pintarInventario(); };
$('#inv-lista').addEventListener('click', async ev => {
  const pv = ev.target.closest('[data-prov]');
  if (pv) { if (pv.dataset.prov) { $('#inv-buscar').value = 'prov: ' + pv.dataset.prov; pintarInventario(); } return; }
  const t = ev.target.closest('.tarjeta');
  if (!t || !esAdmin()) return;
  const p = await api('GET', '/api/producto/' + enc(t.dataset.codigo));
  if (await editarProducto(p)) pintarInventario();
});

// Sincronizar con el otro aparato (teléfono ↔ PC)
setInterval(() => { if (sesion && !document.hidden && !$('#app').hidden) traerChat(); }, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && sesion) traerChat(); });

pintarVoz();
(async () => {
  if (!sesion) { $('#entrar').hidden = false; return; }
  try { const yo_ = await api('GET', '/api/yo'); sesion = { ...sesion, ...yo_ }; iniciarApp(); }
  catch (e) { if (e instanceof Cancelado) return; $('#entrar').hidden = false; $('#error-entrar').textContent = e.message; }
})();
