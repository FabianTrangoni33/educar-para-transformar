/**
 * panel-admin.js - Utilidades compartidas por las páginas de administración (pagos.html, reportes.html).
 * - api(): fetch con el token JWT guardado en localStorage ('token').
 * - tabla(): arma tablas con textContent (los datos nunca se insertan como HTML).
 * - exportarCSV() / abrirArchivo() para descargar reportes y ver comprobantes protegidos.
 */
(function () {
  var API = window.API_BASE || '/api';

  function token() { return localStorage.getItem('token') || ''; }

  function api(ruta, opciones) {
    opciones = opciones || {};
    var headers = Object.assign({ 'Authorization': 'Bearer ' + token() }, opciones.headers || {});
    if (opciones.body && typeof opciones.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(opciones.body);
    }
    return fetch(API + ruta, Object.assign({}, opciones, { headers: headers })).then(function (r) {
      if (r.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.href = 'login-admin.html';
        throw new Error('Sesión vencida');
      }
      return r.json().then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Error ' + r.status);
        return j.data;
      });
    });
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  var fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  function pesos(n) { return fmtPesos.format(Number(n) || 0); }
  function fecha(v) { return v ? new Date(v).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '-'; }
  function fechaHora(v) { return v ? new Date(v).toLocaleString('es-AR') : '-'; }

  /**
   * columnas: [{ titulo, campo | valor(fila), clase, celda(fila) -> Node }]
   * Devuelve la <table> y la guarda en contenedor (reemplaza contenido).
   */
  function tabla(contenedor, columnas, filas, vacio) {
    contenedor.innerHTML = '';
    if (!filas || !filas.length) {
      contenedor.appendChild(el('p', 'text-muted my-3', vacio || 'Sin resultados.'));
      return null;
    }
    var wrap = el('div', 'table-responsive');
    var t = el('table', 'table table-sm table-hover align-middle bg-white');
    var thead = el('thead', 'table-light');
    var trh = el('tr');
    columnas.forEach(function (c) { trh.appendChild(el('th', c.clase || '', c.titulo)); });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tbody = el('tbody');
    filas.forEach(function (f) {
      var tr = el('tr');
      columnas.forEach(function (c) {
        var td = el('td', c.clase || '');
        if (c.celda) td.appendChild(c.celda(f));
        else td.textContent = valorDe(c, f);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    contenedor.appendChild(wrap);
    return t;
  }
  function valorDe(c, f) {
    var v = c.valor ? c.valor(f) : f[c.campo];
    return v == null || v === '' ? '-' : String(v);
  }

  function exportarCSV(nombre, columnas, filas) {
    var cols = columnas.filter(function (c) { return !c.celda || c.valor || c.campo; });
    var esc = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lineas = [cols.map(function (c) { return esc(c.titulo); }).join(';')];
    (filas || []).forEach(function (f) { lineas.push(cols.map(function (c) { return esc(valorDe(c, f)); }).join(';')); });
    var blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Abre en otra pestaña un archivo protegido (PDF de factura o comprobante adjunto). */
  function abrirArchivo(ruta) {
    var ventana = window.open('', '_blank');
    return fetch(API + ruta, { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) { if (!r.ok) throw new Error('No se pudo abrir el archivo'); return r.blob(); })
      .then(function (b) { ventana.location.href = URL.createObjectURL(b); })
      .catch(function (e) { ventana.close(); alert(e.message); });
  }

  function aviso(contenedor, ok, mensaje) {
    contenedor.className = 'alert py-2 ' + (ok ? 'alert-success' : 'alert-danger');
    contenedor.textContent = mensaje;
  }

  function periodoActual() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function llenarSelect(select, items, valor, texto, opcionTodos) {
    select.innerHTML = '';
    if (opcionTodos) select.appendChild(new Option(opcionTodos, ''));
    items.forEach(function (i) { select.appendChild(new Option(texto(i), i[valor])); });
  }

  window.Panel = {
    api: api, el: el, pesos: pesos, fecha: fecha, fechaHora: fechaHora, tabla: tabla,
    exportarCSV: exportarCSV, abrirArchivo: abrirArchivo, aviso: aviso, periodoActual: periodoActual, llenarSelect: llenarSelect
  };
})();
