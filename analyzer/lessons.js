/**
 * Lexique pédagogique — une leçon par règle d'analyse statique.
 * Contenu en français, orienté apprentissage : pourquoi c'est un problème,
 * exemple fautif, exemple corrigé, référence externe.
 */
export const LESSONS = {
  EVAL_USAGE: {
    category: 'Sécurité',
    explanation: "eval() exécute une chaîne de caractères comme du code JavaScript. Si cette chaîne contient ne serait-ce qu'un fragment venu de l'extérieur (input utilisateur, API, fichier), un attaquant peut exécuter n'importe quoi dans ton programme.",
    why: 'C’est l’équivalent de laisser la clé de la maison sous le paillasson, mais pour tout ton process Node.',
    badExample: "const result = eval('(' + userInput + ')');",
    goodExample: "const data = JSON.parse(userInput); // ou une logique explicite selon le besoin",
    reference: 'MDN: https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/eval — « Ne jamais utiliser eval »'
  },
  NEW_FUNCTION: {
    category: 'Sécurité',
    explanation: "new Function('corps') compile une chaîne en fonction exécutable : c'est un eval déguisé. Les modèles de langage l'utilisent parfois pour du « code dynamique », mais le risque est identique.",
    why: 'Même surface d’attaque que eval(), avec en plus un coût de compilation à l’exécution.',
    badExample: "const add = new Function('a', 'b', 'return a + b');",
    goodExample: "const add = (a, b) => a + b;",
    reference: 'OWASP A03:2021 — Injection'
  },
  EXEC_INJECTION: {
    category: 'Sécurité',
    explanation: "Construire une commande shell par interpolation (exec(`ls ${dir}`)) permet à une entrée malveillante d'ajouter ses propres commandes : `; rm -rf /` devient exécutable.",
    why: 'Injection de commande = compromission totale de la machine, pas juste de l’app.',
    badExample: "exec(`convert ${file} out.png`);",
    goodExample: "execFile('convert', [file, 'out.png']); // arguments passés séparément, jamais interprétés par le shell",
    reference: 'OWASP A03:2021 — Injection ; CWE-78'
  },
  HARDCODED_SECRET: {
    category: 'Sécurité',
    explanation: "Une clé API, un mot de passe ou un token écrit directement dans le code finit tôt ou tard dans Git, visible par toute personne (ou bot) ayant accès au dépôt. L'historique garde tout, même après suppression.",
    why: 'Les bots scannent GitHub en continu pour voler les clés exposées — souvent en moins d’une heure.',
    badExample: "const config = { password: 'SuperSecret123' };",
    goodExample: "const config = { password: process.env.APP_PASSWORD };",
    reference: 'OWASP A07:2021 — Identification et authentification défaillantes'
  },
  AWS_ACCESS_KEY: {
    category: 'Sécurité',
    explanation: "Ce format AKIA... est une clé d'accès AWS littérale. Exposée, elle donne potentiellement accès à tes serveurs, ta facture et tes données.",
    why: 'C’est l’une des fuites les plus coûteuses : des cryptominers parcourent les repos à la recherche de ces clés.',
    badExample: "// key: AKIAIOSFODNN7EXAMPLE",
    goodExample: "// Utiliser des rôles IAM ou des variables d'environnement, jamais de clé en dur.",
    reference: 'AWS — Bonnes pratiques IAM'
  },
  GITHUB_TOKEN: {
    category: 'Sécurité',
    explanation: "Token GitHub personnel écrit en clair dans le code. Il permet de lire/écrire dans tes dépôts selon ses permissions.",
    why: 'Un token ghp_ exposé = prise de contrôle possible de tes repos et de tes secrets CI.',
    badExample: "const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';",
    goodExample: "const token = process.env.GITHUB_TOKEN;",
    reference: 'GitHub Docs — Secret scanning'
  },
  OPENAI_KEY: {
    category: 'Sécurité',
    explanation: "Clé API de type OpenAI écrite en dur. Toute personne qui voit ce code peut consommer ton quota à tes frais.",
    why: 'Les clés sk- sont parmi les plus recherchées par les scrapers automatisés.',
    badExample: "const openai = new OpenAI({ apiKey: 'sk-proj-xxxx...' });",
    goodExample: "const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });",
    reference: 'OWASP A07:2021'
  },
  TLS_BYPASS: {
    category: 'Sécurité',
    explanation: "rejectUnauthorized: false désactive la vérification du certificat SSL. Ton application accepte alors n'importe quel certificat, y compris un faux posé par un attaquant sur le réseau.",
    why: 'Souvent ajouté « juste pour faire marcher le dev », puis oublié en production.',
    badExample: "https.get(url, { rejectUnauthorized: false }, cb);",
    goodExample: "https.get(url, cb); // et corrige la chaîne de certificats si elle pose problème",
    reference: 'CWE-295 — Validation incorrecte du certificat'
  },
  SQL_CONCAT: {
    category: 'Sécurité',
    explanation: "Assembler une requête SQL par concaténation ('SELECT ... WHERE id = ' + input) permet à l'utilisateur d'injecter son propre SQL : lire d'autres tables, contourner l'authentification, détruire des données.",
    why: 'C’est LA faille classique, toujours n°1 des vulnérabilités critiques en production.',
    badExample: "db.query(\"SELECT * FROM users WHERE name = '\" + name + \"'\");",
    goodExample: "db.query('SELECT * FROM users WHERE name = ?', [name]); // requête paramétrée",
    reference: 'OWASP A03:2021 ; CWE-89 ; bobby-tables.com'
  },
  WEAK_RANDOM_AUTH: {
    category: 'Sécurité',
    explanation: "Math.random() n'est PAS cryptographiquement sûr : ses sorties sont prévisibles si on observe quelques résultats. Un token généré ainsi peut être deviné par un attaquant.",
    why: 'La prévisibilité rend les sessions, tokens de réinitialisation et nonces falsifiables.',
    badExample: "const sessionToken = Math.random().toString(36);",
    goodExample: "import crypto from 'node:crypto';\nconst sessionToken = crypto.randomBytes(32).toString('hex');",
    reference: 'MDN — Math.random() : « ne doit pas être utilisé à des fins de sécurité » ; CWE-338'
  },
  INNERHTML_ASSIGN: {
    category: 'Sécurité',
    explanation: "Écrire dans innerHTML (ou document.write) avec des données non filtrées permet d'injecter du HTML/script : c'est la faille XSS. Le script s'exécute dans le navigateur de la victime.",
    why: 'XSS = vol de sessions, défacement, redirection phishing — dans le navigateur de tes utilisateurs.',
    badExample: "container.innerHTML = userComment;",
    goodExample: "container.textContent = userComment; // ou DOMPurify.sanitize(html)",
    reference: 'OWASP A03:2021 ; MDN — XSS'
  },
  EMPTY_CATCH: {
    category: 'Fiabilité',
    explanation: "Un bloc catch vide avale l'erreur silencieusement : le programme continue dans un état incohérent sans aucune trace. Tu découvriras le problème des semaines plus tard, sans indice.",
    why: 'Le debug le plus cher est celui où l’erreur a été volontairement cachée.',
    badExample: "try { save(data); } catch (e) {}",
    goodExample: "try { save(data); } catch (err) { logger.error('save failed', { err }); throw err; }",
    reference: 'CWE-755 — Traitement inapproprié des conditions exceptionnelles'
  },
  CORS_WILDCARD: {
    category: 'Sécurité',
    explanation: "Access-Control-Allow-Origin: '*' autorise N'IMPORTE QUEL site web à faire des requêtes vers ton API depuis le navigateur d'un utilisateur, et lire les réponses.",
    why: 'Combiné à des cookies, cela permet à un site malveillant d’agir au nom de tes utilisateurs.',
    badExample: "res.setHeader('Access-Control-Allow-Origin', '*');",
    goodExample: "res.setHeader('Access-Control-Allow-Origin', 'https://monapp.example');",
    reference: 'OWASP — Cross-Origin Resource Sharing misconfiguré ; MDN — CORS'
  },
  LOCALSTORAGE_AUTH: {
    category: 'Sécurité',
    explanation: "localStorage est lisible par tout JavaScript de la page. Y stocker un JWT ou token signifie qu'une seule faille XSS suffit à voler la session de l'utilisateur.",
    why: 'httpOnly cookies empêchent le JS de lire le token — XSS ne suffit plus à voler la session.',
    badExample: "localStorage.setItem('jwt', token);",
    goodExample: "// Cookie httpOnly + Secure + SameSide=Strict posé côté serveur",
    reference: 'OWASP — Stockage de session côté client ; MDN — Web Storage API'
  },
  INSECURE_HTTP_URL: {
    category: 'Sécurité',
    explanation: "Une URL http:// transite en clair : contenu lisible et modifiable par n'importe qui sur le réseau (proxy, wifi public, FAI).",
    why: 'Un simple MITM peut injecter du code dans ce que tu télécharges.',
    badExample: "await fetch('http://api.example.com/data');",
    goodExample: "await fetch('https://api.example.com/data');",
    reference: 'RFC 9110 ; Let’s Encrypt (TLS gratuit)'
  },
  WHILE_TRUE_NO_EXIT: {
    category: 'Fiabilité',
    explanation: "Une boucle while(true) doit avoir une condition de sortie garantie sur TOUS les chemins (break, return, throw). Sinon : freeze du processus, timeout, crash.",
    why: 'Les IA génèrent souvent des boucles de polling/traitement dont la sortie dépend d’un cas non prévu.',
    badExample: "while (true) { process(queue[0]); }",
    goodExample: "while (queue.length > 0) { process(queue.shift()); }",
    reference: 'CWE-835 — Boucle avec condition de sortie inaccessible'
  },
  UNAWAITED_FETCH: {
    category: 'Fiabilité',
    explanation: "Un fetch() sans await est « fire-and-forget » : si la requête échoue, l'erreur devient une UnhandledPromiseRejection qui peut crasher le process (Node ≥15) ou passer inaperçue.",
    why: 'Le bug typique généré par IA : ça « marche » en local, puis erreur réseau aléatoire inexplicable.',
    badExample: "fetch(url); sendResponse();",
    goodExample: "const res = await fetch(url);\nif (!res.ok) throw new Error(`HTTP ${res.status}`);",
    reference: 'MDN — async/await ; Node — unhandled rejections'
  },
  LOOSE_EQUALITY: {
    category: 'Qualité',
    explanation: "== compare en convertissant les types : '0' == 0 est vrai, null == undefined est vrai, [] == false aussi. Ces conversions implicites créent des bugs difficiles à voir.",
    why: 'Règle la plus simple à appliquer pour éliminer une famille entière de bugs subtils.',
    badExample: "if (userId == adminId) { grantAccess(); }",
    goodExample: "if (userId === adminId) { grantAccess(); }",
    reference: 'MDN — Égalité faible vs stricte'
  },
  VAR_DECLARATION: {
    category: 'Qualité',
    explanation: "var est scoppé à la FONCTION (pas au bloc) et sujet au hoisting : accessible avant sa déclaration. Dans les boucles et callbacks, cela provoque des captures de valeur inattendues.",
    why: 'let/const éliminent ces pièges par conception.',
    badExample: "for (var i = 0; i < 3; i++) setTimeout(() => console.log(i)); // 3, 3, 3",
    goodExample: "for (let i = 0; i < 3; i++) setTimeout(() => console.log(i)); // 0, 1, 2",
    reference: 'MDN — var vs let'
  },
  DEBUG_LEFTOVER: {
    category: 'Qualité',
    explanation: "console.log oublié : bruit dans les logs de production, fuite potentielle de données sensibles affichées, et signal d'un debug non terminé.",
    why: 'Les logs propres sont ceux qu’on peut relire ; chaque log parasite coûte du temps à l’équipe.',
    badExample: "function login(u, p) { console.log('login', u, p); ... }",
    goodExample: "// Utiliser une lib de logging niveaux (debug/info/error) et retirer les traces temporaires",
    reference: '12 Factor App — Logs as event streams'
  },
  TODO_MARKERS: {
    category: 'Process',
    explanation: "Les modèles de langage laissent souvent des TODO/FIXME comme promesses non tenues : validation manquante, cas d'erreur non géré, valeur en dur temporaire.",
    why: 'Chaque TODO est une bombe à retardement dans une zone que l’IA n’a pas fini de penser.',
    badExample: "// TODO: validate input later\nexport function transfer(from, to, amount) { ... }",
    goodExample: "// Soit implémenter la validation maintenant, soit créer une issue tracée et refuser le cas non validé",
    reference: 'CWE-546 — Code suspect/commenté'
  }
};

/**
 * Retourne la leçon associée à une règle, ou une leçon générique.
 * @param {string} ruleId
 */
export function getLesson(ruleId) {
  return LESSONS[ruleId] || {
    category: 'Général',
    explanation: `Problème détecté par la règle ${ruleId}. Consulte le conseil associé.`,
    why: '',
    badExample: '',
    goodExample: '',
    reference: ''
  };
}
