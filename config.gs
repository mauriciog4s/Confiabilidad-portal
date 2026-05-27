/**
 * ============================================================================
 * ARCHIVO: Config.gs
 * PROPÓSITO: Variables globales y credenciales sensibles.
 * ⚠️ NUNCA se envía al frontend. Solo Code.gs lo usa.
 * ============================================================================
 */

const CONFIG = {
  PROJECT_ID: "g4s-shared-tz1",
  DATASET_ID: "Confiabilidad",
  ADMIN_USERS: ["jhoan.aitan@co.g4s.com", "luis.romero@co.g4s.com"]
};

// Globales de acceso rápido
const DATASET_ID = CONFIG.DATASET_ID;
const ROOT_DRIVE_FOLDER_ID = "";

const TABLES = {
  READ_VIEW:   "vistaSolicitudesCompletasFechas",
  WRITE_TABLE: "conSolicitudesTemporal",
  DOCS:        "conDocumentosSolicitud",
  DOCS_TEMP:   "conDocumentosSolicitudTemporal",
  USERS:       "conUsuarios",
  REL_CLIENTS: "conUsuariosCliente",
  CLIENT_CONF: "conClienteConfiabilidad"
};

// ⚠️ LLAVES PRIVADAS - Solo aquí, nunca en code.gs ni en index.html
const BQ_CREDENTIALS = {
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC8pIXxJuXj2kgo\n3eJ0CuRG7QdZXazXTfTFt04VL6B9b2q+kHyR8UDefeg3LhaYq19jxazqoMvqFsQV\nU/tTCLzKYL+Yew4vy5NOkmENqXmtrjBHmxPqBoHk2R+7aR52RnGkGPcmNAmqcjv4\nCUjgCCq2ko4VDKIQav6/6Psrg1FoaQy4p1lJXZZVTJBU3vUfUIKzlLu7zOrmdZ/K\nUyK+nXSR5Sw6DeE5pf5ElG3QQ9KgjZ/FnzG9gRRWozdW8IgghY6Lw0efyE72ijjf\n873V0K8FqhqDYd1r9stCj05zl07UHqqLXx1ik8YcIxQQR63kcMkqLmysJZx/axds\naDRAvGQbAgMBAAECggEASgqdU/C7jLoxVnD4oCliPgBswQPGgl9jsnLnH+Oor3Ma\nx584daPmnS14Bqh9UAD7mNKOsyzXvJKg9eoXnBiy2RAuQ3AROmtB7zX/B/i7/JKA\n+qoAn/tb4nHiRZHV1gCCPDFcWE9Wd+MMbKdgRiaOdUiCofpqZd1JDhQo+YQ6YKsl\nFZdXPb9SxOFZOxDLjQY64/FV9gn3qFXBbMYf53yNmzd3l6aH/ERgWw3N9YZEgnFM\nBjKn6AN0JSsFLcacjtvgjNDE47U9jO5vdSKu0aFO+vDFBmlewou36i5S9AYLYyAQ\nNC5RDDQ/+WfPv3rGD7D4Nc9JGgK2PbEHRQypmDDNsQKBgQD3AzUE87voHefjH8xw\nWXlRd1H6+0OXt6BwohtSKJmoUvnmbtSjujSppT0EpQzdnrKJ5migbHu3xofaimcH\nmaeqTohuxtQq6E6Yly3kRGexlCAoj0LEW/Hmk1sIiuwI4ukqO6ZiCshMue8pErpE\n5Shb+2xR48nThaeHl8oqrfilCQKBgQDDgaGdKefwE/FCkMgM3ucB12SkHa37Whc9\nPn7YwrcqRC7ZkAvzkzRB/NcyW95fUcD8dYYvHyCHiksMxocwmJ38CbRJWibQlb3y\nMevWes60iAX4NjM1pWWIzADg8MUnncFlUZPWN/b7uxPzMrY1bijtxumGrme0jLwt\nfgOc6CkNAwKBgFhw3IXmYswsEP/APemoD4j8qOytFDl5NMe/MvsKsGGVPAamfhoV\nLI/lKuDD28Rp8tDvH1z5Gp7lRXUZAuS0vlR7A9xt8j9ep+14i6TkXSA2wgDjsmst\n5IHDFuALJZHU9Nj7PIp0A9184UWaf/j096tfbRww6+2BOEeTMH5xhcpJAoGAF9FD\nDxJ73xOO4L0ioe7F1cOXzyaOe4CONDfY3C9cgRmtW3PhANt+EkvrK4dln9cl25u1\nrSftnpWKbxQAhDsThBDqlcUV1XNooIjUYlyzseqgT4zK0E5GAFRaBw1N93WQifdW\nO1K2FBTGaWpUKE4zTkRdTrsQhz5d7mzbo9HkrmECgYAxR0UNwZeSLe+yZhdeK3cv\nqz55RbNeHwrhE10PE49CwlUDDdTHk2qK7raAV+LMFEz2Lq8umXxx2OgJSEip3ty4\noVA5qOjr5M62v1wTbrDpmi2ItWXxuzH+oHVW3MBS4jnrbZzsoZ0ZF855xbgfAEwI\nDAygge9kB/HNsXs2OMufAw==\n-----END PRIVATE KEY-----\n",
  "client_email": "tz1-bigquery@g4s-shared-tz1.iam.gserviceaccount.com",
  "project_id":   "g4s-shared-tz1",
  "client_id":    "g4s-shared-tz1"
};
