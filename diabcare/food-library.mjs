/* Open Food Facts local library, persisted in IndexedDB — ONLY public product data.
   No glucose, insulin, patient profile, voice transcript or medical history ever stored here.
   OFF data licence: ODbL, https://world.openfoodfacts.org/terms-of-use
 */
import {validPer100} from "./nutrition.mjs";
const DB_NAME="diabcare-offline-foodfacts";
const STORE="products";
const VERSION=1;
const MAX_PRODUCTS=300;
const normal=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const validCode=code=>/^\d{8,14}$/.test(String(code||""));
export const OFFLINE_PACK_QUERIES=Object.freeze(["riz","pâtes","pain","yaourt","céréales","lait"]);
export function normalizeProduct(input,at=Date.now()){
 if(!input||input.kind!=="off"||!validCode(input.code)||!validPer100(input.per100))return null;
 const name=String(input.name||"").trim().slice(0,130);
 if(name.length<2||!Number.isFinite(at))return null;
 const brand=String(input.brand||"").trim().slice(0,80);
 return {
  code:String(input.code),name,brand,per100:input.per100,kind:"off",
  source:"Open Food Facts — produit mis en bibliothèque hors connexion",
  cachedAt:at,quantity:String(input.quantity||"").slice(0,50),
  servingSize:String(input.servingSize||"").slice(0,50)
 };
}
export function rankCached(products,query,limit=8){
 const token=normal(query),barcode=String(query||"").trim();
 if(token.length<2&&!validCode(barcode))return [];
 const words=token.split(" ").filter(w=>w.length>=2);
 const scored=[];
 for(const food of products||[]){
  if(!validPer100(food.per100)||food.kind!=="off")continue;
  const name=normal(food.name),label=normal(food.name+" "+(food.brand||""));
  if(!name)continue;
  let score=0;
  if(validCode(barcode)&&String(food.code)===barcode)score=1000;
  else if(token===name)score=180;
  else if(token===label)score=175;
  else if(name.startsWith(token))score=140;
  else if(label.includes(token))score=110;
  else if(words.length&&words.every(w=>label.includes(w)))score=90+words.length;
  else if(words.length===1&&label.includes(words[0]))score=40;
  if(score)scored.push({food,score});
 }
 return scored.sort((a,b)=>b.score-a.score||String(b.food.cachedAt||0).localeCompare(String(a.food.cachedAt||0))).slice(0,limit).map(x=>({...x.food,offline:true}));
}
function getIndexedDB(){
 if(typeof indexedDB==="undefined")throw Error("Bibliothèque indisponible : le navigateur bloque IndexedDB.");
 return indexedDB;
}
function requestPromise(request){
 return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error("Lecture locale impossible."));});
}
async function open(){
 return new Promise((resolve,reject)=>{
  let request;try{request=getIndexedDB().open(DB_NAME,VERSION);}catch(e){reject(e);return;}
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"code"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("Impossible d'ouvrir la bibliothèque hors connexion."));
  request.onblocked=()=>reject(Error("Ferme les autres onglets DiabCare avant de mettre à jour la bibliothèque."));
 });
}
async function withDb(action){
 const db=await open();
 try{return await action(db);}finally{db.close();}
}
export async function allCached(){
 return withDb(async db=>requestPromise(db.transaction(STORE,"readonly").objectStore(STORE).getAll()));
}
export async function cachedStats(){
 const data=await allCached();
 return {count:data.length,lastSaved:data.length?Math.max(...data.map(x=>x.cachedAt||0)):null};
}
export async function cachedSearch(query,limit=8){return rankCached(await allCached(),query,limit);}
export async function storeFoodProducts(items,{at=Date.now()}={}){
 const cleaned=new Map();
 for(const entry of items||[]){
  const food=normalizeProduct(entry,at);
  if(food)cleaned.set(food.code,food);
 }
 if(!cleaned.size)return {added:0,count:(await cachedStats()).count};
 return withDb(async db=>{
  const current=await requestPromise(db.transaction(STORE,"readonly").objectStore(STORE).getAll());
  const map=new Map(current.filter(x=>validCode(x.code)).map(x=>[x.code,x]));
  for(const [k,v] of cleaned)map.set(k,v);
  const kept=[...map.values()].sort((a,b)=>(b.cachedAt||0)-(a.cachedAt||0)).slice(0,MAX_PRODUCTS);
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite"),st=tx.objectStore(STORE);
   st.clear();for(const v of kept)st.put(v);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Enregistrement local impossible."));
   tx.onabort=()=>reject(tx.error||Error("Stockage insuffisant."));
  });
  return {added:cleaned.size,count:kept.length};
 });
}
export async function clearCached(){
 return withDb(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Impossible de vider la bibliothèque."));
 }));
}
export async function productByBarcode(code){
 if(!validCode(code))return null;
 return withDb(async db=>(await requestPromise(db.transaction(STORE,"readonly").objectStore(STORE).get(String(code))))||null);
}
export function libraryStatus(stats){
 if(!stats?.count)return "Aucun produit Open Food Facts mémorisé. La petite table indicative reste utilisable hors connexion.";
 const d=stats.lastSaved?new Date(stats.lastSaved).toLocaleDateString("fr-FR"):"date inconnue";
 return stats.count+" produit"+(stats.count>1?"s":"")+" Open Food Facts sur cet appareil (dernier téléchargement : "+d+"). Données collaboratives non garanties et parfois anciennes.";
}
