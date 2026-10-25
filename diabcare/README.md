# DiabCare 4.2 — Compagnon vocal du diabète de type 1

PWA en français, installable sur iPhone et Android depuis un site HTTPS. **L'essentiel fonctionne hors connexion** après la première ouverture avec réseau : réponses locales, triage des formulations urgentes, journal manuel et données chiffrées. Aucun compte, service de synchronisation glycémique externe, accès pompe ou clé API ne sont nécessaires.

## Démarrage

Le dossier \`diabcare/\` est **autonome** : il suffit d'héberger ce dossier sur HTTPS (ex. \`/diabcare/\`). Pour un développement local : \`cd diabcare && python3 -m http.server 8000\`, puis ouvrir \`http://localhost:8000\`.

Sur iPhone : Safari → Partager → Sur l'écran d'accueil. Sur Android : Chrome → menu → Installer l'application. La possibilité d'installation dépend des exigences PWA et de l'OS.

Lors de l'ouverture, créer une phrase secrète longue (8 caractères minimum) et consentir au stockage chiffré, ou choisir le mode sans stockage. La perte de la phrase secrète empêche de récupérer les données ; effectuer régulièrement une sauvegarde chiffrée.

## Fonctions vérifiables

- Journal de glycémie manuel : unités g/L, mg/dL, mmol/L, validation de plage, date et heure.
- Bilan descriptif de mesures, sans confondre mesures éparses et TIR de capteur continu.
- Journal des injections réellement réalisées, **jamais de calcul de dose ni d'IOB**.
- Triage prioritaire, avant le modèle génératif, de formulations évoquant un danger immédiat.
- Réponses déterministes locales (sécurité, nutrition, activité, traitement, soutien, etc.).
- Synthèse vocale du navigateur si elle est disponible ; dictée seulement si la reconnaissance **locale** est explicitement disponible.
- Chiffrement navigateur AES-GCM, clé PBKDF2-SHA-256 avec 500 000 itérations, données uniquement en local et mode sans stockage.
- Service Worker precache : fichiers essentiels utilisables après installation hors réseau. Mise à jour de la PWA par le navigateur lorsque Internet revient.
- IA générative locale **optionnelle** : wllama 3.6.1 et Qwen3-0.6B GGUF (Q4_K_M, téléchargement de l'ordre de 484 Mo). Les poids sont obtenus au premier chargement via Hugging Face ; le runtime WASM est chargé depuis le CDN épinglé. L'inférence est locale ; les demandes urgentes ou de posologie sont interceptées avant le modèle.

## Limites matérielles et médicales non négociables

1. **Fiabilité clinique à 100 % impossible.** Aucun traitement ne doit être décidé sur la base de cette PWA. Elle ne surveille pas continuellement la glycémie, ne pilote aucune pompe et ne fournit pas de calcul de bolus. Aucune validation de dispositif médical ou évaluation clinique prospective n'a été réalisée.
2. La compatibilité hors connexion du *modèle génératif* n'est **pas garantie** sur tous les iPhone/Android : Safari, stockage local, mémoire vive, WebAssembly et cache de la bibliothèque peuvent empêcher son redémarrage hors ligne. L'assistant documentaire déterministe demeure utilisable.
3. La reconnaissance de la parole hors ligne n'est **pas garantie** sur iPhone/Android. Si \`SpeechRecognition.available({processLocally:true})\` n'existe pas, le micro ne démarre pas, pour éviter l'envoi involontaire d'audio à un service distant. Clavier toujours disponible.
4. Les règles d'urgence ne sont pas exhaustives : l'utilisateur peut contacter les secours à tout moment. En cas de doute : 15 ou 112. La PWA ne remplace ni les alertes du capteur ni le plan médical personnel.
5. Le stockage local du navigateur peut être supprimé par le système, y compris après chiffrement. La sauvegarde chiffrée requiert toujours la phrase secrète. La gestion des migrations/restaurations doit être conçue et testée avant toute utilisation clinique.
6. Les fichiers du modèle sont figés à une version précise ; le **téléchargement silencieux d'un nouveau modèle est interdit** tant qu'une validation cryptographique de la mise à jour, une stratégie de retour arrière et des essais de non-régression ne sont pas publiés. La PWA elle-même peut se mettre à jour automatiquement.

## Tests

\`cd diabcare && node --test core.test.mjs vault.test.mjs\`

Tests unitaires de conversion, seuils, triage, refus de dose et distinction mesures manuelles/TIR. Vérifier sur de vrais appareils : installation PWA, rechargement en mode avion, qualité de l'audio, durée des sessions, stockage et interruption du téléchargement. Ces tests ne constituent **pas** une validation médicale.

## Reprise documentée des projets

- [jarvisdiabete](https://github.com/Nikoju1977/jarvisdiabete) : agents, coffre et sécurité ; les calculs de bolus sont volontairement exclus.
- [OPENVITA-DT1](https://github.com/Nikoju1977/OPENVITA-DT1) : expression naturelle, représentation française des glycémies et bilan.
- [compagnon-diabete](https://github.com/Nikoju1977/compagnon-diabete) : parcours vocal et ergonomie compacte.
- [daphnee-compagnon](https://github.com/Nikoju1977/daphnee-compagnon) : synthèse vocale et expérience mobile ; aucune fausse indication de connexion matérielle.
- [presentation-medtronic](https://github.com/Nikoju1977/presentation-medtronic) : références pour la pédagogie des dispositifs, **pas** d'accès à une pompe.
- DiabCare v3 (code fourni dans la conversation) : contexte conceptuel du journal et de la carte d'urgence, sans formules non validées.

## Sources cliniques

ADA Standards of Care 2026 (section 6) : https://doi.org/10.2337/dc26-s006 ; Assurance Maladie : https://www.ameli.fr/assure/sante/themes/diabete .

## Confidentialité

Aucune télémétrie, aucune transmission du journal ou de la conversation. Le chargement facultatif du runtime et du modèle fait des requêtes réseau vers jsDelivr et Hugging Face et implique que ces fournisseurs voient l'IP lors du téléchargement. Les données santé restent dans le navigateur, chiffrées si le coffre est activé.

**Usage personnel éducatif et démonstratif**. Avant commercialisation ou revendication clinique : analyse de risque IEC 62304/ISO 14971, exigences MDR/UE 2017/745 applicables, validation par une équipe médicale, tests iOS/Android et audits de sécurité/privacy.


## DiabCare 4.1 : JARVIS et GlucoCheck vocal

- **JARVIS** : interface orbe animée, bouton Parler, synthèse vocale et interruption ; pas d'écoute permanente possible en arrière-plan dans une PWA. Dictée locale quand supportée ; dictée réseau uniquement sur accord explicite, avec traitement éventuel de l'audio par le navigateur/fournisseur.
- **GlucoCheck** : « JARVIS, GlucoCheck » lit la dernière mesure **enregistrée et datée** ; « JARVIS, GlucoCheck 1 virgule 20 » ouvre un dialogue de confirmation avant la saisie en g/L. Jamais une mesure issue du microphone.
- **Glucides** : « JARVIS, glucides pour 150 g de riz blanc cuit » ouvre un choix entre une table locale indicative et les produits Open Food Facts en ligne ; les quantités et les valeurs nutritionnelles doivent être vérifiées avant d'enregistrer le repas. Pas de calcul de bolus. Un code-barres peut être saisi manuellement.
- **Mistral** : mode volontaire en ligne pour des questions générales et documentaires. L'application transmet seulement la question admissible, jamais le journal ; une passerelle Vercel applique un refus déterministe des sujets sensibles avant l'appel et sollicite une deuxième évaluation via Mistral. Cette deuxième évaluation ne certifie **pas** l'exactitude clinique.
- **Experts** : routage de sept rôles documentaires (diabétologie, nutrition, pharmacie, activité physique, psychologie, éducation thérapeutique, technologies) ; ce ne sont pas de vrais médecins ni sept LLM formés et validés séparément.
- **Sources de LLM GitHub** : [wllama](https://github.com/ngxson/wllama) pour WebAssembly, [Transformers.js](https://github.com/huggingface/transformers.js) étudié comme alternative, et [Qwen3 0.6B GGUF](https://huggingface.co/QuantFactory/Qwen3-0.6B-GGUF) comme modèle local facultatif. Le fichier Q4_K_M publié annonce SHA-256 \`7af3fdf842f87b24672f8a7f1dd50404043f0bfb71093ff91c31d2b49df4631d\`. Ce hash est enregistré dans le catalogue, **mais le téléchargement wllama ne fait pas encore de comparaison obligatoire du fichier téléchargé**.
- Le dépôt GitHub [python-llm-archive](https://github.com/danielgross/python-llm-archive) a été examiné : il gère des API Python anciennes (OpenAI/Anthropic), n'apporte aucun moteur de LLM local PWA et n'est donc pas intégré.

### Activer Mistral sur Vercel

Configurer dans les réglages du projet Vercel les **variables d'environnement côté serveur**, jamais dans du JavaScript public :
- \`MISTRAL_API_KEY\` : clé privée du compte Mistral ;
- \`DIABCARE_GATE_CODE\` : code privé, aléatoire, d'au moins 16 caractères, différent de la clé API ;
- \`MISTRAL_MODEL\` (facultatif) : modèle de chat autorisé (défaut : \`mistral-small-latest\`).

Redéployer une fois les variables présentes. Dans **Réglages → Moteur connecté Mistral**, sélectionner « Automatique » ou « Mistral », autoriser l'envoi des questions pédagogiques, puis entrer le **code d'accès**, pas la clé API. Le code n'est pas mémorisé dans le coffre et doit être saisi à chaque session. Aucun envoi n'a lieu sans ces conditions, sans réseau ou pour une question personnelle sensible.

**Important** : la passerelle applique une vérification de code statique, mais n'a pas encore de service de gestion des comptes, de limitation de débit par utilisateur ni d'audit de sécurité complet. Ne pas ouvrir l'accès public sans cette infrastructure. L'URL serveur est \`/api/diabcare-chat\` et la réponse n'est pas mise en cache.

### Fiabilité des glucides et mode nature

Open Food Facts est collaboratif : vérifier la marque, l'étiquette et les portions. Le site peut imposer des limites de requêtes et être indisponible. DiabCare revient alors à un mini-référentiel local **indicatif**, qui n'est pas une base certifiée. Un calcul ne peut être enregistré sans validation manuelle de la portion.

L'orbe est un contrôle tactile et vocal, mais ne peut pas rester à l'écoute en tâche de fond sur tous les téléphones. Le mode hors connexion essentiel reste le chat documentaire local, le journal et les aliments locaux. **Mistral fonctionne uniquement avec Internet et les secrets configurés.**

### Commandes de contrôle

\`cd diabcare && node --test *.test.mjs ../api/diabcare-chat.test.mjs\`

La validation automatique couvre notamment la dictée des décimales françaises, l'identification du bon produit, les erreurs alimentaires, la confidentialité des requêtes Mistral, les garde-fous des rôles experts et le chiffrement. Ces tests ne se substituent pas aux essais avec des patients et des appareils physiques.


## Interface unifiée 4.2

L'adresse publiée est \`https://nikoju1977.github.io/jarvisdiabete/diabcare/\`.
La page d'accueil du dépôt renvoie vers cette interface. Le code de l'ancien prototype monolithique, qui comportait une synchronisation tierce et des calculs thérapeutiques expérimentaux, ne constitue plus la page principale.

L'écran d'accueil réunit un bouton vocal central, le dernier résultat **saisi** avec date et provenance, les actions GlucoCheck / Glucides / Urgence et la conversation. Les mesures ne sont jamais affichées comme étant en direct. Les interactions vocales restent conditionnées aux capacités du navigateur.

Les enregistrements de l'ancien prototype ne sont pas importés automatiquement dans le coffre DiabCare : aucun effacement automatique ne les concerne. Sauvegarder toute donnée historique avant de réinitialiser son navigateur.


## Voice-first 4.3 : Android, iPhone et dictée hors connexion

Certaines versions de Chrome Android, Samsung Internet et les navigateurs intégrés ne prennent pas en charge \`SpeechRecognition.available({processLocally:true})\`. La disponibilité de cet appel **ne signifie pas** que le microphone ou la reconnaissance vocale générale sont absents. DiabCare n'affiche donc plus de message bloquant :

1. Appuyer sur l'orbe JARVIS ou le microphone.
2. Si le navigateur sait effectuer une reconnaissance native locale, la dictée locale commence.
3. Sinon, **le choix apparaît dans l'écran** :
   - **Micro en ligne**, uniquement avec accord explicite de l'utilisateur pour la session. La reconnaissance vocale peut alors transmettre le son au fournisseur du navigateur, selon sa politique de confidentialité.
   - **Whisper sur l'appareil**, téléchargement initial de \`onnx-community/whisper-tiny\` via Transformers.js 3.8.1. L'inférence est locale et le fichier audio n'est pas téléversé vers un service de transcription. Les composants du moteur sont mis en cache quand le navigateur l'autorise ; mémoire, espace libre et WebAssembly limitent les appareils compatibles.
4. Pour Whisper, dicter une phrase jusqu'à 16 secondes, puis appuyer sur **Terminer la dictée**. La reconnaissance peut prendre du temps sur téléphone. L'enregistrement n'est jamais automatiquement inscrit au journal : toute glycémie transcrite nécessite confirmation.
5. Si aucune méthode vocale n'est disponible, utiliser le clavier et ouvrir le site directement dans Chrome (Android) ou Safari (iPhone), pas dans une fenêtre intégrée restrictive.

La PWA ne peut pas forcer un navigateur à accorder le microphone, garantir une reconnaissance précise des chiffres médicaux, ni enregistrer des commandes vocales en arrière-plan. La disponibilité hors connexion du modèle Whisper après un téléchargement reste soumise au cache et doit être testée en mode avion sur l'appareil.

**Correction visuelle** : le formulaire de chat ne suit plus le défilement par-dessus le bouton micro, la carte GlucoCheck ou la navigation du bas. Les notifications vocales sont plus compactes et les explications de reconnaissance restent dans la page.

**Sécurité** : le son de Whisper reste en mémoire locale de l'application pendant la transcription. Les décisions de traitement et le dosage d'insuline ne sont jamais calculés par la transcription.


## DiabCare 4.4 : contrôle de tous les boutons

Cette version apporte de vrais gestionnaires de clics aux huit cartes Experts, stabilise les onglets Android/iPhone et affiche la raison si une fonction ne peut pas être utilisée.

**Sur Android :**
1. Dans l'onglet Réglages, bouton **Tester les boutons et les capacités du navigateur**. Ce diagnostic reste local et indique la disponibilité des fonctions voix, du coffre, de la PWA et de l'IA facultative.
2. Pour parler : toucher le micro ; pour autoriser la dictée *via le navigateur* (traitement audio potentiellement sur serveur), cocher d'abord la case de consentement. Le service vocal du navigateur peut être indisponible : aucun site web ne peut forcer Android à l'installer.
3. Pour Whisper hors connexion : installer les fichiers une première fois avec Internet, puis **retoucher le micro** afin d'enregistrer avec une autorisation Android déclenchée par ce geste. Le chargement local n'est pas garanti sur les téléphones à mémoire limitée.
4. Dans Glucides, le bouton clavier du dialogue vocal ramène désormais à **l'aliment**, pas au chat général. Les estimations locales sont affichées sans attendre Open Food Facts (5,5 secondes maximum).
5. La mise à jour de l'application utilise **Vérifier une nouvelle version** puis **Actualiser la page**. Les fichiers JavaScript et CSS utilisent la stratégie réseau-d'abord, avec repli cache hors connexion ; ne pas supprimer le stockage du site pour actualiser, sous peine de perdre le coffre.

**Confidentialité :** le mode **Sans stockage** permet maintenant de **Terminer la session** et protège les coffres existants contre toute suppression depuis cette session. La sauvegarde chiffrée est désactivée lorsqu'aucun coffre n'existe.

Les tests Chromium reproduisent deux tailles d'écran mobile et vérifient les boutons de navigation, le chat clavier, le journal, le bilan texte téléchargé, le calcul et la confirmation des glucides, le dialogue micro (sans capture audio), les rôles Experts, les diagnostics et l'absence de suppression implicite. Ils peuvent aussi vérifier une recharge hors connexion après installation du service worker. Ils ne constituent pas un essai physique de microphones Android/iPhone ni une validation médicale.


## DiabCare 4.5 — Bibliothèque Open Food Facts hors connexion

Le calculateur intègre une bibliothèque **IndexedDB** distincte du journal de santé. Ce stockage local contient seulement des fiches de **produits alimentaires publics** (nom, marque, code-barres, glucides pour 100 g, date de téléchargement). **Il ne contient ni glycémies, ni doses, ni conversations**. Les fiches se consultent hors ligne après leur premier téléchargement.

1. Avec Internet, dans l'onglet **Glucides**, cliquer sur **Préparer mes aliments pour une sortie**. DiabCare effectue *six recherches limitées* (riz, pâtes, pain, yaourt, céréales, lait), stocke des fiches valides, affiche le nombre téléchargé et la date de consultation. Les recherches manuelles en ligne enrichissent également la bibliothèque.
2. Avant de partir, rechercher par **nom, marque ou code-barres** pour vérifier que le produit exact est enregistré. Les produits hors ligne doivent déjà avoir été téléchargés. Le référentiel générique DiabCare est affiché séparément comme **table indicative**, et non comme fiche Open Food Facts.
3. En randonnée, sans Internet, demander à JARVIS « glucides pour 150 grammes de riz » ou saisir une référence : DiabCare affiche les fiches locales correspondant à la recherche, avec *marque*, *code-barres*, *valeur pour 100 g* et *calcul par portion*. Plusieurs correspondances imposent le choix manuel du produit exact.
4. **Vider cette bibliothèque** supprime exclusivement les fiches alimentaires téléchargées ; les repas du journal chiffré et les glycémies sont conservés.
5. L'application ne recommande **aucune dose d'insuline**. Les données Open Food Facts sont collaboratives, peuvent être anciennes, erronées ou manquer de portions. Comparer à l'étiquette du produit réel et choisir son état (cru/cuit) avant d'utiliser une estimation.

Les données proviennent de [Open Food Facts](https://world.openfoodfacts.org/), réutilisées sous **Open Database License (ODbL)** : [conditions de réutilisation](https://world.openfoodfacts.org/terms-of-use). Les produits sont consultés via le service public sans transfert du journal de santé. Open Food Facts limite les recherches ; ce téléchargement de préparation effectue au maximum 6 requêtes par activation, sans autocomplétion constante. Le code-barres n'est pas numérisé par l'appareil : il est saisi manuellement ou vocalement, selon les capacités de reconnaissance de l'appareil.

Les téléphones iPhone et Android peuvent supprimer les fichiers IndexedDB selon l'espace libre, le mode privé ou les politiques système. Il faut **vérifier la présence de la bibliothèque en mode avion** avant de dépendre de l'accès local en sortie. Une bibliothèque préchargée n'implique pas une garantie de disponibilité permanente.

### Non-fonctionnalités volontaires

Aucune importation de la totalité d'Open Food Facts : la base complète est beaucoup trop volumineuse pour une PWA mobile. Aucun remplacement silencieux des valeurs sauvegardées, aucune dose calculée à partir de glucides, aucune fausse mesure en temps réel. La bibliothèque OFF n'est pas fusionnée avec les informations de santé chiffrées.
