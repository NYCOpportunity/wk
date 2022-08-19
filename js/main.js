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
        })
        .catch((error) => {
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
  CMS$1.path = `${"https://raw.githubusercontent.com/nycopportunity/wk/"}${"content"}`;

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
      return this.html`<a class="${this.props.classes.link}" tabindex="${this.props.tabindexes}" href="${"https://nycopportunity.github.io/wk"}${item.href}">
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

  const CMS = `${"https://raw.githubusercontent.com/nycopportunity/wk/"}${"content"}`;

  new Icons('https://cdn.jsdelivr.net/gh/cityofnewyork/nyco-patterns@v2.6.8/dist/svg/icons.svg');
  new Icons(`${"https://nycopportunity.github.io/wk"}/svg/feather.svg`);
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
        let rawContent = window.location.href.replace("https://nycopportunity.github.io/wk", CMS).replace('#/', '');

        let request = new Request(`${rawContent}.md`);
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
