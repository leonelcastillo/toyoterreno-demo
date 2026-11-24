// Demo web: guarda la base en este navegador (localStorage). La primera vez usa los datos inventados
// de demo-datos.js, corridos en el tiempo para que su último día sea hoy.
(() => {
  const CLAVE = 'tt-demo-db-v1';
  try { if (new URLSearchParams(location.search).has('reiniciar')) { localStorage.removeItem(CLAVE); localStorage.removeItem('tt-sesion'); history.replaceState(null, '', location.pathname); } } catch {}

  const z = n => String(n).padStart(2, '0');
  const diaLocal = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;

  function aHoy(db) {
    const ultimo = db.movimientos.reduce((m, x) => (x.dia > m ? x.dia : m), '');
    if (!ultimo) return db;
    const corrimiento = Math.round((Date.parse(diaLocal(new Date()) + 'T12:00') - Date.parse(ultimo + 'T12:00')) / 864e5) * 864e5;
    const ahora = Date.now();
    for (const m of db.movimientos) {
      let t = Date.parse(m.fecha) + corrimiento;
      if (t > ahora) t = ahora - Math.floor(Math.random() * 3600e3); // nada en el futuro
      const d = new Date(t);
      m.fecha = d.toISOString(); m.dia = diaLocal(d);
    }
    db.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return db;
  }

  window.__ttCargar = () => {
    try { const s = localStorage.getItem(CLAVE); if (s) return JSON.parse(s); } catch {}
    return aHoy(JSON.parse(JSON.stringify(window.__TT_DEMO)));
  };
  window.__ttGuardar = db => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch {} };
})();
