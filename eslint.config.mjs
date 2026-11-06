import tseslint from "typescript-eslint";

export default [{
  ignores: ["**/node_modules/**", "**/dist/**", "coverage/**", "test-results/**", "docs/profile/**"],
}, {
  files: ["{client,server,shared}/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
  },
  plugins: { "@typescript-eslint": tseslint.plugin },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-explicit-any": "error",
  },
}];
