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

    /**
     * @Given /je suis le client "(?P<login>[\w.]+)"/
     */
    public function jeSuisLeClient(string $login)
    {
    }
}
