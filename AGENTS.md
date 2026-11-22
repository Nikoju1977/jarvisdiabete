# Instructions de développement Studio Niko — Modern Web Guidance

Source officielle : https://github.com/GoogleChrome/modern-web-guidance

Pour les fonctionnalités web, préférer les API natives, une interface HTML accessible, des contrôles tactiles lisibles et utilisables sur iPhone/Android/PC, des fallbacks Safari/Chrome/Firefox et une consommation CPU/mémoire maîtrisée. Consulter un guide officiel ciblé lors d'une évolution pertinente (CLI Node.js : `npx modern-web-guidance@latest search "responsive layout"`, puis `retrieve` avec l'identifiant réellement obtenu). Ne pas présenter cette CLI comme embarquée dans le navigateur.

## Contraintes propres à l'application

Application DiabCare et données de diabète. Ne jamais modifier sans cadrage les calculs liés aux doses ou les conseils médicaux ; préserver le coffre chiffré et le blocage des recommandations d'insuline. Respecter les unités cliniques, le caractère manuel des données et la distinction prototype/dispositif médical.

## Travail et publication

- Garder les caractéristiques et les limitations documentées par le README et le code existants.
- Ne pas introduire de secret, télémétrie cachée, comportement automatique non autorisé ou données de démonstration présentées comme réelles.
- Ne pas lancer de campagne de tests sans demande explicite de l'utilisateur ; ne jamais affirmer que du code non vérifié fonctionne parfaitement.
- Étiqueter clairement : examiné / modifié / déployé / confirmé en fonctionnement.
