// Generado por construir-demo.js desde lib/datos.js. No editar.
window.TTMotor = (() => {
// Inventario, ventas, compras, búsqueda y chat. Todo vive en datos/inventario.json.
// Lo que está entre <almacen> y </almacen> es lo único que toca el disco: construir-demo.js lo cambia
// por localStorage para la demo web (GitHub Pages).
let db = window.__ttCargar();
function guardar() { window.__ttGuardar(db); }


// ---------- utilidades ----------
function hoy(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
class ErrorAmable extends Error {} // mensajes que se le muestran tal cual al usuario

const codigoOk = c => String(c ?? '').trim().toUpperCase();
const numero = (v, nombre, { entero = false, min = 0 } = {}) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErrorAmable(`${nombre}: no es un número`);
  if (entero && !Number.isInteger(n)) throw new ErrorAmable(`${nombre}: tiene que ser un número entero`);
  if (n < min) throw new ErrorAmable(`${nombre}: no puede ser menor que ${min}`);
  return Math.round(n * 100) / 100;
};
const texto = (v, nombre, max = 200) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw new ErrorAmable(`Falta ${nombre}`);
  return s.slice(0, max);
};

function mov(m) {
  const x = { id: db.sig++, fecha: new Date().toISOString(), dia: hoy(), ...m };
  db.movimientos.push(x);
  return x;
}

// ---------- productos ----------
const producto = c => db.productos.find(p => p.codigo === codigoOk(c)) || null;
const productos = () => [...db.productos].sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
const proveedores = () => {
  const cuenta = new Map();
  for (const p of db.productos) if (p.proveedor) cuenta.set(p.proveedor, (cuenta.get(p.proveedor) || 0) + 1);
  for (const m of db.movimientos) if (m.tipo === 'compra' && m.proveedor) cuenta.set(m.proveedor, (cuenta.get(m.proveedor) || 0) + 3);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
};

function crearProducto(d, usuario) {
  const codigo = codigoOk(texto(d.codigo, 'el código', 40));
  if (producto(codigo)) throw new ErrorAmable(`Ya existe un producto con el código ${codigo}`);
  const p = {
    codigo,
    descripcion: texto(d.descripcion, 'la descripción'),
    proveedor: String(d.proveedor ?? '').trim().slice(0, 80),
    cantidad: numero(d.cantidad ?? 0, 'Cantidad', { entero: true }),
    costo: numero(d.costo ?? 0, 'Costo'),
    creado: new Date().toISOString(),
  };
  db.productos.push(p);
  const m = mov({ tipo: 'nuevo', codigo, descripcion: p.descripcion, cantidad: p.cantidad, costo: p.costo, proveedor: p.proveedor, usuario });
  guardar();
  return { producto: p, movimiento: m };
}

function editarProducto(c, cambios, usuario) {
  const p = producto(c);
  if (!p) throw new ErrorAmable('No existe ese producto');
  const antes = { ...p };
  if (cambios.descripcion !== undefined) p.descripcion = texto(cambios.descripcion, 'la descripción');
  if (cambios.proveedor !== undefined) p.proveedor = String(cambios.proveedor).trim().slice(0, 80);
  if (cambios.costo !== undefined) p.costo = numero(cambios.costo, 'Costo');
  if (cambios.cantidad !== undefined) p.cantidad = numero(cambios.cantidad, 'Cantidad', { entero: true });
  const m = mov({ tipo: 'ajuste', codigo: p.codigo, descripcion: p.descripcion, cantidad: p.cantidad - antes.cantidad, antes, usuario });
  guardar();
  return { producto: p, movimiento: m };
}

// ---------- ventas y compras ----------
function vender(d, usuario) {
  const p = producto(d.codigo);
  if (!p) throw new ErrorAmable(`No encontré el código ${codigoOk(d.codigo)}`);
  const n = numero(d.cantidad, 'Cantidad', { entero: true, min: 1 });
  if (n > p.cantidad) throw new ErrorAmable(`Solo quedan ${p.cantidad} de ${p.descripcion}. Revisa o avisa al jefe.`);
  p.cantidad -= n;
  const m = mov({ tipo: 'venta', codigo: p.codigo, descripcion: p.descripcion, cantidad: n, costo: p.costo, nota: String(d.nota ?? '').slice(0, 200), usuario });
  guardar();
  return { producto: p, movimiento: m };
}

function comprar(d, usuario) {
  const items = Array.isArray(d.items) ? d.items : [];
  if (!items.length) throw new ErrorAmable('La factura no tiene productos');
  const factura = String(d.factura ?? '').trim().slice(0, 40) || 'SIN FACTURA';
  const proveedor = String(d.proveedor ?? '').trim().slice(0, 80);
  // validar todo antes de tocar nada
  const limpios = items.map((it, i) => {
    const codigo = codigoOk(texto(it.codigo, `el código (línea ${i + 1})`, 40));
    const cantidad = numero(it.cantidad, `Cantidad (línea ${i + 1})`, { entero: true, min: 1 });
    const existe = producto(codigo);
    const costo = it.costo === undefined || it.costo === '' ? (existe?.costo ?? 0) : numero(it.costo, `Costo (línea ${i + 1})`);
    if (!existe && !String(it.descripcion ?? '').trim()) throw new ErrorAmable(`El código ${codigo} no existe: falta su descripción`);
    return { codigo, cantidad, costo, descripcion: it.descripcion, existe };
  });
  const grupo = crypto.randomUUID().slice(0, 8);
  const hechos = [];
  for (const it of limpios) {
    let p = producto(it.codigo);
    if (!p) {
      p = { codigo: it.codigo, descripcion: texto(it.descripcion, 'la descripción'), proveedor, cantidad: 0, costo: it.costo, creado: new Date().toISOString() };
      db.productos.push(p);
      mov({ tipo: 'nuevo', codigo: p.codigo, descripcion: p.descripcion, cantidad: 0, costo: p.costo, proveedor, usuario });
    }
    p.cantidad += it.cantidad;
    p.costo = it.costo;
    if (proveedor && !p.proveedor) p.proveedor = proveedor;
    hechos.push({ producto: p, movimiento: mov({ tipo: 'compra', grupo, factura, proveedor, codigo: p.codigo, descripcion: p.descripcion, cantidad: it.cantidad, costo: it.costo, usuario }) });
  }
  guardar();
  return { factura, proveedor, grupo, items: hechos, total: Math.round(hechos.reduce((s, h) => s + h.movimiento.cantidad * h.movimiento.costo, 0) * 100) / 100 };
}

// Deshacer: la persona puede deshacer lo suyo durante 30 minutos; el admin, cualquier cosa.
function deshacer(id, usuario, esAdmin) {
  const m = db.movimientos.find(x => x.id === Number(id));
  if (!m) throw new ErrorAmable('No encontré ese registro');
  if (m.deshecho) throw new ErrorAmable('Eso ya estaba borrado');
  if (!esAdmin && (m.usuario !== usuario || Date.now() - Date.parse(m.fecha) > 30 * 60e3))
    throw new ErrorAmable('Ya pasó mucho tiempo. Pídele al jefe que lo corrija.');
  const grupo = m.tipo === 'compra' ? db.movimientos.filter(x => x.grupo === m.grupo && !x.deshecho) : [m];
  for (const x of grupo) {
    const p = producto(x.codigo);
    if (!p) continue;
    if (x.tipo === 'venta') p.cantidad += x.cantidad;
    else if (x.tipo === 'compra') {
      if (p.cantidad < x.cantidad) throw new ErrorAmable(`No puedo deshacer: de ${p.descripcion} ya se vendió parte`);
    } else if (x.tipo === 'ajuste') { Object.assign(p, x.antes); }
    else if (x.tipo === 'nuevo') throw new ErrorAmable('Para borrar un producto nuevo, pídeselo al jefe');
  }
  for (const x of grupo) {
    const p = producto(x.codigo);
    if (p && x.tipo === 'compra') p.cantidad -= x.cantidad;
    x.deshecho = { fecha: new Date().toISOString(), usuario };
  }
  guardar();
  return { deshechos: grupo.length, tipo: m.tipo };
}

// ---------- consultas ----------
function movimientos({ dia, desde, hasta, codigo, tipo, factura, limite = 100 } = {}) {
  let l = db.movimientos.filter(m => !m.deshecho);
  if (dia) l = l.filter(m => m.dia === dia);
  if (desde) l = l.filter(m => m.dia >= desde);
  if (hasta) l = l.filter(m => m.dia <= hasta);
  if (codigo) l = l.filter(m => m.codigo === codigoOk(codigo));
  if (tipo) l = l.filter(m => m.tipo === tipo);
  if (factura) { const f = compacto(factura); l = l.filter(m => m.factura && compacto(m.factura).includes(f)); }
  return l.slice(-limite).reverse();
}

function resumen(dia = hoy()) {
  const l = movimientos({ dia, limite: 1e9 });
  const sumar = tipo => {
    const mapa = new Map();
    for (const m of l.filter(x => x.tipo === tipo)) {
      const a = mapa.get(m.codigo) || { codigo: m.codigo, descripcion: m.descripcion, cantidad: 0, costo: 0 };
      a.cantidad += m.cantidad; a.costo += m.cantidad * (m.costo || 0);
      mapa.set(m.codigo, a);
    }
    return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad);
  };
  const ventas = sumar('venta'), compras = sumar('compra');
  const facturas = [...new Set(l.filter(m => m.tipo === 'compra').map(m => `${m.factura} · ${m.proveedor || 'sin proveedor'}`))];
  return {
    dia, ventas, compras, facturas,
    piezasVendidas: ventas.reduce((s, v) => s + v.cantidad, 0),
    piezasCompradas: compras.reduce((s, v) => s + v.cantidad, 0),
    costoVendido: Math.round(ventas.reduce((s, v) => s + v.costo, 0) * 100) / 100,
    costoComprado: Math.round(compras.reduce((s, v) => s + v.costo, 0) * 100) / 100,
  };
}

