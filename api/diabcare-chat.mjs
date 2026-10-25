/* Passerelle Mistral côté serveur Vercel : aucune clé côté navigateur.
  Désactivée tant que MISTRAL_API_KEY et DIABCARE_GATE_CODE ne sont pas configurés.
  Un déploiement public doit ajouter quotas / WAF avant ouverture à plusieurs comptes. */
import {timingSafeEqual} from "node:crypto";
import {answer,doseQuestion,urgentQuestion,safeGenerated} from "../diabcare/core.mjs";
import {expertInstructions,auditPrompt,passedAudit} from "../diabcare/specialists.mjs";
const MAX_REQUEST=4000;
const system=[
 "Tu es DiabCare, assistant francophone de pédagogie sur le diabète de type 1, au ton chaleureux et naturel d'un copilote vocal futuriste.",
 "Tu n'es ni un diabétologue ni un dispositif médical. Ne revendique aucun diagnostic, prédiction, ni capacité de mesurer la glycémie.",
 "Ne recommande jamais de dose d'insuline, bolus, correction, modification de traitement, ni procédure pour commander une pompe.",
 "Explique uniquement les principes généraux, en indiquant les incertitudes. Oriente vers le soignant pour toute décision personnelle.",
 "Si des symptômes dangereux sont décrits, réponds uniquement : Appelez immédiatement le 15 ou le 112.",
 "Ne mentionne pas de glycémies, posologies ou données de santé personnelles que tu n'as pas.",
 "Réponds en français, en 3 à 5 phrases courtes, sans Markdown complexe."
].join(" ");
function constantEqual(a,b){
 if(!a||!b||a.length>200||b.length>200)return false;
 const aa=Buffer.from(a),bb=Buffer.from(b);
 if(aa.byteLength!==bb.byteLength)return false;
 return timingSafeEqual(aa,bb);
}
export function canSend(q){
 if(typeof q!=="string"||!q.trim()||q.length>1000)return false;
 if(doseQuestion(q)||urgentQuestion(q))return false;
 const s=q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\bdt1\b/g,"diabete");
 // Ne jamais envoyer au modèle les mesures, bilans personnels, médicaments/doses, ni l'analyse d'une situation médicale.
 if(/(?:\d|mg\/?dl|mmol|g\/l|bolus|dose|inject|corrig|traitement|medicament|ordonnance|cetone|vomiss|acidocetose|malaise|suis en hypo|glycemie actuelle|mes donnees|mon journal|mon bilan|mes mesures|cette nuit|aujourd hui|maintenant|urgence)/.test(s))return false;
 return true;
}
function allowedOrigin(req,env){
 const origin=req.headers?.origin;
 if(!origin)return {allowed:true,origin:null};
 let parsed;
 try{parsed=new URL(origin);}catch{return {allowed:false,origin:null};}
 if(parsed.protocol!=="https:"&&parsed.hostname!=="localhost")return {allowed:false,origin:null};
 if(parsed.pathname!=="/"||parsed.search||parsed.hash)return {allowed:false,origin:null};
 const host=req.headers?.host;
 const same=parsed.host===host;
 const allow=new Set(["https://nikoju1977.github.io"]);
 if(env.DIABCARE_ALLOWED_ORIGINS){
  for(const value of env.DIABCARE_ALLOWED_ORIGINS.split(",").map(x=>x.trim()).filter(Boolean))
   allow.add(value);
 }
 return {allowed:same||allow.has(origin),origin};
}
function corsHeaders(res,origin){
 res.setHeader?.("Vary","Origin");
 if(!origin)return;
 res.setHeader?.("Access-Control-Allow-Origin",origin);
 res.setHeader?.("Access-Control-Allow-Methods","POST, GET, OPTIONS");
 res.setHeader?.("Access-Control-Allow-Headers","Content-Type, X-DiabCare-Code");
 res.setHeader?.("Access-Control-Max-Age","600");
}
function send(res,status,data){
 res.statusCode=status;
 res.setHeader?.("Content-Type","application/json; charset=utf-8");
 res.setHeader?.("Cache-Control","no-store");
 res.setHeader?.("X-Content-Type-Options","nosniff");
 res.end(JSON.stringify(data));
}
export function createHandler({fetchFn=fetch,env=process.env}={}){
 return async function handler(req,res){
  const originCheck=allowedOrigin(req,env);
  if(!originCheck.allowed)return send(res,403,{error:"Origine non autorisée."});
  corsHeaders(res,originCheck.origin);
  if(req.method==="OPTIONS"){
   res.statusCode=204;res.setHeader?.("Cache-Control","no-store");return res.end("");
  }
  if(req.method==="GET"){
   return send(res,200,{service:"diabcare-mistral",configured:Boolean(env.MISTRAL_API_KEY&&env.DIABCARE_GATE_CODE?.length>=16)});
  }
  if(req.method!=="POST"){res.setHeader?.("Allow","GET, POST, OPTIONS");return send(res,405,{error:"Méthode interdite."});}
  if(!env.MISTRAL_API_KEY||!env.DIABCARE_GATE_CODE||env.DIABCARE_GATE_CODE.length<16)return send(res,503,{error:"Mode Mistral non configuré sur ce serveur."});
  const provided=String(req.headers?.["x-diabcare-code"]||"");
  if(!constantEqual(provided,env.DIABCARE_GATE_CODE))return send(res,401,{error:"Accès Mistral refusé."});
  let payload=req.body;
  if(typeof payload==="string"&&payload.length<=MAX_REQUEST){try{payload=JSON.parse(payload);}catch{return send(res,400,{error:"JSON invalide."});}}
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||JSON.stringify(payload).length>MAX_REQUEST)return send(res,413,{error:"Requête trop volumineuse."});
  if(payload.action==="ping")return send(res,200,{ok:true,configured:true,model:env.MISTRAL_MODEL||"mistral-small-latest"});
  const q=payload.question;
  if(!canSend(q))return send(res,422,{error:"Cette question doit être traitée localement par les règles de sécurité."});
  const fallback=answer(q).text;
  const expertise=expertInstructions(q);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  const generate=async(messages,max_tokens)=>{
   const response=await fetchFn("https://api.mistral.ai/v1/chat/completions",{
    method:"POST",headers:{"Authorization":"Bearer "+env.MISTRAL_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({model:env.MISTRAL_MODEL||"mistral-small-latest",temperature:0.1,max_tokens,messages}),
    signal:controller.signal
   });
   if(!response.ok)throw Error("Service indisponible.");
   const json=await response.json();
   const text=json?.choices?.[0]?.message?.content;
   if(typeof text!=="string")throw Error("Réponse invalide.");
   return text.trim();
  };
  try{
   const content=await generate([
    {role:"system",content:system+"\n"+expertise.system},
    {role:"user",content:"Question pédagogique : "+q+"\nInformation locale prudente : "+fallback}
   ],380);
   if(!safeGenerated(content)||content.length>2500)return send(res,502,{error:"Réponse non conforme aux règles de sécurité."});
   const verdict=await generate([
    {role:"system",content:"Contrôle indépendant de sécurité. Réponds APPROUVE ou REJETE."},
    {role:"user",content:auditPrompt(q,content)}
   ],12);
   if(!passedAudit(verdict))return send(res,502,{error:"Réponse retenue par le contrôle des spécialistes."});
   return send(res,200,{text:content,source:"Mistral · pédagogique",experts:expertise.roles,
    references:expertise.references,note:"Références à consulter ; elles ne certifient pas individuellement les affirmations générées."});
  }catch{return send(res,504,{error:"Mistral indisponible ou délai dépassé."});}
  finally{clearTimeout(timer);}
 };
}
export default createHandler();
