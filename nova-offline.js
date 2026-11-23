const DB_NAME = "nova-music-offline";
const STORE = "tracks";
const API = "https://nova-mega-server.onrender.com";
let catalog = [];
let busy = false;
let objectUrl = null;

const byId = id => document.getElementById(id);
const context = () => window.NOVA_OFFLINE_CONTEXT ? window.NOVA_OFFLINE_CONTEXT() : {};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function get(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(String(id));
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function all() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result || []); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function put(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function remove(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(String(id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
function message(value) { const node = byId("novaOfflineProgress"); if (node) node.textContent = value; }
function escapeText(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function formatSize(bytes) {
  return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(2) + " GB" :
    bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.ceil(bytes / 1024) + " KB";
}
async function playbackTicket() {
  const state = context();
  if (!state.session || !state.session.access_token || !state.approved) throw new Error("Inicia sesión con una cuenta aprobada.");
  const response = await fetch(API + "/playback-ticket", {
    method: "POST", headers: { Authorization: "Bearer " + state.session.access_token }
  });
  const result = await response.json();
  if (!response.ok || !result.ticket) throw new Error(result.error || "No se pudo autorizar.");
  return result.ticket;
}
async function saveTrack(track) {
  const state = context();
  if (!state.approved) throw new Error("Tu cuenta no tiene acceso aprobado.");
  if (!state.downloadsAllowed) throw new Error("El administrador todavía no autorizó las descargas.");
  if (await get(track.id)) return false;
  const ticket = await playbackTicket();
  const url = API + "/offline?id=" + encodeURIComponent(track.id) + "&ticket=" + encodeURIComponent(ticket);
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo guardar " + track.title + ".");
  const blob = await response.blob();
  if (!blob.size) throw new Error("El audio llegó vacío.");
  await put({ id: String(track.id), title: track.title || "Canción", artist: track.artist || "", blob, size: blob.size, savedAt: Date.now() });
  return true;
}
async function render() {
  const target = byId("novaOfflineList");
  if (!target) return;
  try {
    const items = await all();
    byId("novaOfflineCount").textContent = items.length + " canciones guardadas";
    target.innerHTML = items.length ? items.map(item =>
      '<article class="nova-offline-item"><div><b>' + escapeText(item.title) +
      '</b><small>' + escapeText(item.artist) + ' · ' + formatSize(item.size) +
      '</small></div><button class="outline-btn" type="button" data-offline-remove="' +
      escapeText(item.id) + '">Quitar</button></article>'
    ).join("") : '<p class="muted-text">Todavía no has guardado canciones.</p>';
    target.querySelectorAll("[data-offline-remove]").forEach(button => button.onclick = async () => {
      await remove(button.dataset.offlineRemove); await render(); message("Canción quitada del almacenamiento sin conexión.");
    });
  } catch (error) { message("No se pudo abrir el almacenamiento local: " + error.message); }
}
async function play(id) {
  const item = await get(id);
  if (!item) return null;
  if (!context().approved) throw new Error("Conéctate para verificar tu acceso antes de reproducir.");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(item.blob);
  return objectUrl;
}
async function saveOne(id) {
  if (busy) return;
  const track = catalog.find(item => String(item.id) === String(id));
  if (!track) return;
  try { message("Guardando " + track.title + "…"); await saveTrack(track); await render(); message("Canción guardada dentro de NOVA MUSIC."); }
  catch (error) { message(error.message); }
}
async function saveAll() {
  const state = context();
  if (busy) return;
  if (!state.approved || !state.downloadsAllowed) { message("Necesitas acceso aprobado y permiso de descarga."); return; }
  if (!navigator.onLine) { message("Conéctate a internet para guardar canciones."); return; }
  if (!confirm("Se guardarán las canciones disponibles. Esto puede ocupar varios GB. ¿Continuar?")) return;
  busy = true;
  const button = byId("novaOfflineAll"); button.disabled = true;
  let saved = 0, existing = 0, errors = 0;
  try {
    for (let index = 0; index < catalog.length; index++) {
      try { if (await saveTrack(catalog[index])) saved++; else existing++; }
      catch (error) { errors++; message("Se detuvo en " + catalog[index].title + ": " + error.message); break; }
      message("Procesando " + (index + 1) + " de " + catalog.length + " · Nuevas: " + saved + " · Ya guardadas: " + existing);
      await render();
    }
    if (!errors) message("Terminado: " + saved + " nuevas, " + existing + " ya guardadas.");
  } finally { busy = false; button.disabled = false; await render(); }
}
function init() {
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-offline-save]");
    if (button) { event.preventDefault(); void saveOne(button.dataset.offlineSave); }
  });
  byId("novaOfflineAll")?.addEventListener("click", () => void saveAll());
  byId("novaOfflineClear")?.addEventListener("click", async () => {
    if (!confirm("¿Quitar todas las canciones guardadas en este dispositivo? No se borrarán de MEGA.")) return;
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close(); await render(); message("Almacenamiento sin conexión liberado.");
  });
}
export const NovaOffline = {
  setTracks(value) { catalog = Array.isArray(value) ? value : []; },
  play,
  render
};
init();
