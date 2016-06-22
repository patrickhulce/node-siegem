var _ = require('lodash');
var uuid = require('node-uuid');

var Attack = function (options) {
  options = _.assign({
    isChaotic: false,
    strategy: undefined,
    targets: [],
    reporters: [],
  }, options);

  if (!options.strategy) {
    throw Error('A strategy is required');
  } else if (!_.isArray(options.targets) || options.targets.length === 0) {
    throw Error('One or more targets are required');
  }

  var attack = {_options: options};
  var state = attack._state = {
    isRequesting: false,
    startedAt: undefined,
    lastTarget: -1,
    numOutstanding: 0,
    numCompleted: 0,
    concurrencySnapshots: [],
  };

  var strategy = attack._strategy = _.clone(options.strategy._options);

  var isDoneRequesting = function () {
    var currentNumRequests = state.numCompleted + state.numOutstanding;
    var repetitionsMet = strategy.repetitions &&
      strategy.repetitions * strategy.concurrency <= currentNumRequests;

    var currentElapsed = Date.now() - state.startedAt;
    var timeMet = strategy.time && strategy.time <= currentElapsed;
    return !state.isRequesting || repetitionsMet || timeMet;
  };

  var recordRequest = function (err, response, target) {
    var item = _.assign({
      failure: err,
      method: target._options.method,
      url: target._options.url,
      path: target._options.urlParts.path,
    }, response);

    options.reporters.forEach(function (reporter) {
      reporter.record(item);
    });
  };

  var requestAndContinue = attack._requestAndContinue = function () {
    if (isDoneRequesting()) { return; }
    var target = selectNextTarget();
    var delay = _.random(strategy.delayMin, strategy.delayMax);
    state.numOutstanding += 1;

    var go = function () {
      if (!state.isRequesting) {
        state.numOutstanding -= 1;
        return;
      }

      target.request(function (err, response) {
        state.numOutstanding -= 1;
        if (!state.isRequesting) { return; }

        state.numCompleted += 1;
        recordRequest(err, response, target);
        requestAndContinue();
      });
    };

    if (delay) {
      setTimeout(go, delay);
    } else {
      go();
    }
  };

  var selectNextTarget = function () {
    if (options.targets.length === 0) { throw Error('Need at least 1 target!'); }
    if (options.isChaotic) {
      return _.sample(options.targets);
    } else {
      var nextIndex = (state.lastTarget + 1) % options.targets.length;
      state.lastTarget = nextIndex;
      return options.targets[nextIndex];
    }
  };

  var periodically = function () {
    state.concurrencySnapshots.push({count: state.numOutstanding, time: Date.now()});
    if (isDoneRequesting() && state.numOutstanding === 0) {
      clearInterval(state.interval);
      if (state.isRequesting) {
        options.reporters.forEach(function (r) { r.stop(); });
      }

      attack.report();
    }
  };

  attack.start = function () {
    if (state.startedAt) { return; }
    state.startedAt = Date.now();
    state.isRequesting = true;
    state.interval = setInterval(periodically, 10);
    _.times(strategy.concurrency, requestAndContinue);
    _.forEach(options.reporters, function (r) { r.start(); });
  };

  attack.stop = function () {
    state.isRequesting = false;
    options.reporters.forEach(function (r) { r.stop(); });
  };

  attack.report = function () {
    options.reporters.forEach(function (reporter) {
      reporter.report(state.concurrencySnapshots);
    });
  };

  return attack;
};


module.exports = Attack;
