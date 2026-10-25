/* End-to-end vocal lifecycle, using a fake recorder/Whisper model.
 * No real microphone, personal medical data, cloud audio, or model downloads.
 * A simulated browser is not a physical Samsung test.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
const base=process.env.PLAYWRIGHT_BASE_URL||"http://127.0.0.1:8765/diabcare/";
const mock=String.raw`export const isRecordingSupported=()=>true;
export async function loadWhisper(progress=()=>{}){progress("Whisper simulé : prêt.");return {ready:true};}
export async function recordClip({onStatus=()=>{}}={}){
 let resolve,reject,done=false;
 const completed=new Promise((a,b)=>{resolve=a;reject=b;});
 onStatus("Micro simulé, parle puis termine.");
 return {
  completed,
  stop(){
   if(!done){done=true;resolve(new Blob(["sample synthetic audio ".repeat(100)]));}
   return completed;
  },
  cancel(){
   if(!done){done=true;reject(Error("annulé"));}
  }
 };
}
export async function transcribeWhisper(blob,progress=()=>{}){
 progress("Whisper simule la transcription…");
 await new Promise(r=>setTimeout(r,350));
 return globalThis.__voiceTestPhrase||"Explique le diabète de type 1";
}
`;
let passed=0;
async function scenario(name,viewport){
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/diabcare/speech-offline.mjs",route=>route.fulfill({
  status:200,contentType:"text/javascript",body:mock
 }));
 await page.route("https://world.openfoodfacts.org/**",route=>route.fulfill({
  status:503,headers:{"access-control-allow-origin":"*"},body:"unavailable"
 }));
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:20000});
 await page.locator("#ephemeralBtn").click();
 await page.locator('nav [data-tab="settings"]').click();
 await page.locator("#voiceInstallBtn").click();
 await page.waitForFunction(()=>document.querySelector("#voiceInstallStatus")?.textContent?.includes("Whisper chargé"));
 assert.match(await page.locator("#aiHealthSummary").innerText(),/Whisper : chargé/);
 console.log("PASS",name,"model ready");passed++;
 await page.locator('nav [data-tab="chat"]').click();
 await page.locator("#talkBtn").click();
 await page.locator("#voiceActivity").waitFor({state:"visible"});
 assert.equal(await page.locator("#voiceActivity").getAttribute("data-stage"),"listening");
 assert.equal(await page.locator("#voiceRecording").count(),0);
 assert.equal(await page.locator("#voiceChatSlot #voiceActivity").count(),1);
 assert.equal(await page.locator("#talkBtn").isDisabled(),true);
 assert.equal(await page.locator("#voiceRecordStop").isVisible(),true);
 console.log("PASS",name,"inline recording, no blocking dialog");passed++;
 await page.locator("#voiceRecordStop").click();
 await page.waitForFunction(()=>document.querySelector("#voiceActivity")?.dataset?.stage==="transcribing",null,{timeout:4000});
 assert.equal(await page.locator("#voiceRecordStop").isVisible(),false);
 assert.match(await page.locator("#voiceActivityTitle").innerText(),/transcrit/);
 await page.locator("#voiceActivity").waitFor({state:"hidden",timeout:7000});
 await page.waitForFunction(()=>document.querySelector("#chat")?.textContent?.includes("Explique le diabète de type 1"),null,{timeout:7000});
 assert.equal(await page.locator("#talkBtn").isEnabled(),true);
 console.log("PASS",name,"stop -> transcribe -> response");passed++;
 // Cancellation must not append stale transcripts.
 const before=await page.locator(".chat .msg").count();
 await page.locator("#talkBtn").click();
 await page.locator("#voiceActivity").waitFor({state:"visible"});
 await page.locator("#voiceRecordCancel").click();
 await page.locator("#voiceActivity").waitFor({state:"hidden"});
 assert.equal(await page.locator(".chat .msg").count(),before);
 console.log("PASS",name,"cancel");passed++;
 // Nutrition button directs the same voice capture into the nutrition calculator.
 await page.evaluate(()=>{globalThis.__voiceTestPhrase="150 grammes de riz blanc cuit";});
 await page.locator('nav [data-tab="nutrition"]').click();
 await page.locator("#foodMicBtn").click();
 await page.locator("#voiceActivity").waitFor({state:"visible"});
 assert.equal(await page.locator("#voiceFoodSlot #voiceActivity").count(),1);
 await page.locator("#voiceRecordStop").click();
 await page.locator("#voiceActivity").waitFor({state:"hidden",timeout:7000});
 await page.locator(".food-estimate").first().waitFor({state:"visible",timeout:7000});
 assert.match(await page.locator(".food-estimate").first().innerText(),/42/);
 console.log("PASS",name,"nutrition microphone -> food lookup");passed++;
 assert.deepEqual(errors,[],name+" browser errors: "+errors.join("; "));
 await context.close();
}
try{
 await scenario("Android-size 412x915",{width:412,height:915});
 await scenario("iPhone-size 390x844",{width:390,height:844});
 console.log("PASS voice-browser-smoke",passed,"end-to-end steps");
}finally{await browser.close();}
