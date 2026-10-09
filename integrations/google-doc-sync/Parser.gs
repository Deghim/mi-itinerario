// Shared pure parser: Apps Script V8 and Node's vm-based fixture tests.
var ITINERARY_WEB_TAB = 'Itinerario web';
var ITINERARY_WEB_COLUMNS = [
  'Fecha',
  'Hora',
  'Lugar',
  'Actividad',
  'Transporte',
  'Hospedaje',
  'Costo estimado',
  'Reserva / boleto',
  'Notas',
];
// Source hosts already reviewed in this repo's public itinerary, place catalogue, and budget.
// Extend this allowlist deliberately when a new public source is approved.
var ITINERARY_PUBLIC_SOURCE_HOSTS = [
  'atlasobscura.com',
  'bunkyo.org.br',
  'cemiteriodaconsolacao.consolare.com.br',
  'cpc.webhostusp.sti.usp.br',
  'guiadeareasprotegidas.sp.gov.br',
  'jardimbotanico.com.br',
  'masp.org.br',
  'memorialdaresistenciasp.org.br',
  'museuafrobrasil.org.br',
  'prefeitura.sp.gov.br',
  'clickbus.com.br',
  'museudaimigracao.org.br',
  'www1.sap.sp.gov.br',
  'hostelkaizen.com',
  'hostelvergueiro.com',
  'ptax.bcb.gov.br',
  'hospedariario.com.br',
  'voegol.com.br'
];

function parseGoogleDocItinerary(document, expectedTabTitle) {
  var tabs = collectDocumentTabs(document && document.tabs ? document.tabs : []);
  var matches = tabs.filter(function (tab) {
    return tab && tab.tabProperties && tab.tabProperties.title === expectedTabTitle;
  });
  if (matches.length !== 1) throw new Error('TAB_NOT_UNIQUE');

  var content = matches[0].documentTab;
  if (!content || !content.body || !Array.isArray(content.body.content)) throw new Error('TAB_BODY_MISSING');
  var tables = findTables(content.body.content);
  var parsedRows = [];
  var recognizedTables = 0;
  var unrecognizedTables = 0;

  tables.forEach(function (table) {
    var logicalRows = expandTableRows(table);
    if (!logicalRows.length) {
      unrecognizedTables += 1;
      return;
    }
    var header = logicalRows[0].map(cellText).map(normalizeHeader);
    if (!sameValues(header, ITINERARY_WEB_COLUMNS.map(normalizeHeader))) {
      unrecognizedTables += 1;
      return;
    }
    recognizedTables += 1;

    logicalRows.slice(1).forEach(function (cells) {
      if (cells.length !== ITINERARY_WEB_COLUMNS.length || cells.some(function (cell) { return !cell; })) throw new Error('ROW_COLUMN_COUNT');
      var values = cells.map(cellText);
      if (values.every(function (value) { return !value; })) return;
      parsedRows.push(validateItineraryRow(values, cells));
    });
  });

  if (!recognizedTables) throw new Error('ITINERARY_TABLE_NOT_FOUND');
  if (unrecognizedTables) throw new Error('TABLE_SCHEMA_AMBIGUOUS');
  if (!parsedRows.length) throw new Error('ITINERARY_TABLE_EMPTY');
  if (parsedRows.length > 150) throw new Error('TOO_MANY_ROWS');
  return { schemaVersion: 1, columns: ITINERARY_WEB_COLUMNS.slice(), rows: parsedRows };
}

function collectDocumentTabs(tabs) {
  var result = [];
  (tabs || []).forEach(function (tab) {
    result.push(tab);
    result = result.concat(collectDocumentTabs(tab && tab.childTabs ? tab.childTabs : []));
  });
  return result;
}

function findTables(elements) {
  var tables = [];
  (elements || []).forEach(function (element) {
    if (element && element.table) tables.push(element.table);
    if (element && element.tableOfContents && element.tableOfContents.content) {
      tables = tables.concat(findTables(element.tableOfContents.content));
    }
  });
  return tables;
}

