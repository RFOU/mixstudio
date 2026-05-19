// Card V2 Studio — Code.gs
// Serveur AppScript : sert l'UI, gère les webhooks et l'envoi

const PROPS_WEBHOOKS_KEY = 'cv2_webhooks';
const PROPS_HISTORY_KEY  = 'cv2_history';

// ── Web App entry point ────────────────────────────────────────────────────
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Card V2 Studio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── Webhooks (stockés dans PropertiesService.getUserProperties) ────────────
function getWebhooks() {
  const raw = PropertiesService.getUserProperties().getProperty(PROPS_WEBHOOKS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveWebhooks(webhooks) {
  PropertiesService.getUserProperties().setProperty(
    PROPS_WEBHOOKS_KEY,
    JSON.stringify(webhooks)
  );
  return true;
}

// ── Historique ────────────────────────────────────────────────────────────
function getHistory() {
  const raw = PropertiesService.getUserProperties().getProperty(PROPS_HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveHistory(history) {
  // Garde seulement les 50 dernières entrées
  const trimmed = (history || []).slice(0, 50);
  PropertiesService.getUserProperties().setProperty(
    PROPS_HISTORY_KEY,
    JSON.stringify(trimmed)
  );
  return true;
}

// ── Envoi du message vers Google Chat ─────────────────────────────────────
function sendWebhook(webhookUrl, payload) {
  if (!webhookUrl) throw new Error('URL de webhook manquante.');

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(webhookUrl, options);
  const code     = response.getResponseCode();
  const body     = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ' : ' + body);
  }

  return { ok: true, code: code, body: body };
}

// ── Test de connectivité (ping à blanc) ───────────────────────────────────
function testWebhook(webhookUrl) {
  // Envoie un message texte simple pour valider l'URL
  const testPayload = { text: '🔔 *Card V2 Studio* — test de connectivité réussi ✓' };
  return sendWebhook(webhookUrl, testPayload);
}
