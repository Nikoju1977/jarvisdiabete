/* A deterministic controller for the Android/iPhone microphone lifecycle.
   States: idle -> requesting -> listening -> finishing -> transcribing -> idle.
   Stale/cancelled model results are discarded. No personal health data stored here.
 */
export function createVoiceSession({capture,transcribe,onState=()=>{},onTranscript=()=>{},onError=()=>{}}){
 if(typeof capture!=="function"||typeof transcribe!=="function")throw Error("Fonctions vocales manquantes.");
 let sequence=0,stage="idle",clip=null;
 const state=(next,details="")=>{stage=next;onState(next,details);};
 const isActive=()=>!["idle","error"].includes(stage);
 async function start(){
  if(isActive())return false;
  const ticket=++sequence;
  state("requesting","Demande d'autorisation du microphone…");
  try{
   // capture() must be invoked synchronously before the first await,
   // so Android preserves the user's button activation for getUserMedia().
   const pending=capture({onProgress:msg=>{if(ticket===sequence)onState(stage,msg);}});
   const recording=await pending;
   // A cancelled pending microphone request must never leave the stream running.
   recording.completed?.catch(()=>{});
   if(ticket!==sequence){recording.cancel?.();return false;}
   clip=recording;
   state("listening","Parle normalement. L'enregistrement s'arrête automatiquement après 16 secondes.");
   const blob=await recording.completed;
   if(ticket!==sequence)return false;
   clip=null;
   state("transcribing","Whisper transcrit la phrase sur cet appareil. Cela peut prendre du temps.");
   const text=await transcribe(blob,{onProgress:msg=>{if(ticket===sequence)onState(stage,msg);}});
   if(ticket!==sequence)return false;
   state("idle");
   onTranscript(text);
   return true;
  }catch(e){
   if(ticket!==sequence)return false;
   clip=null;
   const message=String(e?.message||e||"Erreur vocale");
   state("error",message);
   onError(e);
   return false;
  }
 }
 function stop(){
  if(stage==="requesting"){cancel();return false;}
  if(stage!=="listening"||!clip)return false;
  state("finishing","Arrêt de l'enregistrement…");
  try{
   const promise=clip.stop();
   Promise.resolve(promise).catch(e=>{
    if(stage==="finishing"){state("error",String(e?.message||e));onError(e);}
   });
  }catch(e){state("error",String(e?.message||e));onError(e);}
  return true;
 }
 function cancel(){
  if(stage==="idle")return;
  sequence++;
  const previous=clip;clip=null;
  if(previous)try{previous.cancel?.();}catch{}
  state("idle");
 }
 return {start,stop,cancel,getStage:()=>stage,isActive};
}