const pocoStock = (max = 2) => productos().filter(p => p.cantidad <= max).sort((a, b) => a.cantidad - b.cantidad);
const r2 = n => Math.round(n * 100) / 100;
// Cuánto cuesta el inventario (cantidad × costo), con desglose por proveedor y los productos que más pesan.
const valorInventario = () => {
  const ps = db.productos;
  const valor = r2(ps.reduce((s, p) => s + p.cantidad * p.costo, 0));
  const prov = new Map();
  for (const p of ps) {
    const k = p.proveedor || 'Sin proveedor';
    const a = prov.get(k) || { proveedor: k, productos: 0, piezas: 0, valor: 0 };
    a.productos++; a.piezas += p.cantidad; a.valor += p.cantidad * p.costo;
    prov.set(k, a);
  }
  return {
    productos: ps.length,
    piezas: ps.reduce((s, p) => s + p.cantidad, 0),
    valor,
    agotados: ps.filter(p => p.cantidad <= 0).length,
    sinCosto: ps.filter(p => p.cantidad > 0 && !p.costo).length,
    porProveedor: [...prov.values()].map(a => ({ ...a, valor: r2(a.valor), parte: valor ? r2(a.valor / valor * 100) : 0 })).sort((a, b) => b.valor - a.valor),
    masValiosos: [...ps].filter(p => p.cantidad > 0).sort((a, b) => b.cantidad * b.costo - a.cantidad * a.costo).slice(0, 10)
      .map(p => ({ codigo: p.codigo, descripcion: p.descripcion, cantidad: p.cantidad, costo: p.costo, valor: r2(p.cantidad * p.costo) })),
  };
};

