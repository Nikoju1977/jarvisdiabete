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
 let finished=false,timeout=null,stopWatchdog=null;
 const stopTracks=()=>stream.getTracks().forEach(track=>{try{track.stop();}catch{}});
 const clearTimers=()=>{clearTimeout(timeout);clearTimeout(stopWatchdog);};
 let resolveClip,rejectClip;
 const completion=new Promise((resolve,reject)=>{resolveClip=resolve;rejectClip=reject;});
 const fail=error=>{
  if(finished)return;
  finished=true;clearTimers();stopTracks();
  rejectClip(error instanceof Error?error:Error(String(error||"Enregistrement impossible.")));
 };
 recorder.ondataavailable=e=>{if(!finished&&e.data?.size)chunks.push(e.data);};
 recorder.onerror=e=>fail(Error(e.error?.message||"Erreur d'enregistrement audio."));
 recorder.onstop=()=>{
  if(finished)return;
  finished=true;clearTimers();stopTracks();
  const blob=new Blob(chunks,{type:recorder.mimeType||selected||"audio/webm"});
  if(blob.size<1000){
   rejectClip(Error("Le son est trop court ou aucun mot n'a été capturé. Recommence en parlant pendant au moins une seconde."));
   return;
  }
  resolveClip(blob);
  if(onStop)try{onStop(blob);}catch{}
 };
 const stop=()=>{
  if(finished)return completion;
  clearTimeout(timeout);
  try{
   if(recorder.state!=="inactive")recorder.stop();
  }catch(e){fail(Error("Impossible d'arrêter le micro : "+String(e.message||e)));return completion;}
  // Some Android webviews never fire "stop": reject rather than spin forever.
  if(stopWatchdog===null)stopWatchdog=setTimeout(()=>{
   fail(Error("Le navigateur n'a pas terminé l'enregistrement. Réessaie dans Chrome ou avec la dictée du navigateur."));
  },4500);
  return completion;
 };
 try{recorder.start(250);}catch(e){stopTracks();throw Error("Démarrage du micro refusé : "+String(e.message||e));}
 onStatus("Le microphone enregistre. Parle, puis touche Terminer et transcrire.");
 timeout=setTimeout(stop,durationMs);
 return {
  stop,
  cancel:()=>{
   if(finished)return;
   finished=true;clearTimers();stopTracks();
   try{if(recorder.state!=="inactive")recorder.stop();}catch{}
   rejectClip(Error("Enregistrement annulé."));
  },
  completed:completion
 };
}
