/**
 * ============================================================================
 * ARCHIVO: Code.gs
 * PROPÓSITO: Lógica del servidor. Las variables (BQ_CREDENTIALS, TABLES, etc.)
 * se leen de Config.gs — NO se deben redeclarar aquí.
 * ============================================================================
 */

// ─── INCLUDE HELPER (para HtmlService templates) ──────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── PUNTO DE ENTRADA WEB ────────────────────────────────────────────────
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Confiabilidad')
    .setFaviconUrl('https://www.g4s.com/favicon.ico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ─── ROUTER DE API ───────────────────────────────────────────────────────
function apiHandler(request) {
  const userEmail = Session.getActiveUser().getEmail();
  const { endpoint, payload } = request;
  console.log(`🔒 [API] Endpoint: ${endpoint} | Usuario: ${userEmail}`);
  try {
    switch (endpoint) {
      case 'getUserContext':    return getUserContext(userEmail);
      case 'refreshUserContext':return getUserContext(userEmail);
      case 'getRequests':       return getRequests(userEmail, payload || {});
      case 'getMasterData':     return getMasterData(userEmail);
      case 'createRequest':     return createRequest(userEmail, payload);
      case 'getRequestDetail':  return getRequestDetail(userEmail, payload);
      case 'getTemplateName':   return getTemplateName(userEmail, payload);
      case 'processBulkUpload': return processBulkUpload(userEmail, payload);
      case 'registerTempDocument': return registerTempDocument(userEmail, payload);
      case 'updateClientConfig': return updateClientConfig(userEmail, payload);
      case 'getClientUsers':    return getClientUsers(userEmail, payload);
      case 'updateUserConfig':  return updateUserConfig(userEmail, payload);
      default: throw new Error(`Endpoint desconocido: ${endpoint}`);
    }
  } catch (err) {
    console.error(`❌ ERROR en ${endpoint}: ${err.message}\nStack: ${err.stack}`);
    return { error: true, message: err.message };
  }
}

// ─── CONTEXTO DE USUARIO ────────────────────────────────────────────────
function getUserContext(email) {
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  let context = {
    email: email,
    role: 'Cliente',
    allowedClientIds: [],
    adminClientIds: [],
    clientNames: {},
    clientTypes: {},
    clientData: {},
    isValidUser: false,
    isAdmin: false
  };

  const sqlUser = `SELECT Rol_Asignado FROM \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` WHERE Email = @email LIMIT 1`;
  const userResult = bq.query(sqlUser, { email });

  if (userResult.length === 0) return context;

  context.isValidUser = true;
  context.role = String(userResult[0].Rol_Asignado).trim();
  if (context.role.toLowerCase() === 'administrador') {
    context.isAdmin = true;
  }

  context.userClientConfig = {};

  // Siempre obtener clientes asignados
  let relResult = [];
  try {
    const sqlRel = `SELECT ID_ClientesConfiabilidad, ForcedMyRequests FROM \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` WHERE Correo = @email`;
    relResult = bq.query(sqlRel, { email });
  } catch (e) {
    const sqlRelFallback = `SELECT ID_ClientesConfiabilidad FROM \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` WHERE Correo = @email`;
    relResult = bq.query(sqlRelFallback, { email });
  }
  context.allowedClientIds = relResult.map(r => r.ID_ClientesConfiabilidad);
  relResult.forEach(r => {
    context.userClientConfig[r.ID_ClientesConfiabilidad] = {
      forcedMyRequests: r.ForcedMyRequests === 'SI' || r.ForcedMyRequests === true
    };
  });

  if (context.isAdmin) {
    const sqlAllClients = `SELECT ID_ClientesConfiabilidad FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\``;
    const allRes = bq.query(sqlAllClients);
    context.adminClientIds = allRes.map(r => r.ID_ClientesConfiabilidad);
  }

  const fetchIds = context.isAdmin ? context.adminClientIds : context.allowedClientIds;

  if (fetchIds.length > 0) {
    const idsFormatted = fetchIds.map(id => `'${id}'`).join(',');
    // Intentamos buscar por ID_ClientesConfiabilidad o ID_Cliente
    const sqlDetails = `
      SELECT *
      FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\`
      WHERE ID_ClientesConfiabilidad IN (${idsFormatted})
         OR ID_Cliente IN (${idsFormatted})
    `;
    try {
      const details = bq.query(sqlDetails);
      details.forEach(row => {
        // El ID puede venir en cualquiera de estas dos columnas
        const id = row.ID_ClientesConfiabilidad || row.ID_Cliente;
        if (!id) return;

        // Búsqueda agresiva de un nombre descriptivo
        const descriptiveName = String(
          row.RazonSocial || row.Razon_Social || row.Nombre || row.Nombre_Cliente ||
          row.Cliente || id
        ).trim();

        context.clientNames[id]  = descriptiveName;
        context.clientTypes[id]  = row.TipodeCliente || row.TipoCliente || 'Externo';
        context.clientData[id]   = { 
          nit: row.NIT, 
          razonSocial: row.RazonSocial || descriptiveName,
          tipo: row.TipodeCliente || row.TipoCliente,
          forcedMyRequests: row.ForcedMyRequests === 'SI' || row.ForcedMyRequests === true
        };
      });
    } catch (e) {
      console.warn("Error cargando detalles de clientes:", e.message);
    }
    // Asegurar que todos los IDs tengan al menos un nombre (aunque sea el ID)
    fetchIds.forEach(id => { if (!context.clientNames[id]) context.clientNames[id] = id; });
  }
  return context;
}

