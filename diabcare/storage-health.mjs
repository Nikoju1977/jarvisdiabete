/* Local-only browser storage health. Never transmits journal contents.
   The browser may reject persistence or evict data even after installation;
   encrypted backup outside the browser remains essential. */
const megabytes=b=>Math.round(b/1048576*10)/10;
export async function readStorageHealth(storage=globalThis.navigator?.storage){
 if(!storage)return {supported:false,persistent:null,usageMb:null,quotaMb:null};
 let persistent=null,usageMb=null,quotaMb=null;
 try{if(typeof storage.persisted==="function")persistent=Boolean(await storage.persisted());}catch{}
 try{
  if(typeof storage.estimate==="function"){
   const x=await storage.estimate();
   if(Number.isFinite(x?.usage)&&x.usage>=0)usageMb=megabytes(x.usage);
   if(Number.isFinite(x?.quota)&&x.quota>=0)quotaMb=megabytes(x.quota);
  }
 }catch{}
 return {supported:typeof storage.persist==="function",persistent,usageMb,quotaMb};
}
export function storageStatusText(health){
 if(!health)return "Stockage non vérifié.";
 const state=health.persistent===true?"Stockage persistant accepté par le navigateur.":"Stockage persistant non garanti.";
 const size=health.usageMb!==null&&health.quotaMb!==null?
  " Utilisation estimée du stockage web : "+health.usageMb+" Mo sur "+health.quotaMb+" Mo de quota navigateur.":
  " Quota et espace utilisés indisponibles.";
 return state+size+
  " Même avec le stockage persistant, une désinstallation ou suppression des données du site peut effacer le coffre. Exporte régulièrement une sauvegarde chiffrée.";
}
export async function requestStoragePersistence(storage=globalThis.navigator?.storage){
 if(typeof storage?.persist!=="function")return {granted:false,supported:false};
 try{return {granted:Boolean(await storage.persist()),supported:true};}
 catch{return {granted:false,supported:true};}
}
