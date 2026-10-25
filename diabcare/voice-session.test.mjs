import test from "node:test";
import assert from "node:assert/strict";
import {createVoiceSession} from "./voice-session.mjs";
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test("micro Android : enregistrer, terminer, puis transcrire et livrer une fois",async()=>{
 const got=[],statuses=[],clip=deferred();
 let started=0,stopped=0;
 const voice=createVoiceSession({
  capture:()=>{started++;return Promise.resolve({completed:clip.promise,stop:()=>{stopped++;clip.resolve(new Blob(["audio"]));return clip.promise;},cancel:()=>clip.reject(Error("cancel"))});},
  transcribe:async()=> "150 grammes de riz blanc cuit",
  onState:s=>statuses.push(s),onTranscript:s=>got.push(s)
 });
 const run=voice.start();
 await Promise.resolve();await Promise.resolve();
 assert.equal(voice.getStage(),"listening");
 assert.equal(voice.stop(),true);
 assert.equal(voice.stop(),false);
 assert.equal(await run,true);
 assert.deepEqual(got,["150 grammes de riz blanc cuit"]);
 assert.equal(started,1);assert.equal(stopped,1);
 assert.deepEqual(statuses,["requesting","listening","finishing","transcribing","idle"]);
});
test("si le micro est annulé pendant la permission, la piste tardive est stoppée",async()=>{
 const permission=deferred();let cancelled=0;
 const voice=createVoiceSession({
  capture:()=>permission.promise,
  transcribe:async()=>{throw Error("ne devrait pas arriver");},
 });
 const run=voice.start();
 voice.cancel();
 permission.resolve({completed:Promise.reject(Error("cancelled")),cancel:()=>{cancelled++;}});
 await run;
 assert.equal(cancelled,1);assert.equal(voice.getStage(),"idle");
});
test("fermer durant la transcription ignore le résultat obsolète",async()=>{
 const trans=deferred(),results=[];
 const voice=createVoiceSession({
  capture:async()=>({completed:Promise.resolve(new Blob(["audio"])),stop:()=>{},cancel:()=>{}}),
  transcribe:()=>trans.promise,
  onTranscript:s=>results.push(s)
 });
 const run=voice.start();
 for(let i=0;i<6;i++)await Promise.resolve();
 assert.equal(voice.getStage(),"transcribing");
 voice.cancel();
 trans.resolve("Réponse obsolète");
 await run;
 assert.deepEqual(results,[]);
 assert.equal(voice.getStage(),"idle");
});
test("une erreur MediaRecorder est visible et l'interface peut redémarrer",async()=>{
 let count=0;
 const errors=[];
 const voice=createVoiceSession({
  capture:async()=>{
   count++;
   if(count===1)throw Error("Autorisation du micro refusée");
   return {completed:Promise.resolve(new Blob(["audio"])),stop:()=>{},cancel:()=>{}};
  },
  transcribe:async()=>"bonjour",onError:e=>errors.push(e.message)
 });
 assert.equal(await voice.start(),false);
 assert.equal(voice.getStage(),"error");
 assert.equal(await voice.start(),true);
 assert.equal(voice.getStage(),"idle");
 assert.deepEqual(errors,["Autorisation du micro refusée"]);
});
