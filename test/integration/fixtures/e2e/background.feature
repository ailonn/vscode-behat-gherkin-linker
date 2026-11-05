# language: en
Feature: Background coverage

  Background:
    Given I am "john.doe"

  Scenario: A step after the background
    When I pay for "CMD-7777"
