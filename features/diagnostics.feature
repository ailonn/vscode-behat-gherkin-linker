# SPEC.md §3 — AC-3 : undefined (error) · orpheline (info) · doublon (warning — pattern
# strictement identique, sémantique `AmbiguousMatchException` de Behat — `RedundantStepException` en 3.x).

Fonctionnalité: Diagnostics de l'indexation

  @ac-3
  Scénario: Les diagnostics distinguent undefined (error), orpheline (info) et doublon (warning, pattern strictement identique)
    Soit `features/commandes.feature` (Gherkin FR, `# language: fr`) contient la step `Quand je demande le remboursement "CMD-2026"`
    Et `features/commandes.feature` contient la step `Quand je valide la commande "CMD-2026"`
    Et `CommandeSteps.php` contient les définitions :
      | méthode | annotation | expression |
      | `valideA` | `@When` | `/je valide la commande "(?P<numero>[\w.]+)"/` |
      | `valideB` | `@When` | `/je valide la commande "(?P<numero>[\w.]+)"/` |
      | `valideC` | `@When` | `/je valide la commande "(?P<numero>[\w-]+)"/` |
      | `valideD` | `@Then` | `/je valide la commande "(?P<numero>[\w.]+)"/` |
      | `jeSuisLeClient` | `@Given` | `/je suis le client "(?P<login>[\w.]+)"/` |
    Quand l'extension publie les diagnostics du workspace
    Alors la step `Quand je demande le remboursement "CMD-2026"` porte un diagnostic de niveau error (step undefined)
    Et la définition `@Given /je suis le client "(?P<login>[\w.]+)"/` porte un diagnostic de niveau info (définition orpheline)
    Et le pattern strictement identique `/je valide la commande "(?P<numero>[\w.]+)"/`, déclaré 3 fois (`valideA` et `valideB` en `@When`, `valideD` en `@Then`), porte un diagnostic de niveau warning (doublon)
    Et le doublon ne dépend pas du type d'annotation : `valideA` (`@When`) et `valideD` (`@Then`) sur le même pattern strictement identique sont en doublon, comme au runtime Behat
    Et la définition `valideC`, dont le pattern `/je valide la commande "(?P<numero>[\w-]+)"/` n'est pas strictement identique, ne porte aucun diagnostic de doublon
    Et la step `Quand je valide la commande "CMD-2026"` ne porte aucun diagnostic d'undefined
