/* Cache applicatif hors ligne, sans synchronisation ni téléversement de données santé. */
const CACHE="diabcare-pwa-shell-4.0.0";
const FILES=["./","./index.html","./app.mjs","./core.mjs","./vault.mjs","./model.mjs","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith("diabcare-pwa-shell-")&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));}return r;}).catch(()=>caches.match("./index.html")));
 }else{
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(r=>{
   if(r.ok&&new URL(request.url).pathname.includes("/diabcare/")){const copy=r.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
   return r;
  })));
 }
});
