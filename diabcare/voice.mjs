/* GlucoCheck : lecture d'une mesure DÉJÀ enregistrée, jamais de mesure sans dispositif. */
import {parseGlucose,formatGlucose,guidanceForMeasurement} from "./core.mjs";
export function isGlucoCheck(q){
 const s=String(q||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
 return /\b(?:gluco\s*check|gluco-?check|gluki\s*check|glucki\s*check|glyco\s*check|glucose\s*check)\b/.test(s);
}
export function parseGlucoCheck(q,defaultUnit="g"){
 if(!isGlucoCheck(q))return null;
 let s=String(q||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/,/g,".").replace(/\bvirgule\b/g,".").replace(/\bpoint\b/g,".");
 s=s.replace(/\b(gluco\s*check|gluco-?check|gluki\s*check|glucki\s*check|glyco\s*check|glucose\s*check)\b/gi," ");
 // Ne pas déduire une dose d'insuline à partir d'une commande GlycoCheck.
 const unit=/\bmg\s*(?:\/|par)\s*d[lL]\b/i.test(s)?"mg":/\bmmol\s*(?:\/|par)\s*[lL]\b/i.test(s)?"mmol":/\bg\s*(?:\/|par)\s*[lL]\b/i.test(s)?"g":defaultUnit;
 const match=s.match(/(?:^|[^\w])(\d{1,3}(?:\.\d{1,3})?)(?=\s|$|[^\w])/);
 if(!match)return {type:"last"};
 const raw=match[1];
 // Glycémie sans unité explicitement saisie : on reprend l'unité de l'interface, mais on demande confirmation.
 const measure=parseGlucose(raw,unit);
 if(!measure.ok)return {type:"error",message:measure.error};
 return {type:"candidate",mg:measure.mg,unit,raw,source:"saisie vocale non vérifiée"};
}
export function describeLast(readings,unit="g",now=Date.now()){
 const arr=(readings||[]).filter(r=>Number.isFinite(r.mg)&&Number.isFinite(r.ts)&&r.ts<=now).sort((a,b)=>a.ts-b.ts);
 if(!arr.length)return "GlucoCheck : aucune mesure enregistrée. Je ne peux pas mesurer la glycémie avec le micro. Utilise ton lecteur ou ton capteur, puis dicte le résultat pour le consigner.";
 const r=arr.at(-1),minutes=Math.max(0,Math.round((now-r.ts)/60000));
 const age=minutes<1?"à l'instant":minutes<60?"il y a "+minutes+" minutes":"il y a "+Math.round(minutes/60)+" heures";
 return "GlucoCheck : dernière mesure saisie "+age+" : "+formatGlucose(r.mg,unit)+". Ce n'est pas une mesure en temps réel. "+guidanceForMeasurement(r.mg);
}
export function spokenNumber(raw){
 return /^\d+(?:[.,]\d+)?$/.test(String(raw).trim())?Number(String(raw).replace(",",".")):null;
}
