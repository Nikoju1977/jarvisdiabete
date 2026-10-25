/* Provenance contrôlée de bibliothèques et fichiers de modèles.
 * Une provenance publiée ne remplace PAS une vérification SHA-256 du téléchargement. */
export const LLM_SOURCES=Object.freeze([
 {id:"wllama",role:"Moteur d'inférence dans le navigateur",source:"https://github.com/ngxson/wllama",version:"3.6.1",license:"MIT",archived:false,load:"esm",status:"intégré"},
 {id:"qwen3-06b",role:"LLM quantifié à charger sur l'appareil",source:"https://huggingface.co/QuantFactory/Qwen3-0.6B-GGUF",file:"Qwen3-0.6B.Q4_K_M.gguf",license:"Apache-2.0",sha256:"7af3fdf842f87b24672f8a7f1dd50404043f0bfb71093ff91c31d2b49df4631d",downloadSizeMB:484,status:"facultatif"},
 {id:"transformersjs",role:"Option pour moteurs ONNX et fonctions audio locales",source:"https://github.com/huggingface/transformers.js",license:"Apache-2.0",archived:false,status:"documenté, non chargé automatiquement"}
]);
export function usableSource(item){
 return Boolean(item && item.archived!==true&&/^https:\/\//.test(item.source)&&item.license&&item.status);
}
export function modelInfo(){return LLM_SOURCES.find(x=>x.id==="qwen3-06b");}
export async function hashBlob(blob){
 const bytes=await blob.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function verifyDownloadedFile(blob,expected=modelInfo().sha256){
 if(!(blob instanceof Blob)||!Number.isFinite(blob.size)||blob.size<1000000||!/^[a-f0-9]{64}$/.test(expected))return false;
 return (await hashBlob(blob))===expected;
}
