// Demo web: atiende las llamadas /api/* dentro del navegador, con el mismo motor que el servidor real
// (window.TTMotor = lib/datos.js). Las rutas copian las de server.js.
(() => {
  const D = window.TTMotor;
  const USUARIOS = {
    jefe: { clave: '1234', nombre: 'Jefe', rol: 'admin' },
    trabajador: { clave: '1234', nombre: 'Trabajador', rol: 'empleado' },
  };
  const quien = tok => {
    const u = typeof tok === 'string' && tok.startsWith('demo-') ? tok.slice(5) : '';
    return USUARIOS[u] ? { usuario: u, nombre: USUARIOS[u].nombre, rol: USUARIOS[u].rol } : null;
  };
  const resp = (cod, cuerpo, tipo = 'application/json; charset=utf-8') =>
    new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: cod, headers: { 'Content-Type': tipo } });
  const csv = filas => filas.map(f => f.map(v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');

  function atender(url, m, b, token) {
    const p = url.pathname, q = k => url.searchParams.get(k) || undefined;
    if (p === '/api/entrar' && m === 'POST') {
      const u = String(b.usuario || '').trim().toLowerCase();
      if (!USUARIOS[u] || USUARIOS[u].clave !== String(b.clave)) return resp(401, { error: 'Usuario o clave equivocados' });
      return resp(200, { token: 'demo-' + u, usuario: u, nombre: USUARIOS[u].nombre, rol: USUARIOS[u].rol });
    }
    const yo = quien(token);
    if (!yo) return resp(401, { error: 'Tienes que entrar' });
    const admin = yo.rol === 'admin';
    const soloAdmin = () => { if (!admin) throw new D.ErrorAmable('Eso solo lo puede hacer el jefe'); };

    if (p === '/api/yo') return resp(200, yo);
    if (p === '/api/salir') return resp(200, { ok: true });
    if (p === '/api/buscar') return resp(200, D.buscar(q('q') || '', Math.min(Number(q('limite')) || 20, 500)));
    if (p === '/api/inventario') {
      const v = D.valorInventario();
      if (!admin) { delete v.valor; delete v.porProveedor; delete v.masValiosos; delete v.sinCosto; }
      return resp(200, { productos: D.productos(), valor: v });
    }
    if (p === '/api/valor') { soloAdmin(); return resp(200, D.valorInventario()); }
    if (p === '/api/proveedores') return resp(200, D.proveedores());
    if (p === '/api/proveedor-check') return resp(200, D.proveedorParecido(q('nombre') || ''));
    if (p === '/api/hoy') return resp(200, D.resumen(q('dia') || D.hoy()));
    if (p === '/api/movimientos') return resp(200, D.movimientos({ dia: q('dia'), codigo: q('codigo'), tipo: q('tipo'), limite: 200 }));
    if (p.startsWith('/api/producto/') && m === 'GET') {
      const x = D.producto(decodeURIComponent(p.slice(14)));
      return x ? resp(200, x) : resp(404, { error: 'No existe ese código' });
    }
    if (p === '/api/productos' && m === 'POST') return resp(200, D.crearProducto(b, yo.usuario));
    if (p.startsWith('/api/productos/') && m === 'PUT') { soloAdmin(); return resp(200, D.editarProducto(decodeURIComponent(p.slice(15)), b, yo.usuario)); }
    if (p === '/api/venta' && m === 'POST') return resp(200, D.vender(b, yo.usuario));
    if (p === '/api/compra' && m === 'POST') return resp(200, D.comprar(b, yo.usuario));
    if (p.startsWith('/api/deshacer/') && m === 'POST') return resp(200, D.deshacer(p.slice(14), yo.usuario, admin));
    if (p === '/api/chat' && m === 'GET') return resp(200, D.chatLeer(yo.usuario, Number(q('desde')) || 0));
    if (p === '/api/chat' && m === 'POST') return resp(200, { n: D.chatAgregar(yo.usuario, b.mensajes || []) });
    if (p === '/api/exportar') {
      soloAdmin();
      const filas = [['Código', 'Descripción', 'Proveedor', 'Cantidad', 'Costo', 'Total'], ...D.productos().map(x => [x.codigo, x.descripcion, x.proveedor, x.cantidad, String(x.costo).replace('.', ','), String(Math.round(x.cantidad * x.costo * 100) / 100).replace('.', ',')])];
      return resp(200, '﻿' + csv(filas), 'text/csv; charset=utf-8');
    }
    return resp(404, { error: 'No existe' });
  }

  const original = window.fetch.bind(window);
  window.fetch = async (entrada, op = {}) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return original(entrada, op);
    await new Promise(r => setTimeout(r, 40));
    const h = op.headers || {};
    const token = String(h.Authorization || h.authorization || '').replace(/^Bearer\s+/i, '');
    try { return atender(url, (op.method || 'GET').toUpperCase(), op.body ? JSON.parse(op.body) : {}, token); }
    catch (e) {
      if (e instanceof D.ErrorAmable) return resp(400, { error: e.message, ...(e.datos || {}) });
      console.error(e);
      return resp(500, { error: 'Algo falló' });
    }
  };
})();
