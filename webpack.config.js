let path = require('path');

module.exports = {
  entry: './rxweb.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'rxweb.bundle.js',
  },
};
