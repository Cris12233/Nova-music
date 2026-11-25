const CACHE="nova-pwa-shell-v2";
const CORE=["./","./index.html","./styles.css","./manifest.webmanifest","./icons/nova-icon.svg"];

self.addEventListener("install",event=>{
 event.waitUntil(
  caches.open(CACHE)
   .then(cache=>cache.addAll(CORE))
   .then(()=>self.skipWaiting())
 );
});

self.addEventListener("activate",event=>{
 event.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(
    keys.filter(key=>key.startsWith("nova-pwa-")&&key!==CACHE).map(key=>caches.delete(key))
   ))
   .then(()=>self.clients.claim())
 );
});

self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;

 // El HTML y JavaScript siempre se solicitan a la red para evitar que
 // Safari/iOS ejecute una versión antigua de la aplicación desde caché.
 if(request.mode==="navigate"||/\\.js$/i.test(url.pathname)){
  event.respondWith(
   fetch(request).catch(async()=>{
    if(request.mode!=="navigate")return Response.error();
    const cache=await caches.open(CACHE);
    return await cache.match("./index.html")||Response.error();
   })
  );
  return;
 }

 event.respondWith(
  fetch(request).then(response=>{
   if(response.ok&&/\\.css$/i.test(url.pathname)){
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(request,copy));
   }
   return response;
  }).catch(async()=>{
   const cache=await caches.open(CACHE);
   return await cache.match(request,{ignoreSearch:true})||Response.error();
  })
 );
});
