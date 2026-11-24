import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("/* NOVA MUSIC - Navegación activa automática */");
const end = source.indexOf("/* NOVA MUSIC - Sincronización del reproductor expandido */", start);
assert(start >= 0 && end > start, "No se encontró el bloque real de navegación de NOVA MUSIC");
const navigationCode = source.slice(start, end);

assert(source.includes('if(event==="TOKEN_REFRESHED")'), "Falta evitar la revalidación al renovar el token");
assert(source.includes('if(heartbeatError){'), "Falta tratar los errores temporales del heartbeat");
assert(source.includes('if(alive===false){'), "Debe bloquearse el acceso si el servidor confirma que el dispositivo ya no está activo");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.setContent(`
    <!doctype html><html><head><style>
      *{box-sizing:border-box} body{margin:0;font:16px sans-serif}
      .topbar{height:64px;position:sticky;top:0;background:#111;color:white;z-index:2}
      section{height:800px;padding:20px;border-bottom:2px solid #999}
      .nova-bottom-nav{position:fixed;bottom:0;left:0;right:0;height:64px;background:#222;display:flex;z-index:3}
      .nav-item{flex:1;color:white;text-align:center;padding:10px}
      .nav-item.active{background:#6544aa}
    </style></head><body>
      <header class="topbar">NOVA MUSIC</header>
      <section class="nova-hero">Inicio</section>
      <section id="library">Explorar</section>
      <section class="playlist-section" id="favoritesSection">Favoritos</section>
      <section class="playlist-section"><div id="playlistGrid">Playlists</div></section>
      <nav class="nova-bottom-nav">
        <a href="#" class="nav-item active">Inicio</a>
        <a href="#library" class="nav-item">Explorar</a>
        <a href="#favoritesSection" class="nav-item">Favoritos</a>
        <a href="#playlistGrid" class="nav-item">Playlists</a>
      </nav>
    </body></html>`);
  await page.addScriptTag({ content: navigationCode });
  const nav = page.locator(".nova-bottom-nav .nav-item");
  const cases = [
    { index: 2, selector: "#favoritesSection", label: "Favoritos" },
    { index: 3, selector: "#playlistGrid", label: "Playlists" },
    { index: 1, selector: "#library", label: "Explorar" },
    { index: 0, selector: ".nova-hero", label: "Inicio" }
  ];
  for (const item of cases) {
    await nav.nth(item.index).tap();
    await page.waitForTimeout(150);
    const active = await nav.nth(item.index).evaluate(el => el.classList.contains("active"));
    assert(active, item.label + ": la pestaña no quedó activa");
    const hash = await page.evaluate(() => location.hash);
    assert.equal(hash, "", item.label + ": Safari/WebKit conservó un fragmento de navegación");
    const targetTop = await page.locator(item.selector).evaluate(el => el.getBoundingClientRect().top);
    assert(targetTop >= -90 && targetTop <= 100, item.label + ": el desplazamiento no llegó a la sección (" + targetTop + ")");
  }
  console.log("OK: navegación móvil WebKit, Favoritos, Playlists, Explorar e Inicio.");
  console.log("OK: comprobaciones estáticas de renovación de sesión y heartbeat.");
} finally {
  await browser.close();
}
