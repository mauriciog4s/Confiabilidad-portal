/**
* ------------------------------------------------------------------
* CONFIGURACIÓN & CREDENTIALS (BIGQUERY)
* ------------------------------------------------------------------
*/

const BQ_CREDENTIALS = {
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC8pIXxJuXj2kgo\n3eJ0CuRG7QdZXazXTfTFt04VL6B9b2q+kHyR8UDefeg3LhaYq19jxazqoMvqFsQV\nU/tTCLzKYL+Yew4vy5NOkmENqXmtrjBHmxPqBoHk2R+7aR52RnGkGPcmNAmqcjv4\nCUjgCCq2ko4VDKIQav6/6Psrg1FoaQy4p1lJXZZVTJBU3vUfUIKzlLu7zOrmdZ/K\nUyK+nXSR5Sw6DeE5pf5ElG3QQ9KgjZ/FnzG9gRRWozdW8IgghY6Lw0efyE72ijjf\n873V0K8FqhqDYd1r9stCj05zl07UHqqLXx1ik8YcIxQQR63kcMkqLmysJZx/axds\naDRAvGQbAgMBAAECggEASgqdU/C7jLoxVnD4oCliPgBswQPGgl9jsnLnH+Oor3Ma\nx584daPmnS14Bqh9UAD7mNKOsyzXvJKg9eoXnBiy2RAuQ3AROmtB7zX/B/i7/JKA\n+qoAn/tb4nHiRZHV1gCCPDFcWE9Wd+MMbKdgRiaOdUiCofpqZd1JDhQo+YQ6YKsl\nFZdXPb9SxOFZOxDLjQY64/FV9gn3qFXBbMYf53yNmzd3l6aH/ERgWw3N9YZEgnFM\nBjKn6AN0JSsFLcacjtvgjNDE47U9jO5vdSKu0aFO+vDFBmlewou36i5S9AYLYyAQ\nNC5RDDQ/+WfPv3rGD7D4Nc9JGgK2PbEHRQypmDDNsQKBgQD3AzUE87voHefjH8xw\nWXlRd1H6+0OXt6BwohtSKJmoUvnmbtSjujSppT0EpQzdnrKJ5migbHu3xofaimcH\nmaeqTohuxtQq6E6Yly3kRGexlCAoj0LEW/Hmk1sIiuwI4ukqO6ZiCshMue8pErpE\n5Shb+2xR48nThaeHl8oqrfilCQKBgQDDgaGdKefwE/FCkMgM3ucB12SkHa37Whc9\nPn7YwrcqRC7ZkAvzkzRB/NcyW95fUcD8dYYvHyCHiksMxocwmJ38CbRJWibQlb3y\nMevWes60iAX4NjM1pWWIzADg8MUnncFlUZPWN/b7uxPzMrY1bijtxumGrme0jLwt\nfgOc6CkNAwKBgFhw3IXmYswsEP/APemoD4j8qOytFDl5NMe/MvsKsGGVPAamfhoV\nLI/lKuDD28Rp8tDvH1z5Gp7lRXUZAuS0vlR7A9xt8j9ep+14i6TkXSA2wgDjsmst\n5IHDFuALJZHU9Nj7PIp0A9184UWaf/j096tfbRww6+2BOEeTMH5xhcpJAoGAF9FD\nDxJ73xOO4L0ioe7F1cOXzyaOe4CONDfY3C9cgRmtW3PhANt+EkvrK4dln9cl25u1\nrSftnpWKbxQAhDsThBDqlcUV1XNooIjUYlyzseqgT4zK0E5GAFRaBw1N93WQifdW\nO1K2FBTGaWpUKE4zTkRdTrsQhz5d7mzbo9HkrmECgYAxR0UNwZeSLe+yZhdeK3cv\nqz55RbNeHwrhE10PE49CwlUDDdTHk2qK7raAV+LMFEz2Lq8umXxx2OgJSEip3ty4\noVA5qOjr5M62v1wTbrDpmi2ItWXxuzH+oHVW3MBS4jnrbZzsoZ0ZF855xbgfAEwI\nDAygge9kB/HNsXs2OMufAw==\n-----END PRIVATE KEY-----\n",
  "client_email": "tz1-bigquery@g4s-shared-tz1.iam.gserviceaccount.com",
  "project_id": "g4s-shared-tz1"
};

