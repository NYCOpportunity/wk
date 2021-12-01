/**
 * Dependencies
 */

const nodeResolve = require('@rollup/plugin-node-resolve');
const replace = require('@rollup/plugin-replace');
const commonjs = require('@rollup/plugin-commonjs');
const path = require('path');
const global = require('./global');
const pkg = require('../package.json');

/**
 * Plugin configuration. Refer to the package for details on the available options.
 *
 * @source https://github.com/rollup/plugins
 *
 * @type {Object}
 */
let plugins = [
  replace({
    'preventAssignment': false,
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    'CDN_BASE': JSON.stringify(pkg.cdn.base.raw),
    'CDN': JSON.stringify(pkg.cdn.content[process.env.CONTENT]),
    'BASE_URL': JSON.stringify(global.baseUrl)
  }),
  commonjs(),
  nodeResolve.nodeResolve({
    browser: true,
    customResolveOption: {
      moduleDirectories: [
        'node_modules'
      ]
    }
  })
];

/**
 * ES Module Exports
 *
 * @type {Array}
 */
module.exports = [
  {
    input: path.join(global.base, global.src, global.entry.scripts),
    output: [{
      file: path.join(global.base, global.dist, global.entry.scripts),
      name: global.entry.name,
      sourcemap: (process.env.NODE_ENV === 'production') ? false : 'inline',
      format: 'iife',
      strict: true
    }],
    plugins: plugins,
    devModule: true
  }
];
