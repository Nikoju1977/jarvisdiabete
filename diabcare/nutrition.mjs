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
 s=s.replace(/\bvirgule\b/gi,",");
 // Reconnaissance vocale : les poids restent explicites, sans portion implicite.
 const spokenWeights={"cent cinquante":"150","deux cents":"200","cent":"100","cinquante":"50","soixante":"60","trente":"30","quarante":"40","vingt":"20","dix":"10"};
 for(const [words,digits] of Object.entries(spokenWeights).sort((a,b)=>b[0].length-a[0].length)){
  s=s.replace(new RegExp("\\b"+words+"(?=\\s+(?:grammes?|g)\\b)","gi"),digits);
 }
 const parsed=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|grammes?)\s+(?:de |d'|du |des )?(.+)/i);
 if(parsed){const weight=Number(parsed[1].replace(",","."))*(parsed[2].toLowerCase()==="kg"?1000:1);
  if(!(weight>0&&weight<=2000))return {error:"Portion hors plage (0 à 2 000 g)."};
  const term=parsed[3].replace(/[?.!]+$/,"").trim().replace(/^(?:de |d'|du |des |la |le |les )/i,"");
  if(!term)return {error:"Précise le nom de l'aliment."};
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
 // Les valeurs nutritionnelles correspondent au produit tel que vendu, sauf indication explicite du fabricant.
 const carb=p.nutriments?.carbohydrates_100g;
 if(!validPer100(carb))return null;
 const name=String(p.product_name_fr||p.product_name||"").trim().slice(0,130);
 if(!name)return null;
 const code=String(p.code||"");
 return {name,per100:carb,source:"Open Food Facts — fiche collaborative, à vérifier",kind:"off",
  code:/^\d{8,14}$/.test(code)?code:"",
  brand:String(p.brands||"").split(",")[0].trim().slice(0,80),
  quantity:String(p.quantity||"").slice(0,50),
  servingSize:String(p.serving_size||"").slice(0,50),
  lastModified:Number.isFinite(p.last_modified_t)?p.last_modified_t:null
 };
}
export function prepareRecord(food,grams,now=Date.now()){
 if(!food||!["off","local"].includes(food.kind))throw Error("Source alimentaire inconnue.");
 const total=carbsFor(food.per100,grams);
 return {name:String(food.name).slice(0,130),brand:String(food.brand||"").slice(0,80),grams,
  per100:food.per100,carbs:total,source:food.source,code:food.code||"",ts:now};
}
export function speakFood(record){
 return record.name+(record.brand?", marque "+record.brand:"")+". Pour "+record.grams+" grammes : environ "+record.carbs.toLocaleString("fr-FR",{maximumFractionDigits:2})+" grammes de glucides. La référence indique "+record.per100.toLocaleString("fr-FR")+" grammes pour 100 grammes. Source : "+record.source+". Pour une fiche produit, la valeur concerne le produit tel que vendu : cru, sec et cuit peuvent être très différents. Vérifie la marque, la préparation et le poids. Aucune dose d’insuline n’est calculée.";
}
/* OFF: recherches structurées v2 pour produits courants ; legacy fulltext sinon.
 * Search API v2 official: https://openfoodfacts.github.io/documentation/docs/Product-Opener/v2/search/get-search/
 * Respect max ~10 searches/min per IP; no search-as-you-type.
 */
const CATEGORY_KEYS=Object.freeze({
 "riz":"rice","pates":"pasta","pain":"bread","yaourt":"yogurts",
 "cereales":"breakfast-cereals","lait":"milk","jus d orange":"orange-juices"
});
const API_FIELDS="code,product_name,product_name_fr,brands,quantity,serving_size,nutriments,last_modified_t";
export function foodApiUrl(term){
 const query=String(term||"").trim().slice(0,90);
 if(query.length<2)throw Error("Recherche trop courte.");
 const key=normalize(query);
 if(Object.hasOwn(CATEGORY_KEYS,key)){
  const params=new URLSearchParams({
   categories_tags_en:CATEGORY_KEYS[key],countries_tags_en:"france",
   sort_by:"popularity_key",page_size:"8",fields:API_FIELDS
  });
  return "https://world.openfoodfacts.org/api/v2/search?"+params;
 }
 const params=new URLSearchParams({search_terms:query,search_simple:"1",action:"process",json:"1",page_size:"8",fields:API_FIELDS});
 return "https://world.openfoodfacts.org/cgi/search.pl?"+params;
}
export async function searchOpenFoodFacts(term,{fetchImpl=fetch,signal}={}){
 const uri=foodApiUrl(term);
 const response=await fetchImpl(uri,{signal,headers:{"Accept":"application/json"}});
 if(!response.ok)throw Error("Open Food Facts indisponible ("+response.status+").");
 const parsed=await response.json();
 if(!Array.isArray(parsed.products))throw Error("Réponse alimentaire inattendue.");
 return parsed.products.map(fromOffProduct).filter(Boolean).slice(0,8);
}
export async function barcodeOpenFoodFacts(barcode,{fetchImpl=fetch,signal}={}){
 const code=String(barcode||"").replace(/\s/g,"");
 if(!/^\d{8,14}$/.test(code))throw Error("Code-barres attendu : 8 à 14 chiffres.");
 const uri="https://world.openfoodfacts.org/api/v2/product/"+encodeURIComponent(code)+".json?fields=code,product_name,product_name_fr,brands,quantity,serving_size,nutriments,last_modified_t";
 const response=await fetchImpl(uri,{signal,headers:{"Accept":"application/json"}});
 if(!response.ok)throw Error("Produit inaccessible.");
 const parsed=await response.json();
 if(parsed.status!==1)throw Error("Produit non répertorié.");
 const food=fromOffProduct({...parsed.product,code});
 if(!food)throw Error("Glucides non renseignés ou incohérents.");
 return food;
}
