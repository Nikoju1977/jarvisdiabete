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
 assert.match(sw,/diabcare-pwa-shell-4\.3\.0/);
 assert.match(sw,/"\.\/ui\.css"/);
 assert.match(sw,/"\.\/speech-offline\.mjs"/);
 assert.match(rootSW,/jarvis-diabete-/);
});
