# DiabCare 4.0 — Compagnon vocal de diabète type 1

PWA en français, installable sur iPhone et Android depuis un site HTTPS. **L'essentiel fonctionne hors connexion** après la première ouverture avec réseau : réponses locales, triage des formulations urgentes, journal manuel et données chiffrées. Aucun compte, Nightscout, accès pompe ou clé API ne sont nécessaires.

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
