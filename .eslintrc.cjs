/**
 * ESLint 配置：项目使用 TypeScript + CommonJS，检查源代码但不改变构建配置。
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  env: {
    es2020: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    // 当前项目大量使用 any 处理跨平台命令输出，暂不将其作为阻断项。
    '@typescript-eslint/no-explicit-any': 'off',
    // 订阅回调与同步兼容实现保留动态函数和 require，以兼容 CommonJS API。
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    // 类型检查由 tsc 负责，避免 ESLint 与 TypeScript 编译器重复诊断。
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }]
  },
  ignorePatterns: ['dist/', 'coverage/']
};
