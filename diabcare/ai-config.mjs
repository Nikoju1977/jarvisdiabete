/* Connection wizard for user's own HTTPS Mistral gateway.
   Mistral API key never enters this browser; gateway code is session-only. */
export const SUGGESTED_GATEWAY="https://jarvisdiabete.vercel.app/api/diabcare-chat";
export const GATEWAY_STORAGE_KEY="diabcare.ai.gatewayUrl.v1";
export function normalizeGatewayUrl(input,base="https://nikoju1977.github.io"){
 const value=String(input||"").trim();
 if(!value||value.length>400)throw Error("Saisis l'adresse HTTPS de la passerelle Mistral.");
 let u;try{u=new URL(value,base);}catch{throw Error("Adresse de passerelle incorrecte.");}
 if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.hash||u.search||u.port)
  throw Error("Utilise une URL HTTPS sans identifiant, mot de passe ni paramètre.");
 if(u.hostname.endsWith(".github.io")||u.hostname==="github.io"||u.hostname==="api.mistral.ai")
  throw Error("GitHub Pages ne peut pas héberger cette API. Utilise une passerelle privée Vercel ou équivalente.");
 if(!u.pathname.endsWith("/api/diabcare-chat"))
  throw Error("L'adresse doit se terminer par /api/diabcare-chat.");
 return u.origin+u.pathname;
}
export function gatewayError(status){
 switch(status){
  case 400:return "Le serveur n'a pas compris la demande de vérification.";
  case 401:return "Code d'accès incorrect. Vérifie DIABCARE_GATE_CODE configuré sur le serveur.";
  case 403:return "Ce serveur refuse l'origine GitHub Pages. Mets à jour la passerelle avec les règles CORS prévues.";
  case 404:return "La route /api/diabcare-chat n'existe pas sur ce serveur. Vérifie le déploiement.";
  case 405:return "Le serveur utilise une ancienne version sans vérification de connexion.";
  case 422:return "Question refusée par les règles de sécurité. Essaie une question générale.";
  case 429:return "Limite de requêtes atteinte. Réessaie ultérieurement.";
  case 500:case 502:case 503:case 504:return "La passerelle ou sa clé Mistral n'est pas opérationnelle. Contrôle les variables d'environnement Vercel.";
  default:return "La passerelle a renvoyé une erreur HTTP "+status+".";
 }
}
export async function testGateway(endpoint,code,{fetchImpl=fetch,signal}={}){
 const url=normalizeGatewayUrl(endpoint);
 if(!code||String(code).trim().length<16)throw Error("Saisis le code privé configuré dans DIABCARE_GATE_CODE (16 caractères minimum).");
 let response;
 try{
  response=await fetchImpl(url,{method:"POST",mode:"cors",cache:"no-store",signal,
   headers:{"Content-Type":"application/json","X-DiabCare-Code":String(code).trim()},
   body:JSON.stringify({action:"ping"})});
 }catch(e){
  if(e?.name==="AbortError")throw Error("La vérification a dépassé le délai. Vérifie la connexion ou l'adresse du serveur.");
  throw Error("Impossible de contacter le serveur (connexion ou CORS). Aucun accès Mistral n'est activé.");
 }
 if(!response.ok)throw Error(gatewayError(response.status));
 const body=await response.json().catch(()=>null);
 if(body?.ok!==true||body?.configured!==true)throw Error("Réponse de connexion invalide. Le serveur n'est pas compatible.");
 return {endpoint:url,model:String(body.model||"Mistral").slice(0,100)};
}
export function renderAiStatus({connected=false,qwenReady=false,whisperReady=false}={}){
 return {
  cloud:connected?"Mistral : passerelle vérifiée (Internet obligatoire)":"Mistral : non connecté",
  llm:qwenReady?"Qwen : chargé sur cet appareil":"Qwen : non chargé",
  voice:whisperReady?"Whisper : chargé pour cette session":"Whisper : non chargé"
 };
}
