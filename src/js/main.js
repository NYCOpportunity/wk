import Icons from '@nycopportunity/pttrn-scripts/src/icons/icons';
import Toggle from '@nycopportunity/pttrn-scripts/src/toggle/toggle';
import Track from '@nycopportunity/pttrn-scripts/src/track/track';

const CMS = `${CDN_BASE}${CDN}`;

new Icons('https://cdn.jsdelivr.net/gh/cityofnewyork/nyco-patterns@v2.6.8/dist/svg/icons.svg');
new Icons('svg/feather.svg');
new Toggle();
new Track();

// Get the content markdown from CDN and append
let markdowns = document.querySelectorAll('[id^="markdown"]');

markdowns.forEach(async md => {
  try {
    let PAGE = md.getAttribute('id').replace('markdown-', '');
    let request = new Request(`${CMS}/${PAGE}.md`);
    let response = await fetch(request);

    if (response.status === 200) {
      let data = await response.text();

      showdown.setFlavor('github');

      let converter = new showdown.Converter({
        tables: true
      });

      md.innerHTML = converter.makeHtml(data);
    } else {
      console.dir(`The CMS responded with status ${response.status}.`);
    }
  } catch(err) {
    console.error(err);
  }
});