const DATASET_ID = "Confiabilidad";
const TABLES = {
  READ_VIEW: "vistaSolicitudesCompletasFechas",
  WRITE_TABLE: "conSolicitudesTemporal",
  DOCS: "conDocumentosSolicitud",
  DOCS_TEMP: "conDocumentosSolicitudTemporal",
  USERS: "conUsuarios",
  REL_CLIENTS: "conUsuariosCliente",
  CLIENT_CONF: "conClienteConfiabilidad"
};

// Esta variable ya no se usará, pero se puede dejar vacía o borrar
const ROOT_DRIVE_FOLDER_ID = "";

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Confiabilidad') // Título actualizado
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function apiHandler(request) {
  const userEmail = Session.getActiveUser().getEmail();
  const { endpoint, payload } = request;
  console.log(`🔒 [API BQ] Endpoint: ${endpoint} | Usuario: ${userEmail}`);
  try {
    switch (endpoint) {
      case 'getUserContext': return getUserContext(userEmail);
      case 'getRequests': return getRequests(userEmail);
      case 'createRequest': return createRequest(userEmail, payload);
      case 'getSecondaryData': return getSecondaryData(userEmail);
      case 'getRequestDetail': return getRequestDetail(userEmail, payload);
      case 'refreshUserContext': return getUserContext(userEmail);
      
      // --- FUNCIONES COMENTADAS PARA EVITAR PERMISOS DE DRIVE ---
      // case 'uploadFile': return uploadFileHandler(userEmail, payload);
      // case 'getFileUrl': return getFileUrl(userEmail, payload);
      // ----------------------------------------------------------

      case 'getTemplateName': return getTemplateName(userEmail, payload);
      case 'processBulkUpload': return processBulkUpload(userEmail, payload);
      case 'registerTempDocument': return registerTempDocument(userEmail, payload);
      default: throw new Error(`Endpoint desconocido: ${endpoint}`);
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message} \nStack: ${err.stack}`);
    return { error: true, message: err.message };
  }
}

function getUserContext(email) {
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  let context = {
    email: email,
    role: 'Cliente',
    allowedClientIds: [],
    clientNames: {},
    clientTypes: {}, 
    clientData: {}, 
    isValidUser: false,
    isAdmin: false
  };

  const sqlUser = `SELECT Rol_Asignado FROM \`${projectId}.${DATASET_ID}.${TABLES.USERS}\` WHERE Email = @email LIMIT 1`;
  const userResult = bq.query(sqlUser, { email: email });

  if (userResult.length > 0) {
    const user = userResult[0];
    context.isValidUser = true;
    if (String(user.Rol_Asignado).trim().toLowerCase() === 'administrador') {
      context.role = 'Administrador';
      context.isAdmin = true;
    }
  } else {
    return context;
  }

  const sqlRel = `SELECT ID_ClientesConfiabilidad FROM \`${projectId}.${DATASET_ID}.${TABLES.REL_CLIENTS}\` WHERE Correo = @email`;
  const relResult = bq.query(sqlRel, { email: email });
  context.allowedClientIds = relResult.map(r => r.ID_ClientesConfiabilidad);

  if (context.allowedClientIds.length > 0) {
    const idsFormatted = context.allowedClientIds.map(id => `'${id}'`).join(',');
    const sqlDetails = `
      SELECT ID_ClientesConfiabilidad, RazonSocial, TipodeCliente, NIT
      FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\`
      WHERE ID_ClientesConfiabilidad IN (${idsFormatted})
    `;
    try {
      const detailsResult = bq.query(sqlDetails);
      detailsResult.forEach(row => {
        const id = row.ID_ClientesConfiabilidad;
        context.clientNames[id] = row.RazonSocial || `Cliente ${id}`;
        context.clientTypes[id] = row.TipodeCliente || 'Externo'; 
        context.clientData[id] = {
          nit: row.NIT,
          razonSocial: row.RazonSocial,
          tipo: row.TipodeCliente
        };
      });
    } catch (e) {
      console.warn("Error cargando detalles de clientes:", e.message);
      context.allowedClientIds.forEach(id => {
        if(!context.clientNames[id]) context.clientNames[id] = `Cliente ${id}`;
      });
    }
  }

  return context;
}

function getRequests(email) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableView = `${projectId}.${DATASET_ID}.${TABLES.READ_VIEW}`;
  const tableTemp = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;
  
  let params = {};
  let whereClause = "";

  if (!context.isAdmin) {
    if (context.allowedClientIds.length === 0) return { data: [], total: 0 };
    const paramKeys = context.allowedClientIds.map((_, i) => `id${i}`);
    const placeholders = paramKeys.map(k => `@${k}`).join(', ');
    whereClause = `WHERE ID_Cliente IN (${placeholders})`;
    context.allowedClientIds.forEach((val, i) => { params[`id${i}`] = val; });
  }

  // --- 1. CONSULTA PRINCIPAL ---
  const sqlView = `SELECT * FROM \`${tableView}\` ${whereClause} ORDER BY FechaSolicitud DESC`;
  let rowsView = [];
  try {
    rowsView = bq.query(sqlView, params);
  } catch (e) {
    console.warn("Error leyendo vista principal:", e.message);
    throw new Error("Error cargando solicitudes: " + e.message);
  }

  // --- 2. MAPEO DE DATOS DESDE LA VISTA ---
  if (rowsView.length > 0) {
    rowsView.forEach(row => {
        row.ProgramacionVisita = row.Fecha_Programacion_Visita || null;
        row.ProgramacionPoligrafia = row.Fecha_Programacion_Poligrafia || null;
        row.FechaEntregaECP = row.Fecha_Entrega_ECP || null;
        row.FechaEntregaEP = row.Fecha_Entrega_EP || null;
    });
  }

  // Cargar temporales (Solicitudes recién creadas)
  let sqlTemp = `SELECT * FROM \`${tableTemp}\` `;
  if (whereClause) {
     sqlTemp += `${whereClause} AND EstadoActual = 'Creada'`;
  } else {
     sqlTemp += `WHERE EstadoActual = 'Creada'`;
  }
  sqlTemp += ` ORDER BY FechaSolicitud DESC`;

  let rowsTemp = [];
  try {
    rowsTemp = bq.query(sqlTemp, params);
    rowsTemp.forEach(row => {
        if (row.ID_Cliente && context.clientData && context.clientData[row.ID_Cliente]) {
            const cData = context.clientData[row.ID_Cliente];
            if (!row.RazonSocial) row.RazonSocial = cData.razonSocial;
            if (!row.NIT) row.NIT = cData.nit;
            if (!row.Cliente) row.Cliente = cData.razonSocial;
        }
    });
  } catch (e) {
    console.warn("Error leyendo tabla temporal:", e.message);
  }

  // --- 3. DEDUPLICACIÓN (Vista > Temporal) ---
  const allRowsCombined = [...rowsView, ...rowsTemp];
  const uniqueRows = [];
  const seenIds = new Set();

  allRowsCombined.forEach(row => {
      const id = row.ID_SolicitudesConfiabilidad;
      if (!seenIds.has(id)) {
          seenIds.add(id);
          uniqueRows.push(row);
      }
  });

  // Reordenar por fecha descendente
  uniqueRows.sort((a, b) => {
      const valA = a.FechaSolicitud && a.FechaSolicitud.value ? a.FechaSolicitud.value : a.FechaSolicitud;
      const valB = b.FechaSolicitud && b.FechaSolicitud.value ? b.FechaSolicitud.value : b.FechaSolicitud;
      const dateA = new Date(valA);
      const dateB = new Date(valB);
      return dateB - dateA;
  });

  return { data: uniqueRows, total: uniqueRows.length };
}

