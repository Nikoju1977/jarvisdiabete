import test from "node:test";
import assert from "node:assert/strict";
import {parseFoodQuery,findOffline,carbsFor,fromOffProduct,prepareRecord,searchOpenFoodFacts,barcodeOpenFoodFacts,speakFood} from "./nutrition.mjs";
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

test("dictée française de poids, sans portion inventée",()=>{
 assert.deepEqual(parseFoodQuery("JARVIS cent cinquante grammes de pâtes cuites"),{term:"pâtes cuites",grams:150});
 assert.deepEqual(parseFoodQuery("JARVIS deux cents grammes de riz blanc cuit"),{term:"riz blanc cuit",grams:200});
 assert.deepEqual(parseFoodQuery("combien de glucides dans 1,5 kg de pommes"),{term:"pommes",grams:1500});
 assert.equal(parseFoodQuery("un bol de riz").grams,null);
 assert.equal(parseFoodQuery("200 grammes de riz").grams,200);
});
test("fiches collaboratives : marques, étiquettes et source distinguées",()=>{
 const off=fromOffProduct({product_name:"Céréales",brands:"Marque X,Autre",quantity:"450 g",serving_size:"30 g",code:"12345678",nutriments:{carbohydrates_100g:70}});
 assert.equal(off.brand,"Marque X");
 assert.equal(off.quantity,"450 g");
 assert.equal(off.servingSize,"30 g");
 assert.equal(prepareRecord(off,30).carbs,21);
 const speech=speakFood(prepareRecord(off,30));
 assert.match(speech,/21 grammes de glucides/);
 assert.match(speech,/Open Food Facts/);
 assert.match(speech,/Aucune dose d.insuline/);
});
