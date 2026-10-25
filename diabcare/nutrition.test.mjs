import test from "node:test";
import assert from "node:assert/strict";
import {parseFoodQuery,findOffline,carbsFor,fromOffProduct,prepareRecord,searchOpenFoodFacts,barcodeOpenFoodFacts} from "./nutrition.mjs";
test("parole : portion explicitement capturée",()=>{
 assert.deepEqual(parseFoodQuery("Jarvis combien de glucides dans 150 g de riz blanc cuit"),{term:"riz blanc cuit",grams:150});
 assert.deepEqual(parseFoodQuery("200 grammes de pomme"),{term:"pomme",grams:200});
 assert.equal(parseFoodQuery("combien de glucides dans du riz").grams,null);
});
test("calcul exact depuis 100 g et plage valide",()=>{
 assert.equal(carbsFor(28,150),42);
 assert.throws(()=>carbsFor(120,150));
 assert.throws(()=>carbsFor(20,0));
 assert.equal(prepareRecord(findOffline("pomme")[0],150,100).carbs,18);
});
test("Open Food Facts : valeur absente ou suspecte rejetée",()=>{
 assert.equal(fromOffProduct({product_name:"Y",nutriments:{}}),null);
 assert.equal(fromOffProduct({product_name:"Y",nutriments:{carbohydrates_100g:300}}),null);
 assert.equal(fromOffProduct({product_name:"Produit",code:"1234567890123",nutriments:{carbohydrates_100g:50}}).per100,50);
});
test("requêtes publiques ne contiennent aucune mesure personnelle",async()=>{
 let seen="";
 const fake=async url=>{seen=url;return {ok:true,json:async()=>({products:[{product_name:"Riz",nutriments:{carbohydrates_100g:28}}]})};};
 const list=await searchOpenFoodFacts("riz",{fetchImpl:fake});
 assert.equal(list.length,1);assert.match(seen,/search_terms=riz/);assert.ok(!seen.includes("glucose"));
});
test("recherche code barres validée",async()=>{
 const f=await barcodeOpenFoodFacts("12345678",{fetchImpl:async()=>({ok:true,json:async()=>({status:1,product:{product_name:"Test",nutriments:{carbohydrates_100g:22}}})})});
 assert.equal(f.per100,22);
 await assert.rejects(barcodeOpenFoodFacts("1/abc"));
});
