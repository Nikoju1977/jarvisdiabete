import test from "node:test";
import assert from "node:assert/strict";
import {parseGlucose,stateOf,answer,doseQuestion,urgentQuestion,summary,safeGenerated,formatGlucose,safeEducationalQuestion} from "./core.mjs";
test("unités de glycémie",()=>{
 assert.equal(parseGlucose("1,20","g").mg,120);
 assert.equal(parseGlucose("120","mg").mg,120);
 assert.ok(Math.abs(parseGlucose("6.7","mmol").mg-120.72)<.5);
 assert.equal(parseGlucose("0","g").ok,false);
 assert.equal(parseGlucose("123xyz","mg").ok,false);
});
test("seuils cliniques et unités",()=>{
 assert.equal(stateOf(53),"verylow");assert.equal(stateOf(69),"low");
 assert.equal(stateOf(70),"usual");assert.equal(stateOf(180),"usual");
 assert.equal(stateOf(251),"veryhigh");
 assert.match(formatGlucose(120,"g"),/1,20/);
});
test("le triage prime sur l'IA et sur les demandes de dose",()=>{
 assert.equal(urgentQuestion("La personne est inconsciente").level,"critical");
 assert.equal(answer("je suis inconscient, combien injecter ?").agents[0],"securite");
 assert.ok(doseQuestion("Combien d'unités d'insuline pour 50 g ?"));
 assert.equal(answer("Quel bolus dois-je faire ?").level,"blocked");
 assert.equal(answer("bolus pour 60 g de glucides").level,"blocked");
});
test("sortie IA suspecte refusée",()=>{
 assert.equal(safeGenerated("Injecte 4 U d'insuline."),false);
 assert.equal(safeGenerated("Augmente ta dose d'insuline"),false);
 assert.equal(safeGenerated("Une alimentation équilibrée aide le suivi."),true);
});
test("journal non confondu avec TIR continu",()=>{
 const now=Date.now();
 const s=summary([{mg:80,ts:now-10000},{mg:250,ts:now-5000}],14,now);
 assert.equal(s.n,2);
 assert.equal(answer("Fais le bilan", {readings:[{mg:80,ts:now}],profile:{unit:"g"}},now).text.includes("ne permettent pas de calculer le temps dans la cible"),true);
});

test("triage d'urgence : inconscience, impossibilité d'avaler et vomissements",()=>{
 for(const phrase of ["Il ne se réveille pas", "La personne ne réagit plus", "Je ne peux pas avaler", "douleur dans la poitrine"]){
  assert.equal(urgentQuestion(phrase)?.level,"critical",phrase);
  assert.equal(answer(phrase).agents[0],"securite");
 }
 assert.equal(urgentQuestion("Je vomis")?.level,"urgent");
 assert.equal(urgentQuestion("Je vomit depuis une heure")?.level,"urgent");
});
test("aucune modification de paramètres d'insuline ou de pompe suggérée",()=>{
 for(const phrase of ["Quel débit basal pour ma pompe ?", "Ajuste mon ratio insuline glucides", "Quel facteur de correction utiliser ?", "Puis-je arrêter l'insuline ?"]){
  assert.equal(doseQuestion(phrase),true,phrase);
  assert.equal(answer(phrase).level,"blocked",phrase);
 }
 assert.equal(safeGenerated("Arrête ta pompe à insuline maintenant."),false);
 assert.equal(safeGenerated("Modifie le débit basal."),false);
});
test("questions éducatives anonymes acceptées, situations personnelles jamais transmises",()=>{
 for(const phrase of ["Explique le diabète de type 1", "Pourquoi le DT1 est-il auto-immun ?", "Comment fonctionne le pancréas ?"]){
  assert.equal(safeEducationalQuestion(phrase),true,phrase);
 }
 for(const phrase of ["Je suis diabétique", "J'ai un diabète de type 1", "Mon diabète va mal", "Mes valeurs hier", "Ma situation en randonnée", "Explique 6,7 mmol/L", "Combien de bolus ?"]){
  assert.equal(safeEducationalQuestion(phrase),false,phrase);
 }
});
