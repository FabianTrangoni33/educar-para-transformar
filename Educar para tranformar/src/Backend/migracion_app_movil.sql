-- =============================================================================
-- MIGRACIÓN APP MÓVIL + PAGOS (TP Integrador - Parte 3)
-- Solo AGREGA tablas/columnas: no borra ni modifica datos existentes.
-- Se puede ejecutar varias veces (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Ejecutar con: node run-migracion.js
-- =============================================================================

-- 1. Precios diferenciados por deporte (regla: "cada recorrido y deporte tienen valores diferenciados")
ALTER TABLE deportes ADD COLUMN IF NOT EXISTS precio_mensual NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Recorridos del transporte escolar (4 recorridos, cada uno con su precio y paradas)
CREATE TABLE IF NOT EXISTS recorridos_transporte (
    numero          INT PRIMARY KEY CHECK (numero BETWEEN 1 AND 4),
    nombre          VARCHAR(60)  NOT NULL,
    zona            VARCHAR(50)  NOT NULL,
    paradas         TEXT[]       NOT NULL,
    horario_ida     VARCHAR(5),
    horario_vuelta  VARCHAR(5),
    precio_mensual  NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 3. Tarifas generales: cuota por nivel y comedor (solo el administrador las modifica)
CREATE TABLE IF NOT EXISTS tarifas (
    clave           VARCHAR(40) PRIMARY KEY,      -- CUOTA_1 (Inicial), CUOTA_2, CUOTA_3, COMEDOR
    descripcion     VARCHAR(100) NOT NULL,
    monto           NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
    actualizado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inscripción al comedor (una sola por alumno: evita duplicados)
CREATE TABLE IF NOT EXISTS inscripciones_comedor (
    id_comedor        SERIAL PRIMARY KEY,
    id_alumno         INT NOT NULL UNIQUE REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    modalidad         VARCHAR(20) NOT NULL DEFAULT 'ALMUERZO',
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Horarios de cursada (materia por curso, día y franja)
CREATE TABLE IF NOT EXISTS horarios_curso (
    id_horario   SERIAL PRIMARY KEY,
    id_curso     INT NOT NULL REFERENCES cursos(id_curso) ON DELETE CASCADE,
    id_materia   INT NOT NULL REFERENCES materias(id_materia) ON DELETE CASCADE,
    dia_semana   VARCHAR(10) NOT NULL CHECK (dia_semana IN ('Lunes','Martes','Miércoles','Jueves','Viernes')),
    hora_inicio  TIME NOT NULL,
    hora_fin     TIME NOT NULL,
    aula         VARCHAR(40),
    CONSTRAINT uq_horario_curso UNIQUE (id_curso, dia_semana, hora_inicio)
);

-- 6. Facturación mensual por alumno
CREATE TABLE IF NOT EXISTS facturas (
    id_factura        SERIAL PRIMARY KEY,
    numero            VARCHAR(20) NOT NULL UNIQUE,
    id_alumno         INT NOT NULL REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    periodo           CHAR(7) NOT NULL,                 -- 'YYYY-MM'
    fecha_emision     DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE NOT NULL,
    total             NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    CONSTRAINT uq_factura_alumno_periodo UNIQUE (id_alumno, periodo)
);

-- Ítems de la factura: cuota, cada deporte, transporte (opcional, varía por mes) y comedor
CREATE TABLE IF NOT EXISTS factura_items (
    id_item      SERIAL PRIMARY KEY,
    id_factura   INT NOT NULL REFERENCES facturas(id_factura) ON DELETE CASCADE,
    tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('CUOTA','DEPORTE','TRANSPORTE','COMEDOR')),
    referencia   INT,                                   -- id_deporte o número de recorrido
    descripcion  VARCHAR(150) NOT NULL,
    monto        NUMERIC(12,2) NOT NULL CHECK (monto >= 0)
);

-- 7. Comprobantes de pago (solo transferencia bancaria; una factura puede tener varios)
CREATE TABLE IF NOT EXISTS comprobantes_pago (
    id_comprobante       SERIAL PRIMARY KEY,
    numero               VARCHAR(20) NOT NULL UNIQUE,   -- comprobante emitido por el sistema
    id_factura           INT NOT NULL REFERENCES facturas(id_factura) ON DELETE CASCADE,
    id_usuario           INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    medio                VARCHAR(20) NOT NULL DEFAULT 'TRANSFERENCIA' CHECK (medio = 'TRANSFERENCIA'),
    nro_operacion        VARCHAR(60) NOT NULL,
    fecha_transferencia  DATE NOT NULL,
    monto                NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    archivo_nombre       VARCHAR(150),
    archivo_tipo         VARCHAR(60),
    archivo_base64       TEXT,
    estado               VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
    observacion          VARCHAR(200),
    origen               VARCHAR(10) NOT NULL DEFAULT 'WEB',
    creado_en            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Qué ítems cubre cada comprobante (los padres eligen los ítems a pagar)
CREATE TABLE IF NOT EXISTS comprobante_items (
    id_comprobante INT NOT NULL REFERENCES comprobantes_pago(id_comprobante) ON DELETE CASCADE,
    id_item        INT NOT NULL REFERENCES factura_items(id_item) ON DELETE CASCADE,
    monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    PRIMARY KEY (id_comprobante, id_item)
);

-- 8. Sesión móvil: refresh tokens (se guarda solo el hash) y recuperación de contraseña
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    id_usuario  INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,
    expira_en   TIMESTAMP NOT NULL,
    revocado    BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recuperacion_password (
    id          SERIAL PRIMARY KEY,
    id_usuario  INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    codigo_hash CHAR(64) NOT NULL,
    expira_en   TIMESTAMP NOT NULL,
    usado       BOOLEAN NOT NULL DEFAULT FALSE,
    intentos    INT NOT NULL DEFAULT 0,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Notificaciones: dispositivos registrados (push) y bandeja dentro de la app
CREATE TABLE IF NOT EXISTS dispositivos (
    id             SERIAL PRIMARY KEY,
    id_usuario     INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    token_push     VARCHAR(255) NOT NULL UNIQUE,
    plataforma     VARCHAR(10),
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id          SERIAL PRIMARY KEY,
    id_usuario  INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    titulo      VARCHAR(120) NOT NULL,
    cuerpo      VARCHAR(300) NOT NULL,
    tipo        VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    datos       JSONB,
    leida       BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Auditoría de operaciones críticas con origen WEB / MOVIL (RNFM-11)
CREATE TABLE IF NOT EXISTS auditoria (
    id          SERIAL PRIMARY KEY,
    id_usuario  INT,
    accion      VARCHAR(60) NOT NULL,
    detalle     JSONB,
    origen      VARCHAR(10) NOT NULL DEFAULT 'WEB',
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Registro de mails enviados (evita mandar dos veces el mismo aviso)
CREATE TABLE IF NOT EXISTS envios_mail (
    id         SERIAL PRIMARY KEY,
    tipo       VARCHAR(30) NOT NULL,          -- RECORDATORIO | DEUDA
    periodo    CHAR(7) NOT NULL,
    id_tutor   INT NOT NULL REFERENCES tutores(id_tutor) ON DELETE CASCADE,
    email      VARCHAR(120),
    estado     VARCHAR(20) NOT NULL,          -- ENVIADO | SIMULADO | ERROR
    detalle    TEXT,
    creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_envio UNIQUE (tipo, periodo, id_tutor)
);

-- 12. Sitio público: opiniones sin login y postulaciones de empleo
CREATE TABLE IF NOT EXISTS opiniones (
    id_opinion   SERIAL PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL,
    comentario   VARCHAR(1000) NOT NULL,
    calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    estado       VARCHAR(20) NOT NULL DEFAULT 'PUBLICADA' CHECK (estado IN ('PUBLICADA','OCULTA')),
    origen       VARCHAR(10) NOT NULL DEFAULT 'WEB',
    creado_en    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS postulaciones_empleo (
    id_postulacion SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    email          VARCHAR(120) NOT NULL,
    telefono       VARCHAR(30),
    puesto         VARCHAR(80) NOT NULL,
    mensaje        VARCHAR(1500),
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- DATOS INICIALES (solo si no existen)
-- =============================================================================
INSERT INTO tarifas (clave, descripcion, monto) VALUES
('CUOTA_1', 'Cuota mensual Nivel Inicial',    85000),
('CUOTA_2', 'Cuota mensual Nivel Primario',   120000),
('CUOTA_3', 'Cuota mensual Nivel Secundario', 150000),
('COMEDOR', 'Servicio de comedor (mensual)',  45000)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO recorridos_transporte (numero, nombre, zona, paradas, horario_ida, horario_vuelta, precio_mensual) VALUES
(1, 'Recorrido 1 - Zona Norte', 'Norte', ARRAY['Plaza 25 de Mayo','Av. Sarmiento y Av. Alvear','Barrio Villa Prosperidad'], '07:15', '17:00', 32000),
(2, 'Recorrido 2 - Zona Sur',   'Sur',   ARRAY['Av. 25 de Mayo y Ruta 11','Barrio Güiraldes','Villa Río Negro'],             '07:00', '17:15', 30000),
(3, 'Recorrido 3 - Zona Este',  'Este',  ARRAY['Puerto Vilelas','Barranqueras Centro','Av. Laprida y Av. Las Heras'],      '07:30', '17:00', 36000),
(4, 'Recorrido 4 - Zona Oeste', 'Oeste', ARRAY['Fontana Centro','Av. Alberdi y Av. Castelli','Barrio Mapic'],               '07:20', '17:10', 34000)
ON CONFLICT (numero) DO NOTHING;

UPDATE deportes SET precio_mensual = CASE id_deporte
    WHEN 1 THEN 18000 WHEN 2 THEN 25000 WHEN 3 THEN 20000 WHEN 4 THEN 12000 ELSE 15000 END
WHERE precio_mensual = 0;

-- =============================================================================
-- VISTAS DE ESTADO DE PAGO (una sola definición para la app, la web y los reportes)
-- pagado      = comprobantes APROBADOS por administración
-- en_revision = comprobantes cargados por el padre que todavía no se revisaron
-- =============================================================================
CREATE OR REPLACE VIEW v_items_estado AS
SELECT fi.id_item, fi.id_factura, fi.tipo, fi.referencia, fi.descripcion, fi.monto,
       COALESCE(SUM(ci.monto) FILTER (WHERE cp.estado = 'APROBADO'), 0)  AS pagado,
       COALESCE(SUM(ci.monto) FILTER (WHERE cp.estado = 'PENDIENTE'), 0) AS en_revision
FROM factura_items fi
LEFT JOIN comprobante_items ci ON ci.id_item = fi.id_item
LEFT JOIN comprobantes_pago cp ON cp.id_comprobante = ci.id_comprobante
GROUP BY fi.id_item;

CREATE OR REPLACE VIEW v_facturas_estado AS
SELECT f.id_factura, f.numero, f.id_alumno, f.periodo, f.fecha_emision, f.fecha_vencimiento, f.total,
       COALESCE(SUM(i.pagado), 0)                AS pagado,
       COALESCE(SUM(i.en_revision), 0)           AS en_revision,
       f.total - COALESCE(SUM(i.pagado), 0)      AS saldo,
       CASE
         WHEN COALESCE(SUM(i.pagado), 0) >= f.total THEN 'PAGADA'
         WHEN f.fecha_vencimiento < CURRENT_DATE     THEN 'VENCIDA'
         WHEN COALESCE(SUM(i.pagado), 0) > 0         THEN 'PARCIAL'
         ELSE 'PENDIENTE'
       END AS estado
FROM facturas f
LEFT JOIN v_items_estado i ON i.id_factura = f.id_factura
GROUP BY f.id_factura;

CREATE INDEX IF NOT EXISTS idx_facturas_alumno ON facturas(id_alumno);
CREATE INDEX IF NOT EXISTS idx_items_factura ON factura_items(id_factura);
CREATE INDEX IF NOT EXISTS idx_comprobantes_factura ON comprobantes_pago(id_factura);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(id_usuario, creado_en DESC);
