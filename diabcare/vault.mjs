/* Coffre local AES-GCM. Le code ne quitte jamais l'appareil.
   Le PIN reste vulnérable aux tentatives hors ligne si faible : utiliser une phrase longue. */
const STORAGE_KEY="diabcare4.vault";
const META_KEY="diabcare4.meta";
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=u=>{let s="";for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s);};
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function fresh(){return {v:4,profile:{unit:"g"},readings:[],injections:[],meals:[],notes:[],chat:[],prefs:{speak:true},createdAt:Date.now()};}
export function exists(){
 // A partially written vault must never look like a new, empty installation:
 // that could overwrite the only encrypted copy after quota/storage errors.
 try{return localStorage.getItem(STORAGE_KEY)!==null||localStorage.getItem(META_KEY)!==null;}catch{return true;}
}
export async function derive(pin,salt){
 if(typeof pin!=="string"||pin.length<8||pin.length>128)throw Error("Utilise au moins 8 caractères pour protéger les données.");
 const key=await crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:500000,hash:"SHA-256"},key,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function encrypt(key,state){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(state)));
 return JSON.stringify({iv:b64(iv),ct:b64(new Uint8Array(ct))});
}
export async function decrypt(key,blob){
 const p=JSON.parse(blob),iv=un64(p.iv),ct=un64(p.ct);
 if(iv.byteLength!==12)throw Error("Données chiffrées invalides.");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,ct);
 const data=JSON.parse(dec.decode(plain));
 if(data?.v!==4||!Array.isArray(data.readings)||!Array.isArray(data.chat))throw Error("Format de coffre non reconnu.");
 return data;
}
export async function createVault(pin,data){
 if(exists())throw Error("Un coffre existe déjà.");
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await derive(pin,salt);
 const encrypted=await encrypt(key,data);
 try{
  localStorage.setItem(STORAGE_KEY,encrypted);
  localStorage.setItem(META_KEY,JSON.stringify({salt:b64(salt),v:4}));
 }catch(error){
  // Two localStorage keys are not atomic. Roll back the first write if metadata
  // could not be saved; if rollback itself fails, exists() remains fail-closed.
  try{localStorage.removeItem(STORAGE_KEY);}catch{}
  try{localStorage.removeItem(META_KEY);}catch{}
  throw Error("Création du coffre impossible : stockage plein ou bloqué. Aucun nouveau coffre n'a été confirmé. "+String(error?.message||error));
 }
 return key;
}
export async function unlock(pin){
 const encrypted=localStorage.getItem(STORAGE_KEY),rawMeta=localStorage.getItem(META_KEY);
 if(!encrypted||!rawMeta)throw Error("Coffre chiffré incomplet. Ne crée pas un nouveau coffre ; retrouve ta sauvegarde chiffrée avant toute action.");
 const meta=JSON.parse(rawMeta);
 if(meta?.v!==4||typeof meta.salt!=="string")throw Error("Métadonnées du coffre invalides. Conserve ta sauvegarde.");
 const salt=un64(meta.salt);
 if(salt.byteLength!==16)throw Error("Sel du coffre invalide. Conserve ta sauvegarde.");
 const key=await derive(pin,salt);
 const state=await decrypt(key,encrypted);
 return {key,state};
}
export async function persist(key,state){
 if(!key)throw Error("Coffre verrouillé.");
 const ciphertext=await encrypt(key,state);
 localStorage.setItem(STORAGE_KEY,ciphertext);
}
export function erase(){
 localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(META_KEY);
}
export function exportEncrypted(){
 const vault=localStorage.getItem(STORAGE_KEY),meta=localStorage.getItem(META_KEY);
 if(!vault||!meta)throw Error("Aucun coffre enregistré.");
 return JSON.stringify({format:"diabcare-v4-backup",vault:JSON.parse(vault),meta:JSON.parse(meta)},null,2);
}

/** Vérifie le mot de passe et l'intégrité AVANT de remplacer le coffre local. */
export async function restoreEncryptedBackup(fileText,passphrase){
 const backup=JSON.parse(fileText);
 if(backup?.format!=="diabcare-v4-backup"||backup?.meta?.v!==4||!backup?.vault?.iv||!backup?.vault?.ct)throw Error("Fichier de sauvegarde invalide.");
 const salt=un64(backup.meta.salt);
 if(salt.byteLength!==16)throw Error("Sel invalide.");
 const key=await derive(passphrase,salt);
 const state=await decrypt(key,JSON.stringify(backup.vault));
 const oldVault=localStorage.getItem(STORAGE_KEY),oldMeta=localStorage.getItem(META_KEY);
 try{
  localStorage.setItem(STORAGE_KEY,JSON.stringify(backup.vault));
  localStorage.setItem(META_KEY,JSON.stringify(backup.meta));
 }catch(e){
  if(oldVault===null)localStorage.removeItem(STORAGE_KEY);else localStorage.setItem(STORAGE_KEY,oldVault);
  if(oldMeta===null)localStorage.removeItem(META_KEY);else localStorage.setItem(META_KEY,oldMeta);
  throw e;
 }
 return state;
}
