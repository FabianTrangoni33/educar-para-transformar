/**
 * sitio-publico.js - Secciones públicas del sitio (sin iniciar sesión):
 * galería (GET /api/galeria), opiniones (GET/POST /api/opiniones) y empleo (POST /api/empleo).
 * El contenido escrito por usuarios se inserta con textContent (nunca innerHTML) para evitar XSS.
 */
(function () {
  var API = window.API_BASE || '/api';

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function alerta(id, ok, mensaje) {
    var a = document.getElementById(id);
    a.className = 'alert mt-3 ' + (ok ? 'alert-success' : 'alert-danger');
    a.textContent = mensaje;
  }
  function pedir(ruta, opciones) {
    return fetch(API + ruta, opciones).then(function (r) { return r.json(); });
  }

  // ── Galería ──
  var grid = document.getElementById('gridGaleria');
  if (grid) {
    pedir('/galeria').then(function (r) {
      (r.data || []).forEach(function (f) {
        var col = el('div', 'col-6 col-md-4 col-lg-3');
        var fig = el('figure', 'mb-0');
        var img = el('img', 'img-fluid rounded-4 shadow-sm w-100');
        img.src = '..' + f.ruta;
        img.alt = f.titulo;
        img.loading = 'lazy';
        img.style.aspectRatio = '1 / 1';
        img.style.objectFit = 'cover';
        fig.appendChild(img);
        fig.appendChild(el('figcaption', 'small text-secondary mt-1', f.titulo));
        col.appendChild(fig);
        grid.appendChild(col);
      });
    }).catch(function () { grid.appendChild(el('p', 'text-secondary text-center', 'No se pudo cargar la galería.')); });
  }

  // ── Opiniones ──
  var calificacion = 0;
  var estrellas = document.getElementById('opEstrellas');
  function pintarEstrellas() {
    estrellas.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      var b = el('button', 'btn btn-link p-1 fs-3 text-warning text-decoration-none');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === calificacion));
      b.setAttribute('aria-label', i + ' estrellas');
      b.innerHTML = i <= calificacion ? '<i class="bi bi-star-fill"></i>' : '<i class="bi bi-star"></i>';
      b.addEventListener('click', (function (v) { return function () { calificacion = v; pintarEstrellas(); }; })(i));
      estrellas.appendChild(b);
    }
  }
  function cargarOpiniones() {
    var lista = document.getElementById('listaOpiniones');
    pedir('/opiniones').then(function (r) {
      var d = r.data || { opiniones: [] };
      if (d.total) document.getElementById('resumenOpiniones').textContent = 'Calificación promedio ' + d.promedio + ' ★ (' + d.total + ' opiniones). Dejá la tuya, no necesitás registrarte.';
      lista.innerHTML = '';
      if (!d.opiniones.length) lista.appendChild(el('p', 'text-secondary', 'Todavía no hay opiniones. ¡Sé el primero!'));
      d.opiniones.forEach(function (o) {
        var card = el('div', 'bg-white p-3 rounded-4 shadow-sm');
        var cab = el('div', 'd-flex justify-content-between');
        cab.appendChild(el('strong', '', o.nombre));
        cab.appendChild(el('span', 'text-warning', '★★★★★'.slice(0, o.calificacion) + '☆☆☆☆☆'.slice(0, 5 - o.calificacion)));
        card.appendChild(cab);
        card.appendChild(el('p', 'mb-1 mt-2', o.comentario));
        card.appendChild(el('small', 'text-secondary', new Date(o.creado_en).toLocaleDateString('es-AR')));
        lista.appendChild(card);
      });
    }).catch(function () { lista.textContent = 'No se pudieron cargar las opiniones.'; });
  }
  var formOp = document.getElementById('formOpinion');
  if (formOp) {
    pintarEstrellas();
    cargarOpiniones();
    formOp.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nombre = document.getElementById('opNombre').value.trim();
      var comentario = document.getElementById('opComentario').value.trim();
      if (!nombre || !comentario || !calificacion) return alerta('opAlerta', false, 'Completá nombre, comentario y calificación.');
      pedir('/opiniones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nombre, comentario: comentario, calificacion: calificacion }) })
        .then(function (r) {
          if (!r.ok) return alerta('opAlerta', false, r.error);
          formOp.reset(); calificacion = 0; pintarEstrellas();
          alerta('opAlerta', true, r.data.mensaje);
          cargarOpiniones();
        })
        .catch(function () { alerta('opAlerta', false, 'No se pudo enviar. Intentá más tarde.'); });
    });
  }

  // ── Contacto y consultas ──
  var formCo = document.getElementById("formConsulta");
  if (formCo) {
    formCo.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var datos = {
        nombre: document.getElementById("coNombre").value.trim(),
        email: document.getElementById("coEmail").value.trim(),
        telefono: document.getElementById("coTelefono").value.trim(),
        motivo: document.getElementById("coMotivo").value,
        mensaje: document.getElementById("coMensaje").value.trim()
      };
      if (!datos.nombre || !datos.email || !datos.mensaje) return alerta("coAlerta", false, "Completá nombre, correo y tu consulta.");
      var boton = formCo.querySelector("[type=submit]");
      boton.disabled = true;
      pedir("/consultas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) })
        .then(function (r) {
          if (!r.ok) return alerta("coAlerta", false, r.error);
          formCo.reset();
          alerta("coAlerta", true, r.data.mensaje);
        })
        .catch(function () { alerta("coAlerta", false, "No se pudo enviar. Probá por WhatsApp."); })
        .finally(function () { boton.disabled = false; });
    });
  }

  // ── Empleo ──
  var formEm = document.getElementById('formEmpleo');
  if (formEm) {
    formEm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var datos = {
        nombre: document.getElementById('emNombre').value.trim(),
        email: document.getElementById('emEmail').value.trim(),
        telefono: document.getElementById('emTelefono').value.trim(),
        puesto: document.getElementById('emPuesto').value,
        mensaje: document.getElementById('emMensaje').value.trim()
      };
      if (!datos.nombre || !datos.email || !datos.puesto) return alerta('emAlerta', false, 'Completá nombre, correo y puesto.');
      pedir('/empleo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
        .then(function (r) {
          if (!r.ok) return alerta('emAlerta', false, r.error);
          formEm.reset();
          alerta('emAlerta', true, r.data.mensaje);
        })
        .catch(function () { alerta('emAlerta', false, 'No se pudo enviar. Intentá más tarde.'); });
    });
  }
})();
