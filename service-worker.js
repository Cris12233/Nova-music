const CACHE="nova-pwa-shell-v1";
const CORE=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icons/nova-icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("nova-pwa-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;e.respondWith(fetch(r).then(res=>{if(res.ok&&(r.mode==="navigate"||/\.(?:js|css)$/.test(u.pathname)))caches.open(CACHE).then(c=>c.put(r,res.clone()));return res;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(r,{ignoreSearch:true})||(r.mode==="navigate"?await c.match("./index.html"):Response.error());}));});
