const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'popup.html', to: 'popup.html' },
        { 
          from: 'manifest.json', 
          to: 'manifest.json',
          transform(content) {
            // Fix the manifest to point to the correct file paths (remove "dist/" prefix)
            const manifest = JSON.parse(content.toString());
            manifest.content_scripts[0].js = ['content.js'];
            manifest.background.service_worker = 'background.js';
            return JSON.stringify(manifest, null, 2);
          }
        },
        { from: 'icons', to: 'icons' }
      ]
    })
  ]
}; 