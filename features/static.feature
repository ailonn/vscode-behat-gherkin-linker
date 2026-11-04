# SPEC.md §3 — AC-5 : statique, zéro PHP, zéro CLI. SPEC.md §5 : les globs de features et
# de steps excluent `vendor/` et `node_modules/`.

Fonctionnalité: Statique — sans environnement PHP

  @ac-5
  Scénario: L'indexation et la navigation fonctionnent sans environnement PHP, et le dossier vendor/ est exclu des globs
    Soit un workspace sans environnement PHP (ni interpréteur, ni `composer`)
    Et le mini-projet fictif : `features/commandes.feature` (Gherkin FR, `# language: fr`) et `CommandeSteps.php` (docblocks `@Given` / `@When` / `@Then`)
    Et un dossier `vendor/` contenant le fichier leurre `vendor/legacy.feature`
    Et un dossier `node_modules/` contenant le fichier leurre `node_modules/package/steps.feature`
    Quand l'extension est activée sur ce workspace
    Alors les steps de `commandes.feature` et les définitions de `CommandeSteps.php` sont indexées par simple lecture statique des fichiers, sans exécuter de PHP
    Et les fichiers leurre `vendor/legacy.feature` et `node_modules/package/steps.feature` ne sont pas indexés (les globs de features et de steps excluent `vendor/` et `node_modules/`)
    Et la navigation step → définition résout `Quand je valide la commande "CMD-2026"` vers la méthode `laCommandeValidee`
    Et la navigation définition → usages résout la méthode `laCommandeValidee` vers sa step
    Et aucun diagnostic ne signale d'environnement PHP manquant