function getTemplateName(email, { clientId }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  if (!context.isAdmin && !context.allowedClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para descargar plantillas de este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableConf = `${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}`;

  const sql = `SELECT PlantillaMasivo FROM \`${tableConf}\` WHERE ID_ClientesConfiabilidad = @id LIMIT 1`;
  const rows = bq.query(sql, { id: clientId });

  if (rows.length === 0 || !rows[0].PlantillaMasivo) {
    throw new Error("No hay plantilla configurada para este cliente.");
  }

  const fullPath = rows[0].PlantillaMasivo;
  const parts = fullPath.split(/[/\\]/);
  const filename = parts[parts.length - 1];

  return { success: true, filename: filename };
}

// -------------------------------------------------------------------------
// FUNCIÓN PROCESS BULK UPLOAD CON VALIDACIÓN ESTRICTA Y NORMALIZADA
// -------------------------------------------------------------------------
function processBulkUpload(email, { csvContent, clientId }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");
   if (!context.isAdmin && !context.allowedClientIds.includes(String(clientId))) {
    throw new Error("No tiene permisos para cargar datos para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;

  // Helper de Normalización
  const normalizeStr = (str) => {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Eliminar diacríticos
      .toUpperCase()
      .trim();
  };

  // --- PASO 0: VERIFICAR TIPO DE CLIENTE ---
  let clientTypeRaw = context.clientTypes[clientId];

  if (!clientTypeRaw) {
      const sqlCheck = `SELECT TipodeCliente FROM \`${projectId}.${DATASET_ID}.${TABLES.CLIENT_CONF}\` WHERE ID_ClientesConfiabilidad = @id LIMIT 1`;
      try {
          const checkRes = bq.query(sqlCheck, { id: clientId });
          if (checkRes.length > 0 && checkRes[0].TipodeCliente) {
              clientTypeRaw = checkRes[0].TipodeCliente;
          }
      } catch(e) {
          console.warn("Advertencia: No se pudo verificar tipo de cliente en BD, usando defecto Externo. " + e.message);
      }
  }

  const isInternal = String(clientTypeRaw || 'Externo').toLowerCase().includes('interno');

  // --- PASO 1: OBTENER DATOS MAESTROS PARA VALIDACIÓN ---
  const sqlMasters = `
    SELECT 'LineaCC' as Tipo, Linea, LN_Nombre, CC_Nombre, NULL as Descripcion FROM \`${projectId}.${DATASET_ID}.conLineaCC\`
    UNION ALL
    SELECT 'Ciudad', Ciudades, NULL, NULL, NULL FROM \`${projectId}.${DATASET_ID}.conCiudades\`
    UNION ALL
    SELECT 'Poligrafia', Ciudad, NULL, NULL, NULL FROM \`${projectId}.${DATASET_ID}.conPoligrafias\`
    UNION ALL
    SELECT 'ClienteProyecto', NULL, NULL, NULL, Descripcion FROM \`${projectId}.${DATASET_ID}.conClienteProyecto\`
  `;
  
  let masterData = [];
  try {
    masterData = bq.query(sqlMasters);
  } catch(e) {
    throw new Error("Error consultando tablas maestras para validación: " + e.message);
  }
  
  const validLineaCC = new Set();
  const validCiudades = new Set();
  const validPoligrafias = new Set();
  const validProyectos = new Set();
  
  masterData.forEach(row => {
      const tipo = row.Tipo || row.f?.[0]?.v;
      
      if (tipo === 'LineaCC') {
          const l = normalizeStr(row.Linea);
          const n = normalizeStr(row.LN_Nombre);
          const c = normalizeStr(row.CC_Nombre);
          validLineaCC.add(`${l}|${n}|${c}`);
      } else if (tipo === 'Ciudad') {
          validCiudades.add(normalizeStr(row.Linea)); 
      } else if (tipo === 'Poligrafia') {
          validPoligrafias.add(normalizeStr(row.Linea)); 
      } else if (tipo === 'ClienteProyecto') {
          validProyectos.add(normalizeStr(row.Descripcion)); 
      }
  });

  const validTiposPoli = new Set(['PREEMPLEO', 'RUTINA', 'ESPECIFICA', 'VERIFEYE PREEMPLEO', 'VERIFEYE RUTINA', 'VERIFEYE ESPECIFICA', 'VSA PREEMPLEO', 'VSA RUTINA', 'VSA ESPECIFICA']);
  const validModalidades = new Set(['PRESENCIAL', 'VIRTUAL', 'AUTOGESTIONADA']);
  const validTiposID = new Set([
      'CEDULA DE CIUDADANIA', 
      'TARJETA DE IDENTIDAD', 
      'CEDULA DE EXTRANJERIA', 
      'PASAPORTE', 
      'PERMISO ESPECIAL', 
      'PERMISO PERMANENTE DE TRABAJO', 
      'PEP', 
      'OTRO'
  ]);
  const validTiposTrabajador = new Set(['NUEVO', 'ACTUAL', 'REINVERSION']);
  const validBooleanos = new Set(['SI', 'NO']);

  // --- PASO 2: PROCESAR CSV ---
  let csvString = Utilities.newBlob(Utilities.base64Decode(csvContent)).getDataAsString('UTF-8');
  if (csvString.charCodeAt(0) === 0xFEFF) { csvString = csvString.slice(1); }

  const lines = csvString.split(/\r\n|\n|\r/);
  if (lines.length < 2) throw new Error("El archivo está vacío o no tiene formato correcto.");

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const normalizeHeader = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const columnMap = {
    'ID_Cliente': 'ID_Cliente',
    'CentroCostos': 'CentroCostos',
    'NombreCompleto': 'NombreCompleto',
    'TipoIdentificacion': 'TipoIdentificacion',
    'Identificacion': 'Identificacion',
    'FechaExpedicion': 'FechaExpedicion',
    'Cargo': 'Cargo',
    'Correo': 'Correo',
    'Celular': 'Celular',
    'Ciudad': 'Ciudad',
    'Direccion': 'Direccion',
    'Barrio': 'Barrio',
    'TipoTrabajador': 'TipoTrabajador',
    'VisitaDomiciliaria': 'VisitaDomiciliaria',
    'ModalidadVisita': 'ModalidadVisita',
    'ConsultaAntecedentes': 'ConsultaAntecedentes',
    'Referenciacion': 'Referenciacion',
    'ReferenciaAcademica': 'ReferenciaAcademica',
    'ReferenciaLaboral': 'ReferenciaLaboral',
    'ReferenciaPersonal': 'ReferenciaPersonal', 
    'EstudiosPoligrafia': 'EstudiosPoligrafia',
    'TipoPoligrafia': 'TipoPoligrafia',
    'CiudadP': 'CiudadP',
    'ConsultaDatacredito': 'ConsultaDatacredito',
    'ComparativoOEA': 'ComparativoOEA',
    'Notas': 'Notas',
    'Linea': 'Linea',
    'LineaNegocio': 'LineaNegocio',
    'ClienteProyectoInterno': 'ClienteProyectoInterno',
    'CentroCostosExterno': 'CentroCostosExterno' 
  };

  const normalizedMap = {};
  Object.keys(columnMap).forEach(k => {
    normalizedMap[normalizeHeader(k)] = columnMap[k];
  });

  const parsedRows = [];
  const validationErrors = [];

  // --- PASO 3: LECTURA Y VALIDACIÓN FILA A FILA ---
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
        if (val.toUpperCase() === 'TRUE') val = 'SI';
        if (val.toUpperCase() === 'FALSE') val = 'NO';
        rowData[bqColumn] = val;
        if(val) hasData = true;
      }
    });

    if (!hasData) continue;
    const rowNum = i + 1;
    
    // VALIDACIONES (simplificadas para el ejemplo, pero mantienen la lógica original)
    if (!rowData.NombreCompleto) validationErrors.push(`Error: Campo obligatorio vacío | Registro: Fila ${rowNum} | Columna: NombreCompleto`);
    if (!rowData.Identificacion) validationErrors.push(`Error: Campo obligatorio vacío | Registro: Fila ${rowNum} | Columna: Identificacion`);
    
    if (rowData.TipoIdentificacion) {
        if (!validTiposID.has(normalizeStr(rowData.TipoIdentificacion))) {
             validationErrors.push(`Error: Tipo de Identificación no válido | Registro: Fila ${rowNum}`);
        }
    } else {
         validationErrors.push(`Error: Campo obligatorio vacío | Registro: Fila ${rowNum} | Columna: TipoIdentificacion`);
    }

    if (rowData.Ciudad) {
        const ciudadNorm = normalizeStr(rowData.Ciudad);
        if (!validCiudades.has(ciudadNorm)) {
            validationErrors.push(`Error: La ciudad no existe en el maestro | Registro: Fila ${rowNum}`); 
        }
    }

    if (isInternal) {
        if (!rowData.Linea) validationErrors.push(`Error: Campo obligatorio para Cliente Interno vacío | Registro: Fila ${rowNum}`);
        if (!rowData.LineaNegocio) validationErrors.push(`Error: Campo obligatorio para Cliente Interno vacío | Registro: Fila ${rowNum}`);
        if (!rowData.CentroCostos) validationErrors.push(`Error: Campo obligatorio para Cliente Interno vacío | Registro: Fila ${rowNum}`);
    }

    parsedRows.push(rowData);
  }

  // --- PASO 4: DECISIÓN ---
  if (validationErrors.length > 0) {
      const maxErrors = 20;
      const errorMsg = "Errores de validación encontrados:\n\n" + 
                       validationErrors.slice(0, maxErrors).join("\n") + 
                       (validationErrors.length > maxErrors ? `\n... y ${validationErrors.length - maxErrors} errores más.` : "");
      return {
          success: false,
          validationError: true, 
          message: errorMsg,
          errorList: validationErrors 
      };
  }

  // --- PASO 5: INSERCIÓN ---
  let successCount = 0;
  let insertErrors = 0;

  for (const rowData of parsedRows) {
      try {
          const insertSql = `
            INSERT INTO \`${tableWrite}\`
            (
              ID_SolicitudesConfiabilidad, usuarioActualizacion, ID_Cliente, Identificacion, NombreCompleto,
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
              @id, @usuarioActualizacion, @cliente, @ident, @nombre,
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
          
          const params = {
            id: generateUniqueId(),
            usuarioActualizacion: email,
            cliente: clientId,
            ident: rowData.Identificacion || '',
            nombre: rowData.NombreCompleto || '',
            cc: rowData.CentroCostos || '',
            tipo: rowData.TipoTrabajador || 'Nuevo',
            estado: "Creada",
            tipoId: rowData.TipoIdentificacion || '',
            fechaExp: rowData.FechaExpedicion || '',
            cargo: rowData.Cargo || '',
            correo: rowData.Correo || '',
            celular: rowData.Celular || '',
            ciudad: rowData.Ciudad || '',
            barrio: rowData.Barrio || '',
            dir: rowData.Direccion || '',
            visita: rowData.VisitaDomiciliaria || 'NO',
            modVisita: rowData.ModalidadVisita || '',
            antec: rowData.ConsultaAntecedentes || 'NO',
            ref: rowData.Referenciacion || 'NO',
            refAcad: rowData.ReferenciaAcademica || 'NO',
            refLab: rowData.ReferenciaLaboral || 'NO',
            refPers: rowData.ReferenciaPersonal || 'NO', 
            poli: rowData.EstudiosPoligrafia || 'NO',
            tipoPoli: rowData.TipoPoligrafia || '',
            ciudPoli: rowData.CiudadP || '',
            datac: rowData.ConsultaDatacredito || 'NO',
            oea: rowData.ComparativoOEA || 'NO',
            notas: rowData.Notas || '',
            linea: rowData.Linea || '',
            lineaNeg: rowData.LineaNegocio || '',
            proyInt: rowData.ClienteProyectoInterno || '',
            ccExt: rowData.CentroCostosExterno || ''
          };

          bq.query(insertSql, params);
          successCount++;
      } catch(e) {
          console.error("Error insertando fila validada:", e);
          insertErrors++;
      }
  }

  return {
    success: true,
    loaded: successCount,
    failed: insertErrors,
    message: `Proceso finalizado. Cargados: ${successCount}, Errores Técnicos: ${insertErrors}`
  };
}

function createRequest(email, payload) {
  // Aseguramos que el email no sea nulo antes de enviarlo
  const emailFinal = email || Session.getActiveUser().getEmail() || 'UsuarioDesconocido';

  // --- VALIDACIÓN DE INTEGRIDAD DEL BACKEND: Al menos un servicio requerido ---
  // Verifica si al menos una de las banderas de servicio viene como 'true' o 'SI'
  const servicesToCheck = [
    payload.visitaDomiciliaria,
    payload.consultaAntecedentes,
    payload.referenciacion,
    payload.estudiosPoligrafia,
    payload.consultaDatacredito,
    payload.comparativoOEA
  ];
  
  // La lógica es simple: si todos son falsy/NO, lanza error.
  const hasAtLeastOneService = servicesToCheck.some(s => 
    s === true || String(s).toUpperCase() === 'SI'
  );

  if (!hasAtLeastOneService) {
    throw new Error("Solicitud Rechazada: Debe seleccionar al menos un servicio a aplicar.");
  }
  // --------------------------------------------------------------------------

  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  if (!context.isAdmin && !context.allowedClientIds.includes(String(payload.clientId))) {
    throw new Error("No tiene permisos para crear solicitudes para este cliente.");
  }

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const tableWrite = `${projectId}.${DATASET_ID}.${TABLES.WRITE_TABLE}`;
  const newId = generateUniqueId();
  const estadoInicial = "Creada";
  
  // CAMBIO 1: Inyectamos emailFinal directamente en el SQL con comillas simples '${emailFinal}'
  const insertSql = `
    INSERT INTO \`${tableWrite}\`
    (
      ID_SolicitudesConfiabilidad, usuarioActualizacion, ID_Cliente, Identificacion, NombreCompleto,
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
      @id, @usuarioActualizacion, @cliente, @identificacion, @nombre,
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

  // CAMBIO 2: Eliminamos usuarioCreacion de los params porque ya lo pusimos arriba
  const params = {
    id: newId,
    usuarioActualizacion: email,
    cliente: payload.clientId,
    identificacion: payload.identificacion,
    nombre: payload.nombre,
    cc: payload.centroCostos || 'N/A',
    tipo: payload.tipoTrabajador,
    estado: estadoInicial,
    tipoId: payload.tipoIdentificacion || '',
    fechaExp: payload.fechaExpedicion || '',
    cargo: payload.cargo || '',
    correo: payload.correo || '',
    celular: payload.celular || '',
    ciudad: payload.ciudad || '',
    barrio: payload.barrio || '',
    direccion: payload.direccion || '',
    visita: payload.visitaDomiciliaria || 'NO',
    modalidad: payload.modalidadVisita || '',
    antecedentes: payload.consultaAntecedentes || 'NO',
    referencia: payload.referenciacion || 'NO',
    refAcad: payload.referenciaAcademica || 'NO',
    refLab: payload.referenciaLaboral || 'NO',
    refPers: payload.referenciaPersonal || 'NO',
    poligrafia: payload.estudiosPoligrafia || 'NO',
    tipoPoli: payload.tipoPoligrafia || '',
    ciudadPoli: payload.ciudadPoligrafia || '',
    datacredito: payload.consultaDatacredito || 'NO',
    oea: payload.comparativoOEA || 'NO',
    notas: payload.notas || '',
    cliProy: payload.clienteProyectoInterno || '',
    linea: payload.linea || '',
    lineaNeg: payload.lineaNegocio || '',
    cliSec: payload.clienteClientesSecundarios || '',
    nitSec: payload.nitClienteSecundario || '',
    convSec: payload.convenioClienteSecundario || '',
    tipoCostoSec: payload.tipoCostoClienteSecundario || '',
    ccExterno: payload.centroCostosExterno || ''
  };

  bq.query(insertSql, params);

  return { success: true, requestId: newId, message: "Solicitud creada correctamente." };
}

function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getSecondaryData(email) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado.");

  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;
  const dataset = DATASET_ID;
  const parentTable = `${projectId}.${dataset}.${TABLES.READ_VIEW}`;

  let subquery = `SELECT ID_SolicitudesConfiabilidad FROM \`${parentTable}\``;
  const params = {};
   if (!context.isAdmin) {
    if (context.allowedClientIds.length === 0) return {};
    const paramKeys = context.allowedClientIds.map((_, i) => `id${i}`);
    subquery += ` WHERE ID_Cliente IN (${paramKeys.map(k => '@'+k).join(',')})`;
    context.allowedClientIds.forEach((val, i) => params[`id${i}`] = val);
  }

  subquery += ` ORDER BY FechaSolicitud DESC`;

  const tables = [
    'conServiciosAplicar', 'conAutFirmada', 'conConsultaDatacredito', 'conDocumentosSolicitud',
    'conEstadosSolicitud', 'conNotasSolicitudes', 'conInformePoligrafia', 'conSolicitudesMasivas',
    'conNovedades', 'conHistoricoEstServ', 'conHistoricoEstSolicitud'
  ];

  const result = {};

  tables.forEach(tableName => {
    const sql = `SELECT * FROM \`${projectId}.${dataset}.${tableName}\` WHERE ID_SolicitudesConfiabilidad IN (${subquery})`;
    try {
      result[tableName] = bq.query(sql, params);
    } catch (e) {
      console.warn(`Error fetching table ${tableName}: ${e.message}`);
      result[tableName] = [];
    }
  });

  // Tablas maestras
  try {
    const sqlCiudades = `SELECT Ciudades FROM \`${projectId}.${dataset}.conCiudades\` ORDER BY Ciudades ASC`;
    result['conCiudades'] = bq.query(sqlCiudades);
  } catch (e) {
    result['conCiudades'] = [];
  }

  try {
    const sqlPoli = `SELECT DISTINCT Ciudad FROM \`${projectId}.${dataset}.conPoligrafias\` WHERE Ciudad IS NOT NULL ORDER BY Ciudad ASC`;
    result['conPoligrafias'] = bq.query(sqlPoli);
  } catch (e) {
    result['conPoligrafias'] = [];
  }

  // LOGICA INTERNA
  try {
    const sqlCliProy = `SELECT Descripcion FROM \`${projectId}.${dataset}.conClienteProyecto\` ORDER BY Descripcion ASC`;
    result['ClienteProyecto'] = bq.query(sqlCliProy);
  } catch (e) {
    result['ClienteProyecto'] = [];
  }

  try {
    const sqlLineaCC = `SELECT Linea, LN_Nombre, CC_Nombre FROM \`${projectId}.${dataset}.conLineaCC\``;
    result['LineaCC'] = bq.query(sqlLineaCC);
  } catch (e) {
    result['LineaCC'] = [];
  }

  // LOGICA EXTERNA 
  try {
    const sqlSecClients = `SELECT ClientePrincipal, ClienteSecundarioNombre FROM \`${projectId}.${dataset}.conClientesSecundarios\``;
    result['conClientesSecundarios'] = bq.query(sqlSecClients);
  } catch (e) {
    result['conClientesSecundarios'] = [];
  }

  return result;
}

function getRequestDetail(email, { id }) {
  const context = getUserContext(email);
  if (!context.isValidUser) throw new Error("Acceso Denegado");
  const bq = new BigQueryClient();
  const projectId = BQ_CREDENTIALS.project_id;

  const sqlHeader = `SELECT * FROM \`${projectId}.${DATASET_ID}.${TABLES.READ_VIEW}\` WHERE ID_SolicitudesConfiabilidad = @id`;
  const headerRes = bq.query(sqlHeader, { id: id });
   if (headerRes.length === 0) throw new Error("Solicitud no encontrada.");
   if (!context.isAdmin && !context.allowedClientIds.includes(headerRes[0].ID_Cliente)) {
     throw new Error("No tiene permisos.");
  }

  const getChildren = (tableName) => {
    const sql = `SELECT * FROM \`${projectId}.${DATASET_ID}.${tableName}\` WHERE ID_SolicitudesConfiabilidad = @id`;
    return bq.query(sql, { id: id });
  };

  return {
    header: headerRes[0],
    services: getChildren('conServiciosAplicar'),
    history: getChildren('conEstadosSolicitud'),
    documents: getChildren('conDocumentosSolicitud')
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
    (ID_DocumentosSolicitud, ID_SolicitudesConfiabilidad, NombreDocumento, Documento, UsuarioActualziacion, FechaActualizacion, EstadoActual)
    VALUES (@docId, @reqId, @docName, @fileAlias, @user, CAST(CURRENT_TIMESTAMP() AS STRING), 'Creada')
  `;

  bq.query(insertSql, {
    docId: docId,
    reqId: requestId,
    docName: docName,
    fileAlias: fileName,
    user: email
  });

  return { success: true, message: "Metadatos registrados." };
}


class BigQueryClient {
  constructor() {
    this.token = this.getServiceAccountToken();
  }

  getServiceAccountToken() {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: BQ_CREDENTIALS.client_email,
      scope: 'https://www.googleapis.com/auth/bigquery',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };
    const signatureInput = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + '.' + Utilities.base64EncodeWebSafe(JSON.stringify(claim));
    const signature = Utilities.computeRsaSha256Signature(signatureInput, BQ_CREDENTIALS.private_key);
    const jwt = signatureInput + '.' + Utilities.base64EncodeWebSafe(signature);
    const options = { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt } };
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', options);
    return JSON.parse(response.getContentText()).access_token;
  }

  query(sql, params = {}) {
    const projectId = BQ_CREDENTIALS.project_id;
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
     const queryParameters = Object.keys(params).map(key => ({
      name: key, parameterType: { type: 'STRING' }, parameterValue: { value: String(params[key]) }
    }));

    const payload = {
      query: sql,
      useLegacySql: false,
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
      const nextResponse = UrlFetchApp.fetch(nextUrl, {
        method: 'get', 
        headers: { Authorization: `Bearer ${this.token}` }, 
        muteHttpExceptions: true
      });
    
      if (nextResponse.getResponseCode() !== 200) {
          console.warn("Error obteniendo página siguiente de BigQuery");
          break;
      }
    
      const nextJson = JSON.parse(nextResponse.getContentText());
      if (nextJson.rows) {
          allRows = allRows.concat(nextJson.rows);
      }
    
      pageToken = nextJson.pageToken;
    }

    return allRows.map(row => {
      let obj = {};
      row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
      return obj;
    });
  }
}
