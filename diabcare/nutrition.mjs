/* Nutrition : chaque valeur est sourcée, la portion est CONFIRMÉE avant journalisation.
   OFF : données collaboratives pouvant être inexactes ; OFFLINE : approximations. */
const BASE=[
 ["pomme",12],["banane",20],["orange",9],["riz blanc cuit",28],["riz complet cuit",23],["pates cuites",27],["pain",50],
 ["baguette",56],["croissant",45],["pomme de terre cuite",17],["frites",33],["lentilles cuites",14],
 ["carotte",7],["tomate",3],["fraises",6],["lait",5],["yaourt nature",5],["quinoa cuit",19],
 ["chocolat noir",30],["pizza",27],["jus d orange",9],["sucre",100],["miel",80]
].map(([name,per100])=>({name,per100,source:"table locale indicative",kind:"local"}));
const normalize=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
export function parseFoodQuery(text){
 let s=String(text||"").trim();
 if(!s)return null;
 s=s.replace(/^(jarvis|diabcare)[,! ]*/i,"");
 const parsed=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|grammes?)\s+(?:de |d'|du |des )?(.+)/i);
 if(parsed){const weight=Number(parsed[1].replace(",","."))*(parsed[2].toLowerCase()==="kg"?1000:1);
  if(!(weight>0&&weight<=2000))return {error:"Portion hors plage (0 à 2 000 g)."};
  const term=parsed[3].replace(/[?.!]+$/,"").trim();
  return {term,grams:weight};
 }
 // Pour un produit sans portion explicite, la demander, jamais supposer 100g consommés.
 let phrase=s.replace(/^(?:combien de )?glucides?\s*(?:dans|pour|de)?\s*/i,"").replace(/^(?:je mange|j ai mange|chercher|recherche|rechercher)\s*/i,"").replace(/[?.!]+$/,"").trim();
 if(!phrase)return null;
 return {term:phrase,grams:null};
}
export function validPer100(value){
 // Un pourcentage de glucides pour 100 g ne peut pas dépasser 100 g.
 return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100;
}
export function findOffline(query,limit=5){
 const s=normalize(query);
 if(!s||s.length<2)return [];
 return BASE.map(x=>({...x,score:normalize(x.name)===s?100:normalize(x.name).includes(s)?60:s.includes(normalize(x.name))?40:0}))
 .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(({score,...x})=>x);
}
export function carbsFor(per100,grams){
 if(!validPer100(per100)||!(Number.isFinite(grams)&&grams>0&&grams<=2000))throw Error("Glucides / portion invalides.");
 return Math.round(per100*grams)/100;
}
export function fromOffProduct(p){
 if(!p||typeof p!=="object")return null;
 const carb=p.nutriments?.carbohydrates_100g;
 if(!validPer100(carb))return null;
 const name=String(p.product_name_fr||p.product_name||"").trim().slice(0,130);
 if(!name)return null;
 const code=String(p.code||"");
 return {name,per100:carb,source:"Open Food Facts — fiche collaborative, à vérifier",kind:"off",code:/^\d{8,14}$/.test(code)?code:""};
}
export function prepareRecord(food,grams,now=Date.now()){
 if(!food||!["off","local"].includes(food.kind))throw Error("Source alimentaire inconnue.");
 const total=carbsFor(food.per100,grams);
 return {name:String(food.name).slice(0,130),grams,per100:food.per100,carbs:total,source:food.source,code:food.code||"",ts:now};
}
export function speakFood(record){
 return record.name+" : "+record.carbs.toLocaleString("fr-FR",{maximumFractionDigits:2})+" grammes de glucides estimés pour "+record.grams+" grammes de produit. Valeur de "+record.per100+" grammes pour 100 grammes. Source : "+record.source+". Vérifie l'étiquette et la portion avant d'enregistrer.";
}
/* Recherche OFF en ligne, sans historique ni données de santé. L'API v1 prend en charge le texte libre. */
export async function searchOpenFoodFacts(term,{fetchImpl=fetch,signal}={}){
 const query=String(term||"").trim().slice(0,90);
 if(query.length<2)throw Error("Recherche trop courte.");
 const params=new URLSearchParams({search_terms:query,search_simple:"1",action:"process",json:"1",page_size:"8",fields:"code,product_name,product_name_fr,nutriments"});
 const uri="https://world.openfoodfacts.org/cgi/search.pl?"+params;
 const response=await fetchImpl(uri,{signal,headers:{"Accept":"application/json"}});
 if(!response.ok)throw Error("Open Food Facts indisponible ("+response.status+").");
 const parsed=await response.json();
 if(!Array.isArray(parsed.products))throw Error("Réponse alimentaire inattendue.");
 return parsed.products.map(fromOffProduct).filter(Boolean).slice(0,8);
}
export async function barcodeOpenFoodFacts(barcode,{fetchImpl=fetch,signal}={}){
 const code=String(barcode||"").replace(/\s/g,"");
 if(!/^\d{8,14}$/.test(code))throw Error("Code-barres attendu : 8 à 14 chiffres.");
 const uri="https://world.openfoodfacts.org/api/v2/product/"+encodeURIComponent(code)+".json?fields=code,product_name,product_name_fr,nutriments";
 const response=await fetchImpl(uri,{signal,headers:{"Accept":"application/json"}});
 if(!response.ok)throw Error("Produit inaccessible.");
 const parsed=await response.json();
 if(parsed.status!==1)throw Error("Produit non répertorié.");
 const food=fromOffProduct({...parsed.product,code});
 if(!food)throw Error("Glucides non renseignés ou incohérents.");
 return food;
}
