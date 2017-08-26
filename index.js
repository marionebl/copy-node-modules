'use strict';

const path = require('path');
const fs = require('fs');
const jsonfile = require('jsonfile');
const ncp = require('ncp').ncp;
const exists = require('path-exists');
const up = require('find-up');
const mkdirp = require('mkdirp-promise');
const {entries, merge, uniqBy} = require('lodash');
const sander = require('sander');

module.exports = copyNodeModules;

function copyNodeModules(options, callback) {
  const pkgs = uniqBy(find(options)(), 'name');
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
      exists(pkg.out)
        .then(e => {
          if (e) {
            return resolve();
          }
          return mkdirp(pkg.out);
        })
        .then(() => exists(pkg.out))
        .then(e => cp(pkg.in, pkg.out, opts))
        .then(() => {
          return Promise.all(pkg.bin.map(b => {
            return mkdirp(path.join(options.out, '.bin'))
              .then(() => {
                const to = path.resolve(options.out, '.bin', b.name);
                if (!exists.sync(to)) {
                  return sander.symlink(b.target).to(to);
                }
              });
          }));
        })
    });
  };
}

function cp(from, to, opts) {
  return new Promise((resolve, reject) => {
    ncp(from, to, opts, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function getDeps(base, options, seed = []) {
  const manifest = path.join(base, 'package.json');
  const pkg = jsonfile.readFileSync(manifest);

  if (seed.some(s => s.name === pkg.name)) {
    return seed;
  }

  const deps = entries(pkg.dependencies || {}).map(([name, version]) => ({name, version}));

  if (options.devDependencies) {
    const dev = entries(pkg.devDependencies || {}).map(([name, version]) => ({name, version}));
    Array.prototype.push.apply(deps, dev);
  }

  return deps
    .reduce((dependencies, dep) => {
      if (!seed.some(d => d.name === dep.name) && !dependencies.some(d => d.name === dep.name)) {
        dep.in = getPath(options.in, dep.name);
        dep.out = path.resolve(options.out, dep.name);
        const dp = jsonfile.readFileSync(path.join(dep.in, 'package.json'));
        dep.bin = getBin(dp, dep.in);
        dependencies.push(dep);
        Array.prototype.push.apply(dependencies, uniqBy(getDeps(dep.in, options, dependencies), 'id'));
      }
      return dependencies;
    }, []);
}

function getBin(manifest, base) {
  if (!manifest.bin) {
    return [];
  }
  if (typeof manifest.bin === 'string') {
    return [
      {
        name: manifest.name,
        target: path.resolve(base, manifest.bin)
      }
    ];
  }
  return entries(manifest.bin).map(([name, target]) => ({name: name, target: path.resolve(base, target)}));
}

function getPath(base, name) {
  const file = path.join(base, name);

  if (exists.sync(file)) {
    return fs.realpathSync(file);
  }

  const next = up.sync('node_modules', {cwd: path.join(base, '../..')});

  if (!next) {
    throw new Error(`Could not resolve ${name}`);
  }

  return getPath(next, name);
}