// ─── OBTENER SOLICITUDES (con filtro de período) ─────────────────────────
// period: 'today' | 'week' | 'month' | 'year' | 'all'
function getRequests(email, { period = 'today', clientId = null } = {}) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableView  = `${projectId}.${DATASET_ID}.${TABLES.READ_VIEW}`;
  const tableTemp  = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;

  // Filtro de fecha
  const dateFilters = {
    'today': `DATE(SAFE_CAST(FechaSolicitud AS TIMESTAMP), 'America/Bogota') = CURRENT_DATE('America/Bogota')`,
    'week':  `SAFE_CAST(FechaSolicitud AS TIMESTAMP) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)`,
    'month': `SAFE_CAST(FechaSolicitud AS TIMESTAMP) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)`,
    'year':  `SAFE_CAST(FechaSolicitud AS TIMESTAMP) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)`,
    'all':   null
  };
  const dateClause = dateFilters[period] || dateFilters['today'];

  let clientParams = {};
  let clientClause = '';

  if (clientId) {
    if (!context.allowedClientIds.includes(clientId)) throw new Error("Acceso denegado a este cliente.");
    clientClause = `ID_Cliente = @clientId`;
    clientParams.clientId = clientId;
  } else {
    if (context.allowedClientIds.length === 0) return { data: [], total: 0 };
    const paramKeys = context.allowedClientIds.map((_, i) => `id${i}`);
    clientClause = `ID_Cliente IN (${paramKeys.map(k => `@${k}`).join(', ')})`;
    context.allowedClientIds.forEach((val, i) => { clientParams[`id${i}`] = val; });
  }

  // Tarea 8: Forzar "Mis Solicitudes" (Seguridad robusta)
  let securityClause = '';
  if (!context.isAdmin) {
    const forcedClientIds = context.allowedClientIds.filter(id =>
      context.clientData[id]?.forcedMyRequests || context.userClientConfig[id]?.forcedMyRequests
    );
    if (forcedClientIds.length > 0) {
      const forcedIdsStr = forcedClientIds.map(id => `'${id}'`).join(',');
      if (clientId) {
        if (forcedClientIds.includes(clientId)) {
          securityClause = `\`UsuarioCreación\` = @userEmail`;
          clientParams.userEmail = email;
        }
      } else {
        // Si no hay clientId, filtramos: (Si el cliente es de los forzados, debe ser mi solicitud; si no, ver todo lo permitido)
        securityClause = `(ID_Cliente NOT IN (${forcedIdsStr}) OR \`UsuarioCreación\` = @userEmail)`;
        clientParams.userEmail = email;
      }
    }
  }

  // Construir WHERE
  const buildWhere = (extra = '') => {
    const parts = [];
    if (clientClause)   parts.push(clientClause);
    if (dateClause)     parts.push(dateClause);
    if (securityClause) parts.push(securityClause);
    if (extra)          parts.push(extra);
    return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  };

  // 1. Vista principal (Optimization & Mapping fix)
  const sqlColumns = `
    ID_SolicitudesConfiabilidad, NSolicitud, FechaSolicitud, Identificacion, 
    NombreCompleto, Cargo, EstadoActual, EstadoActualEP, 
    Fecha_Programacion_Visita AS ProgramacionVisita, 
    Fecha_Programacion_Poligrafia AS ProgramacionPoligrafia, 
    Fecha_Entrega_ECP AS FechaEntregaECP, 
    Fecha_Entrega_EP AS FechaEntregaEP, 
    ID_Cliente, UsuarioActualizacion, \`UsuarioCreación\`
  `;
  const sqlView = `SELECT ${sqlColumns} FROM \`${tableView}\` ${buildWhere()} ORDER BY FechaSolicitud DESC LIMIT 500`;
  let rowsView = [];
  try {
    rowsView = bq.query(sqlView, clientParams);
  } catch (e) {
    console.warn("Error leyendo vista principal:", e.message);
    throw new Error("Error cargando solicitudes: " + e.message);
  }

  // 2. Temporales (recién creadas)
  const sqlTemp = `SELECT ${sqlColumns} FROM \`${tableTemp}\` ${buildWhere("EstadoActual = 'Creada'")} ORDER BY FechaSolicitud DESC LIMIT 100`;
  let rowsTemp = [];
  try {
    rowsTemp = bq.query(sqlTemp, clientParams);
    rowsTemp.forEach(row => {
      if (row.ID_Cliente && context.clientData && context.clientData[row.ID_Cliente]) {
        const cd = context.clientData[row.ID_Cliente];
        if (!row.RazonSocial) row.RazonSocial = cd.razonSocial;
        if (!row.NIT)         row.NIT = cd.nit;
        if (!row.Cliente)     row.Cliente = cd.razonSocial;
      }
    });
  } catch (e) {
    console.warn("Error leyendo temporales:", e.message);
  }

  // 3. Deduplicar (vista tiene prioridad)
  const allRows = [...rowsView, ...rowsTemp];
  const uniqueRows = [];
  const seenIds = new Set();
  allRows.forEach(row => {
    const id = row.ID_SolicitudesConfiabilidad;
    if (!seenIds.has(id)) { seenIds.add(id); uniqueRows.push(row); }
  });
  uniqueRows.sort((a, b) => {
    const dA = new Date((a.FechaSolicitud?.value || a.FechaSolicitud) || 0);
    const dB = new Date((b.FechaSolicitud?.value || b.FechaSolicitud) || 0);
    return dB - dA;
  });

  return { data: uniqueRows, total: uniqueRows.length, period };
}

