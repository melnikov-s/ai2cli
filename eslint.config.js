export default [
  {
    ignores: ["node_modules/", ".git/"],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
    files: ["**/*.js"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-console": "off",
      semi: ["warn", "always"],
      eqeqeq: "error",
      "no-trailing-spaces": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-duplicate-imports": "error",
      "no-useless-rename": "error",
      "no-undef": "error",
      "no-multiple-empty-lines": ["warn", { max: 1 }],
      "object-curly-spacing": ["warn", "always"],
    },
  },
];
