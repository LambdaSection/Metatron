# Metatron — AI Code Debugger & Learning Tutor

Metatron analyse le code généré (ou non) par IA, **explique chaque erreur en français**,
mémorise tes erreurs récurrentes et t'aide à ne plus les refaire.

## Pourquoi

Le code écrit avec l'aide de l'IA accumule des vulnérabilités à chaque itération sans
revue humaine. Les scanners classiques listent des problèmes — Metatron, lui, **te forme** :
chaque erreur détectée devient une leçon (quoi, pourquoi c'est dangereux, exemple avant/après),
suivie dans le temps, avec détection de régression quand une erreur « corrigée » revient.

## Installation

```bash
npm install -g metatron   # après publication
# ou depuis une copie locale :
git clone https://github.com/LambdaSection/Metatron && cd Metatron && npm link
```

Prérequis : Node.js ≥ 18. Aucune clé API requise pour l'analyse statique.

## Utilisation

```bash
# Analyser toute la codebase + session tuteur interactive
metatron learn .

# Scan statique seul (exit code 1 si findings critiques)
metatron analyze src/

# Exécuter un fichier en sandbox avec timeout
metatron run script.js --timeout=5000

# Tableau de bord : erreurs récurrentes, corrigées, régressions
metatron progress

# Carte HTML cliquable des points d'erreur
metatron map --out=carte.html
```

### Couche LLM optionnelle

Avec une clé API dans l'environnement (`GROK_API_KEY`, `GROQ_API_KEY`,
`CLAUDE_API_KEY` ou `OLLAMA_MODEL`), `learn` ouvre un **tuteur conversationnel**
qui répond à tes questions sur ton code, et `analyze --review` ajoute une revue
sémantique au-delà des règles statiques.

```bash
metatron analyze src/ --review
```

## Ce que détecte l'analyse statique

21 règles ciblant les pièges typiques du code IA : secrets codés en dur, injection
SQL/commande, `eval`, bypass TLS, CORS sauvage, `Math.random()` en contexte sécurité,
catch vides, boucles infinies, promesses non attendues… Chaque règle a sa leçon
intégrée en français.

## Mémoire d'apprentissage

Chaque scan met à jour `.metatron/memory.json` (local, gitignorable) :

| Statut | Signification |
|--------|---------------|
| 🆕 Nouveau | première occurrence |
| 👀 Déjà vu | toujours présente |
| 🔁 Récurrent | vue 3 fois ou plus |
| 🚨 Régression | corrigée puis revenue |
| ✅ Corrigée | disparue lors d'un scan couvrant son fichier |

## Roadmap

### v2.0 — Pivot debugger/tuteur ✅
- [x] Moteur statique 21 règles + check syntaxe
- [x] Exécution sandboxée avec capture d'erreurs structurées
- [x] Lexique pédagogique FR (une leçon par règle)
- [x] Mémoire projet : new / known / recurring / regression / fixed
- [x] Tuteur interactif (browse + Q&A LLM)
- [x] Carte HTML cliquable (sévérité, récurrence, régressions)
- [x] Scan récursif codebase + CLI global (`npm link`)

### v2.1
- [ ] Revue LLM enrichissant le lexique pour erreurs hors règles
- [ ] Génération de tests exécutables (`gentest`) stabilisée
- [ ] Mode watch : rescan à chaque sauvegarde de fichier
- [ ] Publication npm + CI GitHub Actions

### v2.2+
- [ ] Support TypeScript / Python
- [ ] Intégration hook pre-commit
- [ ] Historique de progression par développeur

## Positionnement

Metatron n'est **pas** un scanner de sécurité ni un garant de qualité :
les règles sont heuristiques et la VERIFICATION générée par LLM reste un
conseil, pas une preuve. Relis et teste toujours ton code.

## License

Voir [LICENSE](LICENSE).
