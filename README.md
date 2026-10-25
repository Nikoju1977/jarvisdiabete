# DiabCare — JARVIS DT1

PWA vocale spécialisée dans le diabète de type 1. L'application principale se trouve dans [diabcare/](./diabcare/) et est disponible sur GitHub Pages :

**https://nikoju1977.github.io/jarvisdiabete/diabcare/**

La racine du dépôt redirige vers cette application. L'ancien prototype intégrant de la synchronisation et des suggestions thérapeutiques a été retiré de l'interface principale. Ses anciens fichiers HTML ne sont plus servis comme application utilisateur. Les données stockées par l'ancienne version ne sont **pas migrées automatiquement** ; aucune suppression automatique des anciens coffres n'est effectuée.

## Fonctions

- JARVIS : commandes vocales sur activation, synthèse vocale, interface adaptée aux mobiles.
- GlucoCheck : lecture des glycémies *saisies*, avec horodatage ; dictée validée avant inscription au journal.
- Calculateur de glucides : portions explicites, sources Open Food Facts ou mini-référentiel indicatif hors connexion.
- Assistant pédagogique hors connexion ; Qwen GGUF optionnel selon compatibilité du navigateur.
- Mistral uniquement sur un serveur compatible, après accord explicite ; ce mode **n'est pas disponible depuis GitHub Pages statique**.
- Coffre local chiffré, sauvegarde et restauration.
- Filtrage prioritaire des demandes d'insuline : aucune recommandation de dose ni contrôle de pompe.

## Statut médical

Il s'agit d'un assistant documentaire personnel, non d'un dispositif médical certifié ni d'un système de surveillance continue. Aucune fiabilité médicale de 100 % n'est garantie. Les données manuelles ne permettent pas de prédire les hypoglycémies.

## Développement et tests

Les sources et limitations sont documentées dans [diabcare/README.md](./diabcare/README.md).

\`\`\`bash
cd diabcare
node --test *.test.mjs ../api/diabcare-chat.test.mjs
\`\`\`

Les tests automatiques ne remplacent ni les essais sur iPhone/Android ni une validation clinique.