// ─── DATOS MAESTROS (solo tablas de referencia para formularios) ─────────
function getMasterData(email) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const ds = DATASET_ID;
  const result = {};

  const queries = {
    conCiudades:           `SELECT Ciudades FROM \`${projectId}.${ds}.conCiudades\` ORDER BY Ciudades ASC`,
    conPoligrafias:        `SELECT DISTINCT Ciudad FROM \`${projectId}.${ds}.conPoligrafias\` WHERE Ciudad IS NOT NULL ORDER BY Ciudad ASC`,
    ClienteProyecto:       `SELECT Descripcion FROM \`${projectId}.${ds}.conClienteProyecto\` ORDER BY Descripcion ASC`,
    LineaCC:               `SELECT Linea, LN_Nombre, CC_Nombre FROM \`${projectId}.${ds}.conLineaCC\``,
    conClientesSecundarios:`SELECT ClientePrincipal, ClienteSecundarioNombre FROM \`${projectId}.${ds}.conClientesSecundarios\``,
    conEstados:            `SELECT DISTINCT EstadoSol FROM \`${projectId}.${ds}.conHistoricoEstSolicitud\` WHERE EstadoSol != 'Depurada' AND EstadoSol IS NOT NULL ORDER BY EstadoSol ASC`
  };

  Object.entries(queries).forEach(([key, sql]) => {
    try { result[key] = bq.query(sql); }
    catch (e) { console.warn(`[getMasterData] Error en ${key}: ${e.message}`); result[key] = []; }
  });

  return result;
}

// ─── DETALLE COMPLETO DE UNA SOLICITUD (carga bajo demanda) ─────────────
function getRequestDetail(email, { id }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado");

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  // Buscar en vista principal, luego en temporal
  let headerRes = [];
  try {
    const sql = `SELECT * FROM \`${projectId}.${DATASET_ID}.${TABLES.READ_VIEW}\` WHERE ID_SolicitudesConfiabilidad = @id LIMIT 1`;
    headerRes = bq.query(sql, { id });
  } catch (e) { console.warn("Vista no encontró ID, buscando en temporal..."); }

  if (headerRes.length === 0) {
    try {
      const sqlT = `SELECT * FROM \`${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}\` WHERE ID_SolicitudesConfiabilidad = @id LIMIT 1`;
      headerRes = bq.query(sqlT, { id });
    } catch (e) { console.warn("Temporal tampoco encontró ID."); }
  }

  if (headerRes.length === 0) throw new Error("Solicitud no encontrada.");
  if (!context.isAdmin && !context.allowedClientIds.includes(headerRes[0].ID_Cliente)) throw new Error("No tiene permisos.");

  const header = headerRes[0];
  header.ProgramacionVisita     = header.Fecha_Programacion_Visita    || null;
  header.ProgramacionPoligrafia = header.Fecha_Programacion_Poligrafia || null;
  header.FechaEntregaECP        = header.Fecha_Entrega_ECP            || null;
  header.FechaEntregaEP         = header.Fecha_Entrega_EP             || null;

  const getChildren = (tableName) => {
    try {
      const sql = `SELECT * FROM \`${projectId}.${DATASET_ID}.${tableName}\` WHERE ID_SolicitudesConfiabilidad = @id`;
      return bq.query(sql, { id });
    } catch (e) { console.warn(`[getRequestDetail] Error en ${tableName}: ${e.message}`); return []; }
  };

  return {
    header,
    services:             getChildren('conServiciosAplicar'),
    history:              getChildren('conEstadosSolicitud'),
    documents:            getChildren('conDocumentosSolicitud'),
    autFirmada:           getChildren('conAutFirmada'),
    datacredito:          getChildren('conConsultaDatacredito'),
    notas:                getChildren('conNotasSolicitudes'),
    poligrafia:           getChildren('conInformePoligrafia'),
    masivas:              getChildren('conSolicitudesMasivas'),
    novedades:            getChildren('conNovedades'),
    historicoServ:        getChildren('conHistoricoEstServ'),
    historicoEstSolicitud:getChildren('conHistoricoEstSolicitud')
  };
}

