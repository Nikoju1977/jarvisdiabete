/* Catalogue d'expertises documentaires, jamais de professionnels réels. */
export const EXPERTS=Object.freeze([
 {id:"endocrinology",name:"Diabétologie",keywords:/diabet|dt1|auto.immun|pancrea|glyc|insuline|hormone|endocrin|cetone/i,
  focus:"Physiologie du diabète de type 1, notions générales, limites de l'éducation thérapeutique.",
  references:[{title:"ADA — Standards of Care",url:"https://professional.diabetes.org/standards-of-care"}]},
 {id:"nutrition",name:"Diététique",keywords:/aliment|mang|repas|nutrition|glucide|carbohydrat|sucre|glycemiq|fibre/i,
  focus:"Connaissances générales sur les aliments, glucides, étiquettes et incertitudes nutritionnelles.",
  references:[{title:"Open Food Facts",url:"https://world.openfoodfacts.org/"}]},
 {id:"pharmacist",name:"Pharmacie",keywords:/pharmac|conserv|stock|temperature|frigo|chaleur|injection|stylo|glucagon/i,
  focus:"Conservation générale des traitements et bonnes pratiques, en rappelant que la notice du produit exact prévaut.",
  references:[{title:"Base publique des médicaments",url:"https://base-donnees-publique.medicaments.gouv.fr/"}]},
 {id:"activity",name:"Activité physique",keywords:/sport|randon|marche|activite|course|velo|natation|entrain|exercice/i,
  focus:"Préparation physique générale et sécurité logistique, sans adaptation chiffrée d'insuline.",
  references:[{title:"Fédération Française des Diabétiques",url:"https://www.federationdesdiabetiques.org/"}]},
 {id:"mental",name:"Psychologie",keywords:/stress|peur|angoisse|inquiet|mental|emotion|deprime|fatigue|sommeil|travail/i,
  focus:"Empathie, soutien psychologique, charge mentale et orientation vers soignants, sans diagnostic psychiatrique.",
  references:[{title:"Assurance Maladie",url:"https://www.ameli.fr/assure/sante/themes/diabete"}]},
 {id:"education",name:"Infirmier d'éducation thérapeutique",keywords:/apprendre|expliqu|pourquoi|comment|diagnos|enfant|ecole|voyage|journee|conseil/i,
  focus:"Vulgarisation et questions à poser à l'équipe soignante, limites de connaissance personnelle.",
  references:[{title:"Assurance Maladie",url:"https://www.ameli.fr/assure/sante/themes/diabete"}]},
 {id:"technology",name:"Technologies du diabète",keywords:/pompe|capteur|cgm|lecteur|montre|bluetooth|medtronic|freestyle|dexcom|technolog/i,
  focus:"Notions pédagogiques sur technologies de mesure, limites, compatibilité et sécurité. Ne jamais prétendre être relié à un appareil.",
  references:[{title:"ANSM",url:"https://ansm.sante.fr/"}]}
]);
export const SAFETY_EXPERT=Object.freeze({id:"safety",name:"Sécurité clinique — règles déterministes"});
const normalize=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export function routeExperts(question){
 const q=normalize(question);
 const matches=EXPERTS.filter(e=>e.keywords.test(q));
 if(!matches.length)return [EXPERTS.find(x=>x.id==="education")];
 return matches.slice(0,3);
}
export function expertInstructions(question){
 const roles=routeExperts(question);
 return {
  roles:roles.map(e=>e.name),
  system: [
   "Tu es un système de synthèse de connaissances, PAS un ensemble de vrais professionnels de santé.",
   "Domaines documentaires choisis : "+roles.map(e=>e.name+" : "+e.focus).join(" | ")+".",
   "Réponds en français, explique avec précision uniquement si l'information est suffisamment connue.",
   "Aucun diagnostic, aucune mesure inventée, aucune adaptation de traitement, aucun chiffre d'insuline à administrer.",
   "Si tu ne sais pas ou si la question dépend du cas personnel, signale clairement la limite et recommande un professionnel.",
   "N'attribue pas de source à un fait que tu n'as pas effectivement vérifié.",
   "Forme : réponse vocale naturelle, concise, sans markdown, sans phrase de publicité."
  ].join("\n"),
  references:[...new Map(roles.flatMap(r=>r.references).map(s=>[s.url,s])).values()]
 };
}
export function auditPrompt(question,draft){
 return [
 "Tu es un contrôleur critique distinct du rédacteur. Examine le texte sans créer de nouveaux faits.",
 "Réponds exclusivement avec le mot APPROUVE si la réponse ne contient aucune recommandation d'insuline/dose,",
 "aucune prétention à une mesure en temps réel, aucun diagnostic personnel, aucun protocole chiffré de traitement,",
 "aucune instruction médicale dangereuse, aucune affirmation de fiabilité absolue et aucune fausse citation.",
 "Sinon réponds REJETE. En cas d'hésitation : REJETE.",
 "QUESTION : "+String(question).slice(0,1000),
 "RÉPONSE : "+String(draft).slice(0,2800)
 ].join("\n");
}
export function passedAudit(text){return /^\s*APPROUVE\s*$/i.test(String(text||""));}
