<?php

namespace App\Behat;

class OrderSteps
{
    /**
     * @Given /I am "(?P<login>[\w.]+)"/
     */
    public function iAm(string $login)
    {
    }

    /**
     * @Given /I pay for "(?P<numero>[\w-]+)"/
     */
    public function iPayFor(string $numero)
    {
    }

    /**
     * @When /I validate order "(?P<order>[\w-]+)"/
     */
    public function iValidateOrder(string $order)
    {
    }
}
