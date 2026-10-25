import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=rel=>readFileSync(new URL(rel,import.meta.url),"utf8");
const page=read("./index.html"),js=read("./app.mjs"),css=read("./ui.css"),sw=read("./sw.js");
const root=read("../index.html"),rootSW=read("../sw.js"),speechCSS=read("./voice-ui.css");
test("la racine ouvre DiabCare sans exposer l'ancien assistant",()=>{
 assert.match(root,/location\.replace\(new URL\("\.\/diabcare\/"/);
 assert.doesNotMatch(root,/Nightscout/i);
 assert.doesNotMatch(root,/computeBolus|iobTotal|calculateBolus/i);
});
test("les gestes essentiels sont visibles et reliés aux contrôleurs",()=>{
 for(const id of ["jarvisOrb","talkBtn","stopVoice","glanceValue","glanceDate","goJournal","goNutrition","goEmergency","chat","question","foodForm","confirmGlucose","confirmFood","aiSelect","netStatus"]){
  assert.ok(page.includes('id="'+id+'"'),"HTML manquant : "+id);
  assert.ok(js.includes('"'+id+'"'),"contrôleur manquant : "+id);
 }
 assert.match(page,/ui\.css/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(speechCSS,/position:relative!important/);
 assert.match(page,/voice-ui\.css/);
});
test("aucune dépendance d'un service de suivi exclu dans les fichiers chargés",()=>{
 for(const [name,content] of [["racine",root],["PWA",page],["contrôleur",js],["CSS",css],["cache PWA",sw],["cache racine",rootSW]]){
  assert.doesNotMatch(content,/nightscout/i,"service interdit dans "+name);
 }
});
test("cache versionné pour ne pas afficher le vieux cockpit",()=>{
 assert.match(sw,/diabcare-pwa-shell-4\.4\.0/);
 assert.match(sw,/"\.\/ui\.css"/);
 assert.match(sw,/"\.\/speech-offline\.mjs"/);
 assert.match(rootSW,/jarvis-diabete-/);
});

test("les boutons vocaux possèdent de vrais gestionnaires",()=>{
 for(const id of ["micBtn","jarvisOrb","talkBtn","stopVoice","voiceBrowserBtn","voiceOfflineBtn","voiceKeyboardBtn","voiceCloseBtn","voiceRecordStop","voiceRecordCancel","voiceInstallBtn"]){
  assert.ok(page.includes('id="'+id+'"'),"bouton absent : "+id);
  assert.ok(js.includes('"'+id+'").onclick='),"action absente : "+id);
 }
 assert.match(js,/voiceConsentCheck/);
 assert.match(page,/id="voiceConsentCheck"/);
 assert.match(js,/voiceChooser\(/);
 assert.match(js,/clip\.stop\(\)/);
 assert.match(js,/speech\(.*\{force:true\}\)/);
});
test("les modules audio sont mis en cache dans la PWA et restent optionnels",()=>{
 for(const local of ["./speech-policy.mjs","./speech-offline.mjs","./voice-ui.css"]){
  assert.ok(sw.includes('"'+local+'"'),"asset hors connexion oublié : "+local);
 }
 assert.match(speechCSS,/#chatForm\.composer\{[\s\S]*position:relative!important/);
 assert.match(speechCSS,/#toast\{[\s\S]*max-width:/);
});


test("le calculateur de glucides expose une commande micro reliée à la transcription",()=>{
 assert.match(page,/id="foodMicBtn"/);
 assert.match(page,/id="foodVoiceStatus"/);
 assert.match(page,/id="foodReadPreview"/);
 assert.match(js,/\$\("foodMicBtn"\)\.onclick=\(\)=>dictate\("nutrition"\)/);
 assert.match(js,/if\(intent==="nutrition"\)/);
 assert.match(js,/foodLookup\(text\)/);
 assert.match(js,/if\(urgentQuestion\(text\)\|\|doseQuestion\(text\)\)/);
 assert.match(js,/speech\(speakFood\(rec\),\{force:true\}\)/);
 assert.match(js,/\$\("foodReadPreview"\)\.onclick=/);
 assert.match(page,/Confirmer et enregistrer/);
 assert.doesNotMatch(js,/data\.meals\.push\(rec\)[^}]*foodReadPreview/);
});

test("toutes les cartes spécialistes sont de vrais boutons avec un gestionnaire",()=>{
 assert.match(js,/button\.className="agent agent-action"/);
 assert.match(js,/button\.onclick=\(\)=>/);
 assert.match(js,/visibleTab\("nutrition"\)/);
});
test("les actions disponibles signalent leurs limites et laissent les données chiffrées intactes",()=>{
 for(const id of ["reloadAppBtn","diagnosticBtn","updateStatus","voiceConsentCheck"]){
  assert.ok(page.includes('id="'+id+'"'),"contrôle manquant : "+id);
  assert.ok(js.includes('"'+id+'"'),"gestionnaire manquant : "+id);
 }
 assert.match(js,/if\(!unlocked\|\|ephemeral\)/);
 assert.match(js,/navigator\.serviceWorker\.getRegistration/);
 assert.match(js,/reg\.update\(\)/);
});
test("une requête Open Food Facts trop lente est interrompue",()=>{
 assert.match(js,/AbortController/);
 assert.match(js,/controller\.abort\(\),5500/);
 assert.match(js,/Recherche Open Food Facts indisponible ou trop lente/);
});
