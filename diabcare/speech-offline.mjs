/* Reconnaissance vocale Whisper 100% sur l'appareil après téléchargement initial.
 * Le navigateur télécharge ONNX/WASM dans son cache; aucun enregistrement
 * n'est envoyé à un serveur de transcription. Disponibilité = matériel/navigateur.
 */
import {audioSecondsValid} from "./speech-policy.mjs";
const PACKAGE="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL="onnx-community/whisper-tiny";
let pipePromise=null;
export function isRecordingSupported(){
 return !!(globalThis.navigator?.mediaDevices?.getUserMedia&&globalThis.MediaRecorder&&globalThis.AudioContext||globalThis.navigator?.mediaDevices?.getUserMedia&&globalThis.MediaRecorder&&globalThis.webkitAudioContext);
}
export async function loadWhisper(progress=()=>{}){
 if(pipePromise)return pipePromise;
 pipePromise=(async()=>{
  progress("Téléchargement du moteur vocal : prépare un accès Wi-Fi et de l'espace libre.");
  const {pipeline,env}=await import(PACKAGE);
  env.useBrowserCache=true;env.allowRemoteModels=true;
  const worker=await pipeline("automatic-speech-recognition",MODEL,{
   device:"wasm",dtype:"q8",
   progress_callback:detail=>{
    if(detail.status==="progress"&&detail.total>0){
     progress("Voix hors ligne : "+Math.round(100*detail.loaded/detail.total)+" % · "+String(detail.file||"modèle"));
    }else if(detail.status==="ready")progress("Le modèle Whisper est chargé.");
   }
  });
  return worker;
 })().catch(err=>{pipePromise=null;throw err;});
 return pipePromise;
}
export async function decodeAudioToMono16k(blob){
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Context)throw Error("Décodage audio indisponible.");
 const ctx=new Context();
 try{
  const arrayBuffer=await blob.arrayBuffer();
  const decoded=await ctx.decodeAudioData(arrayBuffer);
  if(!audioSecondsValid(decoded.duration))throw Error("Dicte une courte phrase, entre 1 et 20 secondes.");
  const rate=16000;
  const frames=Math.ceil(decoded.duration*rate);
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error("Rééchantillonnage audio indisponible.");
  const offline=new Offline(1,frames,rate);
  const mono=offline.createBuffer(1,decoded.length,decoded.sampleRate);
  const target=mono.getChannelData(0);
  for(let ch=0;ch<decoded.numberOfChannels;ch++){
   const input=decoded.getChannelData(ch);
   for(let i=0;i<input.length;i++)target[i]+=input[i]/decoded.numberOfChannels;
  }
  const source=offline.createBufferSource();source.buffer=mono;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
 }finally{await ctx.close().catch(()=>{});}
}
export async function transcribeWhisper(blob,progress=()=>{}){
 const model=await loadWhisper(progress);
 progress("Transcription française directement sur ton téléphone…");
 const input=await decodeAudioToMono16k(blob);
 const output=await model(input,{language:"french",task:"transcribe",max_new_tokens:128});
 const text=String(output?.text||"").trim();
 if(!text)throw Error("Aucun mot reconnu. Réessaie plus près du micro.");
 return text;
}
export async function recordClip({durationMs=12000,onStop,onStatus=()=>{}}={}){
 if(!isRecordingSupported())throw Error("Ce navigateur ne permet pas l'enregistrement vocal local.");
 // getUserMedia s'effectue APRÈS un clic et non au chargement de la page.
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
 const opts={};
 const preferred=["audio/webm;codecs=opus","audio/mp4","audio/webm"];
 const selected=preferred.find(type=>MediaRecorder.isTypeSupported?.(type));
 if(selected)opts.mimeType=selected;
 let recorder;
 try{recorder=new MediaRecorder(stream,opts);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
 const chunks=[];
 let finished=false;let timeout=null;
 const stopTracks=()=>stream.getTracks().forEach(t=>t.stop());
 let resolveClip,rejectClip;
 const completion=new Promise((resolve,reject)=>{resolveClip=resolve;rejectClip=reject;});
 recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
 recorder.onerror=e=>{if(!finished){finished=true;clearTimeout(timeout);stopTracks();rejectClip(Error(e.error?.message||"Erreur d'enregistrement."));}};
 recorder.onstop=()=>{
  if(finished)return;finished=true;clearTimeout(timeout);stopTracks();
  const blob=new Blob(chunks,{type:recorder.mimeType||selected||"audio/webm"});
  if(blob.size<1000){rejectClip(Error("Micro silencieux ou enregistrement trop court."));return;}
  resolveClip(blob);
  if(onStop)onStop(blob);
 };
 recorder.start(250);
 onStatus("Micro actif. Dicte une phrase, puis appuie sur Terminer.");
 timeout=setTimeout(()=>{if(recorder.state!=="inactive")recorder.stop();},durationMs);
 return {
  stop:()=>{if(recorder.state!=="inactive")recorder.stop();return completion;},
  cancel:()=>{if(!finished){finished=true;clearTimeout(timeout);stopTracks();try{recorder.stop();}catch{}rejectClip(Error("Enregistrement annulé."));}},
  completed:completion
 };
}
