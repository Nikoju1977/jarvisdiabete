import test from "node:test";
import assert from "node:assert/strict";
import {createWriteQueue} from "./write-queue.mjs";
test("écritures chiffrées ordonnées, clé capturée à l'événement de saisie",async()=>{
 const writes=[];
 let release;
 const gate=new Promise(resolve=>release=resolve);
 const queue=createWriteQueue(async(key,data)=>{
  if(writes.length===0)await gate;
  writes.push({key,data});
 });
 const originalKey={id:"cle-voute-A"},originalData={readings:[1]};
 queue.enqueue(originalKey,originalData);
 originalData.readings.push(2);
 // Change the surrounding app session; the previous write must keep its own key.
 const nextKey={id:"cle-voute-B"};
 queue.enqueue(nextKey,{readings:[3]});
 release();
 await queue.flush();
 assert.deepEqual(writes.map(w=>w.key.id),["cle-voute-A","cle-voute-B"]);
 assert.deepEqual(writes[0].data.readings,[1]);
 assert.deepEqual(writes[1].data.readings,[3]);
});
test("une sauvegarde échouée empêche backup, fermeture ou suppression silencieuse",async()=>{
 let fail=true;
 const queue=createWriteQueue(async()=>{if(fail)throw Error("Quota de stockage dépassé");});
 await queue.enqueue({id:"k"},{readings:[]});
 await assert.rejects(()=>queue.flush(),/Quota de stockage/);
 assert.equal(queue.hasError(),true);
 fail=false;
 await queue.enqueue({id:"k"},{readings:[1]});
 await queue.flush();
 assert.equal(queue.hasError(),false);
});
