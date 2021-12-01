// import showdown from showdown;

class CMS {
  constructor() {

  }

  /**
   * [refresh description]
   *
   * @param   {[type]}  data  [data description]
   *
   * @return  {[type]}        [return description]
   */
  refresh(html, meta) {
    let md = document.querySelector('[data-js="markdown"]');

    Object.keys(meta).map(key => {
      let elements = document.querySelectorAll(`[data-bind="${key}"]`);

      elements.forEach(element => {
        console.dir(element);

        if (element) element.innerHTML = meta[key];
      });
    });

    md.innerHTML = html;
  }

  /**
   * [content description]
   *
   * @param   {[type]}  data  [data description]
   *
   * @return  {[type]}        [return description]
   */
  content(data) {
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
  async router() {
    try {
      const hash = window.location.hash;

      if (hash && hash.startsWith('#/')) {
        let PAGE = hash.replace('#/', '');
        let DIRECTORY = window.location.pathname;

        let request = new Request(`${this.path}${DIRECTORY}${PAGE}.md`);
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
  }
}

/**
 * [path description]
 *
 * @var {[type]}
 */
CMS.path = `${CDN_BASE}${CDN}`;

export default CMS;
