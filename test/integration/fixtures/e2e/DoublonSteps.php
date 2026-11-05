<?php

namespace App\Behat;

class DoublonSteps
{
    /**
     * @When /je double la commande "(?P<numero>[\w-]+)"/
     */
    public function premiere(string $numero)
    {
    }

    /**
     * @When /je double la commande "(?P<numero>[\w-]+)"/
     */
    public function seconde(string $numero)
    {
    }
}
