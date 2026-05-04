import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import eslintPluginNode from "eslint-plugin-node";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: {
      js: js,
      node: eslintPluginNode,
    },
    extends: ["js/recommended", "plugin:node/recommended", "prettier"],
    rules: {
      "no-console": "warn",
      quotes: ["error", "double"],
      semi: ["error", "always"],
    },
    ignores: ["node_modules/", "dist/", "build/", "coverage/"],
  },
  {
    files: ["**/*.json"],
    languageOptions: {
      parser: json,
    },
    rules: {},
  },
]);
