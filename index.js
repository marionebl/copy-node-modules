'use strict';

const path = require('path');
const fs = require('fs');
const jsonfile = require('jsonfile');
const up = require('find-up');
const {entries, merge, uniqBy, sortBy} = require('lodash');
const mkdirp = require('mkdirp-promise');
const ncp = require('graceful-ncp');
const sander = require('@marionebl/sander');
const throat = require('throat');

module.exports = copyNodeModules;

function copyNodeModules(options, callback) {
  const fn = find(options);
  const cp = copy(options);

  // both in and out props should be unique
  const pkgs = uniqBy(uniqBy(fn(), 'in'), 'out');

  return Promise.all(pkgs.map(throat(1, pkg => cp(pkg))));
}

// Check if path a is inside path b
function inside(candidate, parent) {
  if (candidate === parent) {
    return false;
  }
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
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
  return (pkg) => {
    return Promise.all([sander.exists(pkg.in), sander.exists(pkg.out)])
      .then(([inExists, outExists]) => {
        if (inExists && !outExists) {
          return mkdirp(path.dirname(pkg.out))
            .then(() => ncopy(pkg.in, pkg.out));
        }
      })
      .then(() => {
        sander.mkdirSync(options.out, '.bin');

        pkg.bin.map(bin => {
          const link = path.resolve(options.out, '.bin', bin.name);
          const target = path.resolve(options.out, '.bin', bin.target);
          chmodx(target);
          return symlink(bin.target, link);
        });
      });
  };
}

function ncopy(from, to) {
  return new Promise((resolve, reject) => {
    ncp(from, to, err => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function chmodx(file) {
  if (sander.existsSync(file)) {
    fs.chmodSync(file, 511);
  }
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

    const outPath = getOutPath(options, pkg, inPath);

    dep.in = inPath;
    dep.out = outPath;
    dep.bin = getBin(pkg, outPath);

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
      name: getBinName(name),
      target: path.relative(binRoot, path.resolve(base, target))
    };
  };
}

function getBinName(name) {
  if (name.charAt(0) !== '@') {
    return name;
  }
  return name.split('/')[1];
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

function getOutPath(options, pkg, inPath) {
  if (inPath.includes('/node_modules/')) {
    return path.resolve(options.out, path.relative(options.in, inPath));
  }
  return path.resolve(options.out, pkg.name);
}
