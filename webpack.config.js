const path = require('path');

module.exports = {
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'j-queue-sdk-web.js',
    library: 'ConnectionJQueueSdkWeb',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  mode: 'production',
  target: 'web',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  devtool: 'source-map'
};