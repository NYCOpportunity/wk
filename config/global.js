const pkg = require('../package.json');

let remotes = {
  development: 'http://localhost:7070',
  production: 'https://nycopportunity.github.io/wk',
};

/**
 * Global configuration
 *
 * @type {Object}
 */
module.exports = {
  /**
   * Main project directories
   *
   * @type {String}
   */
  base: process.env.PWD,
  src: 'src',
  dist: (process.env.CONTENT === pkg.cdn.content.drafts)
    ? `dist/${pkg.cdn.content.drafts}` : 'dist',
  baseUrl: (process.env.CONTENT === pkg.cdn.content.drafts)
    ? `${remotes[process.env.NODE_ENV]}/${pkg.cdn.content.drafts}` : remotes[process.env.NODE_ENV],

  /**
   * Project entry-points. These are used by other files to determine defaults.
   * They must also have a reference in the directories configuration below.
   *
   * @type {Object}
   */
  entry: {
    styles: 'scss/style.scss',
    imports: 'scss/_imports.scss',
    config: 'config',
    scripts: 'js/main.js',
    name: 'MAIN',
    views: 'views',
    svg: 'svg'
  }
};