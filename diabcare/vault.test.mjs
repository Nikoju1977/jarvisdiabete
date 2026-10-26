import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {fresh,exists,createVault,unlock,persist,erase,exportEncrypted,restoreEncryptedBackup} from "./vault.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const mem=new Map();
globalThis.localStorage={
 getItem:k=>mem.has(k)?mem.get(k):null,
 setItem:(k,v)=>mem.set(k,String(v)),
 removeItem:k=>mem.delete(k)
};
test("chiffrement AES-GCM : roundtrip et refus d'une mauvaise phrase",async()=>{
 erase();
 assert.equal(exists(),false);
 const state=fresh();state.readings=[{mg:120,ts:Date.now()}];
 const key=await createVault("PhraseLongueTresSecrete!",state);
 assert.equal(exists(),true);
 assert.equal(JSON.stringify([...mem]).includes("mg\\\":120"),false);
 const a=await unlock("PhraseLongueTresSecrete!");
 assert.deepEqual(a.state.readings,state.readings);
 await assert.rejects(unlock("PhraseCompletementFausse!"));
 state.readings.push({mg:149,ts:Date.now()});
 await persist(key,state);
 const b=await unlock("PhraseLongueTresSecrete!");
 assert.equal(b.state.readings.length,2);
 const backup=exportEncrypted();
 assert.match(backup,/diabcare-v4-backup/);
 assert.ok(!backup.includes("149"));
 erase();
 assert.equal(exists(),false);
});
test("phrase secrète trop courte refusée",async()=>{
 erase();await assert.rejects(createVault("123456",fresh()));
});

test("restauration : mot de passe incorrect n'écrase pas le coffre",async()=>{
 erase();
 const initial=fresh();initial.readings.push({mg:123,ts:Date.now()});
 await createVault("MotDePasseLong-1",initial);
 const backup=exportEncrypted();
 const current=await unlock("MotDePasseLong-1");
 current.state.readings.push({mg:140,ts:Date.now()});
 await persist(current.key,current.state);
 await assert.rejects(restoreEncryptedBackup(backup,"MotDePasseIncorrect"));
 assert.equal((await unlock("MotDePasseLong-1")).state.readings.length,2);
 await restoreEncryptedBackup(backup,"MotDePasseLong-1");
 assert.equal((await unlock("MotDePasseLong-1")).state.readings.length,1);
 erase();
});


test("coffre incomplet : ne peut pas être écrasé ni déverrouillé sans sauvegarde",async()=>{
 erase();
 mem.set("diabcare4.vault",'{"iv":"corrompu"}');
 assert.equal(exists(),true,"un coffre partiel doit rester réservé");
 await assert.rejects(createVault("NouvellePhraseTresLongue",fresh()),/coffre existe déjà/);
 await assert.rejects(unlock("NouvellePhraseTresLongue"),/incomplet/i);
 erase();
 mem.set("diabcare4.meta",'{"v":4,"salt":"corrompu"}');
 assert.equal(exists(),true);
 await assert.rejects(createVault("NouvellePhraseTresLongue",fresh()),/coffre existe déjà/);
 await assert.rejects(unlock("NouvellePhraseTresLongue"),/incomplet/i);
 erase();
});
test("quota : création partielle automatiquement annulée sans coffre fictif",async()=>{
 erase();
 const original=globalThis.localStorage;
 globalThis.localStorage={
  ...original,
  setItem(key,value){
   if(key==="diabcare4.meta")throw Error("QuotaExceededError");
   return original.setItem(key,value);
  }
 };
 try{
  await assert.rejects(createVault("PhraseTresLongue2026!",fresh()),/stockage plein ou bloqué/);
  assert.equal(mem.has("diabcare4.vault"),false);
  assert.equal(mem.has("diabcare4.meta"),false);
 }finally{globalThis.localStorage=original;erase();}
});
