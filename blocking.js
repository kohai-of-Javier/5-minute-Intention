const WAIT_TIME_MS = 5 * 60 * 1000; // 5 min (coincide con el del background)

let countdownEl = document.getElementById('countdown');
let overlayDiv   = document.getElementById('overlay');
let timerId = null;

/* -----------------------------------------------------------------
 *   1.  Iniciamos el contador visual inmediatamente al cargar la página
 *   ----------------------------------------------------------------- */
function startCountdown(remaining) {
    updateDisplay(remaining);
    timerId = setInterval(() => {
        remaining -= 1000;
        if (remaining <= 0) {
            clearInterval(timerId);
            // Cuando el tiempo termina, notificamos al background para que muestre los botones
            chrome.runtime.sendMessage({ action: 'timerFinished' });
        } else {
            updateDisplay(remaining);
        }
    }, 1000);
}

function updateDisplay(ms) {
    const mins = String(Math.floor(ms / 60000)).padStart(1, '0');
    const secs = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    countdownEl.textContent = `${mins}:${secs}`;
}

/* -----------------------------------------------------------------
 *   2.  Cuando el background indica que debe mostrarse la confirmación
 *   ----------------------------------------------------------------- */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'showConfirm') {
        showConfirmation();
    }
});

/* -----------------------------------------------------------------
 *   3.  Mostrar los botones “Sí, cargar” / “No, cerrar”
 *   ----------------------------------------------------------------- */
function showConfirmation() {
    // Reemplazamos el contenido del overlay
    overlayDiv.innerHTML = `
    <h1>¿Quieres seguir?</h1>
    <button id="yesBtn">Sí, cargar página</button>
    <button id="noBtn">No, cerrar pestaña</button>
    `;

    document.getElementById('yesBtn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'continue' });
    });
    document.getElementById('noBtn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'close' });
    });
}

/* -----------------------------------------------------------------
 *   4.  Arrancamos el contador tan pronto como la página se carga
 *   ----------------------------------------------------------------- */
startCountdown(WAIT_TIME_MS);
