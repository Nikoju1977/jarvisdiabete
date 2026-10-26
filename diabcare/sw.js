/* Cache applicatif hors ligne, sans synchronisation ni téléversement de données santé. */
const CACHE="diabcare-pwa-shell-4.7.1";
const RUNTIME="diabcare-runtime-wllama-3.6.1";
const VOICE_RUNTIME="diabcare-runtime-whisper-3.8.1";
const VOICE_LIB="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const LIB="https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/";
const FILES=["./","./index.html","./app.mjs","./core.mjs","./vault.mjs","./write-queue.mjs","./model.mjs","./ui.css","./voice-ui.css","./speech-policy.mjs","./voice-session.mjs","./speech-offline.mjs","./voice.mjs","./nutrition.mjs","./food-library.mjs","./ai-config.mjs","./specialists.mjs","./llm-sources.mjs","./manifest.webmanifest","./icon.svg"];
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
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin){
  if(request.url.startsWith(LIB)||request.url.startsWith(VOICE_LIB))event.respondWith(caches.open(request.url.startsWith(LIB)?RUNTIME:VOICE_RUNTIME).then(async cache=>{
   const cached=await cache.match(request);if(cached)return cached;
   const response=await fetch(request);if(response.ok){try{await cache.put(request,response.clone());}catch{}}
   return response;
  }));
  return;
 }
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));}return r;}).catch(()=>caches.match("./index.html")));
 }else{
  const appAsset=url.pathname.includes("/diabcare/")&&/\.(?:mjs|css|webmanifest|html)$/.test(url.pathname);
  if(appAsset){
   // Code et styles : réseau d'abord pour réparer les vieux écrans sans toucher au coffre.
   event.respondWith(fetch(request).then(async response=>{
    if(response.ok){
     try{const cache=await caches.open(CACHE);await cache.put(request,response.clone());}catch{}
    }
    return response;
   }).catch(async()=>await caches.match(request)||Response.error()));
  }else{
   event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(r=>{
    if(r.ok&&url.pathname.includes("/diabcare/")){const copy=r.clone();caches.open(CACHE).then(c=>c.put(request,copy));}
    return r;
   })));
  }
 }
});
