/* Passerelle Mistral côté serveur Vercel : aucune clé côté navigateur.
  Désactivée tant que MISTRAL_API_KEY et DIABCARE_GATE_CODE ne sont pas configurés.
  Un déploiement public doit ajouter quotas / WAF avant ouverture à plusieurs comptes. */
import {timingSafeEqual} from "node:crypto";
import {answer,doseQuestion,urgentQuestion,safeGenerated} from "../diabcare/core.mjs";
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
 const s=q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 // Ne jamais envoyer au modèle les mesures, bilans personnels, médicaments/doses, ni l'analyse d'une situation médicale.
 if(/(?:\d|mg\/?dl|mmol|g\/l|bolus|dose|inject|corrig|traitement|medicament|ordonnance|cetone|vomiss|acidocetose|malaise|suis en hypo|glycemie actuelle|mes donnees|mon journal|mon bilan|mes mesures|cette nuit|aujourd hui|maintenant|urgence)/.test(s))return false;
 return true;
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
  if(req.method!=="POST"){res.setHeader?.("Allow","POST");return send(res,405,{error:"Méthode interdite."});}
  const origin=req.headers?.origin;
  if(origin){try{if(new URL(origin).host!==req.headers?.host)return send(res,403,{error:"Origine non autorisée."});}catch{return send(res,403,{error:"Origine invalide."});}}
  if(!env.MISTRAL_API_KEY||!env.DIABCARE_GATE_CODE||env.DIABCARE_GATE_CODE.length<16)return send(res,503,{error:"Mode Mistral non configuré sur ce serveur."});
  const provided=String(req.headers?.["x-diabcare-code"]||"");
  if(!constantEqual(provided,env.DIABCARE_GATE_CODE))return send(res,401,{error:"Accès Mistral refusé."});
  let payload=req.body;
  if(typeof payload==="string"&&payload.length<=MAX_REQUEST){try{payload=JSON.parse(payload);}catch{return send(res,400,{error:"JSON invalide."});}}
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||JSON.stringify(payload).length>MAX_REQUEST)return send(res,413,{error:"Requête trop volumineuse."});
  const q=payload.question;
  if(!canSend(q))return send(res,422,{error:"Cette question doit être traitée localement par les règles de sécurité."});
  const fallback=answer(q).text;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const upstream=await fetchFn("https://api.mistral.ai/v1/chat/completions",{
    method:"POST",headers:{"Authorization":"Bearer "+env.MISTRAL_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({model:"mistral-small-latest",temperature:0.15,max_tokens:240,
      messages:[{role:"system",content:system},{role:"user",content:"Question documentaire : "+q+"\nBase de prudence : "+fallback}]}),
    signal:controller.signal
   });
   if(!upstream.ok)return send(res,502,{error:"Service Mistral momentanément indisponible."});
   const json=await upstream.json();
   const content=json?.choices?.[0]?.message?.content;
   if(typeof content!=="string"||!safeGenerated(content)||content.length>2500)return send(res,502,{error:"Réponse IA non validée par les garde-fous."});
   return send(res,200,{text:content.trim(),source:"Mistral en ligne · information générale, non médicale"});
  }catch{return send(res,504,{error:"Mistral indisponible ou délai dépassé."});}
  finally{clearTimeout(timer);}
 };
}
export default createHandler();
