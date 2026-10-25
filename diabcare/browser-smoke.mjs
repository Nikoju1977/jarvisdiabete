/* Tests e2e Chromium — interactions réelles avec boutons, sans micro ni API externe.
 * Exécution : PLAYWRIGHT_BASE_URL=http://127.0.0.1:8765/diabcare/ node diabcare/browser-smoke.mjs
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const url=process.env.PLAYWRIGHT_BASE_URL||"http://127.0.0.1:8765/diabcare/";
const browser=await chromium.launch({channel:"chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote"]});
let checks=0;
console.log("Browser process launched for",url);
async function check(label,fn){try{await fn();checks++;console.log("PASS",label);}catch(e){console.error("FAIL",label,String(e.stack||e));throw e;}}
async function scenario(label,viewport){
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
 const page=await context.newPage();const failures=[];
 page.on("pageerror",e=>failures.push(String(e.message||e)));

 let offlineCatalogMock=false;
 await page.route("https://world.openfoodfacts.org/**",route=>{
  const reqUrl=new URL(route.request().url());
  const cat=reqUrl.searchParams.get("categories_tags_en");
  const categories={rice:"riz",pasta:"pâtes",bread:"pain",yogurts:"yaourt","breakfast-cereals":"céréales",milk:"lait"};
  const term=reqUrl.searchParams.get("search_terms")||categories[cat]||"";
  if(offlineCatalogMock&&(term||reqUrl.pathname.includes("/product/"))){
   const names={"riz basmati":"Riz basmati bio","riz":"Riz basmati bio","pâtes":"Pâtes complètes","pain":"Pain aux céréales","yaourt":"Yaourt nature","céréales":"Céréales muesli","lait":"Lait UHT"};
   const name=names[term]||"Riz basmati bio";
   const index=Object.keys(names).indexOf(term);
   const code=term==="riz basmati"?"3274080005003":String(3000000000000+Math.max(1,index)*32112);
   route.fulfill({status:200,contentType:"application/json",
    headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({products:[{code,product_name_fr:name,brands:"Marque test",nutriments:{carbohydrates_100g:76}}]})});
  }else{
   route.fulfill({status:503,headers:{"access-control-allow-origin":"*"},body:"Unavailable"});
  }
 });

 await check(label+" : ouverture et coffre",async()=>{
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
  await page.locator("#entryDialog").waitFor({state:"visible"});
  await page.locator("#ephemeralBtn").click();
  await page.locator("#entryDialog").waitFor({state:"hidden"});
  assert.match(await page.locator("#vaultStatus").innerText(),/Sans stockage/i);
 });
 await check(label+" : nav + question clavier",async()=>{
  await page.locator('nav [data-tab="chat"]').click();
  await page.locator("#question").fill("Explique le diabète de type 1");
  await page.locator('#chatForm button[type="submit"]').click();
  await page.locator(".chat .msg").last().waitFor({state:"visible"});
  assert.match(await page.locator("#chat").innerText(),/cellules|auto-immune|diabète de type 1/i);
  await page.locator("#goJournal").click();
  assert.ok(await page.locator("#screen-journal").evaluate(e=>e.classList.contains("active")));
 });
 await check(label+" : journal + dernière mesure",async()=>{
  await page.locator("#glucose").fill("1,20");
  await page.locator("#unit").selectOption("g");
  await page.locator('#glucoseForm button[type="submit"]').click();
  assert.match(await page.locator("#journalSummary").innerText(),/1,20/);
  const downloadEvent=page.waitForEvent("download",{timeout:8000});
  await page.locator("#reportBtn").click();
  const report=await downloadEvent;
  assert.match(report.suggestedFilename(),/diabcare-bilan/);
  await page.locator('nav [data-tab="chat"]').click();
  assert.match(await page.locator("#glanceValue").innerText(),/1,20/);
 });
 await check(label+" : glucides + portion + lecture + confirmation",async()=>{
  await page.locator("#goNutrition").click();
  await page.locator("#foodQuery").fill("150 g de riz blanc cuit");
  await page.locator('#foodForm button[type="submit"]').click();
  await page.locator(".food-estimate").first().waitFor({state:"visible"});
  assert.match(await page.locator(".food-estimate").first().innerText(),/42/);
  assert.ok(await page.locator(".read-carb-btn").first().isVisible());
  await page.getByRole("button",{name:"Choisir et confirmer la portion"}).first().click();
  await page.locator("#confirmFood").waitFor({state:"visible"});
  assert.match(await page.locator("#foodPreview").innerText(),/42/);
  await page.locator("#foodReadPreview").click();
  await page.locator("#foodCancel").click();
  assert.match(await page.locator("#mealHistory").innerText(),/Aucun repas/);
  await page.getByRole("button",{name:"Choisir et confirmer la portion"}).first().click();
  await page.locator("#foodApprove").click();
  assert.match(await page.locator("#mealHistory").innerText(),/42/);
 });
 await check(label+" : téléchargement volontaire de vrais produits simulés et réutilisation hors connexion",async()=>{
  offlineCatalogMock=true;
  await page.locator("#foodQuery").fill("150 g de riz basmati");
  await page.locator('#foodForm button[type="submit"]').click();
  await page.locator(".choice-item .product-source").first().waitFor({state:"visible"});
  await page.waitForFunction(()=>document.querySelector("#foodResults")?.textContent?.includes("Riz basmati bio"),null,{timeout:9000});
  assert.match(await page.locator("#foodResults").innerText(),/Riz basmati bio|Marque test/);
  await page.waitForFunction(()=>document.querySelector("#foodLibraryStatus")?.textContent?.includes("1 produit"),null,{timeout:9000});
  // Pas de cache médical : seule la fiche OFF est enregistrée dans IndexedDB.
  const health=await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open("diabcare-offline-foodfacts");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
   });
   const tx=db.transaction("products","readonly");
   const values=await new Promise((resolve,reject)=>{
    const req=tx.objectStore("products").getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   db.close();return values;
  });
  assert.ok(health.every(x=>!Object.keys(x).some(k=>/glucose|insulin|patient|profile|meal|chat/i.test(k))));
  await context.setOffline(true);
  await page.locator("#foodQuery").fill("150 g de 3274080005003");
  await page.locator('#foodForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#foodResults")?.textContent?.includes("Riz basmati bio"),null,{timeout:9000});
  assert.match(await page.locator("#foodStatus").innerText(),/Open Food Facts mémorisée|fiche\(s\) Open Food Facts/);
  assert.match(await page.locator("#foodResults").innerText(),/114/);
  await context.setOffline(false);
  offlineCatalogMock=false;
 });
 await check(label+" : préparer un lot Open Food Facts à emporter (6 requêtes simulées)",async()=>{
  offlineCatalogMock=true;
  await page.locator("#foodPackBtn").click();
  await page.waitForFunction(()=>document.querySelector("#foodPackStatus")?.textContent?.includes("Préparation terminée"),null,{timeout:55000});
  assert.match(await page.locator("#foodLibraryStatus").innerText(),/produit/);
  assert.ok(await page.locator("#foodPackBtn").isEnabled());
  offlineCatalogMock=false;
 });
 await check(label+" : boutons de la bibliothèque hors connexion",async()=>{
  await page.locator("#foodLibraryRefresh").click();
  await page.locator("#foodSavedList .food-saved-item").first().waitFor({state:"visible"});
  assert.match(await page.locator("#foodLibraryStatus").innerText(),/produit/);
  assert.ok(await page.locator("#foodPackBtn").isVisible());
  assert.ok(await page.locator("#foodLibraryClear").isVisible());
 });
 await check(label+" : bouton micro glucides et clavier restent dans glucides",async()=>{
  await page.locator("#foodMicBtn").click();
  await page.locator("#voiceChoice").waitFor({state:"visible"});
  assert.equal(await page.locator("#voiceConsentCheck").isChecked(),false);
  if(await page.locator("#voiceBrowserBtn").isVisible()){
   await page.locator("#voiceBrowserBtn").click();
   assert.match(await page.locator("#voiceChoiceDetails").innerText(),/Coche d\'abord|Choisis/i);
  }
  await page.locator("#voiceKeyboardBtn").click();
  await page.locator("#voiceChoice").waitFor({state:"hidden"});
  assert.ok(await page.locator("#screen-nutrition").evaluate(e=>e.classList.contains("active")));
  assert.equal(await page.locator("#foodQuery").evaluate(e=>document.activeElement===e),true);
 });
 await check(label+" : experts ouvrent des questions",async()=>{
  await page.locator('nav [data-tab="experts"]').click();
  await page.getByRole("button",{name:/Consulter : Diabétologie/}).click();
  assert.ok(await page.locator("#screen-chat").evaluate(e=>e.classList.contains("active")));
  assert.match(await page.locator("#chat").innerText(),/diabète de type 1/i);
  await page.locator('nav [data-tab="experts"]').click();
  await page.getByRole("button",{name:/Consulter : Diététique/}).click();
  assert.ok(await page.locator("#screen-nutrition").evaluate(e=>e.classList.contains("active")));
 });
 await check(label+" : réglages, diagnostics et coffre sécurisé",async()=>{
  await page.locator('nav [data-tab="settings"]').click();
  await page.locator("#diagnosticBtn").click();
  assert.match(await page.locator("#diagnosticResults").innerText(),/Navigation/);
  assert.ok(await page.locator("#backupBtn").isDisabled());
  assert.ok(await page.locator("#eraseBtn").isDisabled());
  await page.locator("#modelCheck").click();
  assert.match(await page.locator("#modelStatus").innerText(),/modèle/i);
  await page.locator("#appUpdate").click();
  assert.match(await page.locator("#updateStatus").innerText(),/Vérification|mode hors connexion|mise à jour|n'autorise/i);
  await page.locator("#lockBtn").click();
  await page.locator("#entryDialog").waitFor({state:"visible"});
 });
 // Le test de rechargement en mode avion doit être réalisé sur appareils physiques.
 assert.deepEqual(failures,[],"Console errors in "+label+": "+failures.join("; "));
 await context.close();
}
try{
 await scenario("Android mobile 412×915",{width:412,height:915});
 await scenario("iPhone-size Chromium 390×844",{width:390,height:844});
 console.log("TOTAL",checks,"scenarios passed");
}finally{await browser.close();}
