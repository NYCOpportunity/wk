import Tonic from '@socketsupply/tonic/index.esm';
import CMS from './cms.js';

class NycoNav extends Tonic {
  /**
   * Gets data from a local JSON data path
   *
   * @param   {String}  endpoint  The name of the file without extension
   *
   * @return  {Object}            JSON object of the response
   */
   async get(endpoint) {
    try {
      const response = await fetch(`${CMS.path}/${endpoint}.json`, {
        method: 'GET',
        // mode: 'same-origin',
        // cache: 'force-cache'
      });

      if (response.status == 200) {
        return await response.json();
      } else {
        return {
          'response': false
        };
      }
    } catch (error) {
      if (process.env.NODE_ENV != 'production')
        console.dir(error); // eslint-disable-line no-console
    }
  }

  /**
   * The main component render method
   *
   * @return  {String}  The compiled navigation
   */
  async * render() {
    yield this.html`<p>Loading Navigation...</p>`;

    this.state = await this.get('nav');

    if (this.state.response === false) {
      return this.html`<p>Could not load navigation</p>`;
    }

    let navs = [];

    this.props.classes = JSON.parse(this.props.classes);

    for (let index = 0; index < this.state.length; index++) {
      let nav = this.state[index].items.map(element => {
        return (this[element.type]) ? this[element.type](element) : '';
      });

      navs.push(this.html`<nav class="${this.props.classes.nav}">
        ${this.html(nav)}
      </nav>`);
    }

    return this.html`${navs}`;
  }

  /**
   * Renderer for header elements
   *
   * @param   {Object}  item  The data for the item
   *
   * @return  {String}        Rendered element
   */
  header(item) {
    return this.html`<span class="${this.props.classes.header}">
      ${item.label}
    </span>`;
  }

  /**
   * Renderer for link elements
   *
   * @param   {Object}  item  The data for the item
   *
   * @return  {String}        Rendered element
   */
  link(item) {
    return this.html`<a class="${this.props.classes.link}" tabindex="${this.props.tabindexes}" href="${BASE_URL}${item.href}">
      ${item.label}
    </a>`;
  }

  /**
   * Renderer for section elements
   *
   * @param   {Object}  item  The data for the item
   *
   * @return  {String}        Rendered element
   */
  section(item) {
    return this.html`<span class="${this.props.classes.section}">
      ${item.label}
    </span>`;
  }
}

export default NycoNav;