function expandTableRows(table) {
  if (!table || !Array.isArray(table.tableRows)) return [];
  var activeSpans = {};
  var result = [];
  table.tableRows.forEach(function (row, rowIndex) {
    var physicalCells = row && Array.isArray(row.tableCells) ? row.tableCells : [];
    var logical = [];
    Object.keys(activeSpans).forEach(function (column) {
      if (activeSpans[column].untilRow > rowIndex) logical[Number(column)] = activeSpans[column].cell;
    });

    var cursor = 0;
    physicalCells.forEach(function (cell) {
      while (logical[cursor] !== undefined) cursor += 1;
      var style = cell && cell.tableCellStyle ? cell.tableCellStyle : {};
      var columnSpan = positiveSpan(style.columnSpan);
      var rowSpan = positiveSpan(style.rowSpan);
      if (columnSpan > ITINERARY_WEB_COLUMNS.length) throw new Error('COLUMN_SPAN_LIMIT');
      for (var offset = 0; offset < columnSpan; offset += 1) {
        while (logical[cursor + offset] !== undefined) cursor += 1;
        logical[cursor + offset] = cell;
        if (rowSpan > 1) activeSpans[String(cursor + offset)] = { cell: cell, untilRow: rowIndex + rowSpan };
      }
      cursor += columnSpan;
    });

    Object.keys(activeSpans).forEach(function (column) {
      if (activeSpans[column].untilRow <= rowIndex) delete activeSpans[column];
    });
    if (logical.some(function (cell) { return cell !== undefined; })) result.push(logical);
  });
  return result;
}

function positiveSpan(value) {
  if (value === undefined || value === null) return 1;
  if (!Number.isInteger(value) || value < 1 || value > 150) throw new Error('INVALID_TABLE_SPAN');
  return value;
}

function cellText(cell) {
  if (!cell) return '';
  var output = '';
  (cell.content || []).forEach(function (element) {
    var paragraph = element && element.paragraph;
    if (!paragraph) return;
    (paragraph.elements || []).forEach(function (part) {
      if (part && part.textRun && typeof part.textRun.content === 'string') output += part.textRun.content;
      else if (part && part.autoText && typeof part.autoText.suggestedInsertionIds === 'undefined') output += '';
    });
  });
  return output.replace(/\u000b/g, '\n').replace(/\u0007/g, '').replace(/\r/g, '').trim().replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function normalizeHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
}

function sameValues(left, right) {
  return left.length === right.length && left.every(function (value, index) { return value === right[index]; });
}

function validateItineraryRow(values, cells) {
  var bounded = values.map(function (value, index) {
    var limits = [10, 100, 120, 300, 300, 200, 120, 120, 1000];
    if (value.length > limits[index]) throw new Error('CELL_LENGTH_LIMIT');
    return value;
  });
  var date = bounded[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidIsoDate(date)) throw new Error('INVALID_ROW_DATE');
  if (!bounded[2] || !bounded[3]) throw new Error('ROW_PLACE_OR_ACTIVITY_MISSING');
  if (bounded[1] && /\d{1,2}:\d{1,2}/.test(bounded[1]) && !allTimesValid(bounded[1])) throw new Error('INVALID_ROW_TIME');
  validatePublicFieldUrls([bounded[2], bounded[3], bounded[4], bounded[5], bounded[6], bounded[8]]);
  if (containsPrivateMarker(bounded[2] + ' ' + bounded[3] + ' ' + bounded[4] + ' ' + bounded[5] + ' ' + bounded[6] + ' ' + bounded[8])) {
    throw new Error('PRIVATE_MARKER_IN_PUBLIC_FIELD');
  }
  var links = extractSafeNoteLinks(cells[8]);
  var reservation = sanitizeReservationState(bounded[7]);
  return {
    date: date,
    time: bounded[1],
    place: bounded[2],
    activity: bounded[3],
    transport: bounded[4],
    lodging: bounded[5],
    cost: bounded[6],
    reservation: reservation,
    notes: bounded[8],
    sourceUrl: links.length ? links[0] : '',
  };
}

