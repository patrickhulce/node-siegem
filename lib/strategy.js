var _ = require('lodash');

var Strategy = function (options) {
  options = _.assign({
    concurrency: 10,
    repetitions: undefined,
    time: undefined,
    delayMin: 0,
    delayMax: 1000,
  }, options);

  var strategy = {_options: options};
  strategy.concurrency = function (n) {
    options.concurrency = n;
    return strategy;
  };

  strategy.repeat = function (n) {
    options.repetitions = n;
    return strategy;
  };

  strategy.timed = function (s) {
    var match = s.match(/([0-9]+)(H|M|S)/i);
    if (!match) { throw Error('Unexpected timed format: [0-9]+(H|M|S)'); }
    var duration = Number(match[1]);
    var period = match[2].toUpperCase();

    if (period === 'H') {
      duration = duration * 60 * 60;
    } else if (period === 'M') {
      duration = duration * 60;
    }

    options.time = duration * 1000;
    return strategy;
  };

  strategy.delay = function (s) {
    options.delayMax = s;
    return strategy;
  };

  return strategy;
};


module.exports = Strategy;
