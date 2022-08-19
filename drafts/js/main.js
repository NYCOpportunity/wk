(function () {
  'use strict';

  // @ts-check

  class TonicTemplate {
    constructor (rawText, templateStrings, unsafe) {
      this.isTonicTemplate = true;
      this.unsafe = unsafe;
      this.rawText = rawText;
      this.templateStrings = templateStrings;
    }

    valueOf () { return this.rawText }
    toString () { return this.rawText }
  }

  class Tonic extends window.HTMLElement {
    constructor () {
      super();
      const state = Tonic._states[super.id];
      delete Tonic._states[super.id];
      this._state = state || {};
      this.preventRenderOnReconnect = false;
      this.props = {};
      this.elements = [...this.children];
      this.elements.__children__ = true;
      this.nodes = [...this.childNodes];
      this.nodes.__children__ = true;
      this._events();
    }

    static _createId () {
      return `tonic${Tonic._index++}`
    }

    static _splitName (s) {
      return s.match(/[A-Z][a-z0-9]*/g).join('-')
    }

    static _normalizeAttrs (o, x = {}) {
      [...o].forEach(o => (x[o.name] = o.value));
      return x
    }

    _checkId () {
      const _id = super.id;
      if (!_id) {
        const html = this.outerHTML.replace(this.innerHTML, '...');
        throw new Error(`Component: ${html} has no id`)
      }
      return _id
    }

    get state () {
      return (this._checkId(), this._state)
    }

    set state (newState) {
      this._state = (this._checkId(), newState);
    }

    _events () {
      const hp = Object.getOwnPropertyNames(window.HTMLElement.prototype);
      for (const p of this._props) {
        if (hp.indexOf('on' + p) === -1) continue
        this.addEventListener(p, this);
      }
    }

    _prop (o) {
      const id = this._id;
      const p = `__${id}__${Tonic._createId()}__`;
      Tonic._data[id] = Tonic._data[id] || {};
      Tonic._data[id][p] = o;
      return p
    }

    _placehold (r) {
      const id = this._id;
      const ref = `placehold:${id}:${Tonic._createId()}__`;
      Tonic._children[id] = Tonic._children[id] || {};
      Tonic._children[id][ref] = r;
      return ref
    }

    static match (el, s) {
      if (!el.matches) el = el.parentElement;
      return el.matches(s) ? el : el.closest(s)
    }

    static getPropertyNames (proto) {
      const props = [];
      while (proto && proto !== Tonic.prototype) {
        props.push(...Object.getOwnPropertyNames(proto));
        proto = Object.getPrototypeOf(proto);
      }
      return props
    }

    static add (c, htmlName) {
      const hasValidName = htmlName || (c.name && c.name.length > 1);
      if (!hasValidName) {
        throw Error('Mangling. https://bit.ly/2TkJ6zP')
      }

      if (!htmlName) htmlName = Tonic._splitName(c.name).toLowerCase();
      if (!Tonic.ssr && window.customElements.get(htmlName)) {
        throw new Error(`Cannot Tonic.add(${c.name}, '${htmlName}') twice`)
      }

      if (!c.prototype || !c.prototype.isTonicComponent) {
        const tmp = { [c.name]: class extends Tonic {} }[c.name];
        tmp.prototype.render = c;
        c = tmp;
      }

      c.prototype._props = Tonic.getPropertyNames(c.prototype);

      Tonic._reg[htmlName] = c;
      Tonic._tags = Object.keys(Tonic._reg).join();
      window.customElements.define(htmlName, c);

      if (typeof c.stylesheet === 'function') {
        Tonic.registerStyles(c.stylesheet);
      }

      return c
    }

    static registerStyles (stylesheetFn) {
      if (Tonic._stylesheetRegistry.includes(stylesheetFn)) return
      Tonic._stylesheetRegistry.push(stylesheetFn);

      const styleNode = document.createElement('style');
      if (Tonic.nonce) styleNode.setAttribute('nonce', Tonic.nonce);
      styleNode.appendChild(document.createTextNode(stylesheetFn()));
      if (document.head) document.head.appendChild(styleNode);
    }

    static escape (s) {
      return s.replace(Tonic.ESC, c => Tonic.MAP[c])
    }

    static unsafeRawString (s, templateStrings) {
      return new TonicTemplate(s, templateStrings, true)
    }

    dispatch (eventName, detail = null) {
      const opts = { bubbles: true, detail };
      this.dispatchEvent(new window.CustomEvent(eventName, opts));
    }

    html (strings, ...values) {
      const refs = o => {
        if (o && o.__children__) return this._placehold(o)
        if (o && o.isTonicTemplate) return o.rawText
        switch (Object.prototype.toString.call(o)) {
          case '[object HTMLCollection]':
          case '[object NodeList]': return this._placehold([...o])
          case '[object Array]':
            if (o.every(x => x.isTonicTemplate && !x.unsafe)) {
              return new TonicTemplate(o.join('\n'), null, false)
            }
            return this._prop(o)
          case '[object Object]':
          case '[object Function]': return this._prop(o)
          case '[object NamedNodeMap]':
            return this._prop(Tonic._normalizeAttrs(o))
          case '[object Number]': return `${o}__float`
          case '[object String]': return Tonic.escape(o)
          case '[object Boolean]': return `${o}__boolean`
          case '[object Null]': return `${o}__null`
          case '[object HTMLElement]':
            return this._placehold([o])
        }
        if (
          typeof o === 'object' && o && o.nodeType === 1 &&
          typeof o.cloneNode === 'function'
        ) {
          return this._placehold([o])
        }
        return o
      };

      const out = [];
      for (let i = 0; i < strings.length - 1; i++) {
        out.push(strings[i], refs(values[i]));
      }
      out.push(strings[strings.length - 1]);

      const htmlStr = out.join('').replace(Tonic.SPREAD, (_, p) => {
        const o = Tonic._data[p.split('__')[1]][p];
        return Object.entries(o).map(([key, value]) => {
          const k = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          if (value === true) return k
          else if (value) return `${k}="${Tonic.escape(String(value))}"`
          else return ''
        }).filter(Boolean).join(' ')
      });
      return new TonicTemplate(htmlStr, strings, false)
    }

    scheduleReRender (oldProps) {
      if (this.pendingReRender) return this.pendingReRender

      this.pendingReRender = new Promise(resolve => setTimeout(() => {
        if (!this.isInDocument(this.shadowRoot || this)) return
        const p = this._set(this.shadowRoot || this, this.render);
        this.pendingReRender = null;

        if (p && p.then) {
          return p.then(() => {
            this.updated && this.updated(oldProps);
            resolve();
          })
        }

        this.updated && this.updated(oldProps);
        resolve();
      }, 0));

      return this.pendingReRender
    }

    reRender (o = this.props) {
      const oldProps = { ...this.props };
      this.props = typeof o === 'function' ? o(oldProps) : o;
      return this.scheduleReRender(oldProps)
    }

    handleEvent (e) {
      this[e.type](e);
    }

    _drainIterator (target, iterator) {
      return iterator.next().then((result) => {
        this._set(target, null, result.value);
        if (result.done) return
        return this._drainIterator(target, iterator)
      })
    }

    _set (target, render, content = '') {
      this.willRender && this.willRender();
      for (const node of target.querySelectorAll(Tonic._tags)) {
        if (!node.isTonicComponent) continue

        const id = node.getAttribute('id');
        if (!id || !Tonic._refIds.includes(id)) continue
        Tonic._states[id] = node.state;
      }

      if (render instanceof Tonic.AsyncFunction) {
        return (render
          .call(this, this.html, this.props)
          .then(content => this._apply(target, content))
        )
      } else if (render instanceof Tonic.AsyncFunctionGenerator) {
        return this._drainIterator(target, render.call(this))
      } else if (render === null) {
        this._apply(target, content);
      } else if (render instanceof Function) {
        this._apply(target, render.call(this, this.html, this.props) || '');
      }
    }

    _apply (target, content) {
      if (content && content.isTonicTemplate) {
        content = content.rawText;
      } else if (typeof content === 'string') {
        content = Tonic.escape(content);
      }

      if (typeof content === 'string') {
        if (this.stylesheet) {
          content = `<style nonce=${Tonic.nonce || ''}>${this.stylesheet()}</style>${content}`;
        }

        target.innerHTML = content;

        if (this.styles) {
          const styles = this.styles();
          for (const node of target.querySelectorAll('[styles]')) {
            for (const s of node.getAttribute('styles').split(/\s+/)) {
              Object.assign(node.style, styles[s.trim()]);
            }
          }
        }

        const children = Tonic._children[this._id] || {};

        const walk = (node, fn) => {
          if (node.nodeType === 3) {
            const id = node.textContent.trim();
            if (children[id]) fn(node, children[id], id);
          }

          const childNodes = node.childNodes;
          if (!childNodes) return

          for (let i = 0; i < childNodes.length; i++) {
            walk(childNodes[i], fn);
          }
        };

        walk(target, (node, children, id) => {
          for (const child of children) {
            node.parentNode.insertBefore(child, node);
          }
          delete Tonic._children[this._id][id];
          node.parentNode.removeChild(node);
        });
      } else {
        target.innerHTML = '';
        target.appendChild(content.cloneNode(true));
      }
    }

    connectedCallback () {
      this.root = this.shadowRoot || this; // here for back compat

      if (super.id && !Tonic._refIds.includes(super.id)) {
        Tonic._refIds.push(super.id);
      }
      const cc = s => s.replace(/-(.)/g, (_, m) => m.toUpperCase());

      for (const { name: _name, value } of this.attributes) {
        const name = cc(_name);
        const p = this.props[name] = value;

        if (/__\w+__\w+__/.test(p)) {
          const { 1: root } = p.split('__');
          this.props[name] = Tonic._data[root][p];
        } else if (/\d+__float/.test(p)) {
          this.props[name] = parseFloat(p, 10);
        } else if (p === 'null__null') {
          this.props[name] = null;
        } else if (/\w+__boolean/.test(p)) {
          this.props[name] = p.includes('true');
        } else if (/placehold:\w+:\w+__/.test(p)) {
          const { 1: root } = p.split(':');
          this.props[name] = Tonic._children[root][p][0];
        }
      }

      this.props = Object.assign(
        this.defaults ? this.defaults() : {},
        this.props
      );

      this._id = this._id || Tonic._createId();

      this.willConnect && this.willConnect();

      if (!this.isInDocument(this.root)) return
      if (!this.preventRenderOnReconnect) {
        if (!this._source) {
          this._source = this.innerHTML;
        } else {
          this.innerHTML = this._source;
        }
        const p = this._set(this.root, this.render);
        if (p && p.then) return p.then(() => this.connected && this.connected())
      }

      this.connected && this.connected();
    }

    isInDocument (target) {
      const root = target.getRootNode();
      return root === document || root.toString() === '[object ShadowRoot]'
    }

    disconnectedCallback () {
      this.disconnected && this.disconnected();
      delete Tonic._data[this._id];
      delete Tonic._children[this._id];
    }
  }

  Tonic.prototype.isTonicComponent = true;

  Object.assign(Tonic, {
    _tags: '',
    _refIds: [],
    _data: {},
    _states: {},
    _children: {},
    _reg: {},
    _stylesheetRegistry: [],
    _index: 0,
    version: typeof require !== 'undefined' ? require('./package').version : null,
    SPREAD: /\.\.\.\s?(__\w+__\w+__)/g,
    ESC: /["&'<>`/]/g,
    AsyncFunctionGenerator: async function * () {}.constructor,
    AsyncFunction: async function () {}.constructor,
    MAP: { '"': '&quot;', '&': '&amp;', '\'': '&#x27;', '<': '&lt;', '>': '&gt;', '`': '&#x60;', '/': '&#x2F;' }
  });

  /**
   * The Icon module
   * @class
   */
  class Icons {
    /**
     * @constructor
     * @param  {String} path The path of the icon file
     * @return {object} The class
     */
    constructor(path) {
      path = (path) ? path : Icons.path;

      fetch(path)
        .then((response) => {
          if (response.ok)
            return response.text();
          else
            // eslint-disable-next-line no-console
            console.dir(response);
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.dir(error);
        })
        .then((data) => {
          const sprite = document.createElement('div');
          sprite.innerHTML = data;
          sprite.setAttribute('aria-hidden', true);
          sprite.setAttribute('style', 'display: none;');
          document.body.appendChild(sprite);
        });

      return this;
    }
  }

  /** @type {String} The path of the icon file */
  Icons.path = 'svg/icons.svg';

  /**
   * The Simple Toggle class. This will toggle the class 'active' and 'hidden'
   * on target elements, determined by a click event on a selected link or
   * element. This will also toggle the aria-hidden attribute for targeted
   * elements to support screen readers. Target settings and other functionality
   * can be controlled through data attributes.
   *
   * This uses the .matches() method which will require a polyfill for IE
   * https://polyfill.io/v2/docs/features/#Element_prototype_matches
   *
   * @class
   */
  class Toggle {
    /**
     * @constructor
     *
     * @param  {Object}  s  Settings for this Toggle instance
     *
     * @return {Object}     The class
     */
    constructor(s) {
      // Create an object to store existing toggle listeners (if it doesn't exist)
      if (!window.hasOwnProperty(Toggle.callback))
        window[Toggle.callback] = [];

      s = (!s) ? {} : s;

      this.settings = {
        selector: (s.selector) ? s.selector : Toggle.selector,
        namespace: (s.namespace) ? s.namespace : Toggle.namespace,
        inactiveClass: (s.inactiveClass) ? s.inactiveClass : Toggle.inactiveClass,
        activeClass: (s.activeClass) ? s.activeClass : Toggle.activeClass,
        before: (s.before) ? s.before : false,
        after: (s.after) ? s.after : false,
        valid: (s.valid) ? s.valid : false,
        focusable: (s.hasOwnProperty('focusable')) ? s.focusable : true,
        jump: (s.hasOwnProperty('jump')) ? s.jump : true
      };

      // Store the element for potential use in callbacks
      this.element = (s.element) ? s.element : false;

      if (this.element) {
        this.element.addEventListener('click', (event) => {
          this.toggle(event);
        });
      } else {
        // If there isn't an existing instantiated toggle, add the event listener.
        if (!window[Toggle.callback].hasOwnProperty(this.settings.selector)) {
          let body = document.querySelector('body');

          for (let i = 0; i < Toggle.events.length; i++) {
            let tggleEvent = Toggle.events[i];

            body.addEventListener(tggleEvent, event => {
              if (!event.target.matches(this.settings.selector))
                return;

              this.event = event;

              let type = event.type.toUpperCase();

              if (
                this[event.type] &&
                Toggle.elements[type] &&
                Toggle.elements[type].includes(event.target.tagName)
              ) this[event.type](event);
            });
          }
        }
      }

      // Record that a toggle using this selector has been instantiated.
      // This prevents double toggling.
      window[Toggle.callback][this.settings.selector] = true;

      return this;
    }

    /**
     * Click event handler
     *
     * @param  {Event}  event  The original click event
     */
    click(event) {
      this.toggle(event);
    }

    /**
     * Input/select/textarea change event handler. Checks to see if the
     * event.target is valid then toggles accordingly.
     *
     * @param  {Event}  event  The original input change event
     */
    change(event) {
      let valid = event.target.checkValidity();

      if (valid && !this.isActive(event.target)) {
        this.toggle(event); // show
      } else if (!valid && this.isActive(event.target)) {
        this.toggle(event); // hide
      }
    }

    /**
     * Check to see if the toggle is active
     *
     * @param  {Object}  element  The toggle element (trigger)
     */
    isActive(element) {
      let active = false;

      if (this.settings.activeClass) {
        active = element.classList.contains(this.settings.activeClass);
      }

      // if () {
        // Toggle.elementAriaRoles
        // TODO: Add catch to see if element aria roles are toggled
      // }

      // if () {
        // Toggle.targetAriaRoles
        // TODO: Add catch to see if target aria roles are toggled
      // }

      return active;
    }

    /**
     * Get the target of the toggle element (trigger)
     *
     * @param  {Object}  el  The toggle element (trigger)
     */
    getTarget(element) {
      let target = false;

      /** Anchor Links */
      target = (element.hasAttribute('href')) ?
        document.querySelector(element.getAttribute('href')) : target;

      /** Toggle Controls */
      target = (element.hasAttribute('aria-controls')) ?
        document.querySelector(`#${element.getAttribute('aria-controls')}`) : target;

      return target;
    }

    /**
     * The toggle event proxy for getting and setting the element/s and target
     *
     * @param  {Object}  event  The main click event
     *
     * @return {Object}         The Toggle instance
     */
    toggle(event) {
      let element = event.target;
      let target = false;
      let focusable = [];

      event.preventDefault();

      target = this.getTarget(element);

      /** Focusable Children */
      focusable = (target) ?
        target.querySelectorAll(Toggle.elFocusable.join(', ')) : focusable;

      /** Main Functionality */
      if (!target) return this;
      this.elementToggle(element, target, focusable);

      /** Undo */
      if (element.dataset[`${this.settings.namespace}Undo`]) {
        const undo = document.querySelector(
          element.dataset[`${this.settings.namespace}Undo`]
        );

        undo.addEventListener('click', (event) => {
          event.preventDefault();
          this.elementToggle(element, target);
          undo.removeEventListener('click');
        });
      }

      return this;
    }

    /**
     * Get other toggles that might control the same element
     *
     * @param   {Object}    element  The toggling element
     *
     * @return  {NodeList}           List of other toggling elements
     *                               that control the target
     */
    getOthers(element) {
      let selector = false;

      if (element.hasAttribute('href')) {
        selector = `[href="${element.getAttribute('href')}"]`;
      } else if (element.hasAttribute('aria-controls')) {
        selector = `[aria-controls="${element.getAttribute('aria-controls')}"]`;
      }

      return (selector) ? document.querySelectorAll(selector) : [];
    }

    /**
     * Hide the Toggle Target's focusable children from focus.
     * If an element has the data-attribute `data-toggle-tabindex`
     * it will use that as the default tab index of the element.
     *
     * @param   {NodeList}  elements  List of focusable elements
     *
     * @return  {Object}              The Toggle Instance
     */
    toggleFocusable(elements) {
      elements.forEach(element => {
        let tabindex = element.getAttribute('tabindex');

        if (tabindex === '-1') {
          let dataDefault = element
            .getAttribute(`data-${Toggle.namespace}-tabindex`);

          if (dataDefault) {
            element.setAttribute('tabindex', dataDefault);
          } else {
            element.removeAttribute('tabindex');
          }
        } else {
          element.setAttribute('tabindex', '-1');
        }
      });

      return this;
    }

    /**
     * Jumps to Element visibly and shifts focus
     * to the element by setting the tabindex
     *
     * @param   {Object}  element  The Toggling Element
     * @param   {Object}  target   The Target Element
     *
     * @return  {Object}           The Toggle instance
     */
    jumpTo(element, target) {
      // Reset the history state. This will clear out
      // the hash when the target is toggled closed
      history.pushState('', '',
        window.location.pathname + window.location.search);

      // Focus if active
      if (target.classList.contains(this.settings.activeClass)) {
        window.location.hash = element.getAttribute('href');

        target.setAttribute('tabindex', '0');
        target.focus({preventScroll: true});
      } else {
        target.removeAttribute('tabindex');
      }

      return this;
    }

    /**
     * The main toggling method for attributes
     *
     * @param  {Object}    element    The Toggle element
     * @param  {Object}    target     The Target element to toggle active/hidden
     * @param  {NodeList}  focusable  Any focusable children in the target
     *
     * @return {Object}               The Toggle instance
     */
    elementToggle(element, target, focusable = []) {
      let i = 0;
      let attr = '';
      let value = '';

      /**
       * Store elements for potential use in callbacks
       */

      this.element = element;
      this.target = target;
      this.others = this.getOthers(element);
      this.focusable = focusable;

      /**
       * Validity method property that will cancel the toggle if it returns false
       */

      if (this.settings.valid && !this.settings.valid(this))
        return this;

      /**
       * Toggling before hook
       */

      if (this.settings.before)
        this.settings.before(this);

      /**
       * Toggle Element and Target classes
       */

      if (this.settings.activeClass) {
        this.element.classList.toggle(this.settings.activeClass);
        this.target.classList.toggle(this.settings.activeClass);

        // If there are other toggles that control the same element
        this.others.forEach(other => {
          if (other !== this.element)
            other.classList.toggle(this.settings.activeClass);
        });
      }

      if (this.settings.inactiveClass)
        target.classList.toggle(this.settings.inactiveClass);

      /**
       * Target Element Aria Attributes
       */

      for (i = 0; i < Toggle.targetAriaRoles.length; i++) {
        attr = Toggle.targetAriaRoles[i];
        value = this.target.getAttribute(attr);

        if (value != '' && value)
          this.target.setAttribute(attr, (value === 'true') ? 'false' : 'true');
      }

      /**
       * Toggle the target's focusable children tabindex
       */

      if (this.settings.focusable)
        this.toggleFocusable(this.focusable);

      /**
       * Jump to Target Element if Toggle Element is an anchor link
       */

      if (this.settings.jump && this.element.hasAttribute('href'))
        this.jumpTo(this.element, this.target);

      /**
       * Toggle Element (including multi toggles) Aria Attributes
       */

      for (i = 0; i < Toggle.elAriaRoles.length; i++) {
        attr = Toggle.elAriaRoles[i];
        value = this.element.getAttribute(attr);

        if (value != '' && value)
          this.element.setAttribute(attr, (value === 'true') ? 'false' : 'true');

        // If there are other toggles that control the same element
        this.others.forEach((other) => {
          if (other !== this.element && other.getAttribute(attr))
            other.setAttribute(attr, (value === 'true') ? 'false' : 'true');
        });
      }

      /**
       * Toggling complete hook
       */

      if (this.settings.after)
        this.settings.after(this);

      return this;
    }
  }

  /** @type  {String}  The main selector to add the toggling function to */
  Toggle.selector = '[data-js*="toggle"]';

  /** @type  {String}  The namespace for our data attribute settings */
  Toggle.namespace = 'toggle';

  /** @type  {String}  The hide class */
  Toggle.inactiveClass = 'hidden';

  /** @type  {String}  The active class */
  Toggle.activeClass = 'active';

  /** @type  {Array}  Aria roles to toggle true/false on the toggling element */
  Toggle.elAriaRoles = ['aria-pressed', 'aria-expanded'];

  /** @type  {Array}  Aria roles to toggle true/false on the target element */
  Toggle.targetAriaRoles = ['aria-hidden'];

  /** @type  {Array}  Focusable elements to hide within the hidden target element */
  Toggle.elFocusable = [
    'a', 'button', 'input', 'select', 'textarea', 'object', 'embed', 'form',
    'fieldset', 'legend', 'label', 'area', 'audio', 'video', 'iframe', 'svg',
    'details', 'table', '[tabindex]', '[contenteditable]', '[usemap]'
  ];

  /** @type  {Array}  Key attribute for storing toggles in the window */
  Toggle.callback = ['TogglesCallback'];

  /** @type  {Array}  Default events to to watch for toggling. Each must have a handler in the class and elements to look for in Toggle.elements */
  Toggle.events = ['click', 'change'];

  /** @type  {Array}  Elements to delegate to each event handler */
  Toggle.elements = {
    CLICK: ['A', 'BUTTON'],
    CHANGE: ['SELECT', 'INPUT', 'TEXTAREA']
  };

  // import showdown from showdown;

  class CMS$1 {
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

            let req404 = new Request(`${CMS$1}/404.md`);
            let resp404 = await fetch(req404);

            if (resp404.status === 200) {
              let data404 = await resp404.text();

              content(data404);
            } else {
              window.location = `${CMS$1}/404`;
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
  CMS$1.path = `${"https://raw.githubusercontent.com/nycopportunity/wk/"}${"drafts"}`;

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
        const response = await fetch(`${CMS$1.path}/${endpoint}.json`, {
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
      return this.html`<a class="${this.props.classes.link}" tabindex="${this.props.tabindexes}" href="${item.href}">
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

  const CMS = `${"https://raw.githubusercontent.com/nycopportunity/wk/"}${"drafts"}`;

  new Icons('https://cdn.jsdelivr.net/gh/cityofnewyork/nyco-patterns@v2.6.8/dist/svg/icons.svg');
  new Icons(`${""}/svg/feather.svg`);
  new Toggle();

  Tonic.add(NycoNav);

  /**
   * [refresh description]
   *
   * @param   {[type]}  data  [data description]
   *
   * @return  {[type]}        [return description]
   */
  let refresh$1 = (html, meta) => {
    let md = document.querySelector('[data-js="markdown"]');

    Object.keys(meta).map(key => {
      let elements = document.querySelectorAll(`[data-bind="${key}"]`);

      elements.forEach(element => {
        console.dir(element);

        if (element) element.innerHTML = meta[key];
      });
    });

    md.innerHTML = html;

    window.scrollTo(0, 0);
  };

  /**
   * [content description]
   *
   * @param   {[type]}  data  [data description]
   *
   * @return  {[type]}        [return description]
   */
  const content$1 = (data) => {
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

    refresh$1(html, meta);
  };

  /**
   * [router description]
   *
   * @return  {[type]}  [return description]
   */
  const router = async () => {
    try {
      const hash = window.location.hash;

      if (hash && hash.startsWith('#/')) {
        let PAGE = hash.replace('#/', '');
        let DIRECTORY = window.location.pathname;

        let request = new Request(`${CMS}${DIRECTORY}${PAGE}.md`);
        let response = await fetch(request);

        if (response.status === 200) {
          let data = await response.text();

          content$1(data);
        } else {
          console.error(`The CMS responded with status ${response.status}.`);

          let req404 = new Request(`${CMS}/404.md`);
          let resp404 = await fetch(req404);

          if (resp404.status === 200) {
            let data404 = await resp404.text();

            content$1(data404);
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

})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0Bzb2NrZXRzdXBwbHkvdG9uaWMvaW5kZXguZXNtLmpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0BueWNvcHBvcnR1bml0eS9wdHRybi1zY3JpcHRzL3NyYy9pY29ucy9pY29ucy5qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9Abnljb3Bwb3J0dW5pdHkvcHR0cm4tc2NyaXB0cy9zcmMvdG9nZ2xlL3RvZ2dsZS5qcyIsIi4uLy4uLy4uL3NyYy9qcy9jbXMuanMiLCIuLi8uLi8uLi9zcmMvanMvbnljby1uYXYuanMiLCIuLi8uLi8uLi9zcmMvanMvbWFpbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtY2hlY2tcbid1c2Ugc3RyaWN0J1xuXG5jbGFzcyBUb25pY1RlbXBsYXRlIHtcbiAgY29uc3RydWN0b3IgKHJhd1RleHQsIHRlbXBsYXRlU3RyaW5ncywgdW5zYWZlKSB7XG4gICAgdGhpcy5pc1RvbmljVGVtcGxhdGUgPSB0cnVlXG4gICAgdGhpcy51bnNhZmUgPSB1bnNhZmVcbiAgICB0aGlzLnJhd1RleHQgPSByYXdUZXh0XG4gICAgdGhpcy50ZW1wbGF0ZVN0cmluZ3MgPSB0ZW1wbGF0ZVN0cmluZ3NcbiAgfVxuXG4gIHZhbHVlT2YgKCkgeyByZXR1cm4gdGhpcy5yYXdUZXh0IH1cbiAgdG9TdHJpbmcgKCkgeyByZXR1cm4gdGhpcy5yYXdUZXh0IH1cbn1cblxuY2xhc3MgVG9uaWMgZXh0ZW5kcyB3aW5kb3cuSFRNTEVsZW1lbnQge1xuICBjb25zdHJ1Y3RvciAoKSB7XG4gICAgc3VwZXIoKVxuICAgIGNvbnN0IHN0YXRlID0gVG9uaWMuX3N0YXRlc1tzdXBlci5pZF1cbiAgICBkZWxldGUgVG9uaWMuX3N0YXRlc1tzdXBlci5pZF1cbiAgICB0aGlzLl9zdGF0ZSA9IHN0YXRlIHx8IHt9XG4gICAgdGhpcy5wcmV2ZW50UmVuZGVyT25SZWNvbm5lY3QgPSBmYWxzZVxuICAgIHRoaXMucHJvcHMgPSB7fVxuICAgIHRoaXMuZWxlbWVudHMgPSBbLi4udGhpcy5jaGlsZHJlbl1cbiAgICB0aGlzLmVsZW1lbnRzLl9fY2hpbGRyZW5fXyA9IHRydWVcbiAgICB0aGlzLm5vZGVzID0gWy4uLnRoaXMuY2hpbGROb2Rlc11cbiAgICB0aGlzLm5vZGVzLl9fY2hpbGRyZW5fXyA9IHRydWVcbiAgICB0aGlzLl9ldmVudHMoKVxuICB9XG5cbiAgc3RhdGljIF9jcmVhdGVJZCAoKSB7XG4gICAgcmV0dXJuIGB0b25pYyR7VG9uaWMuX2luZGV4Kyt9YFxuICB9XG5cbiAgc3RhdGljIF9zcGxpdE5hbWUgKHMpIHtcbiAgICByZXR1cm4gcy5tYXRjaCgvW0EtWl1bYS16MC05XSovZykuam9pbignLScpXG4gIH1cblxuICBzdGF0aWMgX25vcm1hbGl6ZUF0dHJzIChvLCB4ID0ge30pIHtcbiAgICBbLi4ub10uZm9yRWFjaChvID0+ICh4W28ubmFtZV0gPSBvLnZhbHVlKSlcbiAgICByZXR1cm4geFxuICB9XG5cbiAgX2NoZWNrSWQgKCkge1xuICAgIGNvbnN0IF9pZCA9IHN1cGVyLmlkXG4gICAgaWYgKCFfaWQpIHtcbiAgICAgIGNvbnN0IGh0bWwgPSB0aGlzLm91dGVySFRNTC5yZXBsYWNlKHRoaXMuaW5uZXJIVE1MLCAnLi4uJylcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ29tcG9uZW50OiAke2h0bWx9IGhhcyBubyBpZGApXG4gICAgfVxuICAgIHJldHVybiBfaWRcbiAgfVxuXG4gIGdldCBzdGF0ZSAoKSB7XG4gICAgcmV0dXJuICh0aGlzLl9jaGVja0lkKCksIHRoaXMuX3N0YXRlKVxuICB9XG5cbiAgc2V0IHN0YXRlIChuZXdTdGF0ZSkge1xuICAgIHRoaXMuX3N0YXRlID0gKHRoaXMuX2NoZWNrSWQoKSwgbmV3U3RhdGUpXG4gIH1cblxuICBfZXZlbnRzICgpIHtcbiAgICBjb25zdCBocCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHdpbmRvdy5IVE1MRWxlbWVudC5wcm90b3R5cGUpXG4gICAgZm9yIChjb25zdCBwIG9mIHRoaXMuX3Byb3BzKSB7XG4gICAgICBpZiAoaHAuaW5kZXhPZignb24nICsgcCkgPT09IC0xKSBjb250aW51ZVxuICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKHAsIHRoaXMpXG4gICAgfVxuICB9XG5cbiAgX3Byb3AgKG8pIHtcbiAgICBjb25zdCBpZCA9IHRoaXMuX2lkXG4gICAgY29uc3QgcCA9IGBfXyR7aWR9X18ke1RvbmljLl9jcmVhdGVJZCgpfV9fYFxuICAgIFRvbmljLl9kYXRhW2lkXSA9IFRvbmljLl9kYXRhW2lkXSB8fCB7fVxuICAgIFRvbmljLl9kYXRhW2lkXVtwXSA9IG9cbiAgICByZXR1cm4gcFxuICB9XG5cbiAgX3BsYWNlaG9sZCAocikge1xuICAgIGNvbnN0IGlkID0gdGhpcy5faWRcbiAgICBjb25zdCByZWYgPSBgcGxhY2Vob2xkOiR7aWR9OiR7VG9uaWMuX2NyZWF0ZUlkKCl9X19gXG4gICAgVG9uaWMuX2NoaWxkcmVuW2lkXSA9IFRvbmljLl9jaGlsZHJlbltpZF0gfHwge31cbiAgICBUb25pYy5fY2hpbGRyZW5baWRdW3JlZl0gPSByXG4gICAgcmV0dXJuIHJlZlxuICB9XG5cbiAgc3RhdGljIG1hdGNoIChlbCwgcykge1xuICAgIGlmICghZWwubWF0Y2hlcykgZWwgPSBlbC5wYXJlbnRFbGVtZW50XG4gICAgcmV0dXJuIGVsLm1hdGNoZXMocykgPyBlbCA6IGVsLmNsb3Nlc3QocylcbiAgfVxuXG4gIHN0YXRpYyBnZXRQcm9wZXJ0eU5hbWVzIChwcm90bykge1xuICAgIGNvbnN0IHByb3BzID0gW11cbiAgICB3aGlsZSAocHJvdG8gJiYgcHJvdG8gIT09IFRvbmljLnByb3RvdHlwZSkge1xuICAgICAgcHJvcHMucHVzaCguLi5PYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhwcm90bykpXG4gICAgICBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwcm90bylcbiAgICB9XG4gICAgcmV0dXJuIHByb3BzXG4gIH1cblxuICBzdGF0aWMgYWRkIChjLCBodG1sTmFtZSkge1xuICAgIGNvbnN0IGhhc1ZhbGlkTmFtZSA9IGh0bWxOYW1lIHx8IChjLm5hbWUgJiYgYy5uYW1lLmxlbmd0aCA+IDEpXG4gICAgaWYgKCFoYXNWYWxpZE5hbWUpIHtcbiAgICAgIHRocm93IEVycm9yKCdNYW5nbGluZy4gaHR0cHM6Ly9iaXQubHkvMlRrSjZ6UCcpXG4gICAgfVxuXG4gICAgaWYgKCFodG1sTmFtZSkgaHRtbE5hbWUgPSBUb25pYy5fc3BsaXROYW1lKGMubmFtZSkudG9Mb3dlckNhc2UoKVxuICAgIGlmICghVG9uaWMuc3NyICYmIHdpbmRvdy5jdXN0b21FbGVtZW50cy5nZXQoaHRtbE5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBUb25pYy5hZGQoJHtjLm5hbWV9LCAnJHtodG1sTmFtZX0nKSB0d2ljZWApXG4gICAgfVxuXG4gICAgaWYgKCFjLnByb3RvdHlwZSB8fCAhYy5wcm90b3R5cGUuaXNUb25pY0NvbXBvbmVudCkge1xuICAgICAgY29uc3QgdG1wID0geyBbYy5uYW1lXTogY2xhc3MgZXh0ZW5kcyBUb25pYyB7fSB9W2MubmFtZV1cbiAgICAgIHRtcC5wcm90b3R5cGUucmVuZGVyID0gY1xuICAgICAgYyA9IHRtcFxuICAgIH1cblxuICAgIGMucHJvdG90eXBlLl9wcm9wcyA9IFRvbmljLmdldFByb3BlcnR5TmFtZXMoYy5wcm90b3R5cGUpXG5cbiAgICBUb25pYy5fcmVnW2h0bWxOYW1lXSA9IGNcbiAgICBUb25pYy5fdGFncyA9IE9iamVjdC5rZXlzKFRvbmljLl9yZWcpLmpvaW4oKVxuICAgIHdpbmRvdy5jdXN0b21FbGVtZW50cy5kZWZpbmUoaHRtbE5hbWUsIGMpXG5cbiAgICBpZiAodHlwZW9mIGMuc3R5bGVzaGVldCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgVG9uaWMucmVnaXN0ZXJTdHlsZXMoYy5zdHlsZXNoZWV0KVxuICAgIH1cblxuICAgIHJldHVybiBjXG4gIH1cblxuICBzdGF0aWMgcmVnaXN0ZXJTdHlsZXMgKHN0eWxlc2hlZXRGbikge1xuICAgIGlmIChUb25pYy5fc3R5bGVzaGVldFJlZ2lzdHJ5LmluY2x1ZGVzKHN0eWxlc2hlZXRGbikpIHJldHVyblxuICAgIFRvbmljLl9zdHlsZXNoZWV0UmVnaXN0cnkucHVzaChzdHlsZXNoZWV0Rm4pXG5cbiAgICBjb25zdCBzdHlsZU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpXG4gICAgaWYgKFRvbmljLm5vbmNlKSBzdHlsZU5vZGUuc2V0QXR0cmlidXRlKCdub25jZScsIFRvbmljLm5vbmNlKVxuICAgIHN0eWxlTm9kZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShzdHlsZXNoZWV0Rm4oKSkpXG4gICAgaWYgKGRvY3VtZW50LmhlYWQpIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGVOb2RlKVxuICB9XG5cbiAgc3RhdGljIGVzY2FwZSAocykge1xuICAgIHJldHVybiBzLnJlcGxhY2UoVG9uaWMuRVNDLCBjID0+IFRvbmljLk1BUFtjXSlcbiAgfVxuXG4gIHN0YXRpYyB1bnNhZmVSYXdTdHJpbmcgKHMsIHRlbXBsYXRlU3RyaW5ncykge1xuICAgIHJldHVybiBuZXcgVG9uaWNUZW1wbGF0ZShzLCB0ZW1wbGF0ZVN0cmluZ3MsIHRydWUpXG4gIH1cblxuICBkaXNwYXRjaCAoZXZlbnROYW1lLCBkZXRhaWwgPSBudWxsKSB7XG4gICAgY29uc3Qgb3B0cyA9IHsgYnViYmxlczogdHJ1ZSwgZGV0YWlsIH1cbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQobmV3IHdpbmRvdy5DdXN0b21FdmVudChldmVudE5hbWUsIG9wdHMpKVxuICB9XG5cbiAgaHRtbCAoc3RyaW5ncywgLi4udmFsdWVzKSB7XG4gICAgY29uc3QgcmVmcyA9IG8gPT4ge1xuICAgICAgaWYgKG8gJiYgby5fX2NoaWxkcmVuX18pIHJldHVybiB0aGlzLl9wbGFjZWhvbGQobylcbiAgICAgIGlmIChvICYmIG8uaXNUb25pY1RlbXBsYXRlKSByZXR1cm4gby5yYXdUZXh0XG4gICAgICBzd2l0Y2ggKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKSkge1xuICAgICAgICBjYXNlICdbb2JqZWN0IEhUTUxDb2xsZWN0aW9uXSc6XG4gICAgICAgIGNhc2UgJ1tvYmplY3QgTm9kZUxpc3RdJzogcmV0dXJuIHRoaXMuX3BsYWNlaG9sZChbLi4ub10pXG4gICAgICAgIGNhc2UgJ1tvYmplY3QgQXJyYXldJzpcbiAgICAgICAgICBpZiAoby5ldmVyeSh4ID0+IHguaXNUb25pY1RlbXBsYXRlICYmICF4LnVuc2FmZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgVG9uaWNUZW1wbGF0ZShvLmpvaW4oJ1xcbicpLCBudWxsLCBmYWxzZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX3Byb3AobylcbiAgICAgICAgY2FzZSAnW29iamVjdCBPYmplY3RdJzpcbiAgICAgICAgY2FzZSAnW29iamVjdCBGdW5jdGlvbl0nOiByZXR1cm4gdGhpcy5fcHJvcChvKVxuICAgICAgICBjYXNlICdbb2JqZWN0IE5hbWVkTm9kZU1hcF0nOlxuICAgICAgICAgIHJldHVybiB0aGlzLl9wcm9wKFRvbmljLl9ub3JtYWxpemVBdHRycyhvKSlcbiAgICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzogcmV0dXJuIGAke299X19mbG9hdGBcbiAgICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzogcmV0dXJuIFRvbmljLmVzY2FwZShvKVxuICAgICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzogcmV0dXJuIGAke299X19ib29sZWFuYFxuICAgICAgICBjYXNlICdbb2JqZWN0IE51bGxdJzogcmV0dXJuIGAke299X19udWxsYFxuICAgICAgICBjYXNlICdbb2JqZWN0IEhUTUxFbGVtZW50XSc6XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX3BsYWNlaG9sZChbb10pXG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJiBvICYmIG8ubm9kZVR5cGUgPT09IDEgJiZcbiAgICAgICAgdHlwZW9mIG8uY2xvbmVOb2RlID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYWNlaG9sZChbb10pXG4gICAgICB9XG4gICAgICByZXR1cm4gb1xuICAgIH1cblxuICAgIGNvbnN0IG91dCA9IFtdXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgb3V0LnB1c2goc3RyaW5nc1tpXSwgcmVmcyh2YWx1ZXNbaV0pKVxuICAgIH1cbiAgICBvdXQucHVzaChzdHJpbmdzW3N0cmluZ3MubGVuZ3RoIC0gMV0pXG5cbiAgICBjb25zdCBodG1sU3RyID0gb3V0LmpvaW4oJycpLnJlcGxhY2UoVG9uaWMuU1BSRUFELCAoXywgcCkgPT4ge1xuICAgICAgY29uc3QgbyA9IFRvbmljLl9kYXRhW3Auc3BsaXQoJ19fJylbMV1dW3BdXG4gICAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMobykubWFwKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc3QgayA9IGtleS5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEtJDInKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdHJ1ZSkgcmV0dXJuIGtcbiAgICAgICAgZWxzZSBpZiAodmFsdWUpIHJldHVybiBgJHtrfT1cIiR7VG9uaWMuZXNjYXBlKFN0cmluZyh2YWx1ZSkpfVwiYFxuICAgICAgICBlbHNlIHJldHVybiAnJ1xuICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyAnKVxuICAgIH0pXG4gICAgcmV0dXJuIG5ldyBUb25pY1RlbXBsYXRlKGh0bWxTdHIsIHN0cmluZ3MsIGZhbHNlKVxuICB9XG5cbiAgc2NoZWR1bGVSZVJlbmRlciAob2xkUHJvcHMpIHtcbiAgICBpZiAodGhpcy5wZW5kaW5nUmVSZW5kZXIpIHJldHVybiB0aGlzLnBlbmRpbmdSZVJlbmRlclxuXG4gICAgdGhpcy5wZW5kaW5nUmVSZW5kZXIgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLmlzSW5Eb2N1bWVudCh0aGlzLnNoYWRvd1Jvb3QgfHwgdGhpcykpIHJldHVyblxuICAgICAgY29uc3QgcCA9IHRoaXMuX3NldCh0aGlzLnNoYWRvd1Jvb3QgfHwgdGhpcywgdGhpcy5yZW5kZXIpXG4gICAgICB0aGlzLnBlbmRpbmdSZVJlbmRlciA9IG51bGxcblxuICAgICAgaWYgKHAgJiYgcC50aGVuKSB7XG4gICAgICAgIHJldHVybiBwLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHRoaXMudXBkYXRlZCAmJiB0aGlzLnVwZGF0ZWQob2xkUHJvcHMpXG4gICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHRoaXMudXBkYXRlZCAmJiB0aGlzLnVwZGF0ZWQob2xkUHJvcHMpXG4gICAgICByZXNvbHZlKClcbiAgICB9LCAwKSlcblxuICAgIHJldHVybiB0aGlzLnBlbmRpbmdSZVJlbmRlclxuICB9XG5cbiAgcmVSZW5kZXIgKG8gPSB0aGlzLnByb3BzKSB7XG4gICAgY29uc3Qgb2xkUHJvcHMgPSB7IC4uLnRoaXMucHJvcHMgfVxuICAgIHRoaXMucHJvcHMgPSB0eXBlb2YgbyA9PT0gJ2Z1bmN0aW9uJyA/IG8ob2xkUHJvcHMpIDogb1xuICAgIHJldHVybiB0aGlzLnNjaGVkdWxlUmVSZW5kZXIob2xkUHJvcHMpXG4gIH1cblxuICBoYW5kbGVFdmVudCAoZSkge1xuICAgIHRoaXNbZS50eXBlXShlKVxuICB9XG5cbiAgX2RyYWluSXRlcmF0b3IgKHRhcmdldCwgaXRlcmF0b3IpIHtcbiAgICByZXR1cm4gaXRlcmF0b3IubmV4dCgpLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgdGhpcy5fc2V0KHRhcmdldCwgbnVsbCwgcmVzdWx0LnZhbHVlKVxuICAgICAgaWYgKHJlc3VsdC5kb25lKSByZXR1cm5cbiAgICAgIHJldHVybiB0aGlzLl9kcmFpbkl0ZXJhdG9yKHRhcmdldCwgaXRlcmF0b3IpXG4gICAgfSlcbiAgfVxuXG4gIF9zZXQgKHRhcmdldCwgcmVuZGVyLCBjb250ZW50ID0gJycpIHtcbiAgICB0aGlzLndpbGxSZW5kZXIgJiYgdGhpcy53aWxsUmVuZGVyKClcbiAgICBmb3IgKGNvbnN0IG5vZGUgb2YgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3JBbGwoVG9uaWMuX3RhZ3MpKSB7XG4gICAgICBpZiAoIW5vZGUuaXNUb25pY0NvbXBvbmVudCkgY29udGludWVcblxuICAgICAgY29uc3QgaWQgPSBub2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuICAgICAgaWYgKCFpZCB8fCAhVG9uaWMuX3JlZklkcy5pbmNsdWRlcyhpZCkpIGNvbnRpbnVlXG4gICAgICBUb25pYy5fc3RhdGVzW2lkXSA9IG5vZGUuc3RhdGVcbiAgICB9XG5cbiAgICBpZiAocmVuZGVyIGluc3RhbmNlb2YgVG9uaWMuQXN5bmNGdW5jdGlvbikge1xuICAgICAgcmV0dXJuIChyZW5kZXJcbiAgICAgICAgLmNhbGwodGhpcywgdGhpcy5odG1sLCB0aGlzLnByb3BzKVxuICAgICAgICAudGhlbihjb250ZW50ID0+IHRoaXMuX2FwcGx5KHRhcmdldCwgY29udGVudCkpXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChyZW5kZXIgaW5zdGFuY2VvZiBUb25pYy5Bc3luY0Z1bmN0aW9uR2VuZXJhdG9yKSB7XG4gICAgICByZXR1cm4gdGhpcy5fZHJhaW5JdGVyYXRvcih0YXJnZXQsIHJlbmRlci5jYWxsKHRoaXMpKVxuICAgIH0gZWxzZSBpZiAocmVuZGVyID09PSBudWxsKSB7XG4gICAgICB0aGlzLl9hcHBseSh0YXJnZXQsIGNvbnRlbnQpXG4gICAgfSBlbHNlIGlmIChyZW5kZXIgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgdGhpcy5fYXBwbHkodGFyZ2V0LCByZW5kZXIuY2FsbCh0aGlzLCB0aGlzLmh0bWwsIHRoaXMucHJvcHMpIHx8ICcnKVxuICAgIH1cbiAgfVxuXG4gIF9hcHBseSAodGFyZ2V0LCBjb250ZW50KSB7XG4gICAgaWYgKGNvbnRlbnQgJiYgY29udGVudC5pc1RvbmljVGVtcGxhdGUpIHtcbiAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJhd1RleHRcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgY29udGVudCA9IFRvbmljLmVzY2FwZShjb250ZW50KVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmICh0aGlzLnN0eWxlc2hlZXQpIHtcbiAgICAgICAgY29udGVudCA9IGA8c3R5bGUgbm9uY2U9JHtUb25pYy5ub25jZSB8fCAnJ30+JHt0aGlzLnN0eWxlc2hlZXQoKX08L3N0eWxlPiR7Y29udGVudH1gXG4gICAgICB9XG5cbiAgICAgIHRhcmdldC5pbm5lckhUTUwgPSBjb250ZW50XG5cbiAgICAgIGlmICh0aGlzLnN0eWxlcykge1xuICAgICAgICBjb25zdCBzdHlsZXMgPSB0aGlzLnN0eWxlcygpXG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiB0YXJnZXQucXVlcnlTZWxlY3RvckFsbCgnW3N0eWxlc10nKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgcyBvZiBub2RlLmdldEF0dHJpYnV0ZSgnc3R5bGVzJykuc3BsaXQoL1xccysvKSkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihub2RlLnN0eWxlLCBzdHlsZXNbcy50cmltKCldKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBjaGlsZHJlbiA9IFRvbmljLl9jaGlsZHJlblt0aGlzLl9pZF0gfHwge31cblxuICAgICAgY29uc3Qgd2FsayA9IChub2RlLCBmbikgPT4ge1xuICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMykge1xuICAgICAgICAgIGNvbnN0IGlkID0gbm9kZS50ZXh0Q29udGVudC50cmltKClcbiAgICAgICAgICBpZiAoY2hpbGRyZW5baWRdKSBmbihub2RlLCBjaGlsZHJlbltpZF0sIGlkKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY2hpbGROb2RlcyA9IG5vZGUuY2hpbGROb2Rlc1xuICAgICAgICBpZiAoIWNoaWxkTm9kZXMpIHJldHVyblxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGROb2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHdhbGsoY2hpbGROb2Rlc1tpXSwgZm4pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgd2Fsayh0YXJnZXQsIChub2RlLCBjaGlsZHJlbiwgaWQpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgIG5vZGUucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoY2hpbGQsIG5vZGUpXG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIFRvbmljLl9jaGlsZHJlblt0aGlzLl9pZF1baWRdXG4gICAgICAgIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgdGFyZ2V0LmlubmVySFRNTCA9ICcnXG4gICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoY29udGVudC5jbG9uZU5vZGUodHJ1ZSkpXG4gICAgfVxuICB9XG5cbiAgY29ubmVjdGVkQ2FsbGJhY2sgKCkge1xuICAgIHRoaXMucm9vdCA9IHRoaXMuc2hhZG93Um9vdCB8fCB0aGlzIC8vIGhlcmUgZm9yIGJhY2sgY29tcGF0XG5cbiAgICBpZiAoc3VwZXIuaWQgJiYgIVRvbmljLl9yZWZJZHMuaW5jbHVkZXMoc3VwZXIuaWQpKSB7XG4gICAgICBUb25pYy5fcmVmSWRzLnB1c2goc3VwZXIuaWQpXG4gICAgfVxuICAgIGNvbnN0IGNjID0gcyA9PiBzLnJlcGxhY2UoLy0oLikvZywgKF8sIG0pID0+IG0udG9VcHBlckNhc2UoKSlcblxuICAgIGZvciAoY29uc3QgeyBuYW1lOiBfbmFtZSwgdmFsdWUgfSBvZiB0aGlzLmF0dHJpYnV0ZXMpIHtcbiAgICAgIGNvbnN0IG5hbWUgPSBjYyhfbmFtZSlcbiAgICAgIGNvbnN0IHAgPSB0aGlzLnByb3BzW25hbWVdID0gdmFsdWVcblxuICAgICAgaWYgKC9fX1xcdytfX1xcdytfXy8udGVzdChwKSkge1xuICAgICAgICBjb25zdCB7IDE6IHJvb3QgfSA9IHAuc3BsaXQoJ19fJylcbiAgICAgICAgdGhpcy5wcm9wc1tuYW1lXSA9IFRvbmljLl9kYXRhW3Jvb3RdW3BdXG4gICAgICB9IGVsc2UgaWYgKC9cXGQrX19mbG9hdC8udGVzdChwKSkge1xuICAgICAgICB0aGlzLnByb3BzW25hbWVdID0gcGFyc2VGbG9hdChwLCAxMClcbiAgICAgIH0gZWxzZSBpZiAocCA9PT0gJ251bGxfX251bGwnKSB7XG4gICAgICAgIHRoaXMucHJvcHNbbmFtZV0gPSBudWxsXG4gICAgICB9IGVsc2UgaWYgKC9cXHcrX19ib29sZWFuLy50ZXN0KHApKSB7XG4gICAgICAgIHRoaXMucHJvcHNbbmFtZV0gPSBwLmluY2x1ZGVzKCd0cnVlJylcbiAgICAgIH0gZWxzZSBpZiAoL3BsYWNlaG9sZDpcXHcrOlxcdytfXy8udGVzdChwKSkge1xuICAgICAgICBjb25zdCB7IDE6IHJvb3QgfSA9IHAuc3BsaXQoJzonKVxuICAgICAgICB0aGlzLnByb3BzW25hbWVdID0gVG9uaWMuX2NoaWxkcmVuW3Jvb3RdW3BdWzBdXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5wcm9wcyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICB0aGlzLmRlZmF1bHRzID8gdGhpcy5kZWZhdWx0cygpIDoge30sXG4gICAgICB0aGlzLnByb3BzXG4gICAgKVxuXG4gICAgdGhpcy5faWQgPSB0aGlzLl9pZCB8fCBUb25pYy5fY3JlYXRlSWQoKVxuXG4gICAgdGhpcy53aWxsQ29ubmVjdCAmJiB0aGlzLndpbGxDb25uZWN0KClcblxuICAgIGlmICghdGhpcy5pc0luRG9jdW1lbnQodGhpcy5yb290KSkgcmV0dXJuXG4gICAgaWYgKCF0aGlzLnByZXZlbnRSZW5kZXJPblJlY29ubmVjdCkge1xuICAgICAgaWYgKCF0aGlzLl9zb3VyY2UpIHtcbiAgICAgICAgdGhpcy5fc291cmNlID0gdGhpcy5pbm5lckhUTUxcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaW5uZXJIVE1MID0gdGhpcy5fc291cmNlXG4gICAgICB9XG4gICAgICBjb25zdCBwID0gdGhpcy5fc2V0KHRoaXMucm9vdCwgdGhpcy5yZW5kZXIpXG4gICAgICBpZiAocCAmJiBwLnRoZW4pIHJldHVybiBwLnRoZW4oKCkgPT4gdGhpcy5jb25uZWN0ZWQgJiYgdGhpcy5jb25uZWN0ZWQoKSlcbiAgICB9XG5cbiAgICB0aGlzLmNvbm5lY3RlZCAmJiB0aGlzLmNvbm5lY3RlZCgpXG4gIH1cblxuICBpc0luRG9jdW1lbnQgKHRhcmdldCkge1xuICAgIGNvbnN0IHJvb3QgPSB0YXJnZXQuZ2V0Um9vdE5vZGUoKVxuICAgIHJldHVybiByb290ID09PSBkb2N1bWVudCB8fCByb290LnRvU3RyaW5nKCkgPT09ICdbb2JqZWN0IFNoYWRvd1Jvb3RdJ1xuICB9XG5cbiAgZGlzY29ubmVjdGVkQ2FsbGJhY2sgKCkge1xuICAgIHRoaXMuZGlzY29ubmVjdGVkICYmIHRoaXMuZGlzY29ubmVjdGVkKClcbiAgICBkZWxldGUgVG9uaWMuX2RhdGFbdGhpcy5faWRdXG4gICAgZGVsZXRlIFRvbmljLl9jaGlsZHJlblt0aGlzLl9pZF1cbiAgfVxufVxuXG5Ub25pYy5wcm90b3R5cGUuaXNUb25pY0NvbXBvbmVudCA9IHRydWVcblxuT2JqZWN0LmFzc2lnbihUb25pYywge1xuICBfdGFnczogJycsXG4gIF9yZWZJZHM6IFtdLFxuICBfZGF0YToge30sXG4gIF9zdGF0ZXM6IHt9LFxuICBfY2hpbGRyZW46IHt9LFxuICBfcmVnOiB7fSxcbiAgX3N0eWxlc2hlZXRSZWdpc3RyeTogW10sXG4gIF9pbmRleDogMCxcbiAgdmVyc2lvbjogdHlwZW9mIHJlcXVpcmUgIT09ICd1bmRlZmluZWQnID8gcmVxdWlyZSgnLi9wYWNrYWdlJykudmVyc2lvbiA6IG51bGwsXG4gIFNQUkVBRDogL1xcLlxcLlxcLlxccz8oX19cXHcrX19cXHcrX18pL2csXG4gIEVTQzogL1tcIiYnPD5gL10vZyxcbiAgQXN5bmNGdW5jdGlvbkdlbmVyYXRvcjogYXN5bmMgZnVuY3Rpb24gKiAoKSB7fS5jb25zdHJ1Y3RvcixcbiAgQXN5bmNGdW5jdGlvbjogYXN5bmMgZnVuY3Rpb24gKCkge30uY29uc3RydWN0b3IsXG4gIE1BUDogeyAnXCInOiAnJnF1b3Q7JywgJyYnOiAnJmFtcDsnLCAnXFwnJzogJyYjeDI3OycsICc8JzogJyZsdDsnLCAnPic6ICcmZ3Q7JywgJ2AnOiAnJiN4NjA7JywgJy8nOiAnJiN4MkY7JyB9XG59KVxuXG5leHBvcnQgZGVmYXVsdCBUb25pY1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFRoZSBJY29uIG1vZHVsZVxuICogQGNsYXNzXG4gKi9cbmNsYXNzIEljb25zIHtcbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0gIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGljb24gZmlsZVxuICAgKiBAcmV0dXJuIHtvYmplY3R9IFRoZSBjbGFzc1xuICAgKi9cbiAgY29uc3RydWN0b3IocGF0aCkge1xuICAgIHBhdGggPSAocGF0aCkgPyBwYXRoIDogSWNvbnMucGF0aDtcblxuICAgIGZldGNoKHBhdGgpXG4gICAgICAudGhlbigocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlLm9rKVxuICAgICAgICAgIHJldHVybiByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKVxuICAgICAgICAgICAgY29uc29sZS5kaXIocmVzcG9uc2UpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpXG4gICAgICAgICAgY29uc29sZS5kaXIoZXJyb3IpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKChkYXRhKSA9PiB7XG4gICAgICAgIGNvbnN0IHNwcml0ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBzcHJpdGUuaW5uZXJIVE1MID0gZGF0YTtcbiAgICAgICAgc3ByaXRlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCB0cnVlKTtcbiAgICAgICAgc3ByaXRlLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCAnZGlzcGxheTogbm9uZTsnKTtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzcHJpdGUpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufVxuXG4vKiogQHR5cGUge1N0cmluZ30gVGhlIHBhdGggb2YgdGhlIGljb24gZmlsZSAqL1xuSWNvbnMucGF0aCA9ICdzdmcvaWNvbnMuc3ZnJztcblxuZXhwb3J0IGRlZmF1bHQgSWNvbnM7XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogVGhlIFNpbXBsZSBUb2dnbGUgY2xhc3MuIFRoaXMgd2lsbCB0b2dnbGUgdGhlIGNsYXNzICdhY3RpdmUnIGFuZCAnaGlkZGVuJ1xuICogb24gdGFyZ2V0IGVsZW1lbnRzLCBkZXRlcm1pbmVkIGJ5IGEgY2xpY2sgZXZlbnQgb24gYSBzZWxlY3RlZCBsaW5rIG9yXG4gKiBlbGVtZW50LiBUaGlzIHdpbGwgYWxzbyB0b2dnbGUgdGhlIGFyaWEtaGlkZGVuIGF0dHJpYnV0ZSBmb3IgdGFyZ2V0ZWRcbiAqIGVsZW1lbnRzIHRvIHN1cHBvcnQgc2NyZWVuIHJlYWRlcnMuIFRhcmdldCBzZXR0aW5ncyBhbmQgb3RoZXIgZnVuY3Rpb25hbGl0eVxuICogY2FuIGJlIGNvbnRyb2xsZWQgdGhyb3VnaCBkYXRhIGF0dHJpYnV0ZXMuXG4gKlxuICogVGhpcyB1c2VzIHRoZSAubWF0Y2hlcygpIG1ldGhvZCB3aGljaCB3aWxsIHJlcXVpcmUgYSBwb2x5ZmlsbCBmb3IgSUVcbiAqIGh0dHBzOi8vcG9seWZpbGwuaW8vdjIvZG9jcy9mZWF0dXJlcy8jRWxlbWVudF9wcm90b3R5cGVfbWF0Y2hlc1xuICpcbiAqIEBjbGFzc1xuICovXG5jbGFzcyBUb2dnbGUge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gIHMgIFNldHRpbmdzIGZvciB0aGlzIFRvZ2dsZSBpbnN0YW5jZVxuICAgKlxuICAgKiBAcmV0dXJuIHtPYmplY3R9ICAgICBUaGUgY2xhc3NcbiAgICovXG4gIGNvbnN0cnVjdG9yKHMpIHtcbiAgICAvLyBDcmVhdGUgYW4gb2JqZWN0IHRvIHN0b3JlIGV4aXN0aW5nIHRvZ2dsZSBsaXN0ZW5lcnMgKGlmIGl0IGRvZXNuJ3QgZXhpc3QpXG4gICAgaWYgKCF3aW5kb3cuaGFzT3duUHJvcGVydHkoVG9nZ2xlLmNhbGxiYWNrKSlcbiAgICAgIHdpbmRvd1tUb2dnbGUuY2FsbGJhY2tdID0gW107XG5cbiAgICBzID0gKCFzKSA/IHt9IDogcztcblxuICAgIHRoaXMuc2V0dGluZ3MgPSB7XG4gICAgICBzZWxlY3RvcjogKHMuc2VsZWN0b3IpID8gcy5zZWxlY3RvciA6IFRvZ2dsZS5zZWxlY3RvcixcbiAgICAgIG5hbWVzcGFjZTogKHMubmFtZXNwYWNlKSA/IHMubmFtZXNwYWNlIDogVG9nZ2xlLm5hbWVzcGFjZSxcbiAgICAgIGluYWN0aXZlQ2xhc3M6IChzLmluYWN0aXZlQ2xhc3MpID8gcy5pbmFjdGl2ZUNsYXNzIDogVG9nZ2xlLmluYWN0aXZlQ2xhc3MsXG4gICAgICBhY3RpdmVDbGFzczogKHMuYWN0aXZlQ2xhc3MpID8gcy5hY3RpdmVDbGFzcyA6IFRvZ2dsZS5hY3RpdmVDbGFzcyxcbiAgICAgIGJlZm9yZTogKHMuYmVmb3JlKSA/IHMuYmVmb3JlIDogZmFsc2UsXG4gICAgICBhZnRlcjogKHMuYWZ0ZXIpID8gcy5hZnRlciA6IGZhbHNlLFxuICAgICAgdmFsaWQ6IChzLnZhbGlkKSA/IHMudmFsaWQgOiBmYWxzZSxcbiAgICAgIGZvY3VzYWJsZTogKHMuaGFzT3duUHJvcGVydHkoJ2ZvY3VzYWJsZScpKSA/IHMuZm9jdXNhYmxlIDogdHJ1ZSxcbiAgICAgIGp1bXA6IChzLmhhc093blByb3BlcnR5KCdqdW1wJykpID8gcy5qdW1wIDogdHJ1ZVxuICAgIH07XG5cbiAgICAvLyBTdG9yZSB0aGUgZWxlbWVudCBmb3IgcG90ZW50aWFsIHVzZSBpbiBjYWxsYmFja3NcbiAgICB0aGlzLmVsZW1lbnQgPSAocy5lbGVtZW50KSA/IHMuZWxlbWVudCA6IGZhbHNlO1xuXG4gICAgaWYgKHRoaXMuZWxlbWVudCkge1xuICAgICAgdGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMudG9nZ2xlKGV2ZW50KTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJZiB0aGVyZSBpc24ndCBhbiBleGlzdGluZyBpbnN0YW50aWF0ZWQgdG9nZ2xlLCBhZGQgdGhlIGV2ZW50IGxpc3RlbmVyLlxuICAgICAgaWYgKCF3aW5kb3dbVG9nZ2xlLmNhbGxiYWNrXS5oYXNPd25Qcm9wZXJ0eSh0aGlzLnNldHRpbmdzLnNlbGVjdG9yKSkge1xuICAgICAgICBsZXQgYm9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2JvZHknKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IFRvZ2dsZS5ldmVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBsZXQgdGdnbGVFdmVudCA9IFRvZ2dsZS5ldmVudHNbaV07XG5cbiAgICAgICAgICBib2R5LmFkZEV2ZW50TGlzdGVuZXIodGdnbGVFdmVudCwgZXZlbnQgPT4ge1xuICAgICAgICAgICAgaWYgKCFldmVudC50YXJnZXQubWF0Y2hlcyh0aGlzLnNldHRpbmdzLnNlbGVjdG9yKSlcbiAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB0aGlzLmV2ZW50ID0gZXZlbnQ7XG5cbiAgICAgICAgICAgIGxldCB0eXBlID0gZXZlbnQudHlwZS50b1VwcGVyQ2FzZSgpO1xuXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXNbZXZlbnQudHlwZV0gJiZcbiAgICAgICAgICAgICAgVG9nZ2xlLmVsZW1lbnRzW3R5cGVdICYmXG4gICAgICAgICAgICAgIFRvZ2dsZS5lbGVtZW50c1t0eXBlXS5pbmNsdWRlcyhldmVudC50YXJnZXQudGFnTmFtZSlcbiAgICAgICAgICAgICkgdGhpc1tldmVudC50eXBlXShldmVudCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZWNvcmQgdGhhdCBhIHRvZ2dsZSB1c2luZyB0aGlzIHNlbGVjdG9yIGhhcyBiZWVuIGluc3RhbnRpYXRlZC5cbiAgICAvLyBUaGlzIHByZXZlbnRzIGRvdWJsZSB0b2dnbGluZy5cbiAgICB3aW5kb3dbVG9nZ2xlLmNhbGxiYWNrXVt0aGlzLnNldHRpbmdzLnNlbGVjdG9yXSA9IHRydWU7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGljayBldmVudCBoYW5kbGVyXG4gICAqXG4gICAqIEBwYXJhbSAge0V2ZW50fSAgZXZlbnQgIFRoZSBvcmlnaW5hbCBjbGljayBldmVudFxuICAgKi9cbiAgY2xpY2soZXZlbnQpIHtcbiAgICB0aGlzLnRvZ2dsZShldmVudCk7XG4gIH1cblxuICAvKipcbiAgICogSW5wdXQvc2VsZWN0L3RleHRhcmVhIGNoYW5nZSBldmVudCBoYW5kbGVyLiBDaGVja3MgdG8gc2VlIGlmIHRoZVxuICAgKiBldmVudC50YXJnZXQgaXMgdmFsaWQgdGhlbiB0b2dnbGVzIGFjY29yZGluZ2x5LlxuICAgKlxuICAgKiBAcGFyYW0gIHtFdmVudH0gIGV2ZW50ICBUaGUgb3JpZ2luYWwgaW5wdXQgY2hhbmdlIGV2ZW50XG4gICAqL1xuICBjaGFuZ2UoZXZlbnQpIHtcbiAgICBsZXQgdmFsaWQgPSBldmVudC50YXJnZXQuY2hlY2tWYWxpZGl0eSgpO1xuXG4gICAgaWYgKHZhbGlkICYmICF0aGlzLmlzQWN0aXZlKGV2ZW50LnRhcmdldCkpIHtcbiAgICAgIHRoaXMudG9nZ2xlKGV2ZW50KTsgLy8gc2hvd1xuICAgIH0gZWxzZSBpZiAoIXZhbGlkICYmIHRoaXMuaXNBY3RpdmUoZXZlbnQudGFyZ2V0KSkge1xuICAgICAgdGhpcy50b2dnbGUoZXZlbnQpOyAvLyBoaWRlXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIHRvIHNlZSBpZiB0aGUgdG9nZ2xlIGlzIGFjdGl2ZVxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9ICBlbGVtZW50ICBUaGUgdG9nZ2xlIGVsZW1lbnQgKHRyaWdnZXIpXG4gICAqL1xuICBpc0FjdGl2ZShlbGVtZW50KSB7XG4gICAgbGV0IGFjdGl2ZSA9IGZhbHNlO1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpIHtcbiAgICAgIGFjdGl2ZSA9IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpXG4gICAgfVxuXG4gICAgLy8gaWYgKCkge1xuICAgICAgLy8gVG9nZ2xlLmVsZW1lbnRBcmlhUm9sZXNcbiAgICAgIC8vIFRPRE86IEFkZCBjYXRjaCB0byBzZWUgaWYgZWxlbWVudCBhcmlhIHJvbGVzIGFyZSB0b2dnbGVkXG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKCkge1xuICAgICAgLy8gVG9nZ2xlLnRhcmdldEFyaWFSb2xlc1xuICAgICAgLy8gVE9ETzogQWRkIGNhdGNoIHRvIHNlZSBpZiB0YXJnZXQgYXJpYSByb2xlcyBhcmUgdG9nZ2xlZFxuICAgIC8vIH1cblxuICAgIHJldHVybiBhY3RpdmU7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSB0YXJnZXQgb2YgdGhlIHRvZ2dsZSBlbGVtZW50ICh0cmlnZ2VyKVxuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9ICBlbCAgVGhlIHRvZ2dsZSBlbGVtZW50ICh0cmlnZ2VyKVxuICAgKi9cbiAgZ2V0VGFyZ2V0KGVsZW1lbnQpIHtcbiAgICBsZXQgdGFyZ2V0ID0gZmFsc2U7XG5cbiAgICAvKiogQW5jaG9yIExpbmtzICovXG4gICAgdGFyZ2V0ID0gKGVsZW1lbnQuaGFzQXR0cmlidXRlKCdocmVmJykpID9cbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSkgOiB0YXJnZXQ7XG5cbiAgICAvKiogVG9nZ2xlIENvbnRyb2xzICovXG4gICAgdGFyZ2V0ID0gKGVsZW1lbnQuaGFzQXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJykpID9cbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYCMke2VsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJyl9YCkgOiB0YXJnZXQ7XG5cbiAgICByZXR1cm4gdGFyZ2V0O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSB0b2dnbGUgZXZlbnQgcHJveHkgZm9yIGdldHRpbmcgYW5kIHNldHRpbmcgdGhlIGVsZW1lbnQvcyBhbmQgdGFyZ2V0XG4gICAqXG4gICAqIEBwYXJhbSAge09iamVjdH0gIGV2ZW50ICBUaGUgbWFpbiBjbGljayBldmVudFxuICAgKlxuICAgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgVGhlIFRvZ2dsZSBpbnN0YW5jZVxuICAgKi9cbiAgdG9nZ2xlKGV2ZW50KSB7XG4gICAgbGV0IGVsZW1lbnQgPSBldmVudC50YXJnZXQ7XG4gICAgbGV0IHRhcmdldCA9IGZhbHNlO1xuICAgIGxldCBmb2N1c2FibGUgPSBbXTtcblxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICB0YXJnZXQgPSB0aGlzLmdldFRhcmdldChlbGVtZW50KTtcblxuICAgIC8qKiBGb2N1c2FibGUgQ2hpbGRyZW4gKi9cbiAgICBmb2N1c2FibGUgPSAodGFyZ2V0KSA/XG4gICAgICB0YXJnZXQucXVlcnlTZWxlY3RvckFsbChUb2dnbGUuZWxGb2N1c2FibGUuam9pbignLCAnKSkgOiBmb2N1c2FibGU7XG5cbiAgICAvKiogTWFpbiBGdW5jdGlvbmFsaXR5ICovXG4gICAgaWYgKCF0YXJnZXQpIHJldHVybiB0aGlzO1xuICAgIHRoaXMuZWxlbWVudFRvZ2dsZShlbGVtZW50LCB0YXJnZXQsIGZvY3VzYWJsZSk7XG5cbiAgICAvKiogVW5kbyAqL1xuICAgIGlmIChlbGVtZW50LmRhdGFzZXRbYCR7dGhpcy5zZXR0aW5ncy5uYW1lc3BhY2V9VW5kb2BdKSB7XG4gICAgICBjb25zdCB1bmRvID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcbiAgICAgICAgZWxlbWVudC5kYXRhc2V0W2Ake3RoaXMuc2V0dGluZ3MubmFtZXNwYWNlfVVuZG9gXVxuICAgICAgKTtcblxuICAgICAgdW5kby5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB0aGlzLmVsZW1lbnRUb2dnbGUoZWxlbWVudCwgdGFyZ2V0KTtcbiAgICAgICAgdW5kby5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IG90aGVyIHRvZ2dsZXMgdGhhdCBtaWdodCBjb250cm9sIHRoZSBzYW1lIGVsZW1lbnRcbiAgICpcbiAgICogQHBhcmFtICAge09iamVjdH0gICAgZWxlbWVudCAgVGhlIHRvZ2dsaW5nIGVsZW1lbnRcbiAgICpcbiAgICogQHJldHVybiAge05vZGVMaXN0fSAgICAgICAgICAgTGlzdCBvZiBvdGhlciB0b2dnbGluZyBlbGVtZW50c1xuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGF0IGNvbnRyb2wgdGhlIHRhcmdldFxuICAgKi9cbiAgZ2V0T3RoZXJzKGVsZW1lbnQpIHtcbiAgICBsZXQgc2VsZWN0b3IgPSBmYWxzZTtcblxuICAgIGlmIChlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnaHJlZicpKSB7XG4gICAgICBzZWxlY3RvciA9IGBbaHJlZj1cIiR7ZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKX1cIl1gO1xuICAgIH0gZWxzZSBpZiAoZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnKSkge1xuICAgICAgc2VsZWN0b3IgPSBgW2FyaWEtY29udHJvbHM9XCIke2VsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJyl9XCJdYDtcbiAgICB9XG5cbiAgICByZXR1cm4gKHNlbGVjdG9yKSA/IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpIDogW107XG4gIH1cblxuICAvKipcbiAgICogSGlkZSB0aGUgVG9nZ2xlIFRhcmdldCdzIGZvY3VzYWJsZSBjaGlsZHJlbiBmcm9tIGZvY3VzLlxuICAgKiBJZiBhbiBlbGVtZW50IGhhcyB0aGUgZGF0YS1hdHRyaWJ1dGUgYGRhdGEtdG9nZ2xlLXRhYmluZGV4YFxuICAgKiBpdCB3aWxsIHVzZSB0aGF0IGFzIHRoZSBkZWZhdWx0IHRhYiBpbmRleCBvZiB0aGUgZWxlbWVudC5cbiAgICpcbiAgICogQHBhcmFtICAge05vZGVMaXN0fSAgZWxlbWVudHMgIExpc3Qgb2YgZm9jdXNhYmxlIGVsZW1lbnRzXG4gICAqXG4gICAqIEByZXR1cm4gIHtPYmplY3R9ICAgICAgICAgICAgICBUaGUgVG9nZ2xlIEluc3RhbmNlXG4gICAqL1xuICB0b2dnbGVGb2N1c2FibGUoZWxlbWVudHMpIHtcbiAgICBlbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgbGV0IHRhYmluZGV4ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cbiAgICAgIGlmICh0YWJpbmRleCA9PT0gJy0xJykge1xuICAgICAgICBsZXQgZGF0YURlZmF1bHQgPSBlbGVtZW50XG4gICAgICAgICAgLmdldEF0dHJpYnV0ZShgZGF0YS0ke1RvZ2dsZS5uYW1lc3BhY2V9LXRhYmluZGV4YCk7XG5cbiAgICAgICAgaWYgKGRhdGFEZWZhdWx0KSB7XG4gICAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgZGF0YURlZmF1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEp1bXBzIHRvIEVsZW1lbnQgdmlzaWJseSBhbmQgc2hpZnRzIGZvY3VzXG4gICAqIHRvIHRoZSBlbGVtZW50IGJ5IHNldHRpbmcgdGhlIHRhYmluZGV4XG4gICAqXG4gICAqIEBwYXJhbSAgIHtPYmplY3R9ICBlbGVtZW50ICBUaGUgVG9nZ2xpbmcgRWxlbWVudFxuICAgKiBAcGFyYW0gICB7T2JqZWN0fSAgdGFyZ2V0ICAgVGhlIFRhcmdldCBFbGVtZW50XG4gICAqXG4gICAqIEByZXR1cm4gIHtPYmplY3R9ICAgICAgICAgICBUaGUgVG9nZ2xlIGluc3RhbmNlXG4gICAqL1xuICBqdW1wVG8oZWxlbWVudCwgdGFyZ2V0KSB7XG4gICAgLy8gUmVzZXQgdGhlIGhpc3Rvcnkgc3RhdGUuIFRoaXMgd2lsbCBjbGVhciBvdXRcbiAgICAvLyB0aGUgaGFzaCB3aGVuIHRoZSB0YXJnZXQgaXMgdG9nZ2xlZCBjbG9zZWRcbiAgICBoaXN0b3J5LnB1c2hTdGF0ZSgnJywgJycsXG4gICAgICB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyB3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcblxuICAgIC8vIEZvY3VzIGlmIGFjdGl2ZVxuICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpKSB7XG4gICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdocmVmJyk7XG5cbiAgICAgIHRhcmdldC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcbiAgICAgIHRhcmdldC5mb2N1cyh7cHJldmVudFNjcm9sbDogdHJ1ZX0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0YXJnZXQucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBtYWluIHRvZ2dsaW5nIG1ldGhvZCBmb3IgYXR0cmlidXRlc1xuICAgKlxuICAgKiBAcGFyYW0gIHtPYmplY3R9ICAgIGVsZW1lbnQgICAgVGhlIFRvZ2dsZSBlbGVtZW50XG4gICAqIEBwYXJhbSAge09iamVjdH0gICAgdGFyZ2V0ICAgICBUaGUgVGFyZ2V0IGVsZW1lbnQgdG8gdG9nZ2xlIGFjdGl2ZS9oaWRkZW5cbiAgICogQHBhcmFtICB7Tm9kZUxpc3R9ICBmb2N1c2FibGUgIEFueSBmb2N1c2FibGUgY2hpbGRyZW4gaW4gdGhlIHRhcmdldFxuICAgKlxuICAgKiBAcmV0dXJuIHtPYmplY3R9ICAgICAgICAgICAgICAgVGhlIFRvZ2dsZSBpbnN0YW5jZVxuICAgKi9cbiAgZWxlbWVudFRvZ2dsZShlbGVtZW50LCB0YXJnZXQsIGZvY3VzYWJsZSA9IFtdKSB7XG4gICAgbGV0IGkgPSAwO1xuICAgIGxldCBhdHRyID0gJyc7XG4gICAgbGV0IHZhbHVlID0gJyc7XG5cbiAgICAvKipcbiAgICAgKiBTdG9yZSBlbGVtZW50cyBmb3IgcG90ZW50aWFsIHVzZSBpbiBjYWxsYmFja3NcbiAgICAgKi9cblxuICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgdGhpcy50YXJnZXQgPSB0YXJnZXQ7XG4gICAgdGhpcy5vdGhlcnMgPSB0aGlzLmdldE90aGVycyhlbGVtZW50KTtcbiAgICB0aGlzLmZvY3VzYWJsZSA9IGZvY3VzYWJsZTtcblxuICAgIC8qKlxuICAgICAqIFZhbGlkaXR5IG1ldGhvZCBwcm9wZXJ0eSB0aGF0IHdpbGwgY2FuY2VsIHRoZSB0b2dnbGUgaWYgaXQgcmV0dXJucyBmYWxzZVxuICAgICAqL1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MudmFsaWQgJiYgIXRoaXMuc2V0dGluZ3MudmFsaWQodGhpcykpXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIC8qKlxuICAgICAqIFRvZ2dsaW5nIGJlZm9yZSBob29rXG4gICAgICovXG5cbiAgICBpZiAodGhpcy5zZXR0aW5ncy5iZWZvcmUpXG4gICAgICB0aGlzLnNldHRpbmdzLmJlZm9yZSh0aGlzKTtcblxuICAgIC8qKlxuICAgICAqIFRvZ2dsZSBFbGVtZW50IGFuZCBUYXJnZXQgY2xhc3Nlc1xuICAgICAqL1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpIHtcbiAgICAgIHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpO1xuICAgICAgdGhpcy50YXJnZXQuY2xhc3NMaXN0LnRvZ2dsZSh0aGlzLnNldHRpbmdzLmFjdGl2ZUNsYXNzKTtcblxuICAgICAgLy8gSWYgdGhlcmUgYXJlIG90aGVyIHRvZ2dsZXMgdGhhdCBjb250cm9sIHRoZSBzYW1lIGVsZW1lbnRcbiAgICAgIHRoaXMub3RoZXJzLmZvckVhY2gob3RoZXIgPT4ge1xuICAgICAgICBpZiAob3RoZXIgIT09IHRoaXMuZWxlbWVudClcbiAgICAgICAgICBvdGhlci5jbGFzc0xpc3QudG9nZ2xlKHRoaXMuc2V0dGluZ3MuYWN0aXZlQ2xhc3MpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuaW5hY3RpdmVDbGFzcylcbiAgICAgIHRhcmdldC5jbGFzc0xpc3QudG9nZ2xlKHRoaXMuc2V0dGluZ3MuaW5hY3RpdmVDbGFzcyk7XG5cbiAgICAvKipcbiAgICAgKiBUYXJnZXQgRWxlbWVudCBBcmlhIEF0dHJpYnV0ZXNcbiAgICAgKi9cblxuICAgIGZvciAoaSA9IDA7IGkgPCBUb2dnbGUudGFyZ2V0QXJpYVJvbGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhdHRyID0gVG9nZ2xlLnRhcmdldEFyaWFSb2xlc1tpXTtcbiAgICAgIHZhbHVlID0gdGhpcy50YXJnZXQuZ2V0QXR0cmlidXRlKGF0dHIpO1xuXG4gICAgICBpZiAodmFsdWUgIT0gJycgJiYgdmFsdWUpXG4gICAgICAgIHRoaXMudGFyZ2V0LnNldEF0dHJpYnV0ZShhdHRyLCAodmFsdWUgPT09ICd0cnVlJykgPyAnZmFsc2UnIDogJ3RydWUnKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUb2dnbGUgdGhlIHRhcmdldCdzIGZvY3VzYWJsZSBjaGlsZHJlbiB0YWJpbmRleFxuICAgICAqL1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuZm9jdXNhYmxlKVxuICAgICAgdGhpcy50b2dnbGVGb2N1c2FibGUodGhpcy5mb2N1c2FibGUpO1xuXG4gICAgLyoqXG4gICAgICogSnVtcCB0byBUYXJnZXQgRWxlbWVudCBpZiBUb2dnbGUgRWxlbWVudCBpcyBhbiBhbmNob3IgbGlua1xuICAgICAqL1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuanVtcCAmJiB0aGlzLmVsZW1lbnQuaGFzQXR0cmlidXRlKCdocmVmJykpXG4gICAgICB0aGlzLmp1bXBUbyh0aGlzLmVsZW1lbnQsIHRoaXMudGFyZ2V0KTtcblxuICAgIC8qKlxuICAgICAqIFRvZ2dsZSBFbGVtZW50IChpbmNsdWRpbmcgbXVsdGkgdG9nZ2xlcykgQXJpYSBBdHRyaWJ1dGVzXG4gICAgICovXG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgVG9nZ2xlLmVsQXJpYVJvbGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhdHRyID0gVG9nZ2xlLmVsQXJpYVJvbGVzW2ldO1xuICAgICAgdmFsdWUgPSB0aGlzLmVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpO1xuXG4gICAgICBpZiAodmFsdWUgIT0gJycgJiYgdmFsdWUpXG4gICAgICAgIHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0ciwgKHZhbHVlID09PSAndHJ1ZScpID8gJ2ZhbHNlJyA6ICd0cnVlJyk7XG5cbiAgICAgIC8vIElmIHRoZXJlIGFyZSBvdGhlciB0b2dnbGVzIHRoYXQgY29udHJvbCB0aGUgc2FtZSBlbGVtZW50XG4gICAgICB0aGlzLm90aGVycy5mb3JFYWNoKChvdGhlcikgPT4ge1xuICAgICAgICBpZiAob3RoZXIgIT09IHRoaXMuZWxlbWVudCAmJiBvdGhlci5nZXRBdHRyaWJ1dGUoYXR0cikpXG4gICAgICAgICAgb3RoZXIuc2V0QXR0cmlidXRlKGF0dHIsICh2YWx1ZSA9PT0gJ3RydWUnKSA/ICdmYWxzZScgOiAndHJ1ZScpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVG9nZ2xpbmcgY29tcGxldGUgaG9va1xuICAgICAqL1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuYWZ0ZXIpXG4gICAgICB0aGlzLnNldHRpbmdzLmFmdGVyKHRoaXMpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn1cblxuLyoqIEB0eXBlICB7U3RyaW5nfSAgVGhlIG1haW4gc2VsZWN0b3IgdG8gYWRkIHRoZSB0b2dnbGluZyBmdW5jdGlvbiB0byAqL1xuVG9nZ2xlLnNlbGVjdG9yID0gJ1tkYXRhLWpzKj1cInRvZ2dsZVwiXSc7XG5cbi8qKiBAdHlwZSAge1N0cmluZ30gIFRoZSBuYW1lc3BhY2UgZm9yIG91ciBkYXRhIGF0dHJpYnV0ZSBzZXR0aW5ncyAqL1xuVG9nZ2xlLm5hbWVzcGFjZSA9ICd0b2dnbGUnO1xuXG4vKiogQHR5cGUgIHtTdHJpbmd9ICBUaGUgaGlkZSBjbGFzcyAqL1xuVG9nZ2xlLmluYWN0aXZlQ2xhc3MgPSAnaGlkZGVuJztcblxuLyoqIEB0eXBlICB7U3RyaW5nfSAgVGhlIGFjdGl2ZSBjbGFzcyAqL1xuVG9nZ2xlLmFjdGl2ZUNsYXNzID0gJ2FjdGl2ZSc7XG5cbi8qKiBAdHlwZSAge0FycmF5fSAgQXJpYSByb2xlcyB0byB0b2dnbGUgdHJ1ZS9mYWxzZSBvbiB0aGUgdG9nZ2xpbmcgZWxlbWVudCAqL1xuVG9nZ2xlLmVsQXJpYVJvbGVzID0gWydhcmlhLXByZXNzZWQnLCAnYXJpYS1leHBhbmRlZCddO1xuXG4vKiogQHR5cGUgIHtBcnJheX0gIEFyaWEgcm9sZXMgdG8gdG9nZ2xlIHRydWUvZmFsc2Ugb24gdGhlIHRhcmdldCBlbGVtZW50ICovXG5Ub2dnbGUudGFyZ2V0QXJpYVJvbGVzID0gWydhcmlhLWhpZGRlbiddO1xuXG4vKiogQHR5cGUgIHtBcnJheX0gIEZvY3VzYWJsZSBlbGVtZW50cyB0byBoaWRlIHdpdGhpbiB0aGUgaGlkZGVuIHRhcmdldCBlbGVtZW50ICovXG5Ub2dnbGUuZWxGb2N1c2FibGUgPSBbXG4gICdhJywgJ2J1dHRvbicsICdpbnB1dCcsICdzZWxlY3QnLCAndGV4dGFyZWEnLCAnb2JqZWN0JywgJ2VtYmVkJywgJ2Zvcm0nLFxuICAnZmllbGRzZXQnLCAnbGVnZW5kJywgJ2xhYmVsJywgJ2FyZWEnLCAnYXVkaW8nLCAndmlkZW8nLCAnaWZyYW1lJywgJ3N2ZycsXG4gICdkZXRhaWxzJywgJ3RhYmxlJywgJ1t0YWJpbmRleF0nLCAnW2NvbnRlbnRlZGl0YWJsZV0nLCAnW3VzZW1hcF0nXG5dO1xuXG4vKiogQHR5cGUgIHtBcnJheX0gIEtleSBhdHRyaWJ1dGUgZm9yIHN0b3JpbmcgdG9nZ2xlcyBpbiB0aGUgd2luZG93ICovXG5Ub2dnbGUuY2FsbGJhY2sgPSBbJ1RvZ2dsZXNDYWxsYmFjayddO1xuXG4vKiogQHR5cGUgIHtBcnJheX0gIERlZmF1bHQgZXZlbnRzIHRvIHRvIHdhdGNoIGZvciB0b2dnbGluZy4gRWFjaCBtdXN0IGhhdmUgYSBoYW5kbGVyIGluIHRoZSBjbGFzcyBhbmQgZWxlbWVudHMgdG8gbG9vayBmb3IgaW4gVG9nZ2xlLmVsZW1lbnRzICovXG5Ub2dnbGUuZXZlbnRzID0gWydjbGljaycsICdjaGFuZ2UnXTtcblxuLyoqIEB0eXBlICB7QXJyYXl9ICBFbGVtZW50cyB0byBkZWxlZ2F0ZSB0byBlYWNoIGV2ZW50IGhhbmRsZXIgKi9cblRvZ2dsZS5lbGVtZW50cyA9IHtcbiAgQ0xJQ0s6IFsnQScsICdCVVRUT04nXSxcbiAgQ0hBTkdFOiBbJ1NFTEVDVCcsICdJTlBVVCcsICdURVhUQVJFQSddXG59O1xuXG5leHBvcnQgZGVmYXVsdCBUb2dnbGU7XG4iLCIvLyBpbXBvcnQgc2hvd2Rvd24gZnJvbSBzaG93ZG93bjtcblxuY2xhc3MgQ01TIHtcbiAgY29uc3RydWN0b3IoKSB7XG5cbiAgfVxuXG4gIC8qKlxuICAgKiBbcmVmcmVzaCBkZXNjcmlwdGlvbl1cbiAgICpcbiAgICogQHBhcmFtICAge1t0eXBlXX0gIGRhdGEgIFtkYXRhIGRlc2NyaXB0aW9uXVxuICAgKlxuICAgKiBAcmV0dXJuICB7W3R5cGVdfSAgICAgICAgW3JldHVybiBkZXNjcmlwdGlvbl1cbiAgICovXG4gIHJlZnJlc2goaHRtbCwgbWV0YSkge1xuICAgIGxldCBtZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWpzPVwibWFya2Rvd25cIl0nKTtcblxuICAgIE9iamVjdC5rZXlzKG1ldGEpLm1hcChrZXkgPT4ge1xuICAgICAgbGV0IGVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtYmluZD1cIiR7a2V5fVwiXWApO1xuXG4gICAgICBlbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBjb25zb2xlLmRpcihlbGVtZW50KTtcblxuICAgICAgICBpZiAoZWxlbWVudCkgZWxlbWVudC5pbm5lckhUTUwgPSBtZXRhW2tleV07XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIG1kLmlubmVySFRNTCA9IGh0bWw7XG4gIH1cblxuICAvKipcbiAgICogW2NvbnRlbnQgZGVzY3JpcHRpb25dXG4gICAqXG4gICAqIEBwYXJhbSAgIHtbdHlwZV19ICBkYXRhICBbZGF0YSBkZXNjcmlwdGlvbl1cbiAgICpcbiAgICogQHJldHVybiAge1t0eXBlXX0gICAgICAgIFtyZXR1cm4gZGVzY3JpcHRpb25dXG4gICAqL1xuICBjb250ZW50KGRhdGEpIHtcbiAgICBzaG93ZG93bi5zZXRGbGF2b3IoJ2dpdGh1YicpO1xuXG4gICAgbGV0IGNvbnZlcnRlciA9IG5ldyBzaG93ZG93bi5Db252ZXJ0ZXIoe1xuICAgICAgbWV0YWRhdGE6IHRydWUsXG4gICAgICB0YWJsZXM6IHRydWVcbiAgICB9KTtcblxuICAgIGxldCBodG1sID0gY29udmVydGVyLm1ha2VIdG1sKGRhdGEpO1xuICAgIGxldCBtZXRhID0gY29udmVydGVyLmdldE1ldGFkYXRhKCk7XG5cbiAgICAvKipcbiAgICAgKiBQYWdlIFJlZnJlc2hcbiAgICAgKi9cblxuICAgIHJlZnJlc2goaHRtbCwgbWV0YSk7XG4gIH1cblxuICAvKipcbiAgICogW3JvdXRlciBkZXNjcmlwdGlvbl1cbiAgICpcbiAgICogQHJldHVybiAge1t0eXBlXX0gIFtyZXR1cm4gZGVzY3JpcHRpb25dXG4gICAqL1xuICBhc3luYyByb3V0ZXIoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGhhc2ggPSB3aW5kb3cubG9jYXRpb24uaGFzaDtcblxuICAgICAgaWYgKGhhc2ggJiYgaGFzaC5zdGFydHNXaXRoKCcjLycpKSB7XG4gICAgICAgIGxldCBQQUdFID0gaGFzaC5yZXBsYWNlKCcjLycsICcnKTtcbiAgICAgICAgbGV0IERJUkVDVE9SWSA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcblxuICAgICAgICBsZXQgcmVxdWVzdCA9IG5ldyBSZXF1ZXN0KGAke3RoaXMucGF0aH0ke0RJUkVDVE9SWX0ke1BBR0V9Lm1kYCk7XG4gICAgICAgIGxldCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlcXVlc3QpO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgIGxldCBkYXRhID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXG4gICAgICAgICAgY29udGVudChkYXRhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBUaGUgQ01TIHJlc3BvbmRlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c30uYCk7XG5cbiAgICAgICAgICBsZXQgcmVxNDA0ID0gbmV3IFJlcXVlc3QoYCR7Q01TfS80MDQubWRgKTtcbiAgICAgICAgICBsZXQgcmVzcDQwNCA9IGF3YWl0IGZldGNoKHJlcTQwNCk7XG5cbiAgICAgICAgICBpZiAocmVzcDQwNC5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgbGV0IGRhdGE0MDQgPSBhd2FpdCByZXNwNDA0LnRleHQoKTtcblxuICAgICAgICAgICAgY29udGVudChkYXRhNDA0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uID0gYCR7Q01TfS80MDRgO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2goZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogW3BhdGggZGVzY3JpcHRpb25dXG4gKlxuICogQHZhciB7W3R5cGVdfVxuICovXG5DTVMucGF0aCA9IGAke0NETl9CQVNFfSR7Q0ROfWA7XG5cbmV4cG9ydCBkZWZhdWx0IENNUztcbiIsImltcG9ydCBUb25pYyBmcm9tICdAc29ja2V0c3VwcGx5L3RvbmljL2luZGV4LmVzbSc7XG5pbXBvcnQgQ01TIGZyb20gJy4vY21zLmpzJztcblxuY2xhc3MgTnljb05hdiBleHRlbmRzIFRvbmljIHtcbiAgLyoqXG4gICAqIEdldHMgZGF0YSBmcm9tIGEgbG9jYWwgSlNPTiBkYXRhIHBhdGhcbiAgICpcbiAgICogQHBhcmFtICAge1N0cmluZ30gIGVuZHBvaW50ICBUaGUgbmFtZSBvZiB0aGUgZmlsZSB3aXRob3V0IGV4dGVuc2lvblxuICAgKlxuICAgKiBAcmV0dXJuICB7T2JqZWN0fSAgICAgICAgICAgIEpTT04gb2JqZWN0IG9mIHRoZSByZXNwb25zZVxuICAgKi9cbiAgIGFzeW5jIGdldChlbmRwb2ludCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke0NNUy5wYXRofS8ke2VuZHBvaW50fS5qc29uYCwge1xuICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAvLyBtb2RlOiAnc2FtZS1vcmlnaW4nLFxuICAgICAgICAvLyBjYWNoZTogJ2ZvcmNlLWNhY2hlJ1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT0gMjAwKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICdyZXNwb25zZSc6IGZhbHNlXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPSAncHJvZHVjdGlvbicpXG4gICAgICAgIGNvbnNvbGUuZGlyKGVycm9yKTsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby1jb25zb2xlXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBtYWluIGNvbXBvbmVudCByZW5kZXIgbWV0aG9kXG4gICAqXG4gICAqIEByZXR1cm4gIHtTdHJpbmd9ICBUaGUgY29tcGlsZWQgbmF2aWdhdGlvblxuICAgKi9cbiAgYXN5bmMgKiByZW5kZXIoKSB7XG4gICAgeWllbGQgdGhpcy5odG1sYDxwPkxvYWRpbmcgTmF2aWdhdGlvbi4uLjwvcD5gO1xuXG4gICAgdGhpcy5zdGF0ZSA9IGF3YWl0IHRoaXMuZ2V0KCduYXYnKTtcblxuICAgIGlmICh0aGlzLnN0YXRlLnJlc3BvbnNlID09PSBmYWxzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuaHRtbGA8cD5Db3VsZCBub3QgbG9hZCBuYXZpZ2F0aW9uPC9wPmA7XG4gICAgfVxuXG4gICAgbGV0IG5hdnMgPSBbXTtcblxuICAgIHRoaXMucHJvcHMuY2xhc3NlcyA9IEpTT04ucGFyc2UodGhpcy5wcm9wcy5jbGFzc2VzKTtcblxuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLnN0YXRlLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgbGV0IG5hdiA9IHRoaXMuc3RhdGVbaW5kZXhdLml0ZW1zLm1hcChlbGVtZW50ID0+IHtcbiAgICAgICAgcmV0dXJuICh0aGlzW2VsZW1lbnQudHlwZV0pID8gdGhpc1tlbGVtZW50LnR5cGVdKGVsZW1lbnQpIDogJyc7XG4gICAgICB9KTtcblxuICAgICAgbmF2cy5wdXNoKHRoaXMuaHRtbGA8bmF2IGNsYXNzPVwiJHt0aGlzLnByb3BzLmNsYXNzZXMubmF2fVwiPlxuICAgICAgICAke3RoaXMuaHRtbChuYXYpfVxuICAgICAgPC9uYXY+YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaHRtbGAke25hdnN9YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXJlciBmb3IgaGVhZGVyIGVsZW1lbnRzXG4gICAqXG4gICAqIEBwYXJhbSAgIHtPYmplY3R9ICBpdGVtICBUaGUgZGF0YSBmb3IgdGhlIGl0ZW1cbiAgICpcbiAgICogQHJldHVybiAge1N0cmluZ30gICAgICAgIFJlbmRlcmVkIGVsZW1lbnRcbiAgICovXG4gIGhlYWRlcihpdGVtKSB7XG4gICAgcmV0dXJuIHRoaXMuaHRtbGA8c3BhbiBjbGFzcz1cIiR7dGhpcy5wcm9wcy5jbGFzc2VzLmhlYWRlcn1cIj5cbiAgICAgICR7aXRlbS5sYWJlbH1cbiAgICA8L3NwYW4+YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXJlciBmb3IgbGluayBlbGVtZW50c1xuICAgKlxuICAgKiBAcGFyYW0gICB7T2JqZWN0fSAgaXRlbSAgVGhlIGRhdGEgZm9yIHRoZSBpdGVtXG4gICAqXG4gICAqIEByZXR1cm4gIHtTdHJpbmd9ICAgICAgICBSZW5kZXJlZCBlbGVtZW50XG4gICAqL1xuICBsaW5rKGl0ZW0pIHtcbiAgICByZXR1cm4gdGhpcy5odG1sYDxhIGNsYXNzPVwiJHt0aGlzLnByb3BzLmNsYXNzZXMubGlua31cIiB0YWJpbmRleD1cIiR7dGhpcy5wcm9wcy50YWJpbmRleGVzfVwiIGhyZWY9XCIke2l0ZW0uaHJlZn1cIj5cbiAgICAgICR7aXRlbS5sYWJlbH1cbiAgICA8L2E+YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW5kZXJlciBmb3Igc2VjdGlvbiBlbGVtZW50c1xuICAgKlxuICAgKiBAcGFyYW0gICB7T2JqZWN0fSAgaXRlbSAgVGhlIGRhdGEgZm9yIHRoZSBpdGVtXG4gICAqXG4gICAqIEByZXR1cm4gIHtTdHJpbmd9ICAgICAgICBSZW5kZXJlZCBlbGVtZW50XG4gICAqL1xuICBzZWN0aW9uKGl0ZW0pIHtcbiAgICByZXR1cm4gdGhpcy5odG1sYDxzcGFuIGNsYXNzPVwiJHt0aGlzLnByb3BzLmNsYXNzZXMuc2VjdGlvbn1cIj5cbiAgICAgICR7aXRlbS5sYWJlbH1cbiAgICA8L3NwYW4+YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBOeWNvTmF2O1xuIiwiaW1wb3J0IFRvbmljIGZyb20gJ0Bzb2NrZXRzdXBwbHkvdG9uaWMvaW5kZXguZXNtJztcblxuaW1wb3J0IEljb25zIGZyb20gJ0BueWNvcHBvcnR1bml0eS9wdHRybi1zY3JpcHRzL3NyYy9pY29ucy9pY29ucyc7XG5pbXBvcnQgVG9nZ2xlIGZyb20gJ0BueWNvcHBvcnR1bml0eS9wdHRybi1zY3JpcHRzL3NyYy90b2dnbGUvdG9nZ2xlJztcbmltcG9ydCBOeWNvTmF2IGZyb20gJy4vbnljby1uYXYuanMnO1xuXG5jb25zdCBDTVMgPSBgJHtDRE5fQkFTRX0ke0NETn1gO1xuXG5uZXcgSWNvbnMoJ2h0dHBzOi8vY2RuLmpzZGVsaXZyLm5ldC9naC9jaXR5b2ZuZXd5b3JrL255Y28tcGF0dGVybnNAdjIuNi44L2Rpc3Qvc3ZnL2ljb25zLnN2ZycpO1xubmV3IEljb25zKGAke0JBU0VfVVJMfS9zdmcvZmVhdGhlci5zdmdgKTtcbm5ldyBUb2dnbGUoKTtcblxuVG9uaWMuYWRkKE55Y29OYXYpO1xuXG4vKipcbiAqIFtyZWZyZXNoIGRlc2NyaXB0aW9uXVxuICpcbiAqIEBwYXJhbSAgIHtbdHlwZV19ICBkYXRhICBbZGF0YSBkZXNjcmlwdGlvbl1cbiAqXG4gKiBAcmV0dXJuICB7W3R5cGVdfSAgICAgICAgW3JldHVybiBkZXNjcmlwdGlvbl1cbiAqL1xubGV0IHJlZnJlc2ggPSAoaHRtbCwgbWV0YSkgPT4ge1xuICBsZXQgbWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1qcz1cIm1hcmtkb3duXCJdJyk7XG5cbiAgT2JqZWN0LmtleXMobWV0YSkubWFwKGtleSA9PiB7XG4gICAgbGV0IGVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW2RhdGEtYmluZD1cIiR7a2V5fVwiXWApO1xuXG4gICAgZWxlbWVudHMuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgIGNvbnNvbGUuZGlyKGVsZW1lbnQpO1xuXG4gICAgICBpZiAoZWxlbWVudCkgZWxlbWVudC5pbm5lckhUTUwgPSBtZXRhW2tleV07XG4gICAgfSk7XG4gIH0pO1xuXG4gIG1kLmlubmVySFRNTCA9IGh0bWw7XG5cbiAgd2luZG93LnNjcm9sbFRvKDAsIDApO1xufTtcblxuLyoqXG4gKiBbY29udGVudCBkZXNjcmlwdGlvbl1cbiAqXG4gKiBAcGFyYW0gICB7W3R5cGVdfSAgZGF0YSAgW2RhdGEgZGVzY3JpcHRpb25dXG4gKlxuICogQHJldHVybiAge1t0eXBlXX0gICAgICAgIFtyZXR1cm4gZGVzY3JpcHRpb25dXG4gKi9cbmNvbnN0IGNvbnRlbnQgPSAoZGF0YSkgPT4ge1xuICBzaG93ZG93bi5zZXRGbGF2b3IoJ2dpdGh1YicpO1xuXG4gIGxldCBjb252ZXJ0ZXIgPSBuZXcgc2hvd2Rvd24uQ29udmVydGVyKHtcbiAgICBtZXRhZGF0YTogdHJ1ZSxcbiAgICB0YWJsZXM6IHRydWVcbiAgfSk7XG5cbiAgbGV0IGh0bWwgPSBjb252ZXJ0ZXIubWFrZUh0bWwoZGF0YSk7XG4gIGxldCBtZXRhID0gY29udmVydGVyLmdldE1ldGFkYXRhKCk7XG5cbiAgLyoqXG4gICAqIFBhZ2UgUmVmcmVzaFxuICAgKi9cblxuICByZWZyZXNoKGh0bWwsIG1ldGEpO1xufVxuXG4vKipcbiAqIFtyb3V0ZXIgZGVzY3JpcHRpb25dXG4gKlxuICogQHJldHVybiAge1t0eXBlXX0gIFtyZXR1cm4gZGVzY3JpcHRpb25dXG4gKi9cbmNvbnN0IHJvdXRlciA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBoYXNoID0gd2luZG93LmxvY2F0aW9uLmhhc2g7XG5cbiAgICBpZiAoaGFzaCAmJiBoYXNoLnN0YXJ0c1dpdGgoJyMvJykpIHtcbiAgICAgIGxldCBQQUdFID0gaGFzaC5yZXBsYWNlKCcjLycsICcnKTtcbiAgICAgIGxldCBESVJFQ1RPUlkgPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XG5cbiAgICAgIGxldCByZXF1ZXN0ID0gbmV3IFJlcXVlc3QoYCR7Q01TfSR7RElSRUNUT1JZfSR7UEFHRX0ubWRgKTtcbiAgICAgIGxldCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlcXVlc3QpO1xuXG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgbGV0IGRhdGEgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cbiAgICAgICAgY29udGVudChkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYFRoZSBDTVMgcmVzcG9uZGVkIHdpdGggc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfS5gKTtcblxuICAgICAgICBsZXQgcmVxNDA0ID0gbmV3IFJlcXVlc3QoYCR7Q01TfS80MDQubWRgKTtcbiAgICAgICAgbGV0IHJlc3A0MDQgPSBhd2FpdCBmZXRjaChyZXE0MDQpO1xuXG4gICAgICAgIGlmIChyZXNwNDA0LnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgbGV0IGRhdGE0MDQgPSBhd2FpdCByZXNwNDA0LnRleHQoKTtcblxuICAgICAgICAgIGNvbnRlbnQoZGF0YTQwNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgd2luZG93LmxvY2F0aW9uID0gYCR7Q01TfS80MDRgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgfVxufTtcblxuLyoqXG4gKiBbYWRkRXZlbnRMaXN0ZW5lciBkZXNjcmlwdGlvbl1cbiAqXG4gKiBAcGFyYW0gICB7W3R5cGVdfSAgcG9wc3RhdGUgIFtwb3BzdGF0ZSBkZXNjcmlwdGlvbl1cbiAqIEBwYXJhbSAgIHtbdHlwZV19ICBhc3luYyAgICAgW2FzeW5jIGRlc2NyaXB0aW9uXVxuICpcbiAqIEByZXR1cm4gIHtbdHlwZV19ICAgICAgICAgICAgW3JldHVybiBkZXNjcmlwdGlvbl1cbiAqL1xud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgKCkgPT4ge1xuICByb3V0ZXIoKTtcbn0pO1xuXG5yb3V0ZXIoKTtcbiJdLCJuYW1lcyI6WyJDTVMiLCJyZWZyZXNoIiwiY29udGVudCJdLCJtYXBwaW5ncyI6Ijs7O0VBQUE7QUFFQTtFQUNBLE1BQU0sYUFBYSxDQUFDO0VBQ3BCLEVBQUUsV0FBVyxDQUFDLENBQUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUU7RUFDakQsSUFBSSxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUk7RUFDL0IsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLE9BQU07RUFDeEIsSUFBSSxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQU87RUFDMUIsSUFBSSxJQUFJ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Q0FBQyxFQUFFLENBQUMsRUFBRTtFQUN2RCxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUM7RUFDbEMsS0FBSztFQUNMLElBQUksTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsV0FBVyxFQUFFLEVBQUM7QUFDakU7RUFDQSxJQUFJLEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRTtFQUMxRCxNQUFNLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUM7RUFDNUIsTUFBTSxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQUs7QUFDeEM7RUFDQSxNQUFNLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRTtFQUNsQyxRQUFRLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUM7RUFDekMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFDO0VBQy9DLE9BQU8sTUFBTSxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7RUFDdkMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFDO0VBQzVDLE9BQU8sTUFBTSxJQUFJLENBQUMsS0FBSyxZQUFZLEVBQUU7RUFDckMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUk7RUFDL0IsT0FBTyxNQUFNLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENB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