// ---------- búsqueda ----------
// Sin acentos, sin importar mayúsculas, guiones o espacios en el código, con errores de tipeo
// (una letra cambiada, de más, de menos o dos letras invertidas) y por pedazos de palabra.
const quitar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = s => quitar(s).split(/[^a-z0-9]+/).filter(Boolean);
const compacto = s => quitar(s).replace(/[^a-z0-9]/g, '');
const SINONIMOS = { amortiguador: ['amortiguadores', 'shock'], bujia: ['bujias'], pastilla: ['pastillas', 'freno'], correa: ['banda'], banda: ['correa'], aceite: ['lubricante'], filtro: ['filtros'], bomba: ['bombas'], empacadura: ['empaque', 'junta'], empaque: ['empacadura', 'junta'], rolinera: ['rodamiento', 'cojinete'], rodamiento: ['rolinera'], muneco: ['rotula'], rotula: ['muneco'], terminal: ['terminales'] };

function dist(a, b, max) { // Damerau (OSA) con corte
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let mejor = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      mejor = Math.min(mejor, d[i][j]);
    }
    if (mejor > max) return max + 1;
  }
  return d[a.length][b.length];
}

function puntajePalabra(t, ws, base) {
  let m = 0;
  const tol = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;
  for (const w of ws) {
    if (w === t) m = Math.max(m, base);
    else if (w.startsWith(t)) m = Math.max(m, base * 0.8);
    else if (t.length >= 3 && w.includes(t)) m = Math.max(m, base * 0.5);
    else if (tol && dist(w.slice(0, t.length + tol), t, tol) <= tol) m = Math.max(m, base * 0.4); // con error de tipeo (también al empezar)
  }
  return m;
}

