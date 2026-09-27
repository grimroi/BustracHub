// frontend/babel.config.cjs
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: 'commonjs',
      },
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
      },
    ],
    // Clean string notation lang - huwag magpasa ng isTSX/allExtensions options
    '@babel/preset-typescript',
  ],
  plugins: [
    '@babel/plugin-syntax-jsx',
    'babel-plugin-transform-vite-meta-env',
    'babel-plugin-transform-import-meta',
  ],
};