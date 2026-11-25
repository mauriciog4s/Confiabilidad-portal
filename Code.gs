/**
 * ============================================================================
 * ARCHIVO: Code.gs
 * PROPÓSITO: Servidor principal. Integra BigQuery (vía OAuth2) y subida/descarga
 * de archivos delegada al Proxy con soporte de autorización Bearer y URL limpia.
 * ============================================================================
 */

// ─── INCLUDE HELPER ──────────────────────────────────────────────────────
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
  try {
    if (!request || typeof request !== 'object') {
      throw new Error("La solicitud enviada al servidor es nula o inválida.");
    }

    const { endpoint, payload } = request;
    const userEmail = Session.getActiveUser().getEmail() || 'usuario_sin_sesion';
    console.log(`🔒 [API] Endpoint: ${endpoint} | Usuario: ${userEmail}`);

    switch (endpoint) {
      case 'getUserContext':       return getUserContext(userEmail);
      case 'refreshUserContext':   return getUserContext(userEmail);
      case 'getRequests':          return getRequests(userEmail, payload || {});
      case 'getMasterData':        return getMasterData(userEmail);
      case 'createRequest':        return createRequest(userEmail, payload);
      case 'getRequestDetail':     return getRequestDetail(userEmail, payload);
      case 'getTemplateName':      return getTemplateName(userEmail, payload);
      case 'processBulkUpload':    return processBulkUpload(userEmail, payload);
      case 'registerTempDocument': return registerTempDocument(userEmail, payload);
      case 'uploadDocument':       return uploadDocument(userEmail, payload);
      case 'updateClientConfig':   return updateClientConfig(userEmail, payload);
      case 'getClientUsers':       return getClientUsers(userEmail, payload);
      case 'updateUserConfig':     return updateUserConfig(userEmail, payload);
      case 'getFileBase64':        return getFileBase64(payload);
      case 'getFileIdByName':      return getFileIdByName(payload);
      
      default: throw new Error(`Endpoint desconocido: ${endpoint}`);
    }
  } catch (err) {
    console.error(`❌ ERROR en apiHandler: ${err.message}\nStack: ${err.stack}`);
    return { error: true, message: err.message };
  }
}

// ─── CONTEXTO DE USUARIO ────────────────────────────────────────────────
function getUserContext(email) {
  if (!email || email === 'usuario_sin_sesion') {
    return {
      email: 'Sin sesión detectada',
      role: 'Cliente',
      allowedClientIds: [],
      creationClientIds: [],
      adminClientIds: [],
      clientNames: {},
      clientTypes: {},
      clientData: {},
      isValidUser: false,
      isAdmin: false
    };
  }

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();

  let context = {
    email: email,
    role: 'Cliente',
    allowedClientIds: [],
    creationClientIds: [],
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
  const roleLower = context.role.toLowerCase();

  context.isAdmin = (roleLower === 'administrador');
  context.userClientConfig = {};

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

  const privilegedForCreation = ['administrador', 'coordinador general', 'coordinador ep', 'coordinador ecp'];
  const privilegedForView     = ['administrador', 'coordinador general'];

  context.isCoordinatorGeneral = (roleLower === 'coordinador general');
  context.isCoordinatorEP      = (roleLower === 'coordinador ep');
  context.isCoordinatorECP     = (roleLower === 'coordinador ecp');

  if (privilegedForCreation.includes(roleLower)) {
    const sqlAllClients = `SELECT ID_ClientesConfiabilidad FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\``;
    const allRes = bq.query(sqlAllClients);
    const allIds = allRes.map(r => r.ID_ClientesConfiabilidad);

    context.creationClientIds = allIds;

    if (privilegedForView.includes(roleLower)) {
      context.allowedClientIds = allIds;
    }

    if (context.isAdmin) {
      context.adminClientIds = allIds;
    }
  } else {
    context.creationClientIds = context.allowedClientIds;
  }

  const fetchIds = [...new Set([...context.allowedClientIds, ...context.creationClientIds, ...context.adminClientIds])];

  if (fetchIds.length > 0) {
    const idsFormatted = fetchIds.map(id => `'${id}'`).join(',');
    const sqlDetails = `
      SELECT ID_ClientesConfiabilidad, RazonSocial, TipodeCliente, NIT
      FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\`
      WHERE ID_ClientesConfiabilidad IN (${idsFormatted})
    `;
    try {
      const details = bq.query(sqlDetails);
      details.forEach(row => {
        const id = row.ID_ClientesConfiabilidad;
        if (!id) return;
        const descriptiveName = String(row.RazonSocial || id).trim();
        context.clientNames[id]  = descriptiveName;
        context.clientTypes[id]  = row.TipodeCliente || 'Externo';
        context.clientData[id]   = {
          nit: row.NIT,
          razonSocial: descriptiveName,
          tipo: row.TipodeCliente,
          forcedMyRequests: false
        };
      });
    } catch (e) {
      console.warn("Error cargando detalles de clientes:", e.message);
    }
    fetchIds.forEach(id => { if (!context.clientNames[id]) context.clientNames[id] = id; });
  }
  return context;
}

// ─── OBTENER SOLICITUDES ─────────────────────────────────────────────────
function getRequests(email, { period = 'today', clientId = null } = {}) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
  const tableView  = `${projectId}.${DATASET_ID}.${TABLES.READ_VIEW}`;
  const tableTemp  = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;

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

  let securityClause = '';
  const roleLower = String(context.role || '').toLowerCase();
  if (!context.isAdmin && roleLower !== 'coordinador general') {
    if (context.role === 'Cliente Perfilado') {
      securityClause = `\`UsuarioCreación\` = @userEmail`;
      clientParams.userEmail = email;
    } else {
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
          securityClause = `(ID_Cliente NOT IN (${forcedIdsStr}) OR \`UsuarioCreación\` = @userEmail)`;
          clientParams.userEmail = email;
        }
      }
    }
  }

  const buildWhere = (extra = '') => {
    const parts = [];
    if (clientClause)   parts.push(clientClause);
    if (dateClause)     parts.push(dateClause);
    if (securityClause) parts.push(securityClause);
    parts.push(`(EstadoActual IS NULL OR EstadoActual != 'Depurada')`);
    if (extra)          parts.push(extra);
    return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  };

  const sqlColumns = `
    ID_SolicitudesConfiabilidad, NSolicitud, FechaSolicitud, Identificacion, 
    NombreCompleto, Cargo, EstadoActual, EstadoActualEP, 
    Fecha_Programacion_Visita AS ProgramacionVisita, 
    Fecha_Programacion_Poligrafia AS ProgramacionPoligrafia, 
    Fecha_Entrega_ECP AS FechaEntregaECP, 
    Fecha_Entrega_EP AS FechaEntregaEP, 
    ID_Cliente, UsuarioActualizacion, \`UsuarioCreación\`
  `;
  const sqlView = `SELECT ${sqlColumns} FROM \`${tableView}\` ${buildWhere()} ORDER BY FechaSolicitud DESC LIMIT 5000`;
  let rowsView = [];
  try {
    rowsView = bq.query(sqlView, clientParams);
  } catch (e) {
    console.warn("Error leyendo vista principal:", e.message);
    throw new Error("Error cargando solicitudes: " + e.message);
  }

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

// ─── DATOS MAESTROS ──────────────────────────────────────────────────────
function getMasterData(email) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
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

// ─── DETALLE COMPLETO DE UNA SOLICITUD ───────────────────────────────────
function getRequestDetail(email, { id }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado");

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();

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

  const getCombinedDocuments = () => {
    const mainDocs = getChildren('conDocumentosSolicitud');
    const tempDocs = getChildren('conDocumentosSolicitudTemporal');
    const seen = new Set();
    const combined = [];

    mainDocs.forEach(d => {
      const key = d.ID_DocumentosSolicitud || d.Documento;
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(d);
      }
    });

    tempDocs.forEach(d => {
      const key = d.ID_DocumentosSolicitud || d.Documento;
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(d);
      }
    });

    return combined;
  };

  return {
    header,
    services:             getChildren('conServiciosAplicar'),
    history:              getChildren('conEstadosSolicitud'),
    documents:            getCombinedDocuments(),
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
  if (!context.isAdmin && !context.creationClientIds.includes(String(payload.clientId))) {
    throw new Error("No tiene permisos para crear solicitudes para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;
  const newId = generateUniqueId();

  const insertSql = `
    INSERT INTO \`${tableWrite}\`
    (
      ID_SolicitudesConfiabilidad, UsuarioActualizacion, \`UsuarioCreación\`, ID_Cliente, Identificacion, NombreCompleto,
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
      @id, @usuarioActualizacion, @usuarioCreacion, @cliente, @identificacion, @nombre,
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
    identificacion: payload.identificacion, nombre: payload.nombre,
    cc: payload.centroCostos || 'N/A', tipo: payload.tipoTrabajador, estado: "Creada",
    tipoId: payload.tipoIdentificacion || '', fechaExp: payload.fechaExpedicion || '',
    cargo: payload.cargo || '', correo: payload.correo || '', celular: payload.celular || '',
    ciudad: payload.ciudad || '', barrio: payload.barrio || '', direccion: payload.direccion || '',
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

  return { success: true, requestId: newId, message: "Solicitud creada correctamente." };
}

// ─── CARGA MASIVA ───────────────────────────────────────────────────────
function getTemplateName(email, { clientId }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");
  if (!context.isAdmin && !context.creationClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para descargar plantillas de este cliente.");
  }
  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
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
  if (!context.isAdmin && !context.creationClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para cargar datos para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;

  const normalizeStr = (str) => {
    if (!str) return "";
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  };

  let clientTypeRaw = context.clientTypes[clientId];
  if (!clientTypeRaw) {
    try {
      const sqlCheck = `SELECT TipodeCliente FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` WHERE ID_ClientesConfiabilidad = @id LIMIT 1`;
      const checkRes = bq.query(sqlCheck, { id: clientId });
      if (checkRes.length > 0) clientTypeRaw = checkRes[0].TipodeCliente;
    } catch (e) { console.warn("No se pudo verificar tipo de cliente:", e.message); }
  }
  const isInternal = String(clientTypeRaw || 'Externo').toLowerCase().includes('interno');

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

  const validTiposID = new Set(['CEDULA DE CIUDADANIA','TARJETA DE IDENTIDAD','CEDULA DE EXTRANJERIA','CEDULA EXTRANJERIA','PASAPORTE','PERMISO ESPECIAL','PERMISO PERMANENTE DE TRABAJO','PEP','OTRO']);
  const validTiposPoligrafia = new Set(['PREEMPLEO', 'RUTINA', 'ESPECIFICA', 'VERIFEYE PREEMPLEO', 'VERIFEYE RUTINA', 'VERIFEYE ESPECIFICA', 'VSA PREEMPLEO', 'VSA RUTINA', 'VSA ESPECIFICA']);

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

    if (!rowData.NombreCompleto) {
      validationErrors.push(`Fila ${rowNum}: NombreCompleto es obligatorio`);
    }

    if (!rowData.TipoIdentificacion) {
      validationErrors.push(`Fila ${rowNum}: TipoIdentificacion es obligatorio`);
    } else if (!validTiposID.has(normalizeStr(rowData.TipoIdentificacion))) {
      validationErrors.push(`Fila ${rowNum}: TipoIdentificacion "${rowData.TipoIdentificacion}" no es válido`);
    }

    if (!rowData.Identificacion) {
      validationErrors.push(`Fila ${rowNum}: Identificacion es obligatoria`);
    } else if (rowData.Identificacion.length < 5 || rowData.Identificacion.length > 15) {
      validationErrors.push(`Fila ${rowNum}: Identificacion debe tener entre 5 y 15 caracteres`);
    }

    if (!rowData.Cargo) validationErrors.push(`Fila ${rowNum}: Cargo es obligatorio`);
    if (!rowData.Celular) validationErrors.push(`Fila ${rowNum}: Celular es obligatorio`);
    
    if (!rowData.Ciudad) {
      validationErrors.push(`Fila ${rowNum}: Ciudad es obligatoria`);
    } else if (!validCiudades.has(normalizeStr(rowData.Ciudad))) {
      validationErrors.push(`Fila ${rowNum}: Ciudad "${rowData.Ciudad}" no existe en el maestro`);
    }

    if (!rowData.Direccion) validationErrors.push(`Fila ${rowNum}: Direccion es obligatoria`);
    if (!rowData.TipoTrabajador) validationErrors.push(`Fila ${rowNum}: TipoTrabajador es obligatorio`);

    if (isInternal) {
      if (!rowData.Linea) validationErrors.push(`Fila ${rowNum}: Linea obligatoria para Cliente Interno`);
      if (!rowData.LineaNegocio) validationErrors.push(`Fila ${rowNum}: LineaNegocio obligatoria para Cliente Interno`);
      if (!rowData.CentroCostos) validationErrors.push(`Fila ${rowNum}: CentroCostos obligatorio para Cliente Interno`);
    }

    const hasService = ['VisitaDomiciliaria', 'ConsultaAntecedentes', 'Referenciacion', 'EstudiosPoligrafia', 'ConsultaDatacredito', 'ComparativoOEA'].some(s => rowData[s] === 'SI');
    if (!hasService) {
      validationErrors.push(`Fila ${rowNum}: Debe seleccionar al menos un servicio a aplicar (escribir "SI" en alguna de las columnas de servicios)`);
    }

    if (rowData.VisitaDomiciliaria !== 'SI') rowData.ModalidadVisita = '';
    if (rowData.Referenciacion !== 'SI') {
      rowData.ReferenciaAcademica = 'NO';
      rowData.ReferenciaLaboral   = 'NO';
      rowData.ReferenciaPersonal  = 'NO';
    }
    if (rowData.EstudiosPoligrafia !== 'SI') {
      rowData.TipoPoligrafia = '';
      rowData.CiudadP        = '';
    }

    if (rowData.VisitaDomiciliaria === 'SI' && !rowData.ModalidadVisita) {
      validationErrors.push(`Fila ${rowNum}: ModalidadVisita es obligatoria cuando aplica VisitaDomiciliaria`);
    }
    if (rowData.Referenciacion === 'SI') {
      if (!rowData.ReferenciaAcademica) validationErrors.push(`Fila ${rowNum}: ReferenciaAcademica (SI/NO) es obligatoria al aplicar Referenciacion`);
      if (!rowData.ReferenciaLaboral)   validationErrors.push(`Fila ${rowNum}: ReferenciaLaboral (SI/NO) es obligatoria al aplicar Referenciacion`);
      if (!rowData.ReferenciaPersonal)  validationErrors.push(`Fila ${rowNum}: ReferenciaPersonal (SI/NO) es obligatoria al aplicar Referenciacion`);

      const alMenosUnaRef = rowData.ReferenciaAcademica === 'SI' || rowData.ReferenciaLaboral === 'SI' || rowData.ReferenciaPersonal === 'SI';
      if (!alMenosUnaRef) validationErrors.push(`Fila ${rowNum}: Referenciacion activa pero todas las referencias están en NO — debe tener al menos una en SI`);
    }
    if (rowData.EstudiosPoligrafia === 'SI') {
      if (!rowData.TipoPoligrafia) {
        validationErrors.push(`Fila ${rowNum}: TipoPoligrafia es obligatorio cuando aplica EstudiosPoligrafia`);
      } else if (!validTiposPoligrafia.has(normalizeStr(rowData.TipoPoligrafia))) {
        validationErrors.push(`Fila ${rowNum}: TipoPoligrafia "${rowData.TipoPoligrafia}" no es válido`);
      }
      if (!rowData.CiudadP) validationErrors.push(`Fila ${rowNum}: CiudadP es obligatoria cuando aplica EstudiosPoligrafia`);
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
      const insertSql = `
        INSERT INTO \`${tableWrite}\`
        (
          ID_SolicitudesConfiabilidad, UsuarioActualizacion, \`UsuarioCreación\`, ID_Cliente, Identificacion, NombreCompleto,
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
          @id, @usuarioActualizacion, @usuarioCreacion, @cliente, @ident, @nombre,
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
        id: generateUniqueId(), usuarioActualizacion: email, usuarioCreacion: email, cliente: clientId,
        ident: rowData.Identificacion || '', nombre: rowData.NombreCompleto || '',
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

// ─── REGISTRAR METADATOS DE DOCUMENTO (BigQuery) ─────────────────────────
function registerTempDocument(email, { requestId, docName, fileName }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Usuario no autorizado.");
  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
  const tableId = `${projectId}.${DATASET_ID}.${TABLES.DOCS_TEMP}`;
  const docId = generateUniqueId();

  const cleanFileName = String(fileName || '').split(/[/\\]/).pop();

  const insertSql = `
    INSERT INTO \`${tableId}\`
    (ID_DocumentosSolicitud, ID_SolicitudesConfiabilidad, NombreDocumento, Documento, UsuarioActualziacion, FechaActualizacion, EstadoActual)
    VALUES (@docId, @reqId, @docName, @fileAlias, @user, CAST(CURRENT_TIMESTAMP() AS STRING), 'Creada')
  `;
  bq.query(insertSql, { docId, reqId: requestId, docName, fileAlias: cleanFileName, user: email });
  return { success: true, message: "Metadatos registrados." };
}

// ─── GUARDAR DOCUMENTO DIRECTO VÍA PROXY (URL LIMPIA + BEARER TOKEN) ─────
function uploadDocument(email, payload) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Usuario no autorizado.");

  const { filename, base64, mimetype } = payload;
  if (!filename || !base64) throw new Error("Faltan datos de archivo para guardar en Drive.");

  const cleanFileName = String(filename).split(/[/\\]/).pop().trim();
  const esPdf = String(mimetype || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(cleanFileName);
  if (!esPdf) throw new Error("Solo se permiten archivos en formato PDF.");

  const cleanBase64 = String(base64).replace(/^data:.*?;base64,/, '');
  const decoded = Utilities.base64Decode(cleanBase64);
  if (decoded.length === 0) throw new Error("El archivo está vacío.");
  if (decoded.length > MAX_DOC_BYTES) {
    throw new Error(`El archivo supera el máximo permitido de ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB.`);
  }

  try {
    // 1. Limpieza de URL: elimina /a/macros/co.g4s.com/ para evitar redirección de inicio de sesión de Google
    const cleanUrl = PROXY_URL.replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/');

    const proxyPayload = {
      token: PROXY_TOKEN,
      filename: cleanFileName,
      mimetype: 'application/pdf',
      base64: cleanBase64
    };

    // 2. Encabezados: si el Proxy pide autenticación de dominio, inyecta el token Bearer
    const headers = {};
    try {
      const token = ScriptApp.getOAuthToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } catch (e) {
      console.warn("No se pudo obtener ScriptApp.getOAuthToken():", e.message);
    }

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(proxyPayload),
      muteHttpExceptions: true
    };

    const resp = UrlFetchApp.fetch(cleanUrl, options);
    const respCode = resp.getResponseCode();
    const respText = resp.getContentText();

    let result = {};
    try {
      result = JSON.parse(respText);
    } catch (e) {
      if (respText.includes("SUCCESS_UPLOAD") || respCode === 200) {
        return { success: true, fileName: cleanFileName };
      }
      throw new Error("Respuesta inválida del servidor Proxy: " + respText);
    }

    if (result.success || result.fileId) {
      console.log(`✅ Archivo guardado vía Proxy exitosamente: ${cleanFileName}`);
      return { success: true, fileId: result.fileId, fileName: result.fileName || cleanFileName };
    } else {
      throw new Error(result.message || "Error reportado por el Proxy al subir archivo.");
    }
  } catch (proxyErr) {
    console.error("Fallo guardando archivo en Proxy:", proxyErr.message);
    throw new Error("No fue posible almacenar el archivo en Drive: " + proxyErr.message);
  }
}

