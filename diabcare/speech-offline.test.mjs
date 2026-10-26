import test from "node:test";
import assert from "node:assert/strict";
import {recordClip,isRecordingSupported} from "./speech-offline.mjs";
function browserStubs({recorderClass,getUserMedia}){
 const keys=["navigator","MediaRecorder","AudioContext"];
 const before=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 Object.defineProperty(globalThis,"navigator",{configurable:true,writable:true,value:{mediaDevices:{getUserMedia}}});
 Object.defineProperty(globalThis,"MediaRecorder",{configurable:true,writable:true,value:recorderClass});
 Object.defineProperty(globalThis,"AudioContext",{configurable:true,writable:true,value:class {}});
 return ()=>{
  for(const [key,descriptor] of before){
   if(descriptor)Object.defineProperty(globalThis,key,descriptor);
   else delete globalThis[key];
  }
 };
}
test("iOS WebKit : refus du timeslice, démarrage sans timeslice puis pistes arrêtées",async()=>{
 let stopTracks=0,starts=[];
 const Recorder=class {
  static isTypeSupported=(type)=>type==="audio/mp4";
  constructor(){this.state="inactive";this.mimeType="audio/mp4";}
  start(slice){
   starts.push(slice);
   if(slice!==undefined){const e=Error("timeslice not supported");e.name="NotSupportedError";throw e;}
   this.state="recording";
  }
  stop(){
   this.state="inactive";
   this.ondataavailable?.({data:new Blob([new Uint8Array(2300)],{type:"audio/mp4"})});
   this.onstop?.();
  }
 };
 const restore=browserStubs({recorderClass:Recorder,getUserMedia:async()=>({getTracks:()=>[{stop(){stopTracks++;}}]})});
 try{
  assert.equal(isRecordingSupported(),true);
  const clip=await recordClip({durationMs:16000});
  const blob=await clip.stop();
  assert.deepEqual(starts,[250,undefined]);
  assert.equal(blob.type,"audio/mp4");assert.ok(blob.size>1000);
  assert.equal(stopTracks,1);
 }finally{restore();}
});
test("un MediaRecorder non constructible libère immédiatement le micro",async()=>{
 let stops=0;
 const Recorder=class {constructor(){throw Error("incompatible codec");}};
 const restore=browserStubs({recorderClass:Recorder,getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})});
 try{
  await assert.rejects(recordClip(),/incompatible codec/);
  assert.equal(stops,1);
 }finally{restore();}
});
