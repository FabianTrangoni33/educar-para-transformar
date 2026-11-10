/**
 * qr-sesion.js - Funcionalidad de valor agregado (TP1, punto 5) del lado web:
 *
 * - En login.html / login-admin.html: botón "Ingresar con QR". La web muestra un QR, el usuario lo escanea
 *   con la app (ya logueada) y la web entra sin escribir la contraseña.
 * - En los paneles (con sesión): un botón redondo con menú:
 *     · "Abrir en la app": QR de un solo uso para entrar a la app con la misma cuenta.
 *     · "Credencial digital" (familias y alumnos): QR de la credencial de cada alumno.
 *
 * No depende de Bootstrap: arma su propio diálogo. Los textos de usuarios se insertan con textContent.
 */
(function () {
  var API = window.API_BASE || '/api';
  var ROL_WEB = { ESTUDIANTE: 'alumno', DOCENTE: 'docente', PADRE: 'familia', ADMIN: 'admin' };
  var DESTINO = { alumno: 'dashboard-alumno.html', docente: 'dashboard-docente.html', familia: 'dashboard-familia.html', admin: 'dashboard.html' };

  function el(tag, estilo, texto) {
    var e = document.createElement(tag);
    if (estilo) e.style.cssText = estilo;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function pedir(ruta, opciones) {
    opciones = opciones || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem('token');
    if (opciones.conSesion && token) headers.Authorization = 'Bearer ' + token;
    return fetch(API + ruta, { method: opciones.metodo || 'GET', headers: headers, body: opciones.body ? JSON.stringify(opciones.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!j.ok) throw new Error(j.error || 'Error ' + r.status); return j.data; }); });
  }

  // ── Diálogo simple ──
  function dialogo(titulo) {
    var fondo = el('div', 'position:fixed;inset:0;background:rgba(11,37,69,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px');
    var caja = el('div', 'background:#fff;border-radius:18px;max-width:420px;width:100%;max-height:90vh;overflow:auto;padding:24px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:inherit');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-label', titulo);
    var h = el('h2', 'font-size:1.25rem;font-weight:700;color:#1f4e79;margin:0 0 8px', titulo);
    var cuerpo = el('div');
    var cerrar = el('button', 'margin-top:16px;border:1px solid #c9d3de;background:#fff;border-radius:999px;padding:8px 22px;font-weight:600;cursor:pointer', 'Cerrar');
    cerrar.type = 'button';
    caja.appendChild(h); caja.appendChild(cuerpo); caja.appendChild(cerrar);
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    var alCerrar = [];
    function cerrarTodo() { alCerrar.forEach(function (f) { f(); }); fondo.remove(); document.removeEventListener('keydown', porTecla); }
    function porTecla(ev) { if (ev.key === 'Escape') cerrarTodo(); }
    cerrar.addEventListener('click', cerrarTodo);
    fondo.addEventListener('click', function (ev) { if (ev.target === fondo) cerrarTodo(); });
    document.addEventListener('keydown', porTecla);
    cerrar.focus();
    return { cuerpo: cuerpo, cerrar: cerrarTodo, alCerrar: function (f) { alCerrar.push(f); } };
  }
  function imagenQR(src, alt) {
    var img = el('img', 'width:240px;height:240px;display:block;margin:12px auto;border:1px solid #e3e8ee;border-radius:12px;padding:6px;background:#fff');
    img.src = src; img.alt = alt;
    return img;
  }
  function textoSuave(t) { return el('p', 'color:#5b6470;font-size:.9rem;margin:4px 0', t); }
  function cuentaRegresiva(nodo, segundos, alTerminar) {
    var fin = Date.now() + segundos * 1000;
    var id = setInterval(function () {
      var resta = Math.max(0, Math.round((fin - Date.now()) / 1000));
      nodo.textContent = 'El código vence en ' + Math.floor(resta / 60) + ':' + String(resta % 60).padStart(2, '0');
      if (!resta) { clearInterval(id); alTerminar(); }
    }, 500);
    return function () { clearInterval(id); };
  }

  // ══════ 1. Login web con QR (la app autoriza) ══════
  function ingresarConQR() {
    var d = dialogo('Ingresar con QR');
    var cancelado = false, pararReloj = function () {}, temporizador = null;
    d.alCerrar(function () { cancelado = true; pararReloj(); clearTimeout(temporizador); });

    function iniciar() {
      d.cuerpo.innerHTML = '';
      d.cuerpo.appendChild(textoSuave('Generando código...'));
      pedir('/qr-login/web/iniciar', { metodo: 'POST' }).then(function (r) {
        if (cancelado) return;
        d.cuerpo.innerHTML = '';
        d.cuerpo.appendChild(textoSuave('1. Abrí la app Educar para Transformar en tu celular (con tu sesión iniciada).'));
        d.cuerpo.appendChild(textoSuave('2. Andá a Perfil → "Iniciar sesión en la web" y escaneá este código.'));
        d.cuerpo.appendChild(imagenQR(r.qr, 'Código QR para iniciar sesión'));
        var reloj = textoSuave('');
        var estado = el('p', 'font-weight:600;color:#1f4e79;margin:6px 0', 'Esperando que lo escanees...');
        estado.setAttribute('aria-live', 'polite');
        d.cuerpo.appendChild(reloj); d.cuerpo.appendChild(estado);
        pararReloj = cuentaRegresiva(reloj, r.segundos, function () { vencido(); });
        consultar(r, estado);
      }).catch(function (e) { d.cuerpo.innerHTML = ''; d.cuerpo.appendChild(textoSuave('No se pudo generar el código: ' + e.message)); });
    }
    function vencido() {
      cancelado = true;
      clearTimeout(temporizador);
      d.cuerpo.innerHTML = '';
      d.cuerpo.appendChild(textoSuave('El código venció.'));
      var otra = el('button', 'border:0;background:#1f4e79;color:#fff;border-radius:999px;padding:8px 22px;font-weight:600;cursor:pointer;margin-top:8px', 'Generar otro');
      otra.type = 'button';
      otra.addEventListener('click', function () { cancelado = false; iniciar(); });
      d.cuerpo.appendChild(otra);
    }
    function consultar(r, estado) {
      if (cancelado) return;
      pedir('/qr-login/web/estado', { metodo: 'POST', body: { codigo: r.codigo, clave: r.clave } }).then(function (s) {
        if (cancelado) return;
        if (s.estado === 'APROBADA') return entrar(s, estado);
        if (s.estado === 'EXPIRADO' || s.estado === 'USADA') return vencido();
        temporizador = setTimeout(function () { consultar(r, estado); }, 2000);
      }).catch(function () { temporizador = setTimeout(function () { consultar(r, estado); }, 4000); });
    }
    function entrar(s, estado) {
      pararReloj();
      var u = s.usuario, rol = ROL_WEB[u.rol] || String(u.rol).toLowerCase();
      localStorage.setItem('token', s.token);
      localStorage.setItem('usuario', JSON.stringify({
        id: u.id, uid: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido,
        rol: rol, nivel: rol === 'admin' ? 'todos' : (u.nivel || null), edad: u.edad || null, genero: u.genero || null
      }));
      estado.textContent = '¡Listo, ' + (u.nombre || '') + '! Ingresando...';
      setTimeout(function () { window.location.href = DESTINO[rol] || 'index.html'; }, 600);
    }
    iniciar();
  }

  // ══════ 2. Web logueada → abrir la app ══════
  function abrirEnApp() {
    var d = dialogo('Abrir en la app');
    var pararReloj = function () {};
    d.alCerrar(function () { pararReloj(); });
    function generar() {
      d.cuerpo.innerHTML = '';
      d.cuerpo.appendChild(textoSuave('Generando código...'));
      pedir('/qr-login/app/generar', { metodo: 'POST', conSesion: true }).then(function (r) {
        d.cuerpo.innerHTML = '';
        d.cuerpo.appendChild(textoSuave('En la app, en la pantalla de ingreso, tocá "Ingresar con QR desde la web" y escaneá este código.'));
        d.cuerpo.appendChild(imagenQR(r.qr, 'Código QR para abrir la app'));
        var reloj = textoSuave('');
        d.cuerpo.appendChild(reloj);
        d.cuerpo.appendChild(textoSuave('Es de un solo uso. No lo compartas: da acceso a tu cuenta.'));
        pararReloj = cuentaRegresiva(reloj, r.segundos, function () {
          d.cuerpo.innerHTML = '';
          d.cuerpo.appendChild(textoSuave('El código venció.'));
          var otra = el('button', 'border:0;background:#1f4e79;color:#fff;border-radius:999px;padding:8px 22px;font-weight:600;cursor:pointer;margin-top:8px', 'Generar otro');
          otra.type = 'button';
          otra.addEventListener('click', generar);
          d.cuerpo.appendChild(otra);
        });
      }).catch(function (e) { d.cuerpo.innerHTML = ''; d.cuerpo.appendChild(textoSuave('No se pudo generar el código: ' + e.message + '. Volvé a iniciar sesión.')); });
    }
    generar();
  }

  // ══════ 3. Credencial digital (familias y alumnos) ══════
  function verCredenciales() {
    var d = dialogo('Credencial digital');
    d.cuerpo.appendChild(textoSuave('Cargando...'));
    pedir('/movil/credenciales', { conSesion: true }).then(function (lista) {
      d.cuerpo.innerHTML = '';
      if (!lista.length) return d.cuerpo.appendChild(textoSuave('No hay credenciales asociadas a tu cuenta.'));
      d.cuerpo.appendChild(textoSuave('Se muestra en portería y al subir al transporte. Cada ingreso y salida se avisa a la familia.'));
      lista.forEach(function (c) {
        var tarjeta = el('div', 'border:1px solid #dde3ea;border-radius:16px;overflow:hidden;margin-top:14px');
        tarjeta.appendChild(el('div', 'background:#1f4e79;color:#fff;font-weight:700;padding:8px', 'Educar para Transformar · Credencial estudiantil'));
        var cuerpo = el('div', 'padding:12px');
        cuerpo.appendChild(el('div', 'font-size:1.15rem;font-weight:700', c.nombre + ' ' + c.apellido));
        cuerpo.appendChild(textoSuave((c.curso ? c.curso + (c.division ? ' ' + c.division : '') : 'Sin curso') + (c.nivel ? ' · ' + c.nivel : '') + ' · Legajo ' + c.legajo));
        cuerpo.appendChild(imagenQR(c.qr, 'Credencial de ' + c.nombre));
        var imprimir = el('button', 'border:1px solid #1f4e79;color:#1f4e79;background:#fff;border-radius:999px;padding:6px 18px;font-weight:600;cursor:pointer', 'Descargar imagen');
        imprimir.type = 'button';
        imprimir.addEventListener('click', function () {
          var a = document.createElement('a');
          a.href = c.qr; a.download = 'credencial-' + c.legajo + '.png';
          document.body.appendChild(a); a.click(); a.remove();
        });
        cuerpo.appendChild(imprimir);
        if (c.movimientos.length) {
          var lista2 = el('ul', 'text-align:left;font-size:.85rem;color:#1b1f24;margin:12px 0 0;padding-left:18px');
          c.movimientos.slice(0, 5).forEach(function (m) {
            lista2.appendChild(el('li', '', m.titulo + ' · ' + new Date(m.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })));
          });
          cuerpo.appendChild(el('div', 'text-align:left;font-weight:600;margin-top:10px;font-size:.9rem', 'Últimos movimientos'));
          cuerpo.appendChild(lista2);
        }
        tarjeta.appendChild(cuerpo);
        d.cuerpo.appendChild(tarjeta);
      });
    }).catch(function (e) { d.cuerpo.innerHTML = ''; d.cuerpo.appendChild(textoSuave('No se pudo cargar: ' + e.message)); });
  }

  // ── Montaje según la página ──
  var ICONO_QR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex:none"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm11-2h2v2h-2v-2zm-3 0h2v3h-2v-3zm3 3h2v2h-2v-2zm2 2h3v3h-2v-1h-1v-2zm-5 0h2v3h-2v-3zm3 2h2v1h-2v-1zm3-7h3v2h-3v-2z"/></svg>';
  function boton(texto, alClic, estilo) {
    var b = el('button', estilo);
    b.type = 'button';
    b.innerHTML = ICONO_QR;
    b.appendChild(el('span', '', texto));
    b.addEventListener('click', alClic);
    return b;
  }
  var pagina = (location.pathname.split('/').pop() || '').toLowerCase();

  // Funciones disponibles para otras pantallas (ej.: botones dentro del panel).
  window.QRSesion = { ingresarConQR: ingresarConQR, abrirEnApp: abrirEnApp, verCredenciales: verCredenciales };

  function montar() {
    if (pagina === 'login.html' || pagina === 'login-admin.html') {
      var form = document.querySelector('form');
      if (!form) return;
      var separador = el('div', 'display:flex;align-items:center;gap:8px;color:#8a94a0;font-size:.85rem;margin:6px 0 10px');
      separador.innerHTML = '<span style="flex:1;height:1px;background:#dde3ea"></span>o<span style="flex:1;height:1px;background:#dde3ea"></span>';
      var b = boton('Ingresar con QR desde la app', ingresarConQR,
        'width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:2px solid #1f4e79;color:#1f4e79;background:#fff;border-radius:12px;padding:11px;font-weight:700;cursor:pointer');
      form.appendChild(separador);
      form.appendChild(b);
      return;
    }
    // Paneles con sesión: un solo botón redondo que despliega un menú chico.
    if (!localStorage.getItem('token')) return;
    var usuario = {};
    try { usuario = JSON.parse(localStorage.getItem('usuario')) || {}; } catch (e) { /* sin datos */ }
    var caja = el('div', 'position:fixed;right:16px;bottom:16px;z-index:1040;display:flex;flex-direction:column;align-items:flex-end;gap:8px');
    var menu = el('div', 'display:none;background:#fff;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;min-width:210px');
    menu.id = 'menuQR';
    menu.setAttribute('role', 'menu');
    var estiloItem = 'display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:10px 12px;border-radius:10px;color:#1f4e79;font-weight:600;cursor:pointer;font-size:.92rem';
    function item(texto, accion) {
      var b = boton(texto, function () { cerrarMenu(); accion(); }, estiloItem);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('mouseenter', function () { b.style.background = '#eef3f9'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
      menu.appendChild(b);
    }
    if (usuario.rol === 'familia' || usuario.rol === 'alumno') item('Credencial digital', verCredenciales);
    item('Abrir en la app', abrirEnApp);
    var fab = el('button', 'width:52px;height:52px;border:0;border-radius:50%;background:#1f4e79;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer');
    fab.type = 'button';
    fab.innerHTML = ICONO_QR.replace(/20/g, '26');
    fab.title = 'Códigos QR: credencial y app';
    fab.setAttribute('aria-label', 'Códigos QR: credencial digital y abrir en la app');
    fab.setAttribute('aria-haspopup', 'menu');
    fab.setAttribute('aria-expanded', 'false');
    function cerrarMenu() { menu.style.display = 'none'; fab.setAttribute('aria-expanded', 'false'); }
    fab.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var abierto = menu.style.display === 'block';
      menu.style.display = abierto ? 'none' : 'block';
      fab.setAttribute('aria-expanded', String(!abierto));
    });
    document.addEventListener('click', function (ev) { if (!caja.contains(ev.target)) cerrarMenu(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrarMenu(); });
    caja.appendChild(menu);
    caja.appendChild(fab);
    document.body.appendChild(caja);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
