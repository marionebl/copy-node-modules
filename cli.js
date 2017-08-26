#!/usr/bin/env node
'use strict';

const meow = require('meow');
const copy = require('.');

main(meow(`
  copy-node-modules {options}
  
  Options
    --dev       Include dev dependencies
    --manifest  Source package.json file to read
    --in        Source node_modules to read
    --out       Out folder to write to
    --verbose   Enable verbose logs
`));

function main(cli) {
  return new Promise((resolve, reject) => {
    copy({
      devDependencies: cli.flags.dev,
      manifest: cli.flags.manifest,
      in: cli.flags.in,
      out: cli.flags.out,
      verbose: cli.flags.verbose
    }, (err, packages) => {
      if (err) {
        return reject(err);
      }
      resolve(packages);
    })
  });
}
