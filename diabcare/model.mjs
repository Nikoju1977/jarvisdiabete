/* Moteur génératif 100 % navigateur, chargé sur consentement explicite.
  Cache du modèle géré par wllama ; aucune donnée utilisateur transmise au LLM.
  Le premier chargement exige Internet. Safari/WebAssembly et stockage demeurent dépendants du navigateur. */
const LIB="https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/index.js";
const WASM="https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/wasm/wllama.wasm";
export const MODEL={version:"Qwen3-0.6B-Q4_K_M",repo:"QuantFactory/Qwen3-0.6B-GGUF",file:"Qwen3-0.6B.Q4_K_M.gguf"};
const SYS=[
 "Tu es un assistant documentaire francophone sur le diabète de type 1, pas un médecin ni un dispositif médical.",
 "Tu dois reformuler sans ajouter de conseil clinique nouveau le texte vérifié fourni comme source.",
 "N'invente ni mesures, ni études, ni traitement, ni prédiction, ni dose ou unité d'insuline.",
 "Ne propose aucune modification de traitement, et ne prétends pas être connecté à un capteur.",
 "Si la question est médicale, exprime l'incertitude ; renvoie aux soignants pour les décisions personnelles.",
 "Réponds en deux à quatre phrases simples, pas de chiffres supplémentaires."
].join(" ");
export async function createLocalModel(progress=()=>{}){
 progress("Chargement du moteur WASM. Premier accès au réseau requis…");
 const lib=await import(LIB);
 if(!lib?.Wllama)throw Error("Bibliothèque locale introuvable.");
 const llama=new lib.Wllama({default:WASM},{allowOffline:true});
 progress("Chargement des poids Qwen3 : environ 484 Mo à mettre en cache…");
 await llama.loadModelFromHF({repo:MODEL.repo,file:MODEL.file},{
  n_ctx:1536,n_threads:1,progressCallback:({loaded,total})=>{
   if(total>0)progress("Téléchargement du modèle : "+Math.round(loaded*100/total)+" %");
  }
 });
 progress("Modèle chargé en mémoire. Génération locale uniquement.");
 return {
  async reply(question,verified){
   const result=await llama.createChatCompletion({
    messages:[{role:"system",content:SYS},{role:"user",content:"Question : "+String(question).slice(0,600)+"\nTexte vérifié à reformuler uniquement : "+String(verified).slice(0,1600)}],
    max_tokens:160,temperature:0.15,top_p:0.8
   });
   const text=result?.choices?.[0]?.message?.content;
   if(typeof text!=="string"||!text.trim())throw Error("Le modèle n'a pas répondu.");
   return text.replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  },
  async unload(){try{await llama.exit();}catch{}}
 };
}
