import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // src/components/ui/** is shadcn scaffolding: generated vendor-style code
  // the user never wrote. Linting it trips the platform's build gate on
  // noise (e.g. no-explicit-any in newly added shadcn components) and feeds
  // an AI "fix" loop against code that shouldn't change — every retry
  // billed. Ignore it wholesale; the user's own code stays fully linted.
  { ignores: ["dist", "src/components/ui/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // 浏览器差异只能写在平台层：业务代码里散落的 Pointer Lock 调用、<a download>
  // 赋值和 pointer:coarse 字面量，每兼容一种机型就要再加一处判断，必须拦住。
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/platform/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='requestPointerLock']",
          message: "指针锁定请使用 @/lib/platform 的 tryPointerLock()。",
        },
        {
          selector: "CallExpression[callee.property.name='exitPointerLock']",
          message: "指针锁定请使用 @/lib/platform 的 releasePointerLock()。",
        },
        {
          selector: "AssignmentExpression[left.property.name='download']",
          message: "下载请使用 @/lib/platform 的 saveFile()。",
        },
        {
          selector: "Literal[value=/pointer:\\s?coarse/]",
          message: "触屏判断请使用 @/lib/platform 的 isCoarsePointer()。",
        },
        {
          selector: "TemplateElement[value.raw=/pointer:\\s?coarse/]",
          message: "触屏判断请使用 @/lib/platform 的 isCoarsePointer()。",
        },
      ],
    },
  }
);
