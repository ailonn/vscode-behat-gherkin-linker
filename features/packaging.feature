# SPEC.md §3 — AC-8 : packaging `vsce` + settings `gherkinBehat.enabled` /
# `gherkinBehat.features` / `gherkinBehat.steps` / `gherkinBehat.orphans`.
# AC-7 (« tests verts en CI ») est un critère méta (SPEC.md §7) : pas de feature dédiée.

Fonctionnalité: Packaging et configuration

  @ac-8
  Scénario: L'extension se pack avec vsce et les 4 settings pilotent enabled, features, steps et orphelines
    Soit le dépôt de l'extension en état d'être packé
    Quand je lance `npx vsce pack` sur le dépôt
    Alors un fichier `.vsix` est produit sans erreur
    Et l'installation de ce `.vsix` dans une instance VS Code active l'extension
    Soit le mini-projet fictif ouvert avec les settings par défaut : `features/commandes.feature` (Gherkin FR, `# language: fr`) + `CommandeSteps.php`, dont 1 définition orpheline `@Given /je suis le client "(?P<login>[\w.]+)"/` et 1 définition qui correspond à la step `Quand je valide la commande "CMD-2026"`
    Alors `commandes.feature` est indexée sans configuration (défaut du glob `gherkinBehat.features` : `**/*.feature`)
    Et `CommandeSteps.php` est indexé sans configuration (défaut du glob `gherkinBehat.steps` : `**/*.php`)
    Et la définition orpheline porte un diagnostic de niveau info sans configuration (défaut `gherkinBehat.orphans` : `true`)
    Quand le setting `gherkinBehat.orphans` est configuré pour ne plus émettre les orphelines
    Alors le diagnostic de niveau info que portait la définition orpheline n'est plus émis
    Et aucun diagnostic de niveau error ni warning n'apparaît
    Soit le même mini-projet dont le glob `gherkinBehat.features` ne couvre plus `commandes.feature`
    Alors la step `Quand je valide la commande "CMD-2026"` n'est plus indexée ni navigable
    Soit le mini-projet fictif restauré (settings par défaut) dont le glob `gherkinBehat.steps` ne couvre plus `CommandeSteps.php`
    Alors les définitions de `CommandeSteps.php` ne sont plus indexées
    Et la step `Quand je valide la commande "CMD-2026"` est undefined (diagnostic error)
    Soit le mini-projet fictif restauré (settings par défaut) dont le setting `gherkinBehat.enabled` est `false`
    Alors aucun fichier n'est lu, aucun diagnostic n'est émis et la navigation ne résout rien (off-switch)
    Soit le setting `gherkinBehat.enabled` restauré à `true`
    Alors les diagnostics de référence sont de nouveau émis
