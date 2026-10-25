import {VERSION,AGENTS,SOURCES,answer,doseQuestion,urgentQuestion,safeGenerated,parseGlucose,formatGlucose,summary,stateOf,guidanceForMeasurement,exportReport} from "./core.mjs";
import {fresh,exists,createVault,unlock,persist,erase,exportEncrypted,restoreEncryptedBackup} from "./vault.mjs";
import {isGlucoCheck,parseGlucoCheck,describeLast} from "./voice.mjs";
import {parseFoodQuery,findOffline,carbsFor,searchOpenFoodFacts,barcodeOpenFoodFacts,prepareRecord,speakFood} from "./nutrition.mjs";
import {routeExperts} from "./specialists.mjs";
import {LLM_SOURCES,modelInfo} from "./llm-sources.mjs";
import {speechRoute,transcriptSafe} from "./speech-policy.mjs";
import {isRecordingSupported,recordClip,loadWhisper,transcribeWhisper} from "./speech-offline.mjs";
import {cachedSearch,allCached,cachedStats,storeFoodProducts,clearCached,libraryStatus,OFFLINE_PACK_QUERIES} from "./food-library.mjs";
import {SUGGESTED_GATEWAY,GATEWAY_STORAGE_KEY,testGateway,gatewayError,renderAiStatus} from "./ai-config.mjs";
const $=id=>document.getElementById(id), $all=s=>[...document.querySelectorAll(s)];
let data=fresh(),key=null,ephemeral=false,unlocked=false,model=null,modelBusy=false,saveQueue=Promise.resolve(),pendingInstall=null;
const TIMEOUT=10*60*1000;let awayAt=null;
let glucoseCandidate=null,foodCandidate=null,recognition=null,listenNonce=0,requestBusy=false;
let clipRecorder=null,whisperReady=false,whisperBusy=false,remoteVoiceConsent=false;
let voiceIntent="general",foodVoicePending=false,foodSearchId=0,nativeSpeechReady=false,nativeSpeechChecked=false;
let foodPackBusy=false,foodCachedList=[],libraryAvailable=true;
let verifiedMistralEndpoint=null,mistralTestInProgress=false;
function updateAiStatuses(){
 const states=renderAiStatus({connected:!!verifiedMistralEndpoint,qwenReady:!!model,whisperReady});
 const el=$("aiHealthSummary");
 if(el)el.textContent="Assistant documentaire hors ligne : opérationnel. "+states.cloud+" · "+states.llm+" · "+states.voice+".";
 const help=$("aiSelectionHelp");
 if(help){
  const mode=liveMode();
  help.textContent=mode==="offline"?"Hors connexion : réponses locales et Qwen uniquement s'il a été chargé."
   :mode==="auto"?(verifiedMistralEndpoint?"Automatique : Mistral vérifié avec Internet ; sinon Qwen ou règles documentaires.":"Automatique : Mistral non connecté ; Qwen chargé ou règles documentaires.")
   :(verifiedMistralEndpoint?"Mistral vérifié pour les seules questions pédagogiques admissibles.":"Mistral sélectionné, mais non connecté. Ouvre le guide ci-dessous.");
 }
}
async function verifyMistral(){
 if(mistralTestInProgress)return;
 const state=$("mistralState"),button=$("mistralTestBtn");
 if(!navigator.onLine){state.textContent="Hors ligne : impossible de tester Mistral. Le mode local reste actif.";return;}
 if(!$("mistralConsent").checked){
  state.textContent="Coche d'abord l'autorisation d'envoyer les questions pédagogiques à Mistral.";
  $("mistralConsent").focus();return;
 }
 mistralTestInProgress=true;button.disabled=true;
 verifiedMistralEndpoint=null;state.textContent="Test du serveur et du code privé (sans jeton de génération Mistral)…";
 updateAiStatuses();
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const proof=await testGateway($("mistralGatewayUrl").value,$("accessCode").value,{signal:ctrl.signal});
  verifiedMistralEndpoint=proof.endpoint;
  try{localStorage.setItem(GATEWAY_STORAGE_KEY,proof.endpoint);}catch{}
  $("aiSelect").value="auto";
  state.textContent="Connexion vérifiée : "+proof.model+". Mode automatique activé. Aucun journal médical transmis.";
  toast("Mistral connecté avec succès pour cette session.");
 }catch(e){
  state.textContent="Connexion non établie : "+String(e.message||e)+". Consulte le guide ci-dessous.";
  $("mistralHelp").open=true;
 }finally{
  clearTimeout(timer);mistralTestInProgress=false;button.disabled=false;updateAiStatuses();
 }
}
function resetMistral(message){
 verifiedMistralEndpoint=null;
 if($("mistralState"))$("mistralState").textContent=message||"Connexion non vérifiée. Relance le test avant d'utiliser Mistral.";
 updateAiStatuses();
}
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
function consentedMistral(){return !!verifiedMistralEndpoint && !!$("mistralConsent")?.checked && !!$("accessCode")?.value.trim();}
function renderMeals(){
 const box=$("mealHistory");if(!box)return;box.replaceChildren();
 const items=(data.meals||[]).slice(-20).reverse();if(!items.length){box.textContent="Aucun repas enregistré.";return;}
 items.forEach(item=>{const el=document.createElement("div");el.className="record";
 const title=document.createElement("span");title.textContent=new Date(item.ts).toLocaleString("fr-FR")+" · "+item.name;
 const total=document.createElement("strong");total.textContent=item.carbs.toLocaleString("fr-FR")+" g";
 el.append(title,total);box.append(el);});
}
function uniqueFoods(foods){
 const found=new Set(),result=[];
 for(const f of foods||[]){
  const key=f.kind==="off"&&f.code?"code:"+f.code:"name:"+(f.name||"").toLowerCase()+":"+f.kind;
  if(found.has(key))continue;
  found.add(key);result.push(f);
 }
 return result.slice(0,14);
}
function showFoodOptions(items,grams){
 const box=$("foodResults");box.replaceChildren();
 uniqueFoods(items).forEach(food=>{
  const card=document.createElement("div");card.className="choice-item";
  const title=document.createElement("strong");title.textContent=food.name+(food.brand?" · "+food.brand:"");
  const badge=document.createElement("div");badge.className="product-source";
  badge.textContent=food.kind==="local"?"Table DiabCare : approximation indicative":food.offline?"Open Food Facts : fiche déjà téléchargée":"Open Food Facts : fiche collaborative en ligne";
  const info=document.createElement("p");info.className="product-metadata";
  info.textContent=food.per100.toLocaleString("fr-FR")+" g de glucides / 100 g de produit"+(food.kind==="off"?" (tel que vendu : vérifier sec/cru ou préparé)":" (table indicative selon aliment)")
   +(food.quantity?" · conditionnement : "+food.quantity:"")
   +(food.servingSize?" · portion indiquée sur la fiche : "+food.servingSize:"")
   +(food.cachedAt?" · téléchargé : "+new Date(food.cachedAt).toLocaleDateString("fr-FR"):"");
  card.append(title,badge,info);
  if(food.kind==="off"&&food.code){
   const p=document.createElement("p");p.className="product-metadata";
   const link=document.createElement("a");
   link.href="https://world.openfoodfacts.org/product/"+encodeURIComponent(food.code);
   link.target="_blank";link.rel="noopener noreferrer";
   link.textContent="Fiche OFF n° "+food.code+" (consultable avec Internet)";
   p.append(link);card.append(p);
  }
  if(grams!=null){
   try{
    const estimate=prepareRecord(food,grams);
    const count=document.createElement("p");count.className="food-estimate";
    count.textContent=estimate.carbs.toLocaleString("fr-FR")+" g de glucides estimés pour "+grams+" g. "+(food.kind==="local"?"Base indicative.":"Vérifie l'étiquette du produit exact.");
    const play=document.createElement("button");play.type="button";play.className="read-carb-btn";
    play.textContent="🔊 Écouter l'estimation";
    play.onclick=()=>speech(speakFood(estimate),{force:true});
    card.append(count,play);
   }catch{}
  }
  const button=document.createElement("button");button.type="button";button.textContent="Choisir et confirmer la portion";
  button.onclick=()=>{
   foodCandidate=food;
   $("foodCandidateName").textContent=food.name+(food.brand?" · "+food.brand:"")+" — "+food.source;
   $("foodPortion").value=grams??"";refreshFoodPreview();
   $("confirmFood").showModal();
  };
  card.append(button);box.append(card);
 });
}
async function refreshFoodLibrary({showList=false}={}){
 try{
  const stats=await cachedStats(),items=showList?await allCached():null;
  libraryAvailable=true;$("foodLibraryStatus").textContent=libraryStatus(stats);
  if(showList){
   foodCachedList=items;
   const box=$("foodSavedList");box.replaceChildren();
   if(!items.length){box.textContent="Aucun produit en mémoire pour le moment.";return;}
   const heading=document.createElement("p");heading.className="hint";
   heading.textContent="Produits Open Food Facts disponibles hors connexion ("+items.length+") :";
   box.append(heading);
   items.sort((a,b)=>(b.cachedAt||0)-(a.cachedAt||0)).slice(0,60).forEach(food=>{
    const row=document.createElement("div");row.className="food-saved-item";
    const text=document.createElement("div"),title=document.createElement("b"),details=document.createElement("small");
    title.textContent=food.name+(food.brand?" — "+food.brand:"");
    details.textContent=food.per100+" g / 100 g · code "+food.code;
    text.append(title,details);
    const button=document.createElement("button");button.type="button";button.textContent="Calculer";
    button.onclick=()=>{$("foodQuery").value=food.code;foodLookup(food.code);};
    row.append(text,button);box.append(row);
   });
  }
 }catch(e){
  libraryAvailable=false;
  $("foodLibraryStatus").textContent="Bibliothèque Open Food Facts impossible à enregistrer ici : "+String(e.message||e).slice(0,130)+". La table indicative reste disponible.";
  $("foodSavedList").replaceChildren();
 }
}
const packPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function downloadFoodPack(){
 if(foodPackBusy){toast("Téléchargement alimentaire déjà en cours.");return;}
 if(!navigator.onLine){$("foodPackStatus").textContent="Connecte-toi d'abord à Internet pour préparer le stock de produits. Les produits déjà téléchargés restent consultables hors connexion.";return;}
 foodPackBusy=true;$("foodPackBtn").disabled=true;
 let saved=0,success=0,failures=0;
 try{
  for(let index=0;index<OFFLINE_PACK_QUERIES.length;index++){
   const term=OFFLINE_PACK_QUERIES[index];
   $("foodPackStatus").textContent="Téléchargement "+(index+1)+"/"+OFFLINE_PACK_QUERIES.length+" : "+term+".";
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
   try{
    const found=await searchOpenFoodFacts(term,{signal:controller.signal});
    const stored=await storeFoodProducts(found);
    saved+=stored.added;success++;
   }catch(err){
    failures++;$("foodPackStatus").textContent="Catégorie "+term+" indisponible ; poursuite des autres catégories.";
   }finally{clearTimeout(timer);}
   if(index<OFFLINE_PACK_QUERIES.length-1)await packPause(1300);
  }
  await refreshFoodLibrary({showList:true});
  $("foodPackStatus").textContent=success
   ? "Préparation terminée : "+saved+" fiches reçues sur "+success+" catégories. "+(failures?"Certaines recherches ont échoué. ":"")+"En mode avion, recherche ces produits par nom, marque ou code-barres."
   : "Aucun produit récupéré. Open Food Facts est peut-être indisponible ou limite les requêtes ; réessaie plus tard.";
 }catch(e){
  $("foodPackStatus").textContent="Bibliothèque non disponible : "+String(e.message||e).slice(0,130);
 }finally{foodPackBusy=false;$("foodPackBtn").disabled=false;}
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
 if(!query||query.error){
  foodVoicePending=false;
  const message=query?.error||"Précise un aliment et, idéalement, une quantité en grammes.";
  $("foodStatus").textContent=message;toast(message);return;
 }
 const id=++foodSearchId,fromVoice=foodVoicePending;foodVoicePending=false;
 visibleTab("nutrition");$("foodQuery").value=raw;
 const local=findOffline(query.term);
 showFoodOptions(local,query.grams);
 const code=query.term.trim().replace(/\s/g,"");
 let saved=[];
 try{
  saved=await cachedSearch(code||query.term,8);
 }catch(e){
  $("foodLibraryStatus").textContent="Bibliothèque locale inaccessible : "+String(e.message||e).slice(0,100);
 }
 if(id!==foodSearchId)return;
 let options=uniqueFoods([...saved,...local]);
 showFoodOptions(options,query.grams);
 const offlineCount=saved.length;
 if(offlineCount){
  $("foodStatus").textContent=offlineCount+" fiche(s) Open Food Facts mémorisée(s) sur le téléphone"+(local.length?" et "+local.length+" référence(s) indicatives.":".")+" Vérifie la marque et les valeurs de l'étiquette.";
 }else if(local.length){
  $("foodStatus").textContent="Table DiabCare indicative, sans fiche Open Food Facts correspondante mémorisée. Vérifie l'aliment préparé.";
 }else{
  $("foodStatus").textContent=navigator.onLine?"Recherche Open Food Facts en cours…":"Aucun produit en mémoire correspondant. Prépare la bibliothèque avant de partir en nature.";
 }
 // Une seule correspondance permet de répondre directement avec sa source explicite.
 let alreadySpoken=false;
 if(fromVoice&&options.length===1&&query.grams!=null){
  try{
   const rec=prepareRecord(options[0],query.grams);
   $("foodVoiceStatus").textContent=rec.carbs.toLocaleString("fr-FR")+" g estimés pour "+query.grams+" g de "+rec.name+". Source : "+rec.source+".";
   speech(speakFood(rec),{force:true});alreadySpoken=true;
  }catch{}
 }
 if(navigator.onLine){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try{
   const online=/^\d{8,14}$/.test(code)
    ?[await barcodeOpenFoodFacts(code,{signal:controller.signal})]
    :await searchOpenFoodFacts(query.term,{signal:controller.signal});
   if(id!==foodSearchId)return;
   if(online.length){
    options=uniqueFoods([...online,...saved,...local]);
    showFoodOptions(options,query.grams);
    $("foodStatus").textContent=online.length+" résultat(s) Open Food Facts consulté(s), avec "+offlineCount+" fiche(s) mémorisée(s) et "+local.length+" approximation(s) locale(s). Vérifie le nom et la préparation.";
    try{await storeFoodProducts(online);await refreshFoodLibrary();}catch(e){
     $("foodLibraryStatus").textContent="La recherche en ligne fonctionne, mais le stockage hors connexion a échoué : "+String(e.message||e).slice(0,100);
    }
    if(fromVoice&&!alreadySpoken&&options.length===1&&query.grams!=null){
     const record=prepareRecord(options[0],query.grams);
     speech(speakFood(record),{force:true});alreadySpoken=true;
    }
   }else if(!options.length)$("foodStatus").textContent="Aucune fiche exploitable trouvée. Recherche d'autres termes ou utilise l'étiquette du produit.";
  }catch(e){
   if(id!==foodSearchId)return;
   $("foodStatus").textContent=(options.length
    ?"Open Food Facts en ligne indisponible ou trop lent : les produits locaux restent calculables."
    :"Aucune fiche locale trouvée ; Open Food Facts indisponible. Aucun chiffre ne sera inventé.");
  }finally{clearTimeout(timer);}
 }
 if(id!==foodSearchId)return;
 const hasResult=$("foodResults").children.length>0;
 let feedback;
 if(hasResult&&query.grams==null)feedback="J'ai trouvé des aliments. Indique une portion en grammes pour obtenir la quantité de glucides, puis vérifie la marque.";
 else if(hasResult&&options.length>1)feedback="Plusieurs aliments correspondent. Choisis le produit exact pour éviter une estimation trompeuse.";
 else if(hasResult)feedback="Une estimation est affichée avec sa source. Vérifie la portion avant d'enregistrer ton repas.";
 else feedback="Je n'ai pas de donnée fiable pour cet aliment hors connexion. Aucun résultat inventé.";
 if(fromVoice&&!alreadySpoken){
  $("foodVoiceStatus").textContent=feedback;
  speech(feedback,{force:true});
 }
 sessionReply(feedback,"Agent nutrition • Open Food Facts / hors connexion",false);
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
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{
  const r=await fetch(verifiedMistralEndpoint,{
   method:"POST",mode:"cors",headers:{"Content-Type":"application/json","X-DiabCare-Code":$("accessCode").value.trim()},
   body:JSON.stringify({question:q}),signal:controller.signal,cache:"no-store"
  });
  if(!r.ok)throw Error(gatewayError(r.status));
  const response=await r.json();
  if(typeof response.text!=="string"||!safeGenerated(response.text))throw Error("Réponse IA bloquée par les contrôles de sécurité.");
  return {text:response.text,experts:Array.isArray(response.experts)?response.experts:[]};
 }finally{clearTimeout(timer);}
}

function toast(t){const x=$("toast");x.textContent=t;x.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>x.hidden=true,5200);}
function speech(text,{force=false}={}){
 if((!force&&!data.prefs.speak)||!("speechSynthesis" in window)){setJarvisState("idle");if(force)toast("Lecture vocale indisponible sur ce navigateur.");return;}
 try{
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(String(text).slice(0,1800));u.lang="fr-FR";u.rate=1.04;u.pitch=0.9;
  u.onstart=()=>setJarvisState("speaking");u.onend=()=>setJarvisState("idle");u.onerror=()=>{setJarvisState("idle");if(force)toast("La lecture audio est bloquée. Vérifie le son et les autorisations du navigateur.");};
  speechSynthesis.speak(u);
 }catch{setJarvisState("idle");if(force)toast("Lecture vocale non prise en charge dans ce navigateur.");}
}
function save(){if(!unlocked||ephemeral||!key)return Promise.resolve();const snapshot=structuredClone(data);
 saveQueue=saveQueue.catch(()=>{}).then(()=>persist(key,snapshot)).catch(e=>toast("Enregistrement impossible : "+e.message));return saveQueue;
}
function msg(role,text,small=""){const d=document.createElement("div");d.className="msg"+(role==="user"?" user":"");d.textContent=text;
 if(small){const e=document.createElement("small");e.textContent=small;d.appendChild(e);}
 $("chat").appendChild(d);$("chat").scrollTop=$("chat").scrollHeight;}
function renderChat(){const chat=$("chat");chat.replaceChildren();data.chat.slice(-35).forEach(m=>msg(m.role,m.text,m.agent||""));if(!data.chat.length)msg("assistant","Bonjour, je suis DiabCare, compagnon DT1. Je peux t'aider à comprendre le diabète et consulter les mesures que tu as saisies. En cas d'urgence, appelle les secours.","Moteur local • disponible sans Internet");}
function visibleTab(id){
 $all("nav [data-tab]").forEach(b=>{const active=b.dataset.tab===id;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");});
 $all(".screen").forEach(x=>x.classList.toggle("active",x.id==="screen-"+id));
 if(id==="journal")renderJournal();if(id==="nutrition"){renderMeals();refreshFoodLibrary().catch(()=>{});}
 try{window.scrollTo({top:0,behavior:"instant"});}catch{window.scrollTo(0,0);}
}
function requireUnlock(){
 if(!unlocked){toast("Choisis un coffre chiffré ou le mode Sans stockage pour utiliser DiabCare.");if(!$("entryDialog").open)entry(exists());return false;}
 return true;
}
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
function activate(loaded,ephem=false){
 data=loaded;unlocked=true;ephemeral=ephem;
 $("entryDialog").close();$("vaultStatus").textContent=ephem?"Session sans stockage":"Coffre déverrouillé";
 renderChat();renderJournal();renderMeals();
 refreshFoodLibrary().catch(()=>{});
 $("speakToggle").checked=data.prefs.speak!==false;
 $("backupBtn").disabled=ephem;
 $("backupBtn").title=ephem?"Le mode sans stockage ne produit aucune sauvegarde.":"Télécharger le coffre chiffré.";
 $("lockBtn").disabled=false;
 $("lockBtn").textContent=ephem?"Terminer la session":"Verrouiller";
 $("eraseBtn").disabled=ephem;
 $("eraseBtn").title=ephem?"Déverrouille d'abord ton coffre pour le supprimer.":"Effacer définitivement le coffre";
}
function lock(){
 silence();data=fresh();key=null;unlocked=false;ephemeral=false;model=null;
 $("chat").replaceChildren();$("vaultStatus").textContent="Verrouillé";
 entry(exists());
}
function entry(already=exists()){$("entryTitle").textContent=already?"Déverrouiller DiabCare":"Créer mon coffre chiffré";$("entryText").textContent=already?"Entre ta phrase secrète. Aucun serveur ne peut la récupérer.":"Crée une phrase secrète d'au moins 8 caractères. Les données de santé seront chiffrées localement, sans cloud."; $("consentField").hidden=already;$("pin").value="";$("pinError").textContent="";
 $("entrySubmit").textContent=already?"Déverrouiller le coffre":"Créer un coffre sécurisé";
 if(!$("entryDialog").open)$("entryDialog").showModal();}
async function submitEntry(){
 try{const pin=$("pin").value;if(pin.length<8)throw Error("Utilise au moins 8 caractères, ou touche Sans stockage pour essayer DiabCare.");
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
   let answeredCloud=false;
   if(liveMode()!=="offline"&&consentedMistral()){
    try{
     const response=await mistralQuestion(q);
     if(response){reply=response.text;label="Mistral contrôlé • "+(response.experts.join(" · ")||experts.join(" · "));answeredCloud=true;}
    }catch(e){
     toast("Mistral indisponible : "+String(e.message||e).slice(0,135)+". Réponse locale utilisée.");
    }
   }else if(liveMode()==="mistral"&&!verifiedMistralEndpoint){
    toast("Mistral n'est pas connecté : réponse locale utilisée.");
   }
   if(!answeredCloud&&model){
    try{
     const generated=await model.reply(q,reply);
     if(safeGenerated(generated)){reply=generated;label="Qwen local • "+experts.join(" · ");}
    }catch(e){
     model=null;updateAiStatuses();
     toast("Qwen indisponible : réponse documentaire locale utilisée.");
    }
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
 if(voiceIntent==="nutrition"){const foodStatus=$("foodVoiceStatus");if(foodStatus)foodStatus.textContent=message;}
}
function deliverTranscript(transcript){
 const text=String(transcript||"").trim(),intent=voiceIntent;voiceIntent="general";
 if(!transcriptSafe(text)){
  voiceHint("Je n'ai pas compris. Réessaie en parlant distinctement ou utilise le clavier.");
  setJarvisState("idle");return;
 }
 voiceHint('J’ai entendu : « '+text.slice(0,150)+' ». Vérifie la mesure ou la portion si nécessaire.');
 if(intent==="nutrition"){
  if(urgentQuestion(text)||doseQuestion(text)){ask(text);return;}
  $("foodQuery").value=text;
  $("foodVoiceStatus").textContent='J’ai compris : « '+text.slice(0,150)+' ». Vérifie le nom et les quantités.';
  foodVoicePending=true;
  foodLookup(text).catch(e=>{foodVoicePending=false;$("foodVoiceStatus").textContent="Recherche impossible : "+String(e.message||e);});
  return;
 }
 $("question").value=text;
 ask(text);
 $("question").value="";
}
async function checkNativeLocalSpeech(SR){
 if(!SR||typeof SR.available!=="function")return false;
 try{return await SR.available({langs:["fr-FR"],processLocally:true})==="available";}catch{return false;}
}
function voiceChooser({browserRecognition=false,recordingSupported=false,online=false}={}){
 $("voiceConsentCheck").checked=remoteVoiceConsent||!!$("remoteSpeechOpt").checked;
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
  whisperReady=true;updateAiStatuses();
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
  if(await installWhisper())voiceHint("Whisper chargé. Appuie à nouveau sur le micro pour démarrer un enregistrement.");
  return;
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
async function dictate(intent="general"){
 if(!requireUnlock())return;
 voiceIntent=intent==="nutrition"?"nutrition":"general";
 if(voiceIntent==="nutrition")$("foodVoiceStatus").textContent="Préparation du microphone…";
 // Deuxième appui pendant l'enregistrement Whisper : arrêter et transcrire.
 if(clipRecorder){const clip=clipRecorder;try{await clip.stop();}catch{}return;}
 if(recognition){try{recognition.stop();}catch{}return;}
 if(whisperBusy){voiceHint("Whisper est en cours de chargement.");return;}
 if(requestBusy){voiceHint("JARVIS traite la question précédente.");return;}
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 // Aucun await avant le lancement : Android peut retirer l'activation utilisateur
 // et refuser la permission du micro après un aller-retour asynchrone.
 const localNative=nativeSpeechChecked&&nativeSpeechReady;
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
async function loadAI(){
 if(modelBusy)return;
 if(!confirm("Installer Qwen3 (~484 Mo) sur ce téléphone ? Prévois du Wi-Fi et de l'espace libre. Annuler conserve l'assistant documentaire local."))return;
 if(!navigator.onLine)toast("Sans réseau, Qwen doit déjà être en cache pour démarrer.");
 modelBusy=true;$("modelBtn").disabled=true;$("modelStatus").textContent="Chargement local, téléchargement possible de centaines de Mo…";
 try{
  const mod=await import("./model.mjs");model=await mod.createLocalModel(t=>$("modelStatus").textContent=t);
  $("aiMode").textContent="IA open source chargée sur cet appareil";$("modelStatus").textContent="Modèle local actif. Aucune question envoyée au cloud.";toast("IA locale chargée.");updateAiStatuses();
 }catch(e){model=null;$("aiMode").textContent="Assistant local déterministe";$("modelStatus").textContent="Modèle indisponible : "+String(e.message||e).slice(0,160);toast("L'assistant de secours hors connexion reste disponible.");updateAiStatuses();}
 finally{modelBusy=false;$("modelBtn").disabled=false;}
}
function setup(){
 let savedGateway="";
 try{savedGateway=localStorage.getItem(GATEWAY_STORAGE_KEY)||"";}catch{}
 $("mistralGatewayUrl").value=savedGateway||SUGGESTED_GATEWAY;
 $("aiSelect").value="offline";
 $("mistralState").textContent="Non connecté : GitHub Pages nécessite une passerelle Vercel et deux secrets sur le serveur.";
 updateAiStatuses();
 updateNet();addEventListener("online",updateNet);addEventListener("offline",updateNet);
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 checkNativeLocalSpeech(SR).then(ready=>{nativeSpeechReady=ready;nativeSpeechChecked=true;}).catch(()=>{nativeSpeechChecked=true;});

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
 $("micBtn").onclick=()=>dictate("general");$("jarvisOrb").onclick=()=>dictate("general");$("talkBtn").onclick=()=>dictate("general");
 $("foodMicBtn").onclick=()=>dictate("nutrition");
 $("stopVoice").onclick=()=>{silence();voiceHint("Micro et synthèse vocale arrêtés.");};
 $("voiceKeyboardBtn").onclick=()=>{
  $("voiceChoice").close();
  const nutrition=voiceIntent==="nutrition";voiceIntent="general";
  visibleTab(nutrition?"nutrition":"chat");
  const input=$(nutrition?"foodQuery":"question");
  input.scrollIntoView({block:"center",behavior:"smooth"});
  input.focus();
  voiceHint(nutrition?"Clavier prêt : indique l'aliment et la portion, puis touche Calculer les glucides.":"Clavier prêt : écris ta question et touche Envoyer.");
 };
 $("voiceRecordStop").onclick=()=>{if(clipRecorder){const clip=clipRecorder;voiceHint("Transcription en cours…");clip.stop().catch(()=>{});}};
 $("voiceRecordCancel").onclick=()=>{silence();voiceHint("Enregistrement annulé.");};
 $("voiceRecording").addEventListener("cancel",e=>{e.preventDefault();silence();});

 $("voiceCloseBtn").onclick=()=>{$("voiceChoice").close();voiceIntent="general";};
 $("voiceBrowserBtn").onclick=()=>{
  if(!$("voiceConsentCheck").checked){
   $("voiceChoiceDetails").textContent="Coche d'abord l'autorisation explicite de dictée en ligne. Sans accord, choisis Whisper ou le clavier.";
   $("voiceConsentCheck").focus();return;
  }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||!navigator.onLine){
   voiceHint("Le navigateur n'a pas de moteur vocal disponible en ligne. Choisis Whisper ou le clavier.");
   return;
  }
  $("voiceChoice").close();remoteVoiceConsent=true;$("remoteSpeechOpt").checked=true;
  // Appel immédiat dans le gestionnaire du bouton : requis sur de nombreux Android.
  browserSpeech(SR,false);
 };
 $("voiceOfflineBtn").onclick=async()=>{
  $("voiceChoice").close();
  // Ne jamais déclencher getUserMedia après un téléchargement asynchrone.
  // Une fois Whisper chargé, il faut un nouveau geste utilisateur pour enregistrer.
  if(await installWhisper()){
   voiceHint("Whisper prêt. Appuie de nouveau sur le micro pour enregistrer.");
   toast("Whisper installé. Appuie à nouveau sur le micro.");
  }
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
 $("foodForm").onsubmit=ev=>{ev.preventDefault();foodVoicePending=false;foodLookup($("foodQuery").value).catch(e=>{
  $("foodStatus").textContent="Erreur de recherche : "+String(e.message||e).slice(0,130);
 });};
 $("foodPackBtn").onclick=()=>downloadFoodPack();
 $("foodLibraryRefresh").onclick=()=>refreshFoodLibrary({showList:true});
 $("foodLibraryClear").onclick=async()=>{
  if(!confirm("Vider uniquement les produits Open Food Facts téléchargés sur ce téléphone ? Le journal chiffré et les repas déjà enregistrés ne seront pas modifiés."))return;
  try{
   await clearCached();
   $("foodResults").replaceChildren();foodSearchId++;
   await refreshFoodLibrary({showList:true});
   $("foodPackStatus").textContent="Bibliothèque alimentaire effacée. Les glycémies et les repas consignés ont été conservés.";
   toast("Fiches alimentaires effacées. Journal préservé.");
  }catch(e){$("foodPackStatus").textContent="Suppression impossible : "+String(e.message||e).slice(0,120);}
 };
 $("foodReadPreview").onclick=()=>{
  if(!foodCandidate)return;
  try{
   const grams=Number($("foodPortion").value.trim().replace(",","."));
   speech(speakFood(prepareRecord(foodCandidate,grams)),{force:true});
  }catch{toast("Vérifie et indique une portion valide.");}
 };
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
 $("aiSelect").onchange=()=>{
  updateAiStatuses();
  if(liveMode()==="mistral"&&!verifiedMistralEndpoint)
   $("mistralState").textContent="Mistral non connecté. Configure l'adresse et le code, coche le consentement, puis lance le test.";
 };
 $("mistralDefaultBtn").onclick=()=>{$("mistralGatewayUrl").value=SUGGESTED_GATEWAY;resetMistral("Adresse du projet Jarvis renseignée. Configure les secrets sur Vercel puis teste.");};
 $("mistralTestBtn").onclick=()=>verifyMistral();
 $("mistralGatewayUrl").oninput=()=>resetMistral("Adresse modifiée : relance le test de connexion.");
 $("accessCode").oninput=()=>resetMistral("Code modifié : relance le test de connexion.");
 $("mistralConsent").onchange=()=>{
  if(!$("mistralConsent").checked)resetMistral("Envoi à Mistral désactivé. Réactive le consentement et vérifie la connexion.");
  updateAiStatuses();
 };

 $("glucoseForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const unit=$("unit").value,r=parseGlucose($("glucose").value,unit);if(!r.ok){toast(r.error);return;}
 data.profile.unit=unit;data.readings.push({mg:r.mg,ts:Date.now(),source:"manuel"});data.readings=data.readings.slice(-2500);$("glucose").value="";save();renderJournal();let info=guidanceForMeasurement(r.mg);toast("Mesure enregistrée : "+formatGlucose(r.mg,unit));$("safetyNotice").textContent=info;$("safetyNotice").className="alert"+(stateOf(r.mg)==="verylow"||stateOf(r.mg)==="low"?" critical":"");};
 $("injectionForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const txt=$("injection").value.trim().replace(",",".");const u=Number(txt);if(!/^\d+(?:\.\d+)?$/.test(txt)||!(u>0&&u<=100)){toast("Valeur invalide. Il s'agit uniquement d'une injection réellement effectuée.");return;}data.injections.push({u,ts:Date.now()});data.injections=data.injections.slice(-1000);$("injection").value="";save();renderJournal();toast("Injection déjà réalisée consignée.");};
 $("reportBtn").onclick=()=>{if(requireUnlock())reportDownload("diabcare-bilan.txt",exportReport(data));};
 $("backupBtn").onclick=async()=>{try{await saveQueue;reportDownload("diabcare-coffre-chiffre.json",exportEncrypted(),"application/json");toast("Sauvegarde chiffrée téléchargée.");}catch(e){toast(e.message);}};
 $("restoreBtn").onclick=()=>{
  if(ephemeral&&exists()){toast("Déverrouille ton coffre existant avant de restaurer une sauvegarde.");return;}
  $("restoreFile").click();
 };
 $("restoreFile").onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value="";if(!file)return;if(file.size>10000000){toast("Sauvegarde trop volumineuse.");return;}
  const phrase=prompt("Phrase secrète de la sauvegarde chiffrée :");if(!phrase)return;
  if(!confirm("Remplacer le coffre local actuel par cette sauvegarde, après vérification ?"))return;
  try{await restoreEncryptedBackup(await file.text(),phrase);toast("Sauvegarde vérifiée et restaurée. Rechargement…");location.reload();}catch(err){toast("Restauration refusée : "+String(err.message||err).slice(0,140));}
 };
 $("speakToggle").onchange=e=>{data.prefs.speak=e.target.checked;save();};
 $("remoteSpeechOpt").onchange=e=>{
  remoteVoiceConsent=e.target.checked;
  $("voiceConsentCheck").checked=e.target.checked;
  voiceHint(e.target.checked?"Dictée du navigateur en ligne autorisée pour cette session.":"Dictée en ligne désactivée.");
 };
 if(!(window.SpeechRecognition||window.webkitSpeechRecognition)&&!isRecordingSupported())voiceHint("Le navigateur actuel ne donne pas accès au micro : utilise Chrome ou Safari dans une fenêtre normale, pas un navigateur intégré. Le clavier reste disponible.");
 $("lockBtn").onclick=lock;
 $("eraseBtn").onclick=()=>{
  if(!unlocked||ephemeral){toast("Le coffre doit être déverrouillé avant suppression.");return;}
  if(!confirm("Supprimer définitivement le coffre chiffré DiabCare ?"))return;
  if(!confirm("Dernière confirmation : les données seront perdues sans sauvegarde."))return;
  erase();location.reload();
 };
 $("emergencyRead").onclick=()=>{speech("Urgence : appelez le 15 ou le 112. Si la personne est inconsciente, ne rien donner par la bouche. Suivez les consignes des secours.",{force:true});};
 $("modelBtn").onclick=loadAI;
 $("modelCheck").onclick=()=>{
  const state=model?"Le modèle local est actif.":"Le modèle local n'est pas chargé.";
  $("modelStatus").textContent=state+" Les poids IA ne sont jamais remplacés automatiquement sans vérification. Version proposée : "+modelInfo().file+".";
  toast("État de l'IA locale actualisé.");
 };
 $("appUpdate").onclick=async()=>{
  const status=$("updateStatus");$("appUpdate").disabled=true;
  status.textContent="Vérification de la version en cours…";
  try{
   if(!("serviceWorker" in navigator)){status.textContent="Ce navigateur n'autorise pas le service worker. Utilise une fenêtre Chrome/Safari normale.";return;}
   const reg=await navigator.serviceWorker.getRegistration();
   if(!reg){status.textContent="Application ouverte mais mode hors connexion non installé. Recharge ce site en HTTPS.";return;}
   await reg.update();
   status.textContent="Vérification terminée. Appuie sur Actualiser la page pour charger la dernière version, sans effacer les données.";
   $("reloadAppBtn").hidden=false;
  }catch(e){status.textContent="Mise à jour inaccessible : "+String(e.message||e).slice(0,100);}
  finally{$("appUpdate").disabled=false;}
 };
 $("reloadAppBtn").onclick=()=>location.reload();
 $("diagnosticBtn").onclick=()=>{
  const result=$("diagnosticResults");result.replaceChildren();
  const tests=[
   ["Navigation", $all("nav [data-tab]").length===5],
   ["Saisie clavier", Boolean($("question")&&$("foodQuery"))],
   ["Journal local", Boolean(globalThis.crypto?.subtle)],
   ["Synthèse vocale", "speechSynthesis" in window],
   ["Dictée du navigateur", Boolean(window.SpeechRecognition||window.webkitSpeechRecognition)],
   ["Enregistrement du microphone", isRecordingSupported()],
   ["Moteur Whisper chargé", whisperReady],
   ["PWA hors connexion", "serviceWorker" in navigator],
   ["Internet détecté", navigator.onLine],
   ["Moteur Qwen chargé", Boolean(model)]
  ];
  for(const [label,ok] of tests){
   const line=document.createElement("p");line.className="diagnostic-line";
   line.textContent=(ok?"✓ ":"— ")+label+" : "+(ok?"disponible":"indisponible ou non activé");
   result.append(line);
  }
  toast("Diagnostic terminé : les fonctions indisponibles sont identifiées.");
 };
 $("agents").replaceChildren();
 const agentPrompts={
  securite:"Quels sont les signes d'alerte d'une hypoglycémie ?",
  diabeto:"Explique le diabète de type 1",
  infirmier:"Comment organiser le suivi de la glycémie au quotidien ?",
  pharmacie:"Comment conserver l'insuline en randonnée ?",
  sport:"Préparer une randonnée avec un diabète de type 1",
  psy:"Comment gérer le stress et la charge mentale du diabète ?",
  analyse:"Fais le bilan de mes mesures"
 };
 AGENTS.forEach(([id,label])=>{
  const button=document.createElement("button");button.type="button";button.className="agent agent-action";
  button.setAttribute("aria-label","Consulter : "+label);
  const b=document.createElement("b");b.textContent=label;
  const small=document.createElement("small");small.textContent=id==="nutrition"?"Ouvrir le calculateur":"Ouvrir une question guidée";
  button.append(b,small);
  button.onclick=()=>{
   if(id==="nutrition"){visibleTab("nutrition");$("foodQuery").focus();}
   else{visibleTab("chat");ask(agentPrompts[id]||"Explique le diabète de type 1");}
  };
  $("agents").append(button);
 });
 SOURCES.forEach(s=>{const p=document.createElement("p"),a=document.createElement("a");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=s.name;p.append(a);$("sources").append(p);});
 $("appVersion").textContent="DiabCare "+VERSION+" • Assistant vocal · GlucoCheck · Glucides · IA locale";
 const sourcesBox=$("llmSources");if(sourcesBox){LLM_SOURCES.forEach(source=>{const row=document.createElement("p"),link=document.createElement("a");link.href=source.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent=source.id+" · "+source.status;row.append(link);sourcesBox.append(row);});}
 $("modelStatus").textContent="Qwen3 0,6B GGUF · 484 Mo · runtime wllama. Non chargé par défaut ; compatibilité selon le téléphone.";updateAiStatuses();

 if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("./sw.js").catch(()=>toast("Mode hors ligne non installé."));
 let installEvt=null;addEventListener("beforeinstallprompt",ev=>{ev.preventDefault();installEvt=ev;$("installBtn").hidden=false;});
 $("installBtn").onclick=async()=>{
  if(!installEvt){toast("Installation : Chrome Android → menu ⋮ → Ajouter à l'écran d'accueil ; Safari iPhone → Partager → Sur l'écran d'accueil.");return;}
  try{await installEvt.prompt();await installEvt.userChoice;$("installBtn").hidden=true;}
  catch{toast("Installation depuis le menu du navigateur.");
  }
 };
 document.addEventListener("visibilitychange",()=>{if(document.hidden){awayAt=Date.now();if("speechSynthesis" in window)speechSynthesis.cancel();}
 else if(awayAt&&!ephemeral&&unlocked&&Date.now()-awayAt>TIMEOUT)lock();});
 addEventListener("pagehide",()=>{if("speechSynthesis" in window)speechSynthesis.cancel();});
 if(exists())entry(true);else entry(false);
}
try{setup();}catch(e){
 console.error("DiabCare startup error",e);
 const notice=document.getElementById("toast");if(notice){notice.hidden=false;notice.textContent="Erreur d’initialisation. Recharge la page sans effacer les données du site.";}
}
