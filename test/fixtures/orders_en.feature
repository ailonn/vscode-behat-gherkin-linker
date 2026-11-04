# language: en
Feature: Place an order

  Scenario: Log in
    Given I am "marie.dupont"

  Scenario Outline: Validate an order
    When I validate order "<order>"
    Examples:
      | order  |
      | CMD-1  |
      | CMD-2  |
