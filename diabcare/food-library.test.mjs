import test from "node:test";
import assert from "node:assert/strict";
import {normalizeProduct,rankCached,OFFLINE_PACK_QUERIES,libraryStatus} from "./food-library.mjs";
test("Les fiches OFF avec code et glucides cohérents peuvent être mises hors ligne",()=>{
 const f=normalizeProduct({code:"1234567890123",name:"Riz basmati",brand:"Marque A",per100:76,kind:"off"},500);
 assert.deepEqual({code:f.code,brand:f.brand,per100:f.per100,cachedAt:f.cachedAt},{code:"1234567890123",brand:"Marque A",per100:76,cachedAt:500});
 assert.equal(normalizeProduct({code:"invalid",name:"Produit",per100:25,kind:"off"}),null);
 assert.equal(normalizeProduct({code:"12345678",name:"Produit",per100:150,kind:"off"}),null);
 assert.equal(normalizeProduct({code:"12345678",name:"Produit",per100:10,kind:"local"}),null);
});
test("Recherche hors ligne fiable avec nom, marque, accents et code-barres",()=>{
 const foods=[
  normalizeProduct({code:"12345678",name:"Riz basmati",brand:"Marque A",per100:77,kind:"off"},200),
  normalizeProduct({code:"87654321",name:"Pâtes blé complet",brand:"Marque B",per100:68,kind:"off"},100)
 ];
 assert.equal(rankCached(foods,"riz basmati")[0].code,"12345678");
 assert.equal(rankCached(foods,"pates ble complet")[0].code,"87654321");
 assert.equal(rankCached(foods,"87654321")[0].per100,68);
 assert.equal(rankCached(foods,"fromage").length,0);
 assert.equal(rankCached(foods,"").length,0);
});
test("La bibliothèque distingue les données enregistrées des valeurs indicatives",()=>{
 assert.equal(OFFLINE_PACK_QUERIES.length,6);
 assert.match(libraryStatus({count:0}),/Aucun produit Open Food Facts/);
 assert.match(libraryStatus({count:2,lastSaved:Date.UTC(2026,9,25)}),/2 produits Open Food Facts/);
});