function buscar(q, limite = 20) {
  const t = quitar(q).trim();
  if (!t) return { productos: [], facturas: [], total: 0, aproximado: false };
  if (/^(agotad|sin stock|sin existencia|poco|bajo|se (estan )?acab|faltan?)/.test(t))
    return { productos: pocoStock().slice(0, limite), facturas: [], total: pocoStock().length, aproximado: false, especial: 'poco' };

  // filtros escritos: "prov:toyota", "proveedor toyota"
  let resto = t, filtroProv = null;
  const mp = resto.match(/(?:prov(?:eedor)?\s*[:=]?\s*)([a-z0-9 ]+)$/);
  if (mp) { filtroProv = compacto(mp[1]); resto = resto.slice(0, mp.index).trim(); }

  const tokens = palabras(resto);
  const qc = compacto(resto);
  const res = [];
  for (const p of db.productos) {
    if (filtroProv && !compacto(p.proveedor).includes(filtroProv)) continue;
    const cc = compacto(p.codigo);
    let s = 0, todos = true, alguno = 0;
    if (qc) {
      if (cc === qc) s += 1000;
      else if (qc.length >= 2 && cc.startsWith(qc)) s += 400;
      else if (qc.length >= 3 && cc.includes(qc)) s += 250;
      else if (qc.length >= 5 && dist(cc, qc, 1) <= 1) s += 150;
    }
    const porCodigo = s;
    const pd = palabras(p.descripcion), pp = palabras(p.proveedor), pc = palabras(p.codigo);
    for (const tk of tokens) {
      let m = Math.max(puntajePalabra(tk, pd, 50), puntajePalabra(tk, pc, 45), puntajePalabra(tk, pp, 20));
      if (!m) for (const sin of SINONIMOS[tk] || []) m = Math.max(m, puntajePalabra(sin, pd, 30));
      if (m) { s += m; alguno++; } else todos = false;
    }
    if (!tokens.length && filtroProv) { res.push({ p, s: 1, completo: true }); continue; }
    if (porCodigo >= 150 || (tokens.length && todos)) res.push({ p, s, completo: true });
    else if (alguno) res.push({ p, s: s * (alguno / tokens.length) / 2, completo: false });
  }
  const completos = res.filter(r => r.completo);
  const lista = (completos.length ? completos : res)
    .sort((a, b) => b.s - a.s || a.p.descripcion.localeCompare(b.p.descripcion, 'es'));

  // facturas que coincidan con el texto
  const facturas = [];
  if (qc.length >= 2) {
    const vistos = new Set();
    for (const m of [...db.movimientos].reverse()) {
      if (m.tipo !== 'compra' || m.deshecho || vistos.has(m.grupo)) continue;
      if (compacto(m.factura).includes(qc) || (tokens.length && tokens.every(tk => compacto(m.proveedor).includes(tk)) && !completos.length)) {
        vistos.add(m.grupo);
        const its = db.movimientos.filter(x => x.grupo === m.grupo && !x.deshecho);
        facturas.push({ factura: m.factura, proveedor: m.proveedor, dia: m.dia, items: its.map(x => ({ codigo: x.codigo, descripcion: x.descripcion, cantidad: x.cantidad, costo: x.costo })) });
        if (facturas.length >= 5) break;
      }
    }
  }
  return { productos: lista.slice(0, limite).map(r => r.p), facturas, total: lista.length, aproximado: !completos.length && lista.length > 0 };
}

// ---------- chat (se guarda en el servidor para que teléfono y PC vean lo mismo) ----------
function chatLeer(usuario, desde = 0) {
  const l = db.chats[usuario] || [];
  return l.filter(m => m.n > desde).slice(-300);
}
function chatAgregar(usuario, mensajes) {
  const l = (db.chats[usuario] ||= []);
  const ids = new Set(l.map(m => m.id));
  let n = l.length ? l[l.length - 1].n : 0;
  for (const m of mensajes.slice(0, 50)) {
    if (!m || typeof m.id !== 'string' || ids.has(m.id)) continue;
    l.push({
      n: ++n, id: m.id.slice(0, 40), de: m.de === 'yo' ? 'yo' : 'bot', t: new Date().toISOString(),
      texto: String(m.texto ?? '').slice(0, 4000),
      productos: Array.isArray(m.productos) ? m.productos.slice(0, 30) : undefined,
      facturas: Array.isArray(m.facturas) ? m.facturas.slice(0, 5) : undefined,
      deshacer: Number.isInteger(m.deshacer) ? m.deshacer : undefined,
    });
  }
  if (l.length > 600) l.splice(0, l.length - 600);
  guardar();
  return n;
}

return { hoy, ErrorAmable, producto, productos, proveedores, crearProducto, editarProducto, vender, comprar, deshacer, movimientos, resumen, pocoStock, valorInventario, buscar, chatLeer, chatAgregar };
})();
