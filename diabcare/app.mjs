import {VERSION,AGENTS,SOURCES,answer,doseQuestion,urgentQuestion,safeGenerated,parseGlucose,formatGlucose,summary,stateOf,guidanceForMeasurement,exportReport} from "./core.mjs";
import {fresh,exists,createVault,unlock,persist,erase,exportEncrypted} from "./vault.mjs";
const $=id=>document.getElementById(id), $all=s=>[...document.querySelectorAll(s)];
let data=fresh(),key=null,ephemeral=false,unlocked=false,model=null,modelBusy=false,saveQueue=Promise.resolve(),pendingInstall=null;
const TIMEOUT=10*60*1000;let awayAt=null;
function toast(t){const x=$("toast");x.textContent=t;x.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>x.hidden=true,5200);}
function speech(text){if(!data.prefs.speak||!("speechSynthesis" in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).slice(0,1250));u.lang="fr-FR";u.rate=1;speechSynthesis.speak(u);}catch{}}
function save(){if(!unlocked||ephemeral||!key)return Promise.resolve();const snapshot=structuredClone(data);
 saveQueue=saveQueue.catch(()=>{}).then(()=>persist(key,snapshot)).catch(e=>toast("Enregistrement impossible : "+e.message));return saveQueue;
}
function msg(role,text,small=""){const d=document.createElement("div");d.className="msg"+(role==="user"?" user":"");d.textContent=text;
 if(small){const e=document.createElement("small");e.textContent=small;d.appendChild(e);}
 $("chat").appendChild(d);$("chat").scrollTop=$("chat").scrollHeight;}
