import test from "node:test";
import assert from "node:assert/strict";
import {routeExperts,expertInstructions,passedAudit,EXPERTS} from "./specialists.mjs";
test("le routeur choisit des rôles spécialisés distincts",()=>{
 assert.ok(EXPERTS.length>=7);
 assert.ok(routeExperts("Comment conserver un stylo au frigo ?").some(e=>e.id==="pharmacist"));
 assert.ok(routeExperts("Je prépare une randonnée avec un repas").some(e=>e.id==="activity"));
 assert.ok(routeExperts("Les capteurs CGM et leur précision").some(e=>e.id==="technology"));
 assert.equal(routeExperts("bonjour").length,1);
});
test("prompts spécialisés n'ont pas de prétexte médical",()=>{
 const x=expertInstructions("explique la nutrition");
 assert.ok(x.system.includes("PAS un ensemble de vrais professionnels"));
 assert.ok(x.references.every(s=>s.url.startsWith("https://")));
});
test("audit explicite et refus par défaut",()=>{
 assert.equal(passedAudit("APPROUVE"),true);
 assert.equal(passedAudit("APPROUVE mais sous réserve"),false);
 assert.equal(passedAudit("REJETE"),false);
 assert.equal(passedAudit(""),false);
});
