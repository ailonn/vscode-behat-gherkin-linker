# SPEC.md §3 — AC-6 : tous les dialectes Gherkin officiels via l'export `dialects` de
# @cucumber/gherkin (zéro mot-clé codé en dur), en-tête `# language:` inclus, guillemets
# doubles conservés, Plan du scénario : interpolation des lignes Examples avant matching.
# Testé par échantillon : FR + EN + un troisième dialecte (DE).

Fonctionnalité: Dialectes Gherkin officiels

  @ac-6
  Scénario: FR, EN et DE sont indexés et résolus — en-tête `# language:`, défaut EN sans en-tête, guillemets doubles conservés, Plan du scénario interpolé avant matching
    Soit un workspace avec 4 paires feature/définition :
      | dialecte | feature (en-tête) | step (guillemets doubles) | définition PHP |
      | FR | `commandes_fr.feature` (`# language: fr`) | `Soit je suis "marie.dupont"` | `@Given /je suis "(?P<login>[\w.]+)"/` |
      | EN | `orders_en.feature` (`# language: en`) | `Given I am "marie.dupont"` | `@Given /I am "(?P<login>[\w.]+)"/` |
      | EN sans en-tête | `orders_default_en.feature` (aucun en-tête) | `Given I pay for "CMD-3000"` | `@Given /I pay for "(?P<numero>[\w-]+)"/` |
      | DE | `bestellungen_de.feature` (`# language: de`) | `Angenommen ich bin "marie.dupont"` | `@Given /ich bin "(?P<login>[\w.]+)"/` |
    Quand l'extension indexe le workspace
    Alors les 3 features sont parsées sans diagnostic « Gherkin non analysable »
    Et la step FR `Soit je suis "marie.dupont"` se résout à la définition `@Given /je suis "(?P<login>[\w.]+)"/`
    Et la step EN `Given I am "marie.dupont"` se résout à la définition `@Given /I am "(?P<login>[\w.]+)"/`
    Et la step DE `Angenommen ich bin "marie.dupont"` se résout à la définition `@Given /ich bin "(?P<login>[\w.]+)"/`
    Et la feature sans en-tête `orders_default_en.feature` est parsée en anglais (défaut officiel du parser) et sa step `Given I pay for "CMD-3000"` se résout à la définition `@Given /I pay for "(?P<numero>[\w-]+)"/`
    Et les guillemets doubles sont conservés dans le texte des steps indexées
    Et `orders_en.feature` contient de plus :
      """
      Scenario Outline: Validate an order
        When I validate order "<order>"
        Examples:
          | order  |
          | CMD-1  |
          | CMD-2  |
      """
    Et la définition `@When /I validate order "(?P<order>[\w-]+)"/`
    Quand l'extension indexe `orders_en.feature`
    Alors le Plan du scénario produit exactement 2 steps interpolées avant matching : `I validate order "CMD-1"` et `I validate order "CMD-2"`
    Et aucune step indexée ne porte le placeholder `<order>` non résolu
    Et les 2 steps interpolées se résolvent à la définition `@When /I validate order "(?P<order>[\w-]+)"/`
