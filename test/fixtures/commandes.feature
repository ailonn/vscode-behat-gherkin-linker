# language: fr
Fonctionnalité: Passer une commande

  Scénario: Valider une commande
    Soit je suis "marie.dupont"
    Quand je valide la commande "CMD-2026" avec succès
    Alors la commande "CMD-2026" est valide

  Scénario: Payer une commande
    Soit la commande "CMD-1111" est valide
    Quand je paie la commande "CMD-1111"
    Quand je demande le remboursement "CMD-2026"
