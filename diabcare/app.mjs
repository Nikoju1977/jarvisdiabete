import {VERSION,AGENTS,SOURCES,answer,doseQuestion,urgentQuestion,safeGenerated,parseGlucose,formatGlucose,summary,stateOf,guidanceForMeasurement,exportReport} from "./core.mjs";
import {fresh,exists,createVault,unlock,persist,erase,exportEncrypted,restoreEncryptedBackup} from "./vault.mjs";
import {isGlucoCheck,parseGlucoCheck,describeLast} from "./voice.mjs";
import {parseFoodQuery,findOffline,carbsFor,searchOpenFoodFacts,barcodeOpenFoodFacts,prepareRecord,speakFood} from "./nutrition.mjs";
import {routeExperts} from "./specialists.mjs";
import {LLM_SOURCES,modelInfo} from "./llm-sources.mjs";
import {speechRoute,transcriptSafe} from "./speech-policy.mjs";
import {isRecordingSupported,recordClip,loadWhisper,transcribeWhisper} from "./speech-offline.mjs";
const $=id=>document.getElementById(id), $all=s=>[...document.querySelectorAll(s)];
let data=fresh(),key=null,ephemeral=false,unlocked=false,model=null,modelBusy=false,saveQueue=Promise.resolve(),pendingInstall=null;
const TIMEOUT=10*60*1000;let awayAt=null;
let glucoseCandidate=null,foodCandidate=null,recognition=null,listenNonce=0,requestBusy=false;
let clipRecorder=null,whisperReady=false,whisperBusy=false,remoteVoiceConsent=false;
function setJarvisState(mode,label){
 const orb=$("jarvisOrb"),state=$("jarvisState");
 if(orb)orb.className="orb"+(mode==="listening"?" listening":mode==="speaking"?" speaking":mode==="thinking"?" thinking":"");
 if(state)state.textContent="JARVIS • "+(label||({idle:"Prêt",listening:"Je vous écoute",speaking:"Je vous réponds",thinking:"J'analyse"})[mode]);
}
function silence(){
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
 if(recognition){const prev=recognition;recognition=null;try{prev.abort();}catch{}}
 if(clipRecorder){const clip=clipRecorder;clipRecorder=null;clip.cancel();}
 if($("voiceRecording")?.open)$("voiceRecording").close();
 listenNonce++;setJarvisState("idle");
 const talk=$("talkBtn");if(talk)talk.textContent="🎙 Parler à JARVIS";
}
function sessionReply(text,label="Assistant local",say=true){
 msg("assistant",text,label);
 data.chat.push({role:"assistant",text,agent:label,ts:Date.now()});
 data.chat=data.chat.slice(-80);save();
 if(say)speech(text);
}
function cleanWake(s){return String(s||"").trim().replace(/^(?:hey|hé|bonjour|ok|salut)?\s*(?:jarvis|diabcare)[\s,.:!-]*/i,"").trim();}
function isFoodQuestion(s){return /\b(?:glucide|glucides|aliment|aliments)\b/i.test(s)&&/(?:combien|dans|pour|calcule|chercher|cherche|\d+\s*(?:g|kg|grammes?))/.test(s.toLowerCase());}
function educationalOnly(question){
 const s=String(question||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\bdt1\b/g,"diabete");
 return s.length<=1000 && !/(?:\d|mg\/?dl|mmol|g\/l|bolus|dose|inject|corrig|traitement|medicament|ordonnance|cetone|vomiss|acidocetose|malaise|suis en hypo|glycemie actuelle|mes donnees|mon journal|mon bilan|mes mesures|cette nuit|aujourd hui|maintenant|urgence)/.test(s);
}
function liveMode(){return $("aiSelect")?.value||"offline";}
function consentedMistral(){return !!$("mistralConsent")?.checked && !!$("accessCode")?.value.trim();}
function renderMeals(){
 const box=$("mealHistory");if(!box)return;box.replaceChildren();
 const items=(data.meals||[]).slice(-20).reverse();if(!items.length){box.textContent="Aucun repas enregistré.";return;}
 items.forEach(item=>{const el=document.createElement("div");el.className="record";
 const title=document.createElement("span");title.textContent=new Date(item.ts).toLocaleString("fr-FR")+" · "+item.name;
 const total=document.createElement("strong");total.textContent=item.carbs.toLocaleString("fr-FR")+" g";
 el.append(title,total);box.append(el);});
}
function showFoodOptions(items,grams){
 const box=$("foodResults");box.replaceChildren();
 items.forEach(food=>{const card=document.createElement("div");card.className="choice-item";
  const title=document.createElement("strong");title.textContent=food.name;
  const info=document.createElement("p");info.className="hint";info.textContent=food.per100+" g de glucides pour 100 g · "+food.source;
  const button=document.createElement("button");button.textContent="Choisir et vérifier la portion";
  button.onclick=()=>{foodCandidate=food;$("foodCandidateName").textContent=food.name+" — "+food.source;$("foodPortion").value=grams??"";refreshFoodPreview();$("confirmFood").showModal();};
  card.append(title,info,button);box.append(card);
 });
}
function refreshFoodPreview(){
 if(!foodCandidate)return;
 const num=Number($("foodPortion").value.trim().replace(",","."));
 try{$("foodPreview").textContent=carbsFor(foodCandidate.per100,num)+" g de glucides estimés. Vérifie la portion et l'étiquette."; $("foodApprove").disabled=false;}
 catch{$("foodPreview").textContent="Indique une portion comprise entre 0 et 2 000 g."; $("foodApprove").disabled=true;}
}
async function foodLookup(raw){
 if(!requireUnlock())return;
 const query=parseFoodQuery(cleanWake(raw));
 if(!query||query.error){toast(query?.error||"Indique un aliment et, si possible, son poids.");return;}
 visibleTab("nutrition");$("foodQuery").value=raw;setJarvisState("thinking","Je recherche les glucides");
 const offline=findOffline(query.term);
 showFoodOptions(offline,query.grams);
 $("foodStatus").textContent=offline.length?"Source locale indicative. Vérifie l'aliment et sa préparation.":"Aucune correspondance locale.";
 if(navigator.onLine){
  try{
   const code=query.term.replace(/\s/g,""),online=/^\d{8,14}$/.test(code)?[await barcodeOpenFoodFacts(code)]:await searchOpenFoodFacts(query.term);
   if(online.length){showFoodOptions([...online,...offline],query.grams);$("foodStatus").textContent="Produits Open Food Facts disponibles : données collaboratives, portion et étiquette à contrôler.";}
   else if(!offline.length)$("foodStatus").textContent="Produit introuvable. Vérifie le nom ou le code-barres.";
  }catch{$("foodStatus").textContent="Open Food Facts indisponible. "+(offline.length?"Estimation locale affichée.":"Aucune donnée nutritionnelle vérifiable.");}
 }
 setJarvisState("idle");
 const feedback=offline.length||$("foodResults").children.length?"J'ai affiché les aliments correspondants. Choisis le bon produit, puis confirme la portion avant d'enregistrer.":"Je ne trouve pas de données suffisamment fiables pour ce produit.";
 sessionReply(feedback,"Agent nutrition • source indiquée");
}
function handleGluco(text){
 const result=parseGlucoCheck(cleanWake(text),data.profile.unit||"g");
 if(!result)return false;
 if(result.type==="last"){sessionReply(describeLast(data.readings,data.profile.unit||"g"),"GlucoCheck • journal");return true;}
 if(result.type==="error"){sessionReply("GlucoCheck : "+result.message,"GlucoCheck • validation");return true;}
 if(result.type==="candidate"){
  glucoseCandidate=result;$("glucoseCandidate").textContent=formatGlucose(result.mg,result.unit);
  $("confirmGlucose").showModal();
  sessionReply("J'ai compris "+formatGlucose(result.mg,result.unit)+". Confirme cette valeur après vérification sur le lecteur. Je n'ai effectué aucune mesure.","GlucoCheck • confirmation",false);return true;
 }
 return false;
}
async function mistralQuestion(q){
 if(!navigator.onLine||liveMode()==="offline"||!consentedMistral()||!educationalOnly(q)||doseQuestion(q)||urgentQuestion(q))return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),19000);
 try{
  const r=await fetch("/api/diabcare-chat",{
   method:"POST",headers:{"Content-Type":"application/json","X-DiabCare-Code":$("accessCode").value.trim()},
   body:JSON.stringify({question:q}),signal:controller.signal,cache:"no-store"
  });
  if(!r.ok)throw Error("Mistral non disponible ("+r.status+").");
  const response=await r.json();
  if(!safeGenerated(response.text))throw Error("Réponse filtrée.");
  return {text:response.text,experts:Array.isArray(response.experts)?response.experts:[]};
 }finally{clearTimeout(timer);}
}

