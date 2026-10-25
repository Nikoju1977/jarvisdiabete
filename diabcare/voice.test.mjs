import test from "node:test";
import assert from "node:assert/strict";
import {isGlucoCheck,parseGlucoCheck,describeLast} from "./voice.mjs";
test("commandes GlucoCheck sans mesure",()=>{
 assert.equal(isGlucoCheck("Jarvis gluckicheck"),true);
 assert.equal(isGlucoCheck("Gluco check"),true);
 assert.equal(isGlucoCheck("Combien d'insuline ?"),false);
 assert.equal(parseGlucoCheck("GlucoCheck").type,"last");
 assert.match(describeLast([]),/ne peux pas mesurer/);
});
test("reconnaissance des valeurs vocales et unités explicites",()=>{
 assert.equal(parseGlucoCheck("GlucoCheck 1 virgule 20").mg,120);
 assert.equal(parseGlucoCheck("GlucoCheck 120 mg/dL").mg,120);
 assert.equal(parseGlucoCheck("GlucoCheck 6.7 mmol/L").mg,120.7);
 assert.equal(parseGlucoCheck("GlucoCheck 1200 mg/dL").type,"error");
});
test("dernière valeur avec âge et source",()=>{
 const now=Date.now();
 const s=describeLast([{mg:121,ts:now-40*60000}],"g",now);
 assert.match(s,/40 minutes/); assert.match(s,/1,21/); assert.match(s,/pas une mesure en temps réel/);
});
