/* Route les anciennes installations vers DiabCare sans conserver l'ancien assistant en cache. */
const CACHE="diabcare-root-redirect-1";
const FILES=["./","./index.html","./manifest.json","./diabcare/icon.svg"];
self.addEventListener("install",e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
 e.waitUntil((async()=>{
  const ks=await caches.keys();
  for(const k of ks)if(k.startsWith("jarvis-diabete-")||k.startsWith("diabcare-root-redirect-")&&k!==CACHE)await caches.delete(k);
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",e=>{
 const req=e.request,u=new URL(req.url);
 if(req.method!=="GET"||u.origin!==self.location.origin||u.pathname.includes("/diabcare/"))return;
 e.respondWith(fetch(req).then(res=>{
  if(res.ok&&req.mode==="navigate"){const c=res.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",c));}
  return res;
 }).catch(async()=>req.mode==="navigate"?await caches.match("./index.html"):await caches.match(req)));
});
