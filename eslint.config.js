const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', '.superpowers/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    rules: {
      // Apps Script comparte un solo ámbito global entre archivos: las funciones
      // de un archivo se usan desde otros, así que no-undef/no-unused-vars globales
      // darían falsos positivos.
      'no-undef': 'off',
      'no-unused-vars': ['error', { vars: 'local', args: 'after-used' }],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['tests/ui/stub.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
