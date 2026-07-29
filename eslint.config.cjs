"use strict";

const js = require("@eslint/js");
const globals = require("globals");

const sharedRules = {
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_"
    }
  ]
};

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**", "playwright-report/**", "test-results/**", ".tmp-*/**"]
  },
  {
    ...js.configs.recommended,
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    ...js.configs.recommended,
    files: ["service-worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.serviceworker
    },
    rules: sharedRules
  },
  {
    ...js.configs.recommended,
    files: ["tests/**/*.js", "eslint.config.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: sharedRules
  }
];
