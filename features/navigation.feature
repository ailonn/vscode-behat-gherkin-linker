# SPEC.md §3 — AC-1 (feature → définition) + AC-2 (définition → usages).
# Mini-projet fictif partagé : `features/commandes.feature` (Gherkin FR, `# language: fr`)
# et `CommandeSteps.php` (docblocks `@Given` / `@When` / `@Then`, groupes nommés `(?P<…>)`,
# `:param`, `@Transform`).

Fonctionnalité: Navigation entre steps Gherkin et définitions PHP

  @ac-1
  Scénario: Une step se résout à sa définition PHP (regex non ancrée, :param ancrée, sans filtre de type)
    Soit `features/commandes.feature` :
      """
      # language: fr
      Fonctionnalité: Passer une commande

        Scénario: Valider une commande
          Soit je suis "marie.dupont"
          Quand je valide la commande "CMD-2026" avec succès
          Alors la commande "CMD-2026" est valide

        Scénario: Payer une commande
          Soit la commande "CMD-1111" est valide
          Quand je paie la commande "CMD-1111"
      """
    Et `CommandeSteps.php` :
      """
      <?php

      namespace App\Behat;

      class CommandeSteps
      {
          /**
           * @Given /je suis "(?P<login>[\w.]+)"/
           */
          public function jeSuis(string $login)
          {
          }

          /**
           * @When /je valide la commande "(?P<numero>[\w.]+)"/
           * @Then /la commande "(?P<numero>[\w.]+)" est valide/
           */
          public function laCommandeValidee(string $numero)
          {
          }

          /**
           * @When je paie la commande :numero
           * @Transform App\Behat\Transforms\CommandeNumero
           */
          public function jePaie(string $numero)
          {
          }
      }
      """
    Quand je demande la définition de la step `Soit je suis "marie.dupont"`
    Alors l'extension résout la step à la méthode `jeSuis` de la classe `App\Behat\CommandeSteps` (`CommandeSteps.php`)
    Quand je demande la définition de la step `Quand je valide la commande "CMD-2026" avec succès`
    Alors l'extension résout la step à la méthode `laCommandeValidee` par match non ancré (sémantique `preg_match`) : le pattern `/je valide la commande "(?P<numero>[\w.]+)"/` est trouvé en sous-chaîne, alors qu'un ancrage ^…$ échouerait sur le suffixe ` avec succès`
    Quand je demande la définition de la step `Quand je paie la commande "CMD-1111"`
    Alors l'extension résout la step à la méthode `jePaie` : l'expression `:param` est ancrée ^…$ avec les drapeaux `iu`, `:numero` étant remplacé par le token officiel Behat (chaîne citée, mot ou nombre)
    Quand je demande la définition de la step `Soit la commande "CMD-1111" est valide`
    Alors l'extension résout la step à la définition `@Then /la commande "(?P<numero>[\w.]+)" est valide/`
    Et le type de mot-clé n'entre pas dans le matching : la step `Soit` se résout à une définition `@Then`, comme le runtime Behat

  @ac-2
  Scénario: Une définition PHP résout l'ensemble des steps et features qui correspondent (méthode à 2 annotations = 2 définitions)
    Soit `CommandeSteps.php` (FQCN `App\Behat\CommandeSteps`) dont la méthode `laCommandeValidee(string $numero)` porte 2 annotations :
      | annotation | expression |
      | `@When` | `/je valide la commande "(?P<numero>[\w.]+)"/` |
      | `@Then` | `/la commande "(?P<numero>[\w.]+)" est valide/` |
    Et `features/commandes.feature` (Gherkin FR, `# language: fr`) contient les steps `Quand je valide la commande "CMD-2026"` et `Alors la commande "CMD-2026" est valide`
    Et `features/paiements.feature` (Gherkin FR, `# language: fr`) contient la step `Quand je valide la commande "CMD-9999"`
    Quand je demande les usages de la méthode `laCommandeValidee`
    Alors l'extension indexe la méthode comme 2 définitions (une par annotation, même FQCN `App\Behat\CommandeSteps`)
    Et la définition `@When` est utilisée par 2 steps : `je valide la commande "CMD-2026"` dans `commandes.feature` et `je valide la commande "CMD-9999"` dans `paiements.feature`
    Et la définition `@Then` est utilisée par 1 step : `la commande "CMD-2026" est valide` dans `commandes.feature`
    Et aucune autre step du workspace n'est rapportée en usage
