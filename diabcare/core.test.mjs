import test from "node:test";
import assert from "node:assert/strict";
import {parseGlucose,stateOf,answer,doseQuestion,urgentQuestion,summary,safeGenerated,formatGlucose} from "./core.mjs";
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
 assert.equal(answer("Fais le bilan", {readings:[{mg:80,ts:now}],profile:{unit:"g"}},now).text.includes("ne constituent pas un TIR CGM"),true);
});
