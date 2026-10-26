/* Safari WebKit smoke test (Android Chromium is covered by the existing browser-smoke suite).
   WebKit on Linux is not a physical iPhone: hardware audio/offline models require device tests.
   Run: node diabcare/mobile-engines-smoke.mjs (Playwright Chromium + WebKit installed)
 */
import assert from "node:assert/strict";
import {webkit} from "playwright";
const URL=process.env.PLAYWRIGHT_BASE_URL||"http://127.0.0.1:8765/diabcare/";
let passed=0;
async function scenario(name,engine,viewport){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const page=await context.newPage();
 const failures=[];
 page.on("pageerror",error=>failures.push(String(error.message||error)));
 // External catalogue need not be reachable for offline mode.
 await page.route("https://world.openfoodfacts.org/**",route=>route.fulfill({
  status:503,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:"{}"
 }));
 const check=async(label,callback)=>{
  try{await callback();passed++;console.log("PASS",name,label);}
  catch(e){console.error("FAIL",name,label,String(e.stack||e));throw e;}
 };
 try{
  await check("initialisation de la PWA",async()=>{
   await page.goto(URL,{waitUntil:"domcontentloaded",timeout:25000});
   await page.locator("#entryDialog").waitFor({state:"visible",timeout:15000});
   await page.locator("#ephemeralBtn").click();
   await page.locator("#entryDialog").waitFor({state:"hidden",timeout:5000});
   assert.match(await page.locator("#vaultStatus").innerText(),/Sans stockage/i);
  });
  await check("navigation tactile des cinq onglets",async()=>{
   for(const tab of ["journal","nutrition","experts","settings","chat"]){
    await page.locator('nav [data-tab="'+tab+'"]').click();
    assert.equal(await page.locator("#screen-"+tab).evaluate(e=>e.classList.contains("active")),true);
   }
  });
  await check("clavier JARVIS / réponse locale",async()=>{
   await page.locator("#question").fill("Explique le diabète de type 1");
   await page.locator('#chatForm button[type="submit"]').click();
   await page.waitForFunction(()=>document.querySelectorAll("#chat .msg").length>=2,null,{timeout:9000});
   assert.match(await page.locator("#chat").innerText(),/auto-immune|cellules|diabète/i);
  });
  await check("GlucoCheck et journal sans capteur fictif",async()=>{
   await page.locator('nav [data-tab="journal"]').click();
   await page.locator("#glucose").fill("1,20");
   await page.locator("#unit").selectOption("g");
   await page.locator('#glucoseForm button[type="submit"]').click();
   assert.match(await page.locator("#journalSummary").innerText(),/1,20/);
  });
  await check("glucides sans réseau ni produit inventé",async()=>{
   await page.locator('nav [data-tab="nutrition"]').click();
   await page.locator("#foodQuery").fill("150 g de riz blanc cuit");
   await page.locator('#foodForm button[type="submit"]').click();
   await page.locator(".food-estimate").first().waitFor({state:"visible",timeout:10000});
   assert.match(await page.locator(".food-estimate").first().innerText(),/42/);
   await page.getByRole("button",{name:"Choisir et confirmer la portion"}).first().click();
   await page.locator("#confirmFood").waitFor({state:"visible"});
   await page.locator("#foodCancel").click();
   await page.locator("#confirmFood").waitFor({state:"hidden"});
   assert.match(await page.locator("#mealHistory").innerText(),/Aucun repas/);
  });
  await check("micro : choix de dictée accessible sans autorisation",async()=>{
   await page.locator('nav [data-tab="chat"]').click();
   await page.locator("#jarvisOrb").click();
   await page.locator("#voiceChoice").waitFor({state:"visible",timeout:10000});
   assert.equal(await page.locator("#voiceConsentCheck").isChecked(),false);
   assert.ok(await page.locator("#voiceKeyboardBtn").isVisible());
   await page.locator("#voiceKeyboardBtn").click();
   await page.locator("#voiceChoice").waitFor({state:"hidden"});
   assert.equal(await page.locator("#question").evaluate(e=>document.activeElement===e),true);
   assert.equal(await page.locator("#voiceActivity").isVisible(),false);
  });
  await check("diagnostic de stockage local sans données envoyées",async()=>{
   await page.locator('nav [data-tab="settings"]').click();
   await page.locator("#storageCheckBtn").click();
   await page.waitForFunction(()=>document.querySelector("#storageHealth")?.textContent?.includes("sauvegarde chiffrée"),null,{timeout:6000});
   assert.match(await page.locator("#storageHealth").innerText(),/Stockage|stockage/);
   assert.ok(await page.locator("#storageProtectBtn").isEnabled());
  });
  await check("états Qwen/Whisper/Mistral explicites",async()=>{
   await page.locator('nav [data-tab="settings"]').click();
   assert.match(await page.locator("#aiHealthSummary").innerText(),/Mistral : non connecté/);
   await page.locator("#diagnosticBtn").click();
   assert.match(await page.locator("#diagnosticResults").innerText(),/Navigation/);
   await page.locator("#mistralTestBtn").click();
   assert.match(await page.locator("#mistralState").innerText(),/Coche d'abord/);
  });
  assert.deepEqual(failures,[],"Uncaught JavaScript errors in "+name+": "+failures.join(" / "));
 }finally{await context.close();await browser.close();}
}
await scenario("iOS Safari WebKit",webkit,{width:390,height:844});
console.log("Safari WebKit smoke tests successful:",passed);
