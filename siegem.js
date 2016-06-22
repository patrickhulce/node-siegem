#!/usr/bin/env node
process.title = process.title.replace(/^node(.*)/, 'siegem$1');

var _ = require('lodash');
var fs = require('fs');
var yargs = require('yargs');

var Strategy = require('./lib/strategy');
var Target = require('./lib/target');
var Attack = require('./lib/attack');
var ClassicReporter = require('./lib/reporters/classic');

var parser = yargs.
  usage('Usage: $0 [options] URL').
  example('siegem -c 50 -d0 -r 10 http://localhost:3000/ping').
  example('siegem -c 5 -t 5m -X POST http://localhost:3000/refresh').
  example('siegem -X PUT --data "foo=bar" http://localhost:3000/a').
  example('siegem -X PUT --data @my_file.json http://localhost:3000/b').
  help('h').
  alias('h', 'help').
  wrap(yargs.terminalWidth()).
  group(['method', 'headers', 'data'], 'Request Options:').
  options({
    concurrent: {
      alias: 'c',
      describe: 'Number of concurrent users',
      default: 10,
      requiresArg: true,
      type: 'number',
    },
    reps: {
      alias: 'r',
      describe: 'Number of times to run the test',
      requiresArg: true,
      type: 'number',
    },
    time: {
      alias: 't',
      describe: 'Duration to run the test, format: 1H, 2M, 45S',
      requiresArg: true,
      type: 'string',
    },
    delay: {
      alias: 'd',
      describe: 'Maximum time to delay each request in miliseconds',
      default: 1000,
      requiresArg: true,
      type: 'number',
    },
    quiet: {
      alias: 'q',
      describe: 'Supresses logging of each request',
      type: 'boolean',
    },
    file: {
      alias: 'f',
      describe: 'File where each line is a set of request options'
    },
    chaotic: {
      describe: 'Process lines in file in random order',
      type: 'boolean',
    },
    method: {
      alias: 'X',
      describe: 'Method to use for the request',
      default: 'GET',
      type: 'string',
      requiresArg: true,
      choices: ['HEAD', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    headers: {
      alias: 'H',
      describe: 'Headers to set on the request',
      type: 'string',
      requiresArg: true,
    },
    data: {
      describe: 'Data for body of request',
      type: 'string',
    }
  });

var getAbsolutePath = function (p) {
  if (p.charAt(0) === '/') { return p; }
  return process.cwd() + '/' + p;
};

var constructTarget = function (options, i) {
  var url = options._[0];
  if (!url) { throw Error('Malformed request options on line ' + (i + 1) + ': url required'); }
  if (options.headers && !_.isArray(options.headers)) { options.headers = [options.headers]; }

  var target = new Target().url(options._[0]);
  if (options.method) { target.method(options.method); }
  if (options.headers) { options.headers.forEach(_.unary(target.header)); }
  if (options.data) {
    if (options.data.charAt(0) === '@') {
      var filePath = getAbsolutePath(options.data.slice(1));
      target.data(fs.readFileSync(filePath));
    } else {
      target.data(options.data);
    }
  }

  return target;
};

var options = parser.argv;
var strategy = new Strategy({concurrency: options.concurrent});
if (options.reps) { strategy.repeat(options.reps); }
if (options.time) { strategy.timed(options.time); }
if (typeof options.delay === 'number') { strategy.delay(options.delay); }

var reporter = new ClassicReporter({quiet: options.quiet});

var targets = [];
if (options.file) {
  var file = fs.readFileSync(getAbsolutePath(options.file), 'utf8');
  var lines = file.split('\n').filter(Boolean);
  var parseOpts = parser.parse.bind(parser);
  targets = lines.map(parseOpts).map(constructTarget);
} else if (options._.length > 0) {
  targets = [constructTarget(options)];
} else {
  parser.showHelp();
  process.exit(1);
}

var attack = new Attack({
  isChaotic: options.chaotic,
  strategy: strategy,
  targets: targets,
  reporters: [reporter],
});

attack.start();

process.on('SIGINT', function () {
  attack.stop();
});
