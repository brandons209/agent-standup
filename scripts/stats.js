// npm run stats — what the project can see about itself, from GitHub's own counters only (no server, no tracking of people).
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
const repo = 'Atoll92/agent-standup', snap = path.join(os.homedir(), '.agent-standup-stats.json');
const prev = fs.existsSync(snap) ? JSON.parse(fs.readFileSync(snap, 'utf8')) : { at: null, n: {} };
const now = { n: {} };
for (const r of gh(['api', `repos/${repo}/releases`, '--paginate'])) for (const a of r.assets) now.n[(r.tag_name === 'stats' ? 'px:' : 'dl:') + a.name] = a.download_count;
const d = (k) => now.n[k] - (prev.n[k] || 0), sum = (pre) => Object.keys(now.n).filter((k) => k.startsWith(pre)).reduce((s, k) => s + now.n[k], 0);
const traffic = (p) => { try { return gh(['api', `repos/${repo}/traffic/${p}`]); } catch { return null; } };
console.log(`since ${prev.at || 'the beginning'}:\n`);
console.log('Landing visits by source:'); for (const k of Object.keys(now.n).filter((k) => k.startsWith('px:'))) console.log('  ', k.slice(9, -4).padEnd(12), now.n[k], prev.at ? `(+${d(k)})` : '');
console.log('Downloads of .vsix from GitHub releases:', sum('dl:'), prev.at ? `(+${Object.keys(now.n).filter((k) => k.startsWith('dl:')).reduce((s, k) => s + d(k), 0)})` : '', '— note: HEAD requests and bots count too');
const v = traffic('views'), c = traffic('clones'); if (v) console.log('Repo views (14 d):', v.count, 'unique', v.uniques); if (c) console.log('Repo clones (14 d):', c.count, 'unique', c.uniques);
console.log('\nMarketplace installs: see https://marketplace.visualstudio.com/manage (Acquisition tab).');
fs.writeFileSync(snap, JSON.stringify({ at: new Date().toISOString().slice(0, 16).replace('T', ' '), n: now.n }));