// ─── OBTENER ARCHIVO EN BASE64 DIRECTO VÍA PROXY ─────────────────────────
function getFileBase64(payload) {
  try {
    let rawInput = String(payload.filename || payload.path || payload.id || '').trim();
    if (!rawInput) return { success: false, message: "No se proporcionó un nombre o ID de archivo." };

    let cleanName = rawInput;
    try { cleanName = decodeURIComponent(cleanName); } catch (e) {}
    cleanName = cleanName.split(/[/\\]/).pop().trim();

    // 1. Limpieza de URL
    const cleanUrl = PROXY_URL.replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/');
    const proxyFetchUrl = `${cleanUrl}?token=${encodeURIComponent(PROXY_TOKEN)}&action=base64&filename=${encodeURIComponent(cleanName)}`;

    // 2. Encabezado de autenticación de dominio
    const headers = {};
    try {
      const token = ScriptApp.getOAuthToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } catch (e) {}

    const proxyRes = UrlFetchApp.fetch(proxyFetchUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    if (proxyRes.getResponseCode() === 200) {
      const jsonRes = JSON.parse(proxyRes.getContentText());
      if (jsonRes.success && jsonRes.base64) {
        return {
          success: true,
          base64: jsonRes.base64,
          mimeType: jsonRes.mimeType || 'application/pdf',
          fileName: jsonRes.fileName || cleanName
        };
      } else {
        return { success: false, message: jsonRes.message || `Archivo no encontrado: "${cleanName}"` };
      }
    } else {
      return { success: false, message: `Error del Proxy (${proxyRes.getResponseCode()}): ${proxyRes.getContentText()}` };
    }

  } catch (error) {
    console.error("Error en getFileBase64 vía Proxy:", error.message);
    return { success: false, message: error.message };
  }
}

// ─── CONFIGURACIÓN DE CLIENTES Y USUARIOS ────────────────────────────────
function updateClientConfig(email, { clientId, forcedMyRequests }) {
  const context = getUserContext(email);
  if (!context.isAdmin) throw new Error("Solo administradores pueden realizar esta acción.");
  
  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();
  const sql = `UPDATE \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` SET ForcedMyRequests = @val WHERE ID_ClientesConfiabilidad = @id`;
  bq.query(sql, { val: forcedMyRequests ? 'SI' : 'NO', id: clientId });
  return { success: true, message: "Configuración actualizada." };
}

function getClientUsers(email, { clientId }) {
  const context = getUserContext(email);
  if (!context.isAdmin) throw new Error("Acceso Denegado");
  const bq = new BigQueryClient();
  const projectId = bq.getProjectId();

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
  const projectId = bq.getProjectId();

  const VALID_ROLES = ['Cliente Completo', 'Cliente Creación', 'Cliente Consulta', 'Cliente Perfilado', 'Administrador', 'Coordinador General', 'Coordinador EP', 'Coordinador ECP'];

  if (role) {
    if (!VALID_ROLES.includes(role)) throw new Error(`Rol inválido: ${role}`);

    const checkSql = `SELECT Email FROM \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` WHERE Email = @targetEmail LIMIT 1`;
    const exists = bq.query(checkSql, { targetEmail });
    if (exists.length === 0) throw new Error(`Usuario no encontrado en el sistema: ${targetEmail}`);

    bq.query(
      `UPDATE \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` SET Rol_Asignado = @role WHERE Email = @targetEmail`,
      { role, targetEmail }
    );

    try {
      bq.query(
        `UPDATE \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` SET ForcedMyRequests = @val WHERE Correo = @targetEmail AND ID_ClientesConfiabilidad = @clientId`,
        { val: role === 'Cliente Perfilado' ? 'SI' : 'NO', targetEmail, clientId }
      );
    } catch (e) { console.warn("Error sincronizando ForcedMyRequests:", e.message); }

    const verify = bq.query(
      `SELECT Rol_Asignado FROM \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` WHERE Email = @targetEmail LIMIT 1`,
      { targetEmail }
    );
    const rolActual = verify[0]?.Rol_Asignado;
    if (rolActual !== role) {
      console.warn(`[updateUserConfig] El rol no se actualizó correctamente. Esperado: ${role}, Actual: ${rolActual}`);
      throw new Error("El cambio no se pudo verificar en BigQuery. Intente de nuevo.");
    }
    console.log(`✅ [updateUserConfig] Rol de ${targetEmail} cambiado a: ${role}`);
  }

  if (userForced !== undefined) {
    try {
      bq.query(
        `UPDATE \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` SET ForcedMyRequests = @val WHERE Correo = @targetEmail AND ID_ClientesConfiabilidad = @clientId`,
        { val: userForced ? 'SI' : 'NO', targetEmail, clientId }
      );
      console.log(`✅ [updateUserConfig] ForcedMyRequests de ${targetEmail} = ${userForced ? 'SI' : 'NO'}`);
    } catch (e) {
      console.warn("No se pudo actualizar ForcedMyRequests:", e.message);
    }
  }

  return { success: true, message: role ? `Rol actualizado a: ${role}` : 'Configuración guardada.' };
}

