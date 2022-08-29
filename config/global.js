const pkg = require('../package.json');

/**
 * Global configuration
 *
 * @type {Object}
 */
let remotes = {
  development: 'http://localhost:7070',
  production: 'https://nycopportunity.github.io/wk',
};

let dist = 'dist';
let baseUrl = remotes[process.env.NODE_ENV];

if (process.env.CONTENT === pkg.cdn.content.drafts) {
  dist = `dist/${pkg.cdn.content.drafts}`;
  baseUrl = `${remotes[process.env.NODE_ENV]}/${pkg.cdn.content.drafts}`;
}

if (process.env.NODE_ENV === 'development') {
  baseUrl = `${remotes[process.env.NODE_ENV]}`;
}

/**
 * Global configuration
 *
 * @type {Object}
 */
let global = {
  /**
   * Main project directories
   *
   * @type {String}
   */
  base: process.env.PWD,
  src: 'src',
  dist: dist,
  baseUrl: baseUrl,

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

// console.dir(global);

/**
 * Export
 *
 * @type {Object}
 */
module.exports = global;
