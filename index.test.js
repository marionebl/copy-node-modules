const sander = require('sander');
const path = require('path');
const test = require('ava');
const eject = require('.');

const fixture = path.resolve.bind(null, __dirname, 'fixtures');

test('graph() basic', async t => {
  const pkg = await json(fixture('basic/packages/a/package.json'))
  const g = await eject.graph(pkg, fixture('basic/packages/a'));

  t.deepEqual([
    {
      bin: [],
      cwd: 'fixtures/basic/packages/a',
      name: 'b',
      version: '1.0.0',
      location: '../../node_modules/b/package.json'
    }
  ], g);
});

test('graph() missing', async t => {
  const pkg = await json(fixture('missing/packages/a/package.json'));
  const actual = eject.graph(pkg, fixture('missing/packages/a'));
  await t.throws(actual, /Could not resolve b@\*/);
});

test('graph() mismatch', async t => {
  const pkg = await json(fixture('mismatch/packages/a/package.json'));
  const actual = eject.graph(pkg, fixture('mismatch/packages/a'));
  await t.throws(actual, /Could not resolve b@1/);
});

test('graph() specific', async t => {
  const pkg = await json(fixture('specific/packages/a/package.json'))
  const g = await eject.graph(pkg, fixture('specific/packages/a'));

  t.deepEqual([
    {
      bin: [],
      cwd: 'fixtures/specific/packages/a',
      name: 'b',
      version: '1.0.0',
      location: 'node_modules/b/package.json'
    }
  ], g);
});

test('graph() fallback', async t => {
  const pkg = await json(fixture('fallback/packages/a/package.json'))
  const g = await eject.graph(pkg, fixture('fallback/packages/a'));

  t.deepEqual([
    {
      bin: [],
      cwd: 'fixtures/fallback/packages/a',
      name: 'b',
      version: '2.0.0',
      location: '../../node_modules/b/package.json'
    }
  ], g);
});

async function json(file) {
  return JSON.parse(String(await sander.readFile(file)));
}
