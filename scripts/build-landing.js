// Builds docs/index.html (the GitHub Pages landing page) from landing/template.html,
// pulling the character art straight out of the app (public/js/cast.js, public/app.css) so the two never drift apart.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'public/js/cast.js'), 'utf8'), app = fs.readFileSync(path.join(root, 'public/app.css'), 'utf8');
const cssStart = app.indexOf('/* character animation'), cssEndMark = '@media (prefers-reduced-motion:reduce)', cssEnd = app.indexOf(cssEndMark, cssStart), css = app.slice(cssStart, app.indexOf('\n', cssEnd));
if (!js.includes('//  cast: soft mascots') || cssStart < 0 || cssEnd < 0) throw new Error('art markers not found in public/js/cast.js or public/app.css');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = fs.readFileSync(path.join(root, 'landing/template.html'), 'utf8')
  .replace('/*ART_CSS*/', () => css).replace('/*ART_JS*/', () => js).replace(/__VERSION__/g, version);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), out);
fs.copyFileSync(path.join(root, 'media/icon.png'), path.join(root, 'docs/icon.png'));
console.log('docs/index.html built (' + Math.round(out.length / 1024) + ' KB, v' + version + ')');
