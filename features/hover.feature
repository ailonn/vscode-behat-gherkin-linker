# SPEC.md §3 — AC-4 : hover dans les 2 sens — step → FQCN / méthode / expression /
# groupes nommés ↔ paramètres ; définition → usages. `@Transform` : parsing et affichage,
# sans évaluation (SPEC.md §4).

Fonctionnalité: Info-bulle (hover) dans les deux sens

  @ac-4
  Scénario: Le survol d'une step affiche la définition (FQCN, méthode, expression, groupes nommés ↔ paramètres) et le survol d'une définition affiche ses usages
    Soit la step `Quand je valide la commande "CMD-2026"` dans `features/commandes.feature` (Gherkin FR, `# language: fr`)
    Et la définition `@When /je valide la commande "(?P<numero>[\w.]+)"/` de la méthode `laCommandeValidee(string $numero)` de `CommandeSteps.php` (FQCN `App\Behat\CommandeSteps`)
    Et la définition `@When je paie la commande :numero` de la méthode `jePaie(string $numero)`, annotée `@Transform App\Behat\Transforms\CommandeNumero`
    Quand je survole la step `Quand je valide la commande "CMD-2026"` dans l'éditeur
    Alors l'info-bulle affiche le FQCN `App\Behat\CommandeSteps`
    Et l'info-bulle affiche la méthode `laCommandeValidee`
    Et l'info-bulle affiche l'expression `/je valide la commande "(?P<numero>[\w.]+)"/`
    Et l'info-bulle affiche la correspondance groupe nommé ↔ paramètre : `numero` → `$numero`
    Et le type de mot-clé de la step y figure comme métadonnée d'affichage, sans effet sur la résolution
    Quand je survole l'annotation `@When /je valide la commande "(?P<numero>[\w.]+)"/` dans `CommandeSteps.php`
    Alors l'info-bulle affiche les usages de la définition : la step `je valide la commande "CMD-2026"` de `features/commandes.feature`
    Et l'info-bulle ne liste aucun autre usage
    Quand je survole l'annotation `@Transform App\Behat\Transforms\CommandeNumero` dans `CommandeSteps.php`
    Alors l'info-bulle affiche le FQCN du transform `App\Behat\Transforms\CommandeNumero`
    Et le transform est affiché sans être évalué (v0 : parsing et affichage seulement)
    Et l'annotation `@Transform` n'est pas traitée comme une définition de step (ni orpheline, ni doublon dans les diagnostics)
