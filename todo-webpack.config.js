let path = require('path');

module.exports = {
  entry: './todo.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'todo.bundle.js',
  },
};