function renderChat(){const chat=$("chat");chat.replaceChildren();data.chat.slice(-35).forEach(m=>msg(m.role,m.text,m.agent||""));if(!data.chat.length)msg("assistant","Bonjour, je suis DiabCare, compagnon DT1. Je peux t'aider à comprendre le diabète et consulter les mesures que tu as saisies. En cas d'urgence, appelle les secours.","Moteur local • disponible sans Internet");}
function visibleTab(id){$all("nav [data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
 $all(".screen").forEach(x=>x.classList.toggle("active",x.id==="screen-"+id));if(id==="journal")renderJournal();}
function requireUnlock(){if(!unlocked){toast("Déverrouille le coffre ou choisis le mode sans stockage.");return false;}return true;}
function reportDownload(name,text,type="text/plain"){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function renderJournal(){const unit=data.profile.unit||"g";$("unit").value=unit;const sum=summary(data.readings);$("journalSummary").textContent=sum?sum.n+" mesures sur 14 jours. Moyenne des saisies : "+formatGlucose(sum.mean,unit)+". Ce n'est PAS un temps dans la cible continu.":"Aucune mesure enregistrée.";
 const box=$("readings");box.replaceChildren();[...data.readings].slice(-30).reverse().forEach(r=>{const d=document.createElement("div");d.className="record";const a=document.createElement("span");a.textContent=new Date(r.ts).toLocaleString("fr-FR");const b=document.createElement("strong");b.textContent=formatGlucose(r.mg,unit);d.append(a,b);box.append(d);});
 const inj=$("injections");inj.replaceChildren();[...data.injections].slice(-12).reverse().forEach(r=>{const d=document.createElement("div");d.className="record";d.textContent=new Date(r.ts).toLocaleString("fr-FR")+" · "+r.u+" U (injection consignée)";inj.append(d);});}
function activate(loaded,ephem=false){data=loaded;unlocked=true;ephemeral=ephem;$("entryDialog").close();$("vaultStatus").textContent=ephem?"Session sans stockage":"Coffre déverrouillé";renderChat();renderJournal();$("speakToggle").checked=data.prefs.speak!==false;$("backupBtn").disabled=ephem;$("lockBtn").disabled=ephem;}
function lock(){if(ephemeral){toast("La session sans stockage ne peut pas être verrouillée : ferme l'application pour l'effacer.");return;}if("speechSynthesis" in window)window.speechSynthesis.cancel();data=fresh();key=null;unlocked=false;model=null;$("chat").replaceChildren();$("vaultStatus").textContent="Verrouillé";entry(true);}
function entry(already=exists()){$("entryTitle").textContent=already?"Déverrouiller DiabCare":"Créer mon coffre chiffré";$("entryText").textContent=already?"Entre ta phrase secrète. Aucun serveur ne peut la récupérer.":"Crée une phrase secrète d'au moins 8 caractères. Les données de santé seront chiffrées localement, sans cloud."; $("consentField").hidden=already;$("pin").value="";$("pinError").textContent="";$("entryDialog").showModal();}
async function submitEntry(){
 try{const pin=$("pin").value;if(pin.length<8)throw Error("Minimum 8 caractères.");
 if(exists()){const unlockedVault=await unlock(pin);key=unlockedVault.key;activate(unlockedVault.state);}
 else{if(!$("consent").checked)throw Error("Consentement nécessaire pour conserver les données.");const next=fresh();const k=await createVault(pin,next);key=k;activate(next);}
 }catch(e){$("pinError").textContent=e?.message==="The operation failed for an operation-specific reason"?"Phrase secrète incorrecte.":String(e.message||e);}}
function allowExpansion(q){const s=String(q).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return !/(?:\d|dose|insuline|bolus|glyc|hypo|hyper|cetone|malaise|symptome|vomis|acidocetose|basale|corrig|inject|journal|bilan|mesure|tendance|traitement|glucagon|medic|glucide)/.test(s);}
async function ask(text){if(!requireUnlock())return;const q=String(text||"").trim();if(!q)return;
 msg("user",q);data.chat.push({role:"user",text:q,ts:Date.now()});
 let result=answer(q,data);let response=result.text;let agentNames=(result.agents||[]).map(id=>AGENTS.find(a=>a[0]===id)?.[1]||id).join(" · ");
 // Le triage et les dosages ne sont jamais transmis au modèle génératif.
 if(model&&allowExpansion(q)&&!doseQuestion(q)&&!urgentQuestion(q)&&result.level==="info"){
  try{
   const generated=await model.reply(q,response);
   if(safeGenerated(generated))response=generated;
  }catch(e){toast("IA locale indisponible : réponse de secours utilisée.");model=null;$("aiMode").textContent="Mode déterministe hors ligne";}
 }
 msg("assistant",response,agentNames+" • "+(model?"IA locale encadrée":"réponse locale"));
 data.chat.push({role:"assistant",text:response,agent:agentNames,ts:Date.now()});data.chat=data.chat.slice(-80);
 await save();if(data.prefs.speak)speech(response);
}
function updateNet(){$("netStatus").textContent=navigator.onLine?"Réseau disponible":"Hors ligne";$("netStatus").style.color=navigator.onLine?"var(--green)":"var(--amber)";}
async function dictate(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR||typeof SR.available!=="function"){toast("Dictée hors ligne non garantie ici : utilise le clavier. Aucun audio n'est envoyé à un serveur.");return;}
 try{
  const status=await SR.available({langs:["fr-FR"],processLocally:true});
  if(status!=="available"){toast(status==="downloadable"?"Pack français local non installé dans le navigateur.":"Dictée locale indisponible. Utilise le clavier.");return;}
  const recognition=new SR();recognition.lang="fr-FR";recognition.processLocally=true;recognition.continuous=false;recognition.interimResults=false;
  recognition.onresult=ev=>{$("question").value=ev.results[0][0].transcript;};
  recognition.onerror=()=>toast("Dictée locale interrompue.");recognition.start();
  toast("Écoute locale en cours…");
 }catch{toast("Dictée locale non prise en charge sur cet appareil.");}
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
 updateNet();addEventListener("online",updateNet);addEventListener("offline",updateNet);
 $all("nav [data-tab]").forEach(b=>b.addEventListener("click",()=>visibleTab(b.dataset.tab)));
 $all("[data-ask]").forEach(b=>b.addEventListener("click",()=>ask(b.dataset.ask)));
 $("entrySubmit").onclick=submitEntry;$("pin").addEventListener("keydown",ev=>{if(ev.key==="Enter")submitEntry();});
 $("entryDialog").addEventListener("cancel",e=>e.preventDefault());
 $("ephemeralBtn").onclick=()=>activate(fresh(),true);
 $("chatForm").onsubmit=e=>{e.preventDefault();const q=$("question").value;$("question").value="";ask(q);};
 $("micBtn").onclick=dictate;
 $("glucoseForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const unit=$("unit").value,r=parseGlucose($("glucose").value,unit);if(!r.ok){toast(r.error);return;}
 data.profile.unit=unit;data.readings.push({mg:r.mg,ts:Date.now(),source:"manuel"});data.readings=data.readings.slice(-2500);$("glucose").value="";save();renderJournal();let info=guidanceForMeasurement(r.mg);toast("Mesure enregistrée : "+formatGlucose(r.mg,unit));$("safetyNotice").textContent=info;$("safetyNotice").className="alert"+(stateOf(r.mg)==="verylow"||stateOf(r.mg)==="low"?" critical":"");};
 $("injectionForm").onsubmit=e=>{e.preventDefault();if(!requireUnlock())return;const txt=$("injection").value.trim().replace(",",".");const u=Number(txt);if(!/^\d+(?:\.\d+)?$/.test(txt)||!(u>0&&u<=100)){toast("Valeur invalide. Il s'agit uniquement d'une injection réellement effectuée.");return;}data.injections.push({u,ts:Date.now()});data.injections=data.injections.slice(-1000);$("injection").value="";save();renderJournal();toast("Injection déjà réalisée consignée.");};
 $("reportBtn").onclick=()=>{if(requireUnlock())reportDownload("diabcare-bilan.txt",exportReport(data));};
 $("backupBtn").onclick=async()=>{try{await saveQueue;reportDownload("diabcare-coffre-chiffre.json",exportEncrypted(),"application/json");toast("Sauvegarde chiffrée téléchargée.");}catch(e){toast(e.message);}};
 $("speakToggle").onchange=e=>{data.prefs.speak=e.target.checked;save();};
 $("lockBtn").onclick=lock;
 $("eraseBtn").onclick=()=>{if(!confirm("Supprimer définitivement les données locales de DiabCare ?"))return;if(!confirm("Dernière confirmation. Cette action est irréversible."))return;erase();location.reload();};
 $("emergencyRead").onclick=()=>{speech("Urgence : appelez le 15 ou le 112. Si la personne est inconsciente, ne rien donner par la bouche. Suivez les consignes des secours.");};
 $("modelBtn").onclick=loadAI;
 $("modelCheck").onclick=()=>toast("Les versions du moteur sont mises à jour avec la PWA. Les poids IA ne changent pas automatiquement sans validation d'intégrité.");
 $("appUpdate").onclick=async()=>{if(!("serviceWorker" in navigator)){toast("Mises à jour automatiques non disponibles.");return;}const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.update();toast("Vérification lancée. Recharge l'application si une version nouvelle est proposée.");}else toast("Installe la PWA depuis un site HTTPS.");};
 $("agents").replaceChildren();AGENTS.forEach(([id,label])=>{const d=document.createElement("div");d.className="agent";const b=document.createElement("b");b.textContent=label;const small=document.createElement("small");small.textContent=id==="securite"?"Contrôles avant l'IA":"Conseils spécialisés simulés";d.append(b,small);$("agents").append(d);});
 SOURCES.forEach(s=>{const p=document.createElement("p"),a=document.createElement("a");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=s.name;p.append(a);$("sources").append(p);});
 $("appVersion").textContent="DiabCare "+VERSION+" • PWA locale • aucun accès Nightscout";
 if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("./sw.js").catch(()=>toast("Mode hors ligne non installé."));
 let installEvt=null;addEventListener("beforeinstallprompt",ev=>{ev.preventDefault();installEvt=ev;$("installBtn").hidden=false;});
 $("installBtn").onclick=async()=>{if(installEvt){installEvt.prompt();await installEvt.userChoice;$("installBtn").hidden=true;}};
 document.addEventListener("visibilitychange",()=>{if(document.hidden){awayAt=Date.now();if("speechSynthesis" in window)speechSynthesis.cancel();}
 else if(awayAt&&!ephemeral&&unlocked&&Date.now()-awayAt>TIMEOUT)lock();});
 addEventListener("pagehide",()=>{if("speechSynthesis" in window)speechSynthesis.cancel();});
 if(exists())entry(true);else entry(false);
}
setup();