// ─── CREAR SOLICITUD ────────────────────────────────────────────────────
function createRequest(email, payload) {
  const emailFinal = email || Session.getActiveUser().getEmail() || 'UsuarioDesconocido';

  const servicesToCheck = [
    payload.visitaDomiciliaria, payload.consultaAntecedentes,
    payload.referenciacion, payload.estudiosPoligrafia,
    payload.consultaDatacredito, payload.comparativoOEA
  ];
  if (!servicesToCheck.some(s => s === true || String(s).toUpperCase() === 'SI')) {
    throw new Error("Solicitud Rechazada: Debe seleccionar al menos un servicio a aplicar.");
  }

  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");
  if (!context.isAdmin && !context.allowedClientIds.includes(String(payload.clientId))) {
    throw new Error("No tiene permisos para crear solicitudes para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;
  const tableServices = `${projectId}.${DATASET_ID}.${TABLES.SERVICES}`;
  const newId = generateUniqueId();

  // Normalización de campos críticos
  const norm = (val) => String(val || '').trim().toUpperCase();
  const nombreNorm = norm(payload.nombre);
  const identNorm = norm(payload.identificacion);
  const ciudadNorm = norm(payload.ciudad);
  const razonSocialNorm = norm(context.clientNames[payload.clientId] || '');

  const insertSql = `
    INSERT INTO \`${tableWrite}\`
    (
      ID_SolicitudesConfiabilidad, UsuarioActualizacion, \`UsuarioCreación\`, ID_Cliente, RazonSocial, Identificacion, NombreCompleto,
      CentroCostos, TipoTrabajador, EstadoActual, FechaSolicitud,
      TipoIdentificacion, FechaExpedicion, Cargo, Correo, Celular,
      Ciudad, Barrio, Direccion,
      VisitaDomiciliaria, ModalidadVisita, ConsultaAntecedentes, Referenciacion,
      ReferenciaAcademica, ReferenciaLaboral, ReferenciaPersonal,
      EstudiosPoligrafia, TipoPoligrafia,
      CiudadP, ConsultaDatacredito, ComparativoOEA, Notas,
      ClienteProyectoInterno, Linea, LineaNegocio,
      ClienteClientesSecundarios, NITClienteSecundario, ConvenioClienteSecundario, TipoCostoClienteSecundario, CentroCostosExterno
    )
    VALUES (
      @id, @usuarioActualizacion, @usuarioCreacion, @cliente, @razonSocial, @identificacion, @nombre,
      @cc, @tipo, @estado, CAST(CURRENT_TIMESTAMP() AS STRING),
      @tipoId, @fechaExp, @cargo, @correo, @celular,
      @ciudad, @barrio, @direccion,
      @visita, @modalidad, @antecedentes, @referencia,
      @refAcad, @refLab, @refPers,
      @poligrafia, @tipoPoli,
      @ciudadPoli, @datacredito, @oea, @notas,
      @cliProy, @linea, @lineaNeg,
      @cliSec, @nitSec, @convSec, @tipoCostoSec, @ccExterno
    )
  `;

  bq.query(insertSql, {
    id: newId, usuarioActualizacion: emailFinal, usuarioCreacion: emailFinal, cliente: payload.clientId,
    razonSocial: razonSocialNorm, identificacion: identNorm, nombre: nombreNorm,
    cc: payload.centroCostos || 'N/A', tipo: payload.tipoTrabajador, estado: "Creada",
    tipoId: payload.tipoIdentificacion || '', fechaExp: payload.fechaExpedicion || '',
    cargo: payload.cargo || '', correo: payload.correo || '', celular: payload.celular || '',
    ciudad: ciudadNorm, barrio: payload.barrio || '', direccion: payload.direccion || '',
    visita: payload.visitaDomiciliaria || 'NO', modalidad: payload.modalidadVisita || '',
    antecedentes: payload.consultaAntecedentes || 'NO', referencia: payload.referenciacion || 'NO',
    refAcad: payload.referenciaAcademica || 'NO', refLab: payload.referenciaLaboral || 'NO',
    refPers: payload.referenciaPersonal || 'NO', poligrafia: payload.estudiosPoligrafia || 'NO',
    tipoPoli: payload.tipoPoligrafia || '', ciudadPoli: payload.ciudadPoligrafia || '',
    datacredito: payload.consultaDatacredito || 'NO', oea: payload.comparativoOEA || 'NO',
    notas: payload.notas || '', cliProy: payload.clienteProyectoInterno || '',
    linea: payload.linea || '', lineaNeg: payload.lineaNegocio || '',
    cliSec: payload.clienteClientesSecundarios || '', nitSec: payload.nitClienteSecundario || '',
    convSec: payload.convenioClienteSecundario || '', tipoCostoSec: payload.tipoCostoClienteSecundario || '',
    ccExterno: payload.centroCostosExterno || ''
  });

  // Inicializar registros en conServiciosAplicar (Tarea: Activar automatizaciones de AppSheet)
  const servicesToInit = [];
  if (payload.visitaDomiciliaria === 'SI' || payload.visitaDomiciliaria === true) servicesToInit.push('Visita Domiciliaria');
  if (payload.consultaAntecedentes === 'SI' || payload.consultaAntecedentes === true) servicesToInit.push('Consulta de Antecedentes');
  if (payload.referenciacion === 'SI' || payload.referenciacion === true) servicesToInit.push('Referenciación');
  if (payload.estudiosPoligrafia === 'SI' || payload.estudiosPoligrafia === true) servicesToInit.push('Estudio de Poligrafía');
  if (payload.consultaDatacredito === 'SI' || payload.consultaDatacredito === true) servicesToInit.push('Consulta Datacrédito');
  if (payload.comparativoOEA === 'SI' || payload.comparativoOEA === true) servicesToInit.push('Comparativo OEA');

  for (const service of servicesToInit) {
    try {
      const sqlSrv = `
        INSERT INTO \`${tableServices}\`
        (ID_ServiciosAplicar, ID_SolicitudesConfiabilidad, TipoServicio, EstadoActual, FechaActualizacion, UsuarioActualizacion, \`UsuarioCreación\`)
        VALUES (@srvId, @reqId, @tipo, 'Ingresada', CAST(CURRENT_TIMESTAMP() AS STRING), @user, @user)
      `;
      bq.query(sqlSrv, {
        srvId: generateUniqueId(),
        reqId: newId,
        tipo: service,
        user: emailFinal
      });
    } catch (e) {
      console.error(`Error inicializando servicio ${service}: ${e.message}`);
    }
  }

  return { success: true, requestId: newId, message: "Solicitud creada correctamente e inicializada." };
}

// ─── CARGA MASIVA ───────────────────────────────────────────────────────
function getTemplateName(email, { clientId }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");
  if (!context.isAdmin && !context.allowedClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para descargar plantillas de este cliente.");
  }
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const sql = `SELECT PlantillaMasivo FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` WHERE ID_ClientesConfiabilidad = @id LIMIT 1`;
  const rows = bq.query(sql, { id: clientId });
  if (rows.length === 0 || !rows[0].PlantillaMasivo) throw new Error("No hay plantilla configurada para este cliente.");
  const fullPath = rows[0].PlantillaMasivo;
  const filename = fullPath.split(/[/\\]/).pop();
  return { success: true, filename };
}

function processBulkUpload(email, { csvContent, clientId }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");
  if (!context.isAdmin && !context.allowedClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para cargar datos para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;
  const tableServices = `${projectId}.${DATASET_ID}.${TABLES.SERVICES}`;

  const normalizeStr = (str) => {
    if (!str) return "";
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  };
  const razonSocialNorm = normalizeStr(context.clientNames[clientId] || '');

  // Verificar tipo de cliente
  let clientTypeRaw = context.clientTypes[clientId];
  if (!clientTypeRaw) {
    try {
      const sqlCheck = `SELECT TipodeCliente FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` WHERE ID_ClientesConfiabilidad = @id LIMIT 1`;
      const checkRes = bq.query(sqlCheck, { id: clientId });
      if (checkRes.length > 0) clientTypeRaw = checkRes[0].TipodeCliente;
    } catch (e) { console.warn("No se pudo verificar tipo de cliente:", e.message); }
  }
  const isInternal = String(clientTypeRaw || 'Externo').toLowerCase().includes('interno');

  // Datos maestros para validación
  const sqlMasters = `
    SELECT 'LineaCC' as Tipo, Linea, LN_Nombre, CC_Nombre, NULL as Descripcion FROM \`${projectId}.${DATASET_ID}.conLineaCC\`
    UNION ALL SELECT 'Ciudad', Ciudades, NULL, NULL, NULL FROM \`${projectId}.${DATASET_ID}.conCiudades\`
    UNION ALL SELECT 'Poligrafia', Ciudad, NULL, NULL, NULL FROM \`${projectId}.${DATASET_ID}.conPoligrafias\`
    UNION ALL SELECT 'ClienteProyecto', NULL, NULL, NULL, Descripcion FROM \`${projectId}.${DATASET_ID}.conClienteProyecto\`
  `;
  let masterData = [];
  try { masterData = bq.query(sqlMasters); }
  catch (e) { throw new Error("Error consultando tablas maestras: " + e.message); }

  const validLineaCC = new Set(), validCiudades = new Set(), validPoligrafias = new Set(), validProyectos = new Set();
  masterData.forEach(row => {
    const tipo = row.Tipo || row.f?.[0]?.v;
    if (tipo === 'LineaCC')          validLineaCC.add(`${normalizeStr(row.Linea)}|${normalizeStr(row.LN_Nombre)}|${normalizeStr(row.CC_Nombre)}`);
    else if (tipo === 'Ciudad')      validCiudades.add(normalizeStr(row.Linea));
    else if (tipo === 'Poligrafia')  validPoligrafias.add(normalizeStr(row.Linea));
    else if (tipo === 'ClienteProyecto') validProyectos.add(normalizeStr(row.Descripcion));
  });

  const validTiposID = new Set(['CEDULA DE CIUDADANIA','TARJETA DE IDENTIDAD','CEDULA DE EXTRANJERIA','PASAPORTE','PERMISO ESPECIAL','PERMISO PERMANENTE DE TRABAJO','PEP','OTRO']);

  // Procesar CSV
  let csvString = Utilities.newBlob(Utilities.base64Decode(csvContent)).getDataAsString('UTF-8');
  if (csvString.charCodeAt(0) === 0xFEFF) csvString = csvString.slice(1);
  const lines = csvString.split(/\r\n|\n|\r/);
  if (lines.length < 2) throw new Error("El archivo está vacío o sin formato correcto.");

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const normalizeHeader = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const columnMap = {
    'ID_Cliente':'ID_Cliente','CentroCostos':'CentroCostos','NombreCompleto':'NombreCompleto',
    'TipoIdentificacion':'TipoIdentificacion','Identificacion':'Identificacion','FechaExpedicion':'FechaExpedicion',
    'Cargo':'Cargo','Correo':'Correo','Celular':'Celular','Ciudad':'Ciudad','Direccion':'Direccion',
    'Barrio':'Barrio','TipoTrabajador':'TipoTrabajador','VisitaDomiciliaria':'VisitaDomiciliaria',
    'ModalidadVisita':'ModalidadVisita','ConsultaAntecedentes':'ConsultaAntecedentes',
    'Referenciacion':'Referenciacion','ReferenciaAcademica':'ReferenciaAcademica',
    'ReferenciaLaboral':'ReferenciaLaboral','ReferenciaPersonal':'ReferenciaPersonal',
    'EstudiosPoligrafia':'EstudiosPoligrafia','TipoPoligrafia':'TipoPoligrafia','CiudadP':'CiudadP',
    'ConsultaDatacredito':'ConsultaDatacredito','ComparativoOEA':'ComparativoOEA','Notas':'Notas',
    'Linea':'Linea','LineaNegocio':'LineaNegocio','ClienteProyectoInterno':'ClienteProyectoInterno',
    'CentroCostosExterno':'CentroCostosExterno'
  };
  const normalizedMap = {};
  Object.keys(columnMap).forEach(k => { normalizedMap[normalizeHeader(k)] = columnMap[k]; });

  const parsedRows = [];
  const validationErrors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(delimiter);
    let rowData = {};
    let hasData = false;
    headers.forEach((header, index) => {
      const bqColumn = normalizedMap[normalizeHeader(header)];
      if (bqColumn && values[index] !== undefined) {
        let val = values[index].trim().replace(/^"|"$/g, '');
        if (val.toUpperCase() === 'TRUE')  val = 'SI';
        if (val.toUpperCase() === 'FALSE') val = 'NO';
        rowData[bqColumn] = val;
        if (val) hasData = true;
      }
    });
    if (!hasData) continue;
    const rowNum = i + 1;

    if (!rowData.NombreCompleto)    validationErrors.push(`Fila ${rowNum}: NombreCompleto es obligatorio`);
    if (!rowData.Identificacion)    validationErrors.push(`Fila ${rowNum}: Identificacion es obligatoria`);
    if (!rowData.TipoIdentificacion) {
      validationErrors.push(`Fila ${rowNum}: TipoIdentificacion es obligatorio`);
    } else if (!validTiposID.has(normalizeStr(rowData.TipoIdentificacion))) {
      validationErrors.push(`Fila ${rowNum}: TipoIdentificacion "${rowData.TipoIdentificacion}" no es válido`);
    }
    if (rowData.Ciudad && !validCiudades.has(normalizeStr(rowData.Ciudad))) {
      validationErrors.push(`Fila ${rowNum}: Ciudad "${rowData.Ciudad}" no existe en el maestro`);
    }
    if (isInternal) {
      if (!rowData.Linea)        validationErrors.push(`Fila ${rowNum}: Linea obligatoria para Cliente Interno`);
      if (!rowData.LineaNegocio) validationErrors.push(`Fila ${rowNum}: LineaNegocio obligatoria para Cliente Interno`);
      if (!rowData.CentroCostos) validationErrors.push(`Fila ${rowNum}: CentroCostos obligatorio para Cliente Interno`);
    }
    parsedRows.push(rowData);
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      validationError: true,
      message: `Se encontraron ${validationErrors.length} error(es) de validación. La carga fue rechazada.`,
      errorList: validationErrors,
      errorSummary: {
        total: validationErrors.length,
        rows: parsedRows.length,
        detail: validationErrors.slice(0, 50)
      }
    };
  }

  let successCount = 0;
  let insertErrors = 0;
  const insertErrorDetails = [];

  for (const rowData of parsedRows) {
    try {
      const newReqId = generateUniqueId();
      const insertSql = `
        INSERT INTO \`${tableWrite}\`
        (
          ID_SolicitudesConfiabilidad, UsuarioActualizacion, \`UsuarioCreación\`, ID_Cliente, RazonSocial, Identificacion, NombreCompleto,
          CentroCostos, TipoTrabajador, EstadoActual, FechaSolicitud,
          TipoIdentificacion, FechaExpedicion, Cargo, Correo, Celular,
          Ciudad, Barrio, Direccion,
          VisitaDomiciliaria, ModalidadVisita, ConsultaAntecedentes, Referenciacion,
          ReferenciaAcademica, ReferenciaLaboral, ReferenciaPersonal,
          EstudiosPoligrafia, TipoPoligrafia,
          CiudadP, ConsultaDatacredito, ComparativoOEA, Notas,
          Linea, LineaNegocio, ClienteProyectoInterno, CentroCostosExterno
        )
        VALUES (
          @id, @usuarioActualizacion, @usuarioCreacion, @cliente, @razonSocial, @ident, @nombre,
          @cc, @tipo, @estado, CAST(CURRENT_TIMESTAMP() AS STRING),
          @tipoId, @fechaExp, @cargo, @correo, @celular,
          @ciudad, @barrio, @dir,
          @visita, @modVisita, @antec, @ref,
          @refAcad, @refLab, @refPers,
          @poli, @tipoPoli,
          @ciudPoli, @datac, @oea, @notas,
          @linea, @lineaNeg, @proyInt, @ccExt
        )
      `;
      bq.query(insertSql, {
        id: newReqId, usuarioActualizacion: email, usuarioCreacion: email, cliente: clientId,
        razonSocial: razonSocialNorm,
        ident: normalizeStr(rowData.Identificacion), nombre: normalizeStr(rowData.NombreCompleto),
        cc: rowData.CentroCostos || '', tipo: rowData.TipoTrabajador || 'Nuevo', estado: "Creada",
        tipoId: rowData.TipoIdentificacion || '', fechaExp: rowData.FechaExpedicion || '',
        cargo: rowData.Cargo || '', correo: rowData.Correo || '', celular: rowData.Celular || '',
        ciudad: rowData.Ciudad || '', barrio: rowData.Barrio || '', dir: rowData.Direccion || '',
        visita: rowData.VisitaDomiciliaria || 'NO', modVisita: rowData.ModalidadVisita || '',
        antec: rowData.ConsultaAntecedentes || 'NO', ref: rowData.Referenciacion || 'NO',
        refAcad: rowData.ReferenciaAcademica || 'NO', refLab: rowData.ReferenciaLaboral || 'NO',
        refPers: rowData.ReferenciaPersonal || 'NO', poli: rowData.EstudiosPoligrafia || 'NO',
        tipoPoli: rowData.TipoPoligrafia || '', ciudPoli: rowData.CiudadP || '',
        datac: rowData.ConsultaDatacredito || 'NO', oea: rowData.ComparativoOEA || 'NO',
        notas: rowData.Notas || '', linea: rowData.Linea || '', lineaNeg: rowData.LineaNegocio || '',
        proyInt: rowData.ClienteProyectoInterno || '', ccExt: rowData.CentroCostosExterno || ''
      });

      // Inicializar registros en conServiciosAplicar (Masivo)
      const servicesToInit = [];
      const isSi = (val) => val === 'SI' || val === true || String(val).toUpperCase() === 'SI' || String(val).toUpperCase() === 'TRUE';

      if (isSi(rowData.VisitaDomiciliaria))   servicesToInit.push('Visita Domiciliaria');
      if (isSi(rowData.ConsultaAntecedentes)) servicesToInit.push('Consulta de Antecedentes');
      if (isSi(rowData.Referenciacion))        servicesToInit.push('Referenciación');
      if (isSi(rowData.EstudiosPoligrafia))   servicesToInit.push('Estudio de Poligrafía');
      if (isSi(rowData.ConsultaDatacredito))  servicesToInit.push('Consulta Datacrédito');
      if (isSi(rowData.ComparativoOEA))      servicesToInit.push('Comparativo OEA');

      for (const service of servicesToInit) {
        try {
          const sqlSrv = `
            INSERT INTO \`${tableServices}\`
            (ID_ServiciosAplicar, ID_SolicitudesConfiabilidad, TipoServicio, EstadoActual, FechaActualizacion, UsuarioActualizacion, \`UsuarioCreación\`)
            VALUES (@srvId, @reqId, @tipo, 'Ingresada', CAST(CURRENT_TIMESTAMP() AS STRING), @user, @user)
          `;
          bq.query(sqlSrv, {
            srvId: generateUniqueId(),
            reqId: newReqId,
            tipo: service,
            user: email
          });
        } catch (srvErr) {
          console.error(`Error inicializando servicio masivo ${service}: ${srvErr.message}`);
        }
      }

      successCount++;
    } catch (e) {
      insertErrors++;
      insertErrorDetails.push(`Error técnico en "${rowData.NombreCompleto}": ${e.message}`);
      console.error("Error insertando fila:", e);
    }
  }

  return {
    success: true,
    loaded: successCount,
    failed: insertErrors,
    message: `Proceso finalizado. Cargados: ${successCount}, Errores técnicos: ${insertErrors}`,
    technicalErrors: insertErrorDetails
  };
}

