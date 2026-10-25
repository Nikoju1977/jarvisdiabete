import test from "node:test";
import assert from "node:assert/strict";
import {canSend,createHandler} from "./diabcare-chat.mjs";
const env={MISTRAL_API_KEY:"test-secret",DIABCARE_GATE_CODE:"cle-de-test-au-moins-16"};
function mockReq(question,code=env.DIABCARE_GATE_CODE){
 return {method:"POST",headers:{host:"example.org",origin:"https://example.org","x-diabcare-code":code},body:{question}};
}
async function run(req,fetchFn=()=>{throw Error("appel interdit");},custom=env){
 const res={headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=JSON.parse(v)}};
 await createHandler({env:custom,fetchFn})(req,res);
 return res;
}
test("absence de configuration, secret erroné",async()=>{
 assert.equal((await run(mockReq("Explique le DT1"),undefined,{})).statusCode,503);
 assert.equal((await run(mockReq("Explique le DT1","mauvais"))).statusCode,401);
});
test("aucun appel pour dose, hyperglycémie personnalisée ou urgence",async()=>{
 for(const q of ["Combien d'unités d'insuline ?", "ma glycémie est de 110 mg/dL", "je suis inconscient", "analyse mon journal"]){
  const response=await run(mockReq(q));
  assert.equal(response.statusCode,422,q);
 }
 assert.equal(canSend("Explique la fonction du pancréas"),true);
});
test("appel autorisé : seul texte documentaire transmis, aucune donnée de santé",async()=>{
 let count=0; const fetchFn=async(url,init)=>{
  count++;assert.equal(url,"https://api.mistral.ai/v1/chat/completions");
  const req=JSON.parse(init.body);
  assert.equal(req.messages.length,2);
  return {ok:true,json:async()=>({choices:[{message:{content:count===1?"L'insuline aide les cellules à utiliser le glucose.":"APPROUVE"}}]})};
 };
 const result=await run(mockReq("Explique comment fonctionne le pancréas"),fetchFn);
 assert.equal(result.statusCode,200);assert.equal(count,2);
});
test("réponse contenant une dose bloquée",async()=>{
 const result=await run(mockReq("Explique le DT1"),async()=>({ok:true,json:async()=>({choices:[{message:{content:"Injecte 4 U d'insuline."}}]})}));
 assert.equal(result.statusCode,502);
});
test("origine tierce rejetée",async()=>{
 const req=mockReq("Explique le DT1");req.headers.origin="https://evil.invalid";
 assert.equal((await run(req)).statusCode,403);
});

test("GitHub Pages peut appeler la passerelle Vercel avec CORS strict",async()=>{
 const req=mockReq("Explique le pancréas");
 req.headers.origin="https://nikoju1977.github.io";req.headers.host="jarvisdiabete.vercel.app";
 req.body={action:"ping"};
 const result=await run(req);
 assert.equal(result.statusCode,200);
 assert.equal(result.headers["Access-Control-Allow-Origin"],"https://nikoju1977.github.io");
 assert.equal(result.body.ok,true);
 assert.equal(result.body.configured,true);
});
test("ping valide le code sans facturation Mistral ni question santé",async()=>{
 let called=0;
 const req=mockReq("ne doit pas être envoyé");req.body={action:"ping"};
 const result=await run(req,async()=>{called++;throw Error("unexpected");});
 assert.equal(result.statusCode,200);assert.equal(called,0);
 const denied=await run({...req,headers:{...req.headers,"x-diabcare-code":"incorrect"}});
 assert.equal(denied.statusCode,401);
});
test("preflight browser GitHub Pages ne consulte jamais Mistral",async()=>{
 const req={method:"OPTIONS",headers:{origin:"https://nikoju1977.github.io",host:"jarvisdiabete.vercel.app"}};
 const response={
  headers:{},setHeader(k,v){this.headers[k]=v},
  end(v){this.body=v}
 };
 await createHandler({env,fetchFn:async()=>{throw Error("unexpected");}})(req,response);
 assert.equal(response.statusCode,204);
 assert.equal(response.headers["Access-Control-Allow-Origin"],"https://nikoju1977.github.io");
 assert.match(response.headers["Access-Control-Allow-Headers"],/X-DiabCare-Code/);
});
test("domaine arbitraire ne peut pas appeler la passerelle",async()=>{
 const req=mockReq("Explique le DT1");req.headers.origin="https://evil.invalid";
 assert.equal((await run(req)).statusCode,403);
});
