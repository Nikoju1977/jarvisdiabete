import test from "node:test";
import assert from "node:assert/strict";
import {readStorageHealth,storageStatusText,requestStoragePersistence} from "./storage-health.mjs";
test("diagnostic local sur navigateur Chromium persistant",async()=>{
 const s={persisted:async()=>true,estimate:async()=>({usage:1048576,quota:10485760}),persist:async()=>true};
 const health=await readStorageHealth(s);
 assert.deepEqual(health,{supported:true,persistent:true,usageMb:1,quotaMb:10});
 assert.match(storageStatusText(health),/sauvegarde chiffrée/);
 assert.deepEqual(await requestStoragePersistence(s),{granted:true,supported:true});
});
test("Safari peut refuser le stockage persistant sans bloquer l'application",async()=>{
 const s={persisted:async()=>false,persist:async()=>false,estimate:async()=>{throw Error("quota restricted");}};
 const h=await readStorageHealth(s);
 assert.equal(h.persistent,false);assert.equal(h.quotaMb,null);
 assert.deepEqual(await requestStoragePersistence(s),{granted:false,supported:true});
 assert.match(storageStatusText(h),/non garanti/);
});
test("PWA en mode privé ou sans StorageManager ne prétend jamais garantir la sauvegarde",async()=>{
 assert.deepEqual(await requestStoragePersistence(null),{granted:false,supported:false});
 const h=await readStorageHealth(null);
 assert.equal(h.supported,false);
 assert.match(storageStatusText(h),/non garanti/);
});
test("erreurs de navigateur lors de persist sont traitées",async()=>{
 const s={persisted:async()=>{throw Error("denied");},persist:async()=>{throw Error("blocked");}};
 assert.equal((await readStorageHealth(s)).persistent,null);
 assert.deepEqual(await requestStoragePersistence(s),{granted:false,supported:true});
});