function toast(t){const x=$("toast");x.textContent=t;x.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>x.hidden=true,5200);}
function speech(text){
 if(!data.prefs.speak||!("speechSynthesis" in window)){setJarvisState("idle");return;}
 try{
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(String(text).slice(0,1800));u.lang="fr-FR";u.rate=1.04;u.pitch=0.9;
  u.onstart=()=>setJarvisState("speaking");u.onend=()=>setJarvisState("idle");u.onerror=()=>setJarvisState("idle");
  speechSynthesis.speak(u);
 }catch{setJarvisState("idle");}
}
function save(){if(!unlocked||ephemeral||!key)return Promise.resolve();const snapshot=structuredClone(data);
 saveQueue=saveQueue.catch(()=>{}).then(()=>persist(key,snapshot)).catch(e=>toast("Enregistrement impossible : "+e.message));return saveQueue;
}
function msg(role,text,small=""){const d=document.createElement("div");d.className="msg"+(role==="user"?" user":"");d.textContent=text;
 if(small){const e=document.createElement("small");e.textContent=small;d.appendChild(e);}
 $("chat").appendChild(d);$("chat").scrollTop=$("chat").scrollHeight;}
function renderChat(){const chat=$("chat");chat.replaceChildren();data.chat.slice(-35).forEach(m=>msg(m.role,m.text,m.agent||""));if(!data.chat.length)msg("assistant","Bonjour, je suis DiabCare, compagnon DT1. Je peux t'aider à comprendre le diabète et consulter les mesures que tu as saisies. En cas d'urgence, appelle les secours.","Moteur local • disponible sans Internet");}
function visibleTab(id){$all("nav [data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
 $all(".screen").forEach(x=>x.classList.toggle("active",x.id==="screen-"+id));if(id==="journal")renderJournal();if(id==="nutrition")renderMeals();}
function requireUnlock(){if(!unlocked){toast("Déverrouille le coffre ou choisis le mode sans stockage.");return false;}return true;}
function reportDownload(name,text,type="text/plain"){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function renderJournal(){
 const unit=data.profile.unit||"g";$("unit").value=unit;
 const latest=[...(data.readings||[])].filter(r=>Number.isFinite(r.mg)&&Number.isFinite(r.ts)&&r.ts<=Date.now()).sort((a,b)=>b.ts-a.ts)[0];
 if($("glanceValue")&&$("glanceDate")){
  if(latest){
   $("glanceValue").textContent=formatGlucose(latest.mg,unit);
   $("glanceDate").textContent="Saisie du "+new Date(latest.ts).toLocaleString("fr-FR")+" · "+(latest.source==="vocal confirmé"?"Dictée confirmée":"Saisie manuelle")+" · Pas de mesure en temps réel.";
  }else{
   $("glanceValue").textContent="Aucune mesure";
   $("glanceDate").textContent="Journal vide. Aucune lecture d'un capteur en temps réel.";
  }
 }
 const sum=summary(data.readings);$("journalSummary").textContent=sum?sum.n+" mesures sur 14 jours. Moyenne des saisies : "+formatGlucose(sum.mean,unit)+". Ce n'est PAS un temps dans la cible continu.":"Aucune mesure enregistrée.";
 const box=$("readings");box.replaceChildren();[...data.readings].slice(-30).reverse().forEach(r=>{const d=document.createElement("div");d.className="record";const a=document.createElement("span");a.textContent=new Date(r.ts).toLocaleString("fr-FR");const b=document.createElement("strong");b.textContent=formatGlucose(r.mg,unit);d.append(a,b);box.append(d);});
 const inj=$("injections");inj.replaceChildren();[...data.injections].slice(-12).reverse().forEach(r=>{const d=document.createElement("div");d.className="record";d.textContent=new Date(r.ts).toLocaleString("fr-FR")+" · "+r.u+" U (injection consignée)";inj.append(d);});}
function activate(loaded,ephem=false){data=loaded;unlocked=true;ephemeral=ephem;$("entryDialog").close();$("vaultStatus").textContent=ephem?"Session sans stockage":"Coffre déverrouillé";renderChat();renderJournal();renderMeals();$("speakToggle").checked=data.prefs.speak!==false;$("backupBtn").disabled=ephem;$("lockBtn").disabled=ephem;}
function lock(){if(ephemeral){toast("La session sans stockage ne peut pas être verrouillée : ferme l'application pour l'effacer.");return;}if("speechSynthesis" in window)window.speechSynthesis.cancel();data=fresh();key=null;unlocked=false;model=null;$("chat").replaceChildren();$("vaultStatus").textContent="Verrouillé";entry(true);}
function entry(already=exists()){$("entryTitle").textContent=already?"Déverrouiller DiabCare":"Créer mon coffre chiffré";$("entryText").textContent=already?"Entre ta phrase secrète. Aucun serveur ne peut la récupérer.":"Crée une phrase secrète d'au moins 8 caractères. Les données de santé seront chiffrées localement, sans cloud."; $("consentField").hidden=already;$("pin").value="";$("pinError").textContent="";$("entryDialog").showModal();}
async function submitEntry(){
 try{const pin=$("pin").value;if(pin.length<8)throw Error("Minimum 8 caractères.");
 if(exists()){const unlockedVault=await unlock(pin);key=unlockedVault.key;activate(unlockedVault.state);}
 else{if(!$("consent").checked)throw Error("Consentement nécessaire pour conserver les données.");const next=fresh();const k=await createVault(pin,next);key=k;activate(next);}
 }catch(e){$("pinError").textContent=e?.message==="The operation failed for an operation-specific reason"?"Phrase secrète incorrecte.":String(e.message||e);}}
function allowExpansion(q){const s=String(q).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return !/(?:\d|dose|insuline|bolus|glyc|hypo|hyper|cetone|malaise|symptome|vomis|acidocetose|basale|corrig|inject|journal|bilan|mesure|tendance|traitement|glucagon|medic|glucide)/.test(s);}
async function ask(text){
 if(!requireUnlock()||requestBusy)return;
 const q=cleanWake(text);if(!q)return;
 requestBusy=true;silence();setJarvisState("thinking");
 msg("user",q);data.chat.push({role:"user",text:q,ts:Date.now()});
 try{
  if(isGlucoCheck(q)){handleGluco(q);return;}
  if(isFoodQuestion(q)){await foodLookup(q);return;}
  const result=answer(q,data),experts=routeExperts(q).map(e=>e.name);
  let reply=result.text,label=(result.agents||[]).map(id=>AGENTS.find(a=>a[0]===id)?.[1]||id).join(" · ")+" • local";
  // Filtrage médical AVANT l'accès aux modèles, y compris pour les commandes vocales.
  if(result.level==="info"&&educationalOnly(q)&&!urgentQuestion(q)&&!doseQuestion(q)){
   if(liveMode()!=="offline"&&consentedMistral()){
    try{const response=await mistralQuestion(q);if(response){reply=response.text;label="Mistral contrôlé • "+(response.experts.join(" · ")||experts.join(" · "));}}
    catch{toast("Connexion Mistral impossible : retour au moteur local.");}
   }else if(model&&liveMode()==="offline"){
    try{const generated=await model.reply(q,reply);if(safeGenerated(generated)){reply=generated;label="Qwen local • "+experts.join(" · ");}}
    catch{model=null;toast("Modèle Qwen indisponible, assistant déterministe actif.");}
   }
  }
  sessionReply(reply,label);
 }finally{
  requestBusy=false;
  if(!data.prefs.speak)setJarvisState("idle");
 }
}

function updateNet(){$("netStatus").textContent=navigator.onLine?"En ligne":"Hors ligne";$("netStatus").dataset.offline=navigator.onLine?"false":"true";}
function voiceHint(message){
 const box=$("voiceStatus");if(box)box.textContent=message;
 const status=$("voiceInstallStatus");if(status)status.textContent=message;
}
function deliverTranscript(transcript){
 const text=String(transcript||"").trim();
 if(!transcriptSafe(text)){
  voiceHint("Je n'ai pas compris. Réessaie en parlant distinctement ou utilise le clavier.");
  setJarvisState("idle");return;
 }
 voiceHint('J’ai entendu : « '+text.slice(0,150)+' ». Vérifie la mesure ou la portion si nécessaire.');
 $("question").value=text;
 ask(text);
 $("question").value="";
}
async function checkNativeLocalSpeech(SR){
 if(!SR||typeof SR.available!=="function")return false;
 try{return await SR.available({langs:["fr-FR"],processLocally:true})==="available";}catch{return false;}
}
function voiceChooser({browserRecognition=false,recordingSupported=false,online=false}={}){
 $("voiceChoiceDetails").textContent=browserRecognition&&online
  ?"Ton téléphone ne dispose pas de dictée locale native. Tu peux autoriser la transcription via le navigateur ou installer Whisper."
  :"La dictée native n'est pas disponible sur ce navigateur. Whisper permet d'essayer la transcription directement sur l'appareil.";
 $("voiceBrowserBtn").hidden=!(online&&browserRecognition);
 $("remoteVoiceExplainer").hidden=!(online&&browserRecognition);
 $("voiceOfflineBtn").disabled=!recordingSupported;
 $("voiceBrowserBtn").disabled=!(online&&browserRecognition);
 if(!$("voiceChoice").open)$("voiceChoice").showModal();
}
async function installWhisper(){
 if(whisperBusy)return false;
 whisperBusy=true;
 $("voiceInstallBtn").disabled=true;
 $("voiceOfflineBtn").disabled=true;
 try{
  if(!isRecordingSupported())throw Error("Le micro ne peut pas être enregistré par ce navigateur.");
  voiceHint("Installation de Whisper : connexion initiale nécessaire, téléchargement important…");
  setJarvisState("thinking","Préparation de la voix locale");
  await loadWhisper(voiceHint);
  whisperReady=true;
  voiceHint("Whisper chargé. Appuie sur le micro pour dicter une phrase (20 secondes maximum).");
  toast("Voix locale prête.");
  return true;
 }catch(error){
  voiceHint("Voix locale indisponible : "+String(error.message||error).slice(0,170)+". Essaie la dictée autorisée en ligne ou le clavier.");
  return false;
 }finally{
  whisperBusy=false;
  $("voiceInstallBtn").disabled=false;
  $("voiceOfflineBtn").disabled=false;
  setJarvisState("idle");
 }
}
async function whisperRecord(){
 if(!whisperReady){
  const ok=await installWhisper();
  if(!ok)return;
 }
 if(!isRecordingSupported()){
  voiceHint("Cet appareil ne permet pas d'enregistrer le micro dans ce navigateur.");return;
 }
 try{
  const nonce=++listenNonce;
  const clip=await recordClip({durationMs:16000,onStatus:voiceHint});
  if(nonce!==listenNonce){clip.cancel();return;}
  clipRecorder=clip;
  if(!$("voiceRecording").open)$("voiceRecording").showModal();
  $("talkBtn").textContent="⏹ Terminer la dictée";
  setJarvisState("listening","Whisper enregistre");
  clip.completed.then(async blob=>{
   if(nonce!==listenNonce)return;
   clipRecorder=null;if($("voiceRecording").open)$("voiceRecording").close();$("talkBtn").textContent="🎙 Parler à JARVIS";
   setJarvisState("thinking","Whisper transcrit la voix");
   try{
    const text=await transcribeWhisper(blob,voiceHint);
    if(nonce===listenNonce)deliverTranscript(text);
   }catch(e){
    if(nonce===listenNonce){voiceHint("Transcription impossible : "+String(e.message||e).slice(0,160));setJarvisState("idle");}
   }
  }).catch(()=>{if(nonce===listenNonce){clipRecorder=null;if($("voiceRecording").open)$("voiceRecording").close();$("talkBtn").textContent="🎙 Parler à JARVIS";setJarvisState("idle");}});
 }catch(err){
  voiceHint("Micro inaccessible : "+String(err.message||err).slice(0,160)+". Vérifie l'autorisation du microphone pour ce site.");
  setJarvisState("idle");
 }
}
function browserSpeech(SR,localOnly){
 try{
  const nonce=++listenNonce,rec=new SR();
  rec.lang="fr-FR";rec.continuous=false;rec.interimResults=false;
  if(localOnly)rec.processLocally=true;
  recognition=rec;
  rec.onresult=ev=>{
   if(nonce!==listenNonce)return;
   recognition=null;
   const text=String(ev.results?.[0]?.[0]?.transcript||"");
   deliverTranscript(text);
  };
  rec.onerror=ev=>{
   if(nonce!==listenNonce)return;
   recognition=null;setJarvisState("idle");
   const reason=ev.error||"erreur";
   voiceHint(reason==="not-allowed"?"Micro refusé. Autorise le microphone du site dans le navigateur puis réessaie.":"Reconnaissance indisponible ("+reason+"). Tu peux choisir Whisper local ou utiliser le clavier.");
   if(reason==="network"||reason==="service-not-allowed")remoteVoiceConsent=false;
  };
  rec.onend=()=>{if(nonce===listenNonce){recognition=null;if(!requestBusy)setJarvisState("idle");}};
  setJarvisState("listening",localOnly?"Dictée native locale":"Dictée en ligne autorisée");
  voiceHint(localOnly?"Écoute locale active…":"Écoute active. La reconnaissance peut être traitée par le fournisseur du navigateur.");
  rec.start();
 }catch(e){recognition=null;setJarvisState("idle");voiceHint("Le navigateur a refusé de lancer la dictée : "+String(e.message||e).slice(0,120));}
}
async function dictate(){
 if(!requireUnlock())return;
 // Deuxième appui pendant l'enregistrement Whisper : arrêter et transcrire.
 if(clipRecorder){const clip=clipRecorder;try{await clip.stop();}catch{}return;}
 if(recognition){try{recognition.stop();}catch{}return;}
 if(whisperBusy){voiceHint("Whisper est en cours de chargement.");return;}
 if(requestBusy){voiceHint("JARVIS traite la question précédente.");return;}
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 const localNative=await checkNativeLocalSpeech(SR);
 const recordingSupported=isRecordingSupported();
 const route=speechRoute({
  localNative,whisperReady,browserRecognition:!!SR,online:navigator.onLine,
  remoteConsent:remoteVoiceConsent||!!$("remoteSpeechOpt")?.checked,recordingSupported
 });
 if(route==="native-local"){browserSpeech(SR,true);return;}
 if(route==="whisper-local"){await whisperRecord();return;}
 if(route==="browser-online"){browserSpeech(SR,false);return;}
 if(route==="choose"){voiceChooser({browserRecognition:!!SR,recordingSupported,online:navigator.onLine});return;}
 voiceHint("Ce navigateur n'autorise pas l'enregistrement vocal. Ouvre DiabCare dans Chrome ou Safari, ou utilise le clavier.");
 voiceChooser({browserRecognition:!!SR,recordingSupported,online:navigator.onLine});
 setJarvisState("idle");
}
async function loadAI(){if(modelBusy)return;if(!navigator.onLine){toast("Pour le premier téléchargement, connecte-toi au Wi-Fi. Si le modèle est déjà en cache, tente son chargement après connexion.");}
 modelBusy=true;$("modelBtn").disabled=true;$("modelStatus").textContent="Chargement local, téléchargement possible de centaines de Mo…";
 try{
  const mod=await import("./model.mjs");model=await mod.createLocalModel(t=>$("modelStatus").textContent=t);
  $("aiMode").textContent="IA open source chargée sur cet appareil";$("modelStatus").textContent="Modèle local actif. Aucune question envoyée au cloud.";toast("IA locale chargée.");
 }catch(e){model=null;$("aiMode").textContent="Assistant local déterministe";$("modelStatus").textContent="Modèle indisponible : "+String(e.message||e).slice(0,160);toast("L'assistant de secours hors connexion reste disponible.");}
 finally{modelBusy=false;$("modelBtn").disabled=false;}
}
function setup(){
 const staticHosting=location.hostname.toLowerCase().endsWith(".github.io");
 if(staticHosting){
   const select=$("aiSelect");if(select){
     select.value="offline";
     for(const option of select.options){if(option.value!=="offline")option.disabled=true;}
     select.disabled=true;
   }
   $("mistralConsent").disabled=true;
   $("accessCode").disabled=true;
   $("mistralState").textContent="Hébergement GitHub Pages : le mode Mistral nécessite une passerelle serveur distincte. Ici, l'assistant local reste disponible hors connexion.";
 }
 updateNet();addEventListener("online",updateNet);addEventListener("offline",updateNet);
 $("goJournal").addEventListener("click",()=>visibleTab("journal"));
 $("goNutrition").addEventListener("click",()=>visibleTab("nutrition"));
 $("goEmergency").addEventListener("click",()=>{
  visibleTab("experts");
  const emergency=$("emergencyCard");if(emergency)emergency.scrollIntoView({behavior:"smooth",block:"center"});
 });
 $all("nav [data-tab]").forEach(b=>b.addEventListener("click",()=>visibleTab(b.dataset.tab)));
 $all("[data-ask]").forEach(b=>b.addEventListener("click",()=>ask(b.dataset.ask)));
 $("entrySubmit").onclick=submitEntry;$("pin").addEventListener("keydown",ev=>{if(ev.key==="Enter")submitEntry();});
 $("entryDialog").addEventListener("cancel",e=>e.preventDefault());
 $("ephemeralBtn").onclick=()=>activate(fresh(),true);
 $("chatForm").onsubmit=e=>{e.preventDefault();const q=$("question").value;$("question").value="";ask(q);};
 $("micBtn").onclick=dictate;$("jarvisOrb").onclick=dictate;$("talkBtn").onclick=dictate;
 $("stopVoice").onclick=()=>{silence();voiceHint("Micro et synthèse vocale arrêtés.");};
 $("voiceKeyboardBtn").onclick=()=>{
  $("voiceChoice").close();
  visibleTab("chat");
  $("question").scrollIntoView({block:"center",behavior:"smooth"});
  $("question").focus();voiceHint("Clavier prêt : écris ta question et touche Envoyer.");
 };
 $("voiceRecordStop").onclick=()=>{if(clipRecorder){const clip=clipRecorder;voiceHint("Transcription en cours…");clip.stop().catch(()=>{});}};
 $("voiceRecordCancel").onclick=()=>{silence();voiceHint("Enregistrement annulé.");};
 $("voiceRecording").addEventListener("cancel",e=>{e.preventDefault();silence();});

 $("voiceCloseBtn").onclick=()=>$("voiceChoice").close();
 $("voiceBrowserBtn").onclick=()=>{
  $("voiceChoice").close();
  if(!confirm("Autorises-tu la dictée en ligne pour cette session ? Le navigateur peut envoyer le son de ton micro à son fournisseur. N’énonce pas de données médicales sensibles.")){voiceHint("Dictée en ligne refusée. Whisper et le clavier restent possibles.");return;}
  remoteVoiceConsent=true;$("remoteSpeechOpt").checked=true;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR&&navigator.onLine)browserSpeech(SR,false);
  else voiceHint("Aucune dictée native disponible. Installe Whisper pour l'enregistrement local.");
 };
 $("voiceOfflineBtn").onclick=async()=>{
  $("voiceChoice").close();
  if(await installWhisper())await whisperRecord();
 };
 $("voiceInstallBtn").onclick=installWhisper;
 $("glucoseCancel").onclick=()=>{$("confirmGlucose").close();glucoseCandidate=null;};
 $("glucoseApprove").onclick=()=>{
  if(!requireUnlock()||!glucoseCandidate)return;
  const r=glucoseCandidate;glucoseCandidate=null;$("confirmGlucose").close();
  data.profile.unit=r.unit;
  data.readings.push({mg:r.mg,ts:Date.now(),source:"vocal confirmé"});data.readings=data.readings.slice(-2500);
  renderJournal();save();sessionReply("GlucoCheck : valeur confirmée et consignée, "+formatGlucose(r.mg,r.unit)+". "+guidanceForMeasurement(r.mg),"GlucoCheck • saisie confirmée");
 };
 $("foodForm").onsubmit=ev=>{ev.preventDefault();foodLookup($("foodQuery").value);};
 $("foodPortion").addEventListener("input",refreshFoodPreview);
 $("foodCancel").onclick=()=>{$("confirmFood").close();foodCandidate=null;};
 $("foodApprove").onclick=()=>{
  if(!requireUnlock()||!foodCandidate)return;
  try{
   const grams=Number($("foodPortion").value.trim().replace(",","."));
   const rec=prepareRecord(foodCandidate,grams);
   data.meals??=[];data.meals.push(rec);data.meals=data.meals.slice(-400);
   $("confirmFood").close();foodCandidate=null;save();renderMeals();
   sessionReply(speakFood(rec),"Diététicien • estimation confirmée");
  }catch(e){toast(e.message);}
 };
 $("aiSelect").onchange=()=>{$("mistralState").textContent=$("aiSelect").value==="offline"?"Mode local. Aucun appel à Mistral.":"Mistral seulement pour les questions générales et avec autorisation explicite.";};
 $("mistralConsent").onchange=()=>toast($("mistralConsent").checked?"Consentement réseau actif pour cette session.":"Envoi à Mistral désactivé.");

 $("glucoseForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const unit=$("unit").value,r=parseGlucose($("glucose").value,unit);if(!r.ok){toast(r.error);return;}
 data.profile.unit=unit;data.readings.push({mg:r.mg,ts:Date.now(),source:"manuel"});data.readings=data.readings.slice(-2500);$("glucose").value="";save();renderJournal();let info=guidanceForMeasurement(r.mg);toast("Mesure enregistrée : "+formatGlucose(r.mg,unit));$("safetyNotice").textContent=info;$("safetyNotice").className="alert"+(stateOf(r.mg)==="verylow"||stateOf(r.mg)==="low"?" critical":"");};
 $("injectionForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const txt=$("injection").value.trim().replace(",",".");const u=Number(txt);if(!/^\d+(?:\.\d+)?$/.test(txt)||!(u>0&&u<=100)){toast("Valeur invalide. Il s'agit uniquement d'une injection réellement effectuée.");return;}data.injections.push({u,ts:Date.now()});data.injections=data.injections.slice(-1000);$("injection").value="";save();renderJournal();toast("Injection déjà réalisée consignée.");};
 $("reportBtn").onclick=()=>{if(requireUnlock())reportDownload("diabcare-bilan.txt",exportReport(data));};
 $("backupBtn").onclick=async()=>{try{await saveQueue;reportDownload("diabcare-coffre-chiffre.json",exportEncrypted(),"application/json");toast("Sauvegarde chiffrée téléchargée.");}catch(e){toast(e.message);}};
 $("restoreBtn").onclick=()=>$("restoreFile").click();
 $("restoreFile").onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value="";if(!file)return;if(file.size>10000000){toast("Sauvegarde trop volumineuse.");return;}
  const phrase=prompt("Phrase secrète de la sauvegarde chiffrée :");if(!phrase)return;
  if(!confirm("Remplacer le coffre local actuel par cette sauvegarde, après vérification ?"))return;
  try{await restoreEncryptedBackup(await file.text(),phrase);toast("Sauvegarde vérifiée et restaurée. Rechargement…");location.reload();}catch(err){toast("Restauration refusée : "+String(err.message||err).slice(0,140));}
 };
 $("speakToggle").onchange=e=>{data.prefs.speak=e.target.checked;save();};
 $("remoteSpeechOpt").onchange=e=>{remoteVoiceConsent=e.target.checked;voiceHint(e.target.checked?"Dictée du navigateur en ligne autorisée pour cette session.":"Dictée en ligne désactivée.");};
 if(!(window.SpeechRecognition||window.webkitSpeechRecognition)&&!isRecordingSupported())voiceHint("Le navigateur actuel ne donne pas accès au micro : utilise Chrome ou Safari dans une fenêtre normale, pas un navigateur intégré. Le clavier reste disponible.");
 $("lockBtn").onclick=lock;
 $("eraseBtn").onclick=()=>{if(!confirm("Supprimer définitivement les données locales de DiabCare ?"))return;if(!confirm("Dernière confirmation. Cette action est irréversible."))return;erase();location.reload();};
 $("emergencyRead").onclick=()=>{speech("Urgence : appelez le 15 ou le 112. Si la personne est inconsciente, ne rien donner par la bouche. Suivez les consignes des secours.");};
 $("modelBtn").onclick=loadAI;
 $("modelCheck").onclick=()=>toast("Les versions du moteur sont mises à jour avec la PWA. Les poids IA ne changent pas automatiquement sans validation d'intégrité.");
 $("appUpdate").onclick=async()=>{if(!("serviceWorker" in navigator)){toast("Mises à jour automatiques non disponibles.");return;}const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.update();toast("Vérification lancée. Recharge l'application si une version nouvelle est proposée.");}else toast("Installe la PWA depuis un site HTTPS.");};
 $("agents").replaceChildren();AGENTS.forEach(([id,label])=>{const d=document.createElement("div");d.className="agent";const b=document.createElement("b");b.textContent=label;const small=document.createElement("small");small.textContent=id==="securite"?"Contrôles avant l'IA":"Conseils spécialisés simulés";d.append(b,small);$("agents").append(d);});
 SOURCES.forEach(s=>{const p=document.createElement("p"),a=document.createElement("a");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=s.name;p.append(a);$("sources").append(p);});
 $("appVersion").textContent="DiabCare "+VERSION+" • Assistant vocal · GlucoCheck · Glucides · IA locale";
 const sourcesBox=$("llmSources");if(sourcesBox){LLM_SOURCES.forEach(source=>{const row=document.createElement("p"),link=document.createElement("a");link.href=source.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent=source.id+" · "+source.status;row.append(link);sourcesBox.append(row);});}
 $("modelStatus").textContent="Qwen3 0,6B GGUF · 484 Mo · runtime wllama. Téléchargement initial requis ; compatibilité Safari non garantie.";

 if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("./sw.js").catch(()=>toast("Mode hors ligne non installé."));
 let installEvt=null;addEventListener("beforeinstallprompt",ev=>{ev.preventDefault();installEvt=ev;$("installBtn").hidden=false;});
 $("installBtn").onclick=async()=>{if(installEvt){installEvt.prompt();await installEvt.userChoice;$("installBtn").hidden=true;}};
 document.addEventListener("visibilitychange",()=>{if(document.hidden){awayAt=Date.now();if("speechSynthesis" in window)speechSynthesis.cancel();}
 else if(awayAt&&!ephemeral&&unlocked&&Date.now()-awayAt>TIMEOUT)lock();});
 addEventListener("pagehide",()=>{if("speechSynthesis" in window)speechSynthesis.cancel();});
 if(exists())entry(true);else entry(false);
}
setup();
