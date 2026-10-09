// Deploy only after the owner authorizes read access and reviews this endpoint.
// Set GOOGLE_DOC_ID in Script Properties; this file never contains the private ID.
var SOURCE_DOCUMENT_ID_PROPERTY = 'GOOGLE_DOC_ID';

function doGet() {
  try {
    var documentId = PropertiesService.getScriptProperties().getProperty(SOURCE_DOCUMENT_ID_PROPERTY);
    if (!documentId || !/^[A-Za-z0-9_-]{20,}$/.test(documentId)) throw new Error('SOURCE_ID_UNAVAILABLE');
    var doc = Docs.Documents.get(documentId, { includeTabsContent: true });
    var payload = parseGoogleDocItinerary(doc, ITINERARY_WEB_TAB);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: payload }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // Do not log exception messages or any document-derived content.
    console.error('Itinerary sync endpoint failed: ' + safeErrorCode(error));
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: safeErrorCode(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function safeErrorCode(error) {
  var code = error && typeof error.message === 'string' ? error.message : '';
  return /^[A-Z0-9_]{1,48}$/.test(code) ? code : 'SYNC_UNAVAILABLE';
}
