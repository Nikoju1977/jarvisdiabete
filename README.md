# Jarvis Diabète
**Studio Niko Design** — suivi du diabète avec agents de contrôle, données chiffrées sur l'appareil.

> ⚠️ Prototype **non certifié dispositif médical** (règlement UE 2017/745). L'estimation de bolus relève du MDR classe IIb : usage de démonstration et de recherche uniquement.

🔗 [jarvisdiabete.vercel.app](https://jarvisdiabete.vercel.app)

## Architecture des agents
| Agent | Rôle | Type |
|---|---|---|
| Triage des urgences | Détecte malaise, cétones, détresse **avant** toute IA (15, 112, 3114) | Déterministe |
| Veille glycémique | Hypo niveaux 1 et 2, hypo projetée à 20 min, hyper, cétones si > 250 pendant 2 h (type 1), données anciennes | Déterministe |
| Qualité des données | Plages 20–600 mg/dL, unités douteuses, horodatages, sources | Déterministe |
| Garde-fou bolus | Paramètres validés obligatoires, double calcul indépendant, insuline active (oref0), plafond, blocage si < 70, arrondi au pas inférieur | Déterministe |
| Nutrition | Table interne + Open Food Facts + code-barres, portion toujours confirmée | Déterministe |
| Consensus temps dans la cible | TIR, TBR, TAR, CV, GMI comparés au consensus international (Battelino 2019 / ADA 2026) | Déterministe |
| Conseiller IA | Chaîne de repli Mistral → Groq → Cerebras → modèle local | LLM |
| Contrôle des réponses | Retire toute dose ou modification de traitement, puis relecture critique par un second modèle | Déterministe + LLM |

Chaque décision est inscrite dans un journal d'audit chiffré.

## Modèles locaux (Ollama)
```bash
OLLAMA_ORIGINS=https://jarvisdiabete.vercel.app ollama serve
ollama pull hf.co/mradermacher/Diabetica-Qwen3-4B-GGUF:Q4_K_M   # spécialisé diabète
ollama pull hf.co/mradermacher/Diabetica-o1-GGUF:Q4_K_M         # multilingue, raisonnement
ollama pull hf.co/unsloth/medgemma-1.5-4b-it-GGUF:Q4_K_M        # médical généraliste (Google)
```

## Sécurité et confidentialité
- Coffre AES-256-GCM, clé PBKDF2-SHA-256 (310 000 itérations), IndexedDB. Aucune donnée en clair.
- Verrouillage automatique après 10 min en arrière-plan ; délai croissant après 5 codes faux.
- Seule la question est envoyée à l'IA ; le contexte glycémique anonymisé seulement sur autorisation.
- Migration automatique des données de l'ancienne version (en clair) vers le coffre, puis effacement.
- En-têtes de sécurité (CSP, Permissions-Policy) dans `vercel.json`.

## Sources
Nightscout (cgm-remote-monitor) · OpenAPS oref0 · Open Food Facts · Diabetica (WaltonFuture, MIT) · MedGemma 1.5 (Google) · Battelino et al., Diabetes Care 2019 · Bergenstal et al., Diabetes Care 2018 · ADA Standards of Care 2026.

## Stack
HTML single-file · XHR · Web Crypto · IndexedDB · Web Speech · BarcodeDetector / Quagga2

## Auteur
**Nicolas Julienne** — [Studio Niko Design](https://github.com/Nikoju1977)
