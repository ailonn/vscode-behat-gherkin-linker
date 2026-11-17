# language: fr
# SPEC.md §3 — AC-9 : exclusion `gherkinBehat.exclude` — le monorepo : les fichiers
# exclus (features et steps) ne sont ni indexés ni diagnostiqués, le reste de
# l'index est intact ; un changement sur un fichier exclu déclenche un rebuild
# dont le résultat est identique (le watcher est inclusions-only : la négation
# `!` du globPattern FileSystemWatcher n'est pas supportée — trade documenté).

Fonctionnalité: Exclusion des fichiers (monorepo)

  @ac-9
  Scénario: Les fichiers exclus par gherkinBehat.exclude ne sont ni indexés ni diagnostiqués, le reste de l'index est intact, et la restauration ré-indexe
    Soit le mini-projet fictif de référence avec un dossier `legacy/` contenant :
      | fichier | contenu |
      | `legacy/legacy_app.feature` | la step `Quand je demande le remboursement "CMD-7777"` (aucune définition ne correspond — undefined) |
      | `legacy/LegacySteps.php` | la définition `@When /je valide la commande "(?P<numero>[\w.-]+)"/` (pattern strictement identique à celle de `CommandeSteps.php`) |
    Quand le setting `gherkinBehat.exclude` est configuré à `legacy/**` et l'extension reconstruit l'index
    Alors `legacy/legacy_app.feature` n'est pas indexé : la step undefined ne porte aucun diagnostic (le fichier est ignoré, pas signalé)
    Et `legacy/LegacySteps.php` n'est pas indexé : aucune définition n'est lue dans ce fichier
    Et `CommandeSteps.php` ne porte aucun diagnostic de niveau warning (doublon) : sa définition reste la seule indexée sur le pattern `/je valide la commande "(?P<numero>[\w.-]+)"/`
    Et le reste de l'index est intact : les diagnostics de référence (undefined step en error + orpheline en info) sont toujours émis
    Quand un fichier exclu est modifié
    Alors le rebuild déclenché produit un index identique : aucun diagnostic sur le fichier exclu, diagnostics de référence inchangés — la négation `!` du globPattern FileSystemWatcher n'étant pas supportée, l'exclusion s'applique au rebuild et non au watcher (trade documenté)
    Quand le setting `gherkinBehat.exclude` est restauré à vide
    Alors `legacy/legacy_app.feature` est de nouveau indexé : sa step undefined porte un diagnostic de niveau error
    Et `CommandeSteps.php` porte un diagnostic de niveau warning (doublon, pattern strictement identique) : la définition de `legacy/LegacySteps.php` est de nouveau indexée
