const WAIT_TIME_MS    = 5 * 60 * 1000;   // 5 min de bloqueo
const DISABLE_TIME_MS = 5 * 60 * 1000;   // 5 min sin restricción

// -----------------------------------------------------------------
// 1.  Estado por pestaña
// -----------------------------------------------------------------
/*
 * pending[tabId] = {
 *  originalUrl: string,
 *  timerId: number|null,
 *  skipBlock: boolean   // evita bloquear la recarga tras “Sí”
 * }
 */
const pending = {};

// -----------------------------------------------------------------
// 2.  Variable en memoria que indica hasta cuándo está desactivada
// -----------------------------------------------------------------
let disabledUntil = 0;   // 0 → nunca desactivada

// Cargar el valor guardado en storage al iniciar la extensión
chrome.storage.local.get('disabledUntil', (data) => {
    disabledUntil = data.disabledUntil || 0;
});

// -----------------------------------------------------------------
// 3.  Helper síncrono: ¿está la restricción temporalmente desactivada?
// -----------------------------------------------------------------
function isTemporarilyDisabled() {
    return Date.now() < disabledUntil;
}

// -----------------------------------------------------------------
// 4. Interceptar la solicitud principal (main_frame)
// -----------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        const { tabId, url } = details;

        // Ignorar URLs internas (chrome://, about:, etc.)
        if (!url || url.startsWith('chrome') || url.startsWith('about')) return {};

        // 4.1  Si la restricción está desactivada, dejar pasar la petición
        if (isTemporarilyDisabled()) return {};

        // 4.2  Si la pestaña tiene el flag skipBlock (recarga tras “Sí”), pasar una vez
        if (pending[tabId]?.skipBlock) {
            delete pending[tabId].skipBlock;
            return {};
        }

        // 4.3  Si ya hay una petición pendiente (el usuario cambió de URL antes de decidir)
        if (pending[tabId]) {
            resetTimer(tabId, url);
            return { cancel: true };
        }

        // 4.4  Primera visita → bloquear y mostrar pantalla de espera
        pending[tabId] = { originalUrl: url, timerId: null, skipBlock: false };
        chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocking.html') });
        startTimer(tabId);
        return { cancel: true };
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['blocking']
);

// -----------------------------------------------------------------
// 5.  Temporizador de 5 min
// -----------------------------------------------------------------
function startTimer(tabId) {
    clearTimer(tabId);
    pending[tabId].timerId = setTimeout(() => {
        // Cuando el tiempo termina, pedimos al contenido que muestre los botones
        chrome.tabs.sendMessage(tabId, { action: 'showConfirm' });
    }, WAIT_TIME_MS);
}

function resetTimer(tabId, newUrl) {
    pending[tabId].originalUrl = newUrl;
    startTimer(tabId);
}

function clearTimer(tabId) {
    if (pending[tabId]?.timerId) {
        clearTimeout(pending[tabId].timerId);
        pending[tabId].timerId = null;
    }
}

// -----------------------------------------------------------------
// 6.  Mensajes enviados desde blocking.js
// -----------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) return false;

    if (msg.action === 'continue') {
        const info = pending[tabId];
        if (info) {
            clearTimer(tabId);
            // Marcar que la próxima carga debe saltarse el bloqueo
            info.skipBlock = true;
            delete pending[tabId];

            // ---- DESACTIVAR LA RESTRICCIÓN POR 2 MIN ----
            disabledUntil = Date.now() + DISABLE_TIME_MS;
            chrome.storage.local.set({ disabledUntil });   // persiste para la próxima sesión

            // Recargar la URL original sin volver a bloquearla
            chrome.tabs.update(tabId, { url: info.originalUrl });
        }
    } else if (msg.action === 'close') {
        const info = pending[tabId];
        if (info) clearTimer(tabId);
        delete pending[tabId];
        chrome.tabs.remove(tabId);
    }
});
