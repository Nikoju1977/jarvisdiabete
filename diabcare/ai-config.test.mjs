import test from "node:test";
import assert from "node:assert/strict";
import {normalizeGatewayUrl,gatewayError,testGateway,renderAiStatus,SUGGESTED_GATEWAY} from "./ai-config.mjs";
test("passerelle validée et aucune clé exposée dans une URL",()=>{
 assert.equal(normalizeGatewayUrl("  "+SUGGESTED_GATEWAY+"  "),SUGGESTED_GATEWAY);
 for(const url of ["http://example.com/api/diabcare-chat","https://nikoju1977.github.io/api/diabcare-chat",
  "https://api.mistral.ai/api/diabcare-chat","https://user:secret@foo.vercel.app/api/diabcare-chat",
  "https://foo.vercel.app/api/diabcare-chat?key=SECRET","https://foo.vercel.app/not-our-api"]){
  assert.throws(()=>normalizeGatewayUrl(url),url);
 }
});
test("test Mistral sans journal ni clé API envoyés par le navigateur",async()=>{
 let called=0;
 const fake=async(url,opts)=>{
  called++;
  assert.equal(url,SUGGESTED_GATEWAY);
  assert.equal(opts.method,"POST");
  assert.equal(JSON.parse(opts.body).action,"ping");
  assert.deepEqual(Object.keys(JSON.parse(opts.body)),["action"]);
  assert.equal(opts.headers["X-DiabCare-Code"],"passphrase-de-passerelle-2026");
  assert.ok(!opts.headers.Authorization);
  return {ok:true,status:200,json:async()=>({ok:true,configured:true,model:"mistral-small-latest"})};
 };
 const r=await testGateway(SUGGESTED_GATEWAY,"passphrase-de-passerelle-2026",{fetchImpl:fake});
 assert.equal(r.model,"mistral-small-latest");assert.equal(called,1);
});
test("erreurs de serveur et code expliquées en français",async()=>{
 for(const status of [401,403,404,405,503]){
  await assert.rejects(testGateway(SUGGESTED_GATEWAY,"passphrase-de-passerelle-2026",{
   fetchImpl:async()=>({ok:false,status,json:async()=>null})
  }),{message:gatewayError(status)});
 }
 assert.match(renderAiStatus().cloud,/non connecté/);
 assert.match(renderAiStatus({connected:true,qwenReady:true}).llm,/chargé/);
});
