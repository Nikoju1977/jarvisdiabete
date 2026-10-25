/* DiabCare 4.0 — moteur hors ligne. Aucune posologie ni prédiction. */
export const VERSION = "4.3.2";
export const AGENTS = [
  ["securite","Sécurité et urgences"],["diabeto","Diabétologie"],["infirmier","Éducation thérapeutique"],
  ["nutrition","Diététique"],["pharmacie","Pharmacie"],["sport","Activité physique"],
  ["psy","Psychologie"],["analyse","Analyse du journal"]
];
const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export const LIMITS = Object.freeze({hypo:70,veryLow:54,high:180,veryHigh:250});
export const NO_DOSE = "Je peux expliquer les mécanismes de l'insuline et enregistrer une injection déjà réalisée, mais je ne calcule ni ne recommande une dose et je ne modifie jamais un traitement. Utilise ton protocole personnalisé validé par l'équipe de diabétologie.";
export const SOURCES = Object.freeze([
 {name:"ADA — Standards of Care 2026, section 6",url:"https://doi.org/10.2337/dc26-s006"},
 {name:"Assurance Maladie",url:"https://www.ameli.fr/assure/sante/themes/diabete"},
 {name:"Fédération Française des Diabétiques",url:"https://www.federationdesdiabetiques.org/"}
]);
export function doseQuestion(q) {
 const s=normalize(q);
 if(/\bbolus\b|\bdose d.insuline\b/.test(s))return true;
 return /(?:combien|calcul|quelle|quel|recommand|ajust|inject|prescri|augment|diminu|corrig|dois.je|bolus).{0,65}(?:insuline|unit|bolus|dose)|(?:insuline|bolus|dose).{0,65}(?:combien|inject|calcul|modifier|augment|diminuer|faire|prendre)/.test(s);
}
export function urgentQuestion(q) {
 const s=normalize(q);
 if(/inconscien|coma|convuls|ne repond plus|perte de connaissance|ne respire|difficulte.*respir|douleur thoracique/.test(s)) return {level:"critical",text:"Urgence potentielle. Appelle le 15 ou le 112 immédiatement. Si la personne ne peut pas avaler ou est inconsciente, ne donne rien par la bouche. Si du glucagon est disponible et si tu sais l'administrer, suis sa notice et les instructions des secours."};
 if(/acidocetose|vomiss|je vomis|haleine fruitee|cetones? elevee/.test(s)) return {level:"urgent",text:"Un risque d'acidocétose doit être évalué sans délai. Mesure les cétones si tu le peux sans retarder les soins. En cas de vomissements, respiration anormale, confusion ou dégradation : appelle le 15 ou le 112. Ne suspends pas ton insuline basale sans indication médicale."};
 if(/je suis en hypo|je fais une hypo|hypoglycemie maintenant|sueurs froides|je tremble|malaise/.test(s)) return {level:"urgent",text:"Arrête ton activité et mets-toi en sécurité. Contrôle ta glycémie si possible. Si tu es conscient et peux avaler, suis ton protocole de resucrage (souvent 15 g de glucides rapides et un contrôle 15 min après chez l'adulte). Si tu ne peux pas avaler ou si ton état s'aggrave : fais appeler les secours."};
 return null;
}
export function parseGlucose(raw,unit) {
 const t=String(raw).trim().replace(",",".");
 if(!/^\d+(?:\.\d+)?$/.test(t)) return {ok:false,error:"Saisis un nombre valide."};
 const x=Number(t);
 const mg=unit==="g"?x*100:unit==="mmol"?x*18.0182:x;
 if(!Number.isFinite(mg)||mg<20||mg>600) return {ok:false,error:"Mesure hors plage vérifiable (20–600 mg/dL). Vérifie l'unité et la valeur."};
 return {ok:true,mg:Math.round(mg*10)/10};
}
export function formatGlucose(mg,unit="g") {
 if(!Number.isFinite(mg)) return "—";
 const n=unit==="g"?mg/100:unit==="mmol"?mg/18.0182:mg;
 const max=unit==="mg"?0:unit==="mmol"?1:2;
 return n.toLocaleString("fr-FR",{maximumFractionDigits:max,minimumFractionDigits:unit==="g"?2:0})+" "+({g:"g/L",mg:"mg/dL",mmol:"mmol/L"}[unit]||"mg/dL");
}
export function stateOf(mg) {return mg<54?"verylow":mg<70?"low":mg>250?"veryhigh":mg>180?"high":"usual";}
export function summary(readings,days=14,now=Date.now()) {
 const arr=(readings||[]).filter(r=>Number.isFinite(r.mg)&&Number.isFinite(r.ts)&&r.ts>=now-days*864e5&&r.ts<=now).sort((a,b)=>a.ts-b.ts);
 if(!arr.length)return null;
 const avg=arr.reduce((s,r)=>s+r.mg,0)/arr.length;
 return {n:arr.length,mean:Math.round(avg),low:arr.filter(r=>r.mg<70).length,high:arr.filter(r=>r.mg>180).length,inRange:arr.filter(r=>r.mg>=70&&r.mg<=180).length,last:arr.at(-1)};
}
export function guidanceForMeasurement(mg) {
 if(mg<54)return "Valeur très basse. Agis immédiatement selon ton protocole d'hypoglycémie. Si la personne ne peut pas avaler ou perd connaissance : 15/112, rien par la bouche.";
 if(mg<70)return "Valeur basse. Applique ton protocole d'hypoglycémie et recontrôle selon ses consignes. Ne prends pas cette information pour une prescription.";
 if(mg>250)return "Valeur très élevée. Vérifie ton protocole pour les cétones et contacte ton équipe en cas de symptômes ou de persistance. Vomissements ou respiration anormale : secours.";
 if(mg>180)return "Valeur au-dessus de l'intervalle de référence habituel de nombreux adultes. Une mesure seule ne permet pas de conclure.";
 return "Valeur dans l'intervalle 70–180 mg/dL usuellement employé chez de nombreux adultes. La cible personnelle dépend de l'équipe soignante.";
}
function agents(q){
 const s=normalize(q),res=[];
 if(/glyc|diab|pancreas|insuline|hypo|hyper|cetone/.test(s))res.push("diabeto");
 if(/mang|aliment|repas|glucide|nutrition/.test(s))res.push("nutrition");
 if(/randon|sport|march|course|velo|nature|activite/.test(s))res.push("sport");
 if(/stress|peur|fatigu|moral|sommeil|angoiss/.test(s))res.push("psy");
 if(/insuline|stylo|pharm|conserv|frigo|glucagon/.test(s))res.push("pharmacie");
 if(/journal|bilan|mesure|nuit|moyenne|tendance|historique/.test(s))res.push("analyse");
 return res.length?[...new Set(res)].slice(0,3):["infirmier","diabeto"];
}
const ARTICLES = [
 [/randon|nature|sport|march|velo|activite/,"Pour une sortie, prévois de quoi mesurer ta glycémie, du sucre rapide, de l'eau, ton traitement et les consignes personnalisées de ton équipe. Informe un proche de l'itinéraire. L'effort peut accroître le risque d'hypoglycémie, y compris après l'activité."],
 [/glucide|repas|manger|aliment|nutrition/,"Pour connaître les glucides, regarde l'étiquette pour 100 g puis multiplie par le poids de la portion divisé par 100. Les estimations de repas ne remplacent ni une mesure ni un calcul de traitement prescrit."],
 [/conserv|frigo|chaleur|gel|stylo/,"Les conditions de conservation diffèrent selon les spécialités d'insuline et leur ouverture. Vérifie la notice du produit exact et demande conseil au pharmacien après exposition au gel ou à la chaleur."],
 [/stress|peur|fatigu|moral|angoiss|sommeil/,"La charge mentale du DT1 peut être importante. Parler avec un psychologue connaissant les maladies chroniques ou l'équipe de diabétologie peut aider. Nous pouvons préparer des questions pour ton rendez-vous."],
 [/hypoglycemie|hypo/,"Une hypoglycémie est généralement définie par une glycémie inférieure à 70 mg/dL, avec un seuil de niveau 2 inférieur à 54 mg/dL. Suis ton protocole de resucrage ; si tu es inconscient ou incapable d'avaler, appelle les secours."],
 [/hyperglycemie|hyper/,"Une glycémie élevée peut avoir plusieurs causes. La recherche de cétones est importante dans certaines situations en DT1. L'acidocétose est une urgence potentielle. Aucune dose ne peut être déterminée à partir d'une phrase isolée."],
 [/insuline|diabete|pancreas|type 1|dt1/,"Le diabète de type 1 est une maladie auto-immune qui détruit les cellules bêta productrices d'insuline. Le traitement par insuline est vital et doit suivre un protocole personnalisé par l'équipe soignante."]
];
export function answer(q,data={},now=Date.now()) {
 const question=String(q||"").trim().slice(0,1200),a=agents(question);
 if(!question)return {text:"Pose une question sur le diabète de type 1.",agents:["infirmier"],level:"info"};
 const urgent=urgentQuestion(question); if(urgent)return {...urgent,agents:["securite"],source:"règle locale"};
 if(doseQuestion(question))return {text:NO_DOSE,agents:["securite"],level:"blocked",source:"règle locale"};
 const s=normalize(question);
 if(/bilan|analyse.*(mesure|jour)|mesure.*bilan|statistique|historique|ma glycemie|derniere glycemie|moyenne/.test(s)){
  const x=summary(data.readings||[],14,now);
  if(!x)return {text:"Aucune mesure disponible dans ton journal. Je ne peux pas connaître ta glycémie actuelle sans mesure.",agents:["analyse"],level:"info"};
  const age=Math.round((now-x.last.ts)/60000);
  return {text:"Sur 14 jours : "+x.n+" mesures consignées, moyenne "+formatGlucose(x.mean,data.profile?.unit||"g")+", "+x.low+" sous 70 mg/dL et "+x.high+" au-dessus de 180 mg/dL. Dernière mesure il y a "+age+" min. Les mesures ponctuelles ne permettent pas de calculer le temps dans la cible d'un capteur continu ni de prédire une hypoglycémie.",agents:["analyse"],level:"info"};
 }
 const entry=ARTICLES.find(v=>v[0].test(s));
 return {text:entry?entry[1]:"Je peux expliquer le DT1, le suivi glycémique, l'alimentation, l'activité physique, la sécurité, l'insuline et le vécu quotidien. Reformule ta question ou consulte les sources médicales en Réglages.",agents:a,level:"info"};
}
export function safeGenerated(text){
 const s=String(text||"").trim();
 if(!s||s.length>4000)return false;
 if(/(?:\d+(?:[.,]\d+)?\s*(?:unités?|UI|U)\s*(?:d.insuline)?)/i.test(s))return false;
 if(/(?:inject|augmente|diminue|arrete|suspend|modifie)\w*[^.!?\n]{0,65}(?:dose|insuline|bolus|basale)/i.test(s))return false;
 return true;
}
export function exportReport(data,now=Date.now()){
 const x=summary(data.readings||[],14,now),unit=data.profile?.unit||"g";
 const rows=(data.readings||[]).slice(-100).map(r=>new Date(r.ts).toLocaleString("fr-FR")+" : "+formatGlucose(r.mg,unit)).join("\n");
 return "DIABCARE — BILAN DESCRIPTIF\n"+new Date(now).toLocaleString("fr-FR")+"\nNon diagnostique. Données déclarées.\n\n"+(x?x.n+" mesures / 14 jours ; moyenne "+formatGlucose(x.mean,unit)+".":"Aucune mesure récente.")+"\n\n"+rows+"\n\nLes mesures manuelles ne constituent pas un TIR CGM. Aucun calcul de dose.";
}
