'use strict';

const path = require('path');
const fs = require('fs');
const jsonfile = require('jsonfile');
const up = require('find-up');
const {entries, merge, uniqBy, sortBy} = require('lodash');
const sander = require('sander');

module.exports = copyNodeModules;

function copyNodeModules(options, callback) {
  const pkgs = uniqBy(find(options)(), 'in');
  return Promise.all(pkgs.map(pkg => copy(options)(pkg)));
}

function find(options) {
  return () => {
    return getDeps(path.dirname(path.resolve(options.manifest)), {
      in: options.in,
      out: options.out,
      devDependencies: options.devDependencies
    });
  }
}

function copy(options) {
  const opts = {
    clobber: false,
    dereference: true,
    filter: name => {
      const frags = path.dirname(name).split(path.sep);
      return frags[frags.length - 1] !== '.bin';
    }
  };

  return (pkg) => {
    return new Promise((resolve, reject) => {
      sander.exists(pkg.out)
        .then(e => {
          if (!e) {
            return sander.copydir(pkg.in).to(pkg.out);
          }
        })
        .then(() => {
          return sander.mkdir(options.out, '.bin')
            .then(() => {
              return Promise.all(pkg.bin.map(b => {
                const link = path.resolve(options.out, '.bin', b.name);
                const target = path.resolve(options.out, '.bin', b.target);

                if (sander.existsSync(target)) {
                  fs.chmodSync(target, 511);
                }

                return symlink(b.target, link);
              }));
            });
        })
    });
  };
}

function symlink(target, link) {
  if (linkExists(link)) {
    fs.unlinkSync(link);
  }
  fs.symlinkSync(target, link);
}

function linkExists(link) {
  try {
    return Boolean(fs.readlinkSync(link));
  } catch (err) {
    return false;
  }
}

function getDeps(base, options) {
  const manifest = path.join(base, 'package.json');
  const pkg = jsonfile.readFileSync(manifest);

  const deps = entries(pkg.dependencies || {}).map(([name, version]) => ({name, version}));

  if (options.devDependencies) {
    const dev = entries(pkg.devDependencies || {}).map(([name, version]) => ({name, version}));
    Array.prototype.push.apply(deps, dev);
  }

  const dir = path.resolve(options.in);
  return sortBy(getGraph(dir, options, deps), 'name');
}

function getGraph(base, options, deps, graph = []) {
  return deps.reduce((subgraph, dep) => {
    const inPath = getPath(base, dep.name);
    const pkg = jsonfile.readFileSync(path.join(inPath, 'package.json'));

    if (graph.some(node => node.in === inPath)) {
      return subgraph;
    }

    dep.in = inPath;
    dep.out = path.resolve(options.out, path.relative(options.in, inPath));
    dep.bin = getBin(pkg, inPath);

    graph.push(dep);
    subgraph.push(dep);

    const dependencies = entries(pkg.dependencies || {}).map(([name, version]) => ({name, version}));
    const graphDeps = getGraph(path.join(inPath, 'node_modules'), options, dependencies, graph);

    Array.prototype.push.apply(subgraph, graphDeps);
    return subgraph;
  }, []);
}

function getBin(manifest, base) {
  if (!manifest.bin) {
    return [];
  }

  const entry = getBinEntry(base);

  if (typeof manifest.bin === 'string') {
    return [entry(manifest.name, manifest.bin)];
  }

  return entries(manifest.bin)
    .map(([name, target]) => entry(name, target));
}

function getBinEntry(base) {
  const binRoot = getBinRoot(base);

  return (name, target) => {
    return {
      name: name,
      target: path.relative(binRoot, path.resolve(base, target))
    };
  };
}

function getBinRoot(base) {
  const fragments = base.split(path.sep);
  return fragments
    .slice(0, fragments.lastIndexOf('node_modules') + 1)
    .concat(['.bin'])
    .join(path.sep);
}

function getPath(base, name) {
  const file = path.join(base, name);

  if (sander.existsSync(file)) {
    return fs.realpathSync(file);
  }

  const next = up.sync('node_modules', {cwd: path.join(base, '../..')});

  if (!next) {
    throw new Error(`Could not resolve ${name}`);
  }

  return getPath(next, name);
}