// ─── UTILIDADES ──────────────────────────────────────────────────────────
function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ─── CLIENTE BIGQUERY CON BIBLIOTECA OFICIAL OAuth2 ───────────────────────
class BigQueryClient {
  constructor() {
    this.creds = this.cargarCredenciales();
    this.token = this.getServiceAccountToken();
  }

  cargarCredenciales() {
    const scriptProps = PropertiesService.getScriptProperties();
    const jsonStr = scriptProps.getProperty('GOOGLE_CLOUD_CREDS');
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.private_key && parsed.client_email) {
          return parsed;
        }
      } catch (e) {
        console.warn("No se pudo parsear GOOGLE_CLOUD_CREDS como JSON:", e.message);
      }
    }

    if (typeof BQ_CREDENTIALS !== 'undefined' && BQ_CREDENTIALS.private_key) {
      return BQ_CREDENTIALS;
    }

    throw new Error("No se encontraron credenciales válidas en GOOGLE_CLOUD_CREDS ni en BQ_CREDENTIALS.");
  }

  getProjectId() {
    return this.creds.project_id || (typeof CONFIG !== 'undefined' ? CONFIG.PROJECT_ID : 'g4s-shared-tz1');
  }

  getServiceAccountToken() {
    try {
      const rawKey = String(this.creds.private_key || '');
      const pemKey = rawKey.replace(/\\n/g, '\n').trim();

      const service = OAuth2.createService('BigQueryAPI')
        .setTokenUrl('https://oauth2.googleapis.com/token')
        .setPrivateKey(pemKey)
        .setIssuer(this.creds.client_email)
        .setPropertyStore(PropertiesService.getScriptProperties())
        .setScope('https://www.googleapis.com/auth/bigquery');

      if (!service.hasAccess()) {
        const err = service.getLastError();
        console.error("❌ Error de acceso en OAuth2:", err);
        throw new Error("Fallo de acceso OAuth2 con BigQuery: " + (err ? JSON.stringify(err) : "Token expirado o inválido"));
      }

      return service.getAccessToken();

    } catch (err) {
      console.error("❌ Error en BigQueryClient.getServiceAccountToken:", err.message);
      throw new Error(`Error de autenticación con BigQuery: ${err.message}`);
    }
  }

  query(sql, params = {}) {
    const projectId = this.getProjectId();
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
    
    const queryParameters = Object.keys(params).map(key => ({
      name: key,
      parameterType: { type: 'STRING' },
      parameterValue: { value: String(params[key]) }
    }));

    const payload = {
      query: sql,
      useLegacySql: false,
      parameterMode: queryParameters.length > 0 ? 'NAMED' : undefined,
      queryParameters: queryParameters.length > 0 ? queryParameters : undefined,
      maxResults: 10000
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.token}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      throw new Error(`BigQuery Error: ${response.getContentText()}`);
    }

    let json = JSON.parse(response.getContentText());
    if (!json.schema) return [];
    
    const fields = json.schema.fields.map(f => f.name);
    let allRows = json.rows || [];
    let jobId = json.jobReference.jobId;
    let pageToken = json.pageToken;

    while (pageToken) {
      const nextUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?pageToken=${pageToken}&maxResults=10000`;
      const nextRes = UrlFetchApp.fetch(nextUrl, {
        method: 'get',
        headers: { Authorization: `Bearer ${this.token}` },
        muteHttpExceptions: true
      });
      if (nextRes.getResponseCode() !== 200) break;
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

function getFileIdByName(payload) {
  try {
    const filename = payload.filename;
    const files = DriveApp.getFilesByName(filename);
    
    if (files.hasNext()) {
      const file = files.next();
      return { success: true, id: file.getId() };
    } else {
      return { success: false, message: "Archivo no encontrado en Drive" };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function forzarPermisos() {
  DriveApp.getFiles();
}