function registerTempDocument(email, { requestId, docName, fileName }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Usuario no autorizado.");
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableId = `${projectId}.${DATASET_ID}.${TABLES.DOCS_TEMP}`;
  const docId = generateUniqueId();
  const insertSql = `
    INSERT INTO \`${tableId}\`
    (ID_DocumentosSolicitud, ID_SolicitudesConfiabilidad, NombreDocumento, Documento, UsuarioActualizacion, \`UsuarioCreación\`, FechaActualizacion, EstadoActual)
    VALUES (@docId, @reqId, @docName, @fileAlias, @user, @user, CAST(CURRENT_TIMESTAMP() AS STRING), 'Creada')
  `;
  bq.query(insertSql, { docId, reqId: requestId, docName, fileAlias: fileName, user: email });
  return { success: true, message: "Metadatos registrados." };
}

function updateClientConfig(email, { clientId, forcedMyRequests }) {
  const context = getUserContext(email);
  if (!context.isAdmin) throw new Error("Solo administradores pueden realizar esta acción.");
  
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const sql = `UPDATE \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` SET ForcedMyRequests = @val WHERE ID_ClientesConfiabilidad = @id`;
  bq.query(sql, { val: forcedMyRequests ? 'SI' : 'NO', id: clientId });
  return { success: true, message: "Configuración actualizada." };
}

function getClientUsers(email, { clientId }) {
  const context = getUserContext(email);
  if (!context.isAdmin) throw new Error("Acceso Denegado");
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  // Join para obtener usuarios y sus roles, filtrados por cliente
  // Se intenta leer ForcedMyRequests de la tabla de relación (conUsuariosCliente)
  const sql = `
    SELECT u.Email, u.Rol_Asignado, rc.ForcedMyRequests as userForced
    FROM \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` rc
    JOIN \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` u ON rc.Correo = u.Email
    WHERE rc.ID_ClientesConfiabilidad = @clientId
  `;
  try {
    return bq.query(sql, { clientId });
  } catch (e) {
    const sqlFallback = `
      SELECT u.Email, u.Rol_Asignado, 'NO' as userForced
      FROM \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` rc
      JOIN \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` u ON rc.Correo = u.Email
      WHERE rc.ID_ClientesConfiabilidad = @clientId
    `;
    return bq.query(sqlFallback, { clientId });
  }
}

function updateUserConfig(email, { targetEmail, clientId, role, userForced }) {
  const context = getUserContext(email);
  if (!context.isAdmin) throw new Error("Acceso Denegado");
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  if (role) {
    bq.query(`UPDATE \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` SET Rol_Asignado = @role WHERE Email = @targetEmail`, { role, targetEmail });
  }

  if (userForced !== undefined) {
    try {
      bq.query(`UPDATE \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` SET ForcedMyRequests = @val WHERE Correo = @targetEmail AND ID_ClientesConfiabilidad = @clientId`, { val: userForced ? 'SI' : 'NO', targetEmail, clientId });
    } catch (e) {
      console.warn("No se pudo actualizar ForcedMyRequests a nivel de usuario:", e.message);
    }
  }

  return { success: true };
}

// ─── UTILIDADES ──────────────────────────────────────────────────────────
function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ─── CLIENTE BIGQUERY ─────────────────────────────────────────────────
class BigQueryClient {
  constructor() { this.token = this.getServiceAccountToken(); }

  getServiceAccountToken() {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: BQ_CREDENTIALS.client_email,
      scope: 'https://www.googleapis.com/auth/bigquery',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, iat: now
    };
    const signatureInput = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + '.' + Utilities.base64EncodeWebSafe(JSON.stringify(claim));
    const signature = Utilities.computeRsaSha256Signature(signatureInput, BQ_CREDENTIALS.private_key);
    const jwt = signatureInput + '.' + Utilities.base64EncodeWebSafe(signature);
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
    });
    return JSON.parse(response.getContentText()).access_token;
  }

  query(sql, params = {}) {
    const projectId = BQ_CREDENTIALS.project_id;
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
    const queryParameters = Object.keys(params).map(key => ({
      name: key, parameterType: { type: 'STRING' }, parameterValue: { value: String(params[key]) }
    }));
    const payload = {
      query: sql, useLegacySql: false,
      parameterMode: queryParameters.length > 0 ? 'NAMED' : undefined,
      queryParameters: queryParameters.length > 0 ? queryParameters : undefined,
      maxResults: 10000
    };
    const options = {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.token}` },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) throw new Error(`BigQuery Error: ${response.getContentText()}`);
    let json = JSON.parse(response.getContentText());
    if (!json.schema) return [];
    const fields = json.schema.fields.map(f => f.name);
    let allRows = json.rows || [];
    let jobId = json.jobReference.jobId;
    let pageToken = json.pageToken;
    while (pageToken) {
      const nextUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?pageToken=${pageToken}&maxResults=10000`;
      const nextRes = UrlFetchApp.fetch(nextUrl, { method: 'get', headers: { Authorization: `Bearer ${this.token}` }, muteHttpExceptions: true });
      if (nextRes.getResponseCode() !== 200) { console.warn("Error paginando BigQuery"); break; }
      const nextJson = JSON.parse(nextRes.getContentText());
      if (nextJson.rows) allRows = allRows.concat(nextJson.rows);
      pageToken = nextJson.pageToken;
    }
    return allRows.map(row => {
      let obj = {};
      row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
      return obj;
    });
  }
}