function isValidIsoDate(value) {
  var parts = value.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function allTimesValid(value) {
  var matches = value.match(/\d{1,2}:\d{1,2}/g) || [];
  return matches.every(function (time) {
    var parts = time.split(':').map(Number);
    return time.split(':')[1].length === 2 && parts[0] >= 0 && parts[0] <= 23 && parts[1] >= 0 && parts[1] <= 59;
  });
}

function containsPrivateMarker(value) {
  var withoutDates = String(value || '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, function (date) {
    return isValidIsoDate(date) ? ' ' : date;
  });
  return /\b(?:PNR|localizador|c[oó]digo\s+(?:de\s+)?(?:reserva|boleto)|booking\s+(?:code|reference)|e-ticket)\b/i.test(withoutDates) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(?:\+?\d[\d ()-]{8,}\d)/.test(withoutDates) ||
    /\b(?=[A-Z0-9]{6,8}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/.test(withoutDates);
}

function sanitizeReservationState(value) {
  var normalized = normalizeHeader(value);
  if (!normalized) return 'Por confirmar';
  if (/\b(?:no\s+pagad[oa]|sin\s+pago|pago\s+(?:por confirmar|pendiente|por definir)|por confirmar.{0,24}(?:pago|reserva)|(?:pago|reserva).{0,24}(?:por confirmar|pendiente|por definir))\b/.test(normalized)) return 'Por confirmar';
  if (/\b(?:sin\s+reserva|no\s+reservad[oa]|no\s+comprad[oa]|no\s+aplica|sin\s+boleto)\b/.test(normalized)) return 'Sin reserva';
  var hasPending = /\b(?:pendiente|por confirmar|por definir|por informar)\b/.test(normalized);
  var pendingAmount = /\b(?:importe|costo|precio|monto)\b.{0,24}\b(?:pendiente|por confirmar|por definir|por informar)\b/.test(normalized);
  var hasPaid = /\b(?:pagado|pagada|pagados|pagadas)\b/.test(normalized);
  if (hasPending && (!hasPaid || !pendingAmount)) return 'Por confirmar';
  if (/\b(?:pagado|pagada|pagados|pagadas)\b/.test(normalized)) return 'Pagado';
  if (/\bconfirmado por el viajero\b/.test(normalized)) return 'Confirmado por el viajero';
  if (/\b(?:reserva|boleto|entrada) confirmad[oa]\b/.test(normalized)) return 'Confirmado';
  if (/\b(?:propuesta|propuesto)\b/.test(normalized)) return 'Propuesta';
  if (/\bcondicional\b/.test(normalized)) return 'Condicional';
  return 'Por confirmar';
}

function extractSafeNoteLinks(cell) {
  var urls = [];
  var plainText = cellText(cell);
  var plainMatches = plainText.match(/https?:\/\/[^\s<>"']+/gi) || [];
  plainMatches.forEach(function (url) {
    var safe = safePublicUrl(url.replace(/[),.;]+$/, ''));
    if (!safe) throw new Error('UNSAFE_NOTE_URL');
    if (urls.indexOf(safe) === -1) urls.push(safe);
  });
  (cell && cell.content ? cell.content : []).forEach(function (element) {
    if (!element || !element.paragraph) return;
    (element.paragraph.elements || []).forEach(function (part) {
      var url = part && part.textRun && part.textRun.textStyle && part.textRun.textStyle.link && part.textRun.textStyle.link.url;
      if (!url) return;
      var safe = safePublicUrl(url);
      if (!safe) throw new Error('UNSAFE_NOTE_URL');
      if (urls.indexOf(safe) === -1) urls.push(safe);
    });
  });
  if (urls.length > 3) throw new Error('TOO_MANY_NOTE_URLS');
  return urls;
}

function safePublicUrl(value) {
  if (typeof value !== 'string' || value.length > 512) return '';
  var match = value.match(/^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i);
  if (!match || /[@\\]/.test(match[1]) || value.indexOf('#') !== -1) return '';
  var host = match[1].toLowerCase();
  var path = match[2] || '/';
  var query = match[3] || '';
  var allowlistHost = host.indexOf('www.') === 0 ? host.slice(4) : host;
  if (ITINERARY_PUBLIC_SOURCE_HOSTS.indexOf(host) === -1 && ITINERARY_PUBLIC_SOURCE_HOSTS.indexOf(allowlistHost) === -1) return '';
  if (query && !isSafeSourceQuery(allowlistHost, query)) return '';
  if (/reserv|booking|pnr|confirmation|checkout/i.test(path)) return '';
  var segments = path.split('/');
  for (var index = 0; index < segments.length; index += 1) {
    var segment = segments[index];
    try { segment = decodeURIComponent(segment); } catch (error) { return ''; }
    if (/^(?=[A-Z0-9]{6,8}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+$/.test(segment)) return '';
  }
  return 'https://' + host + path + (query ? '?' + query : '');
}

function isSafeSourceQuery(host, query) {
  var entries = query.split('&');
  if (!entries.length || entries.length > 2) return false;
  var seen = {};
  for (var index = 0; index < entries.length; index += 1) {
    var parts = entries[index].split('=');
    if (parts.length !== 2) return false;
    var key;
    var value;
    try {
      key = decodeURIComponent(parts[0].replace(/\+/g, ' '));
      value = decodeURIComponent(parts[1].replace(/\+/g, ' '));
    } catch (error) { return false; }
    if (seen[key]) return false;
    seen[key] = true;
    if (host === 'clickbus.com.br' && key === 'departureDate' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidIsoDate(value)) continue;
    if (host === 'ptax.bcb.gov.br' && key === 'method' && value === 'ConsultarTodasAsMoedas') continue;
    return false;
  }
  return true;
}

function validatePublicFieldUrls(fields) {
  (fields || []).forEach(function (field) {
    var matches = String(field || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
    matches.forEach(function (value) {
      if (!safePublicUrl(value.replace(/[),.;]+$/, ''))) throw new Error('UNSAFE_PUBLIC_FIELD_URL');
    });
  });
}
