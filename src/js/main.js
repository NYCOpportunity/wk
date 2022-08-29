import Tonic from '@socketsupply/tonic/index.esm';
import showdown from 'showdown';

import Icons from '@nycopportunity/pttrn-scripts/src/icons/icons';
import Toggle from '@nycopportunity/pttrn-scripts/src/toggle/toggle';
import NycoNav from './nyco-nav.js';

const CMS = `${CDN_BASE}${CDN}`;

new Icons('https://cdn.jsdelivr.net/gh/cityofnewyork/nyco-patterns@v2.6.8/dist/svg/icons.svg');
new Icons(`${BASE_URL}/svg/feather.svg`);
new Toggle();

Tonic.add(NycoNav);

/**
 * [refresh description]
 *
 * @param   {[type]}  data  [data description]
 *
 * @return  {[type]}        [return description]
 */
let refresh = (html, meta) => {
  let md = document.querySelector('[data-js="markdown"]');

  Object.keys(meta).map(key => {
    let elements = document.querySelectorAll(`[data-bind="${key}"]`);

    elements.forEach(element => {
      if (element) element.innerHTML = meta[key];
    });
  });

  if (md) {
    md.innerHTML = html;

    window.scrollTo(0, 0);
  }
};

/**
 * [content description]
 *
 * @param   {[type]}  data  [data description]
 *
 * @return  {[type]}        [return description]
 */
const content = (data) => {
  showdown.setFlavor('github');

  let converter = new showdown.Converter({
    metadata: true,
    tables: true
  });

  let html = converter.makeHtml(data);
  let meta = converter.getMetadata();

  /**
   * Page Refresh
   */

  refresh(html, meta);
}

/**
 * [router description]
 *
 * @return  {[type]}  [return description]
 */
const router = async () => {
  try {
    /**
     * General Page Routes
     *
     * @var {String}
     */
    let hash = window.location.hash;
    let href = window.location.href;

    /**
     * Homepage Route
     */
    if (href === `${BASE_URL}/` || href === `${BASE_URL}/#` || href === `${BASE_URL}/#/`) {
      hash = '#/index';
      href = `${window.location.href}/index`;
    }

    /**
     * Process Route
     */
    if (hash && hash.startsWith('#/')) {
      let rawContent = href.replace(BASE_URL, CMS).replace('#/', '');

      let request = new Request(`${rawContent}.md`);
      let response = await fetch(request);

      if (response.status === 200) {
        let data = await response.text();

        content(data);
      } else {
        console.error(`The CMS responded with status ${response.status}.`);

        let req404 = new Request(`${CMS}/404.md`);
        let resp404 = await fetch(req404);

        if (resp404.status === 200) {
          let data404 = await resp404.text();

          content(data404);
        } else {
          window.location = `${CMS}/404`;
        }
      }
    }
  } catch(err) {
    console.error(err);
  }
};

/**
 * [addEventListener description]
 *
 * @param   {[type]}  popstate  [popstate description]
 * @param   {[type]}  async     [async description]
 *
 * @return  {[type]}            [return description]
 */
window.addEventListener('popstate', () => {
  router();
});

router();
