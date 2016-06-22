require('colors');
var _ = require('lodash');

var padTo = function (s, l, prepend) {
  s = String(s);
  if (s.length >= l) { return s; }
  var padding = _.fill(Array(l - s.length), ' ').join('');
  return prepend ? padding + s : s + padding;
};

module.exports = function ClassicReporter(options) {
  options = _.assign({
    quiet: false,
    longUrl: false,
    stream: process.stdout,
  }, options);

  var startedAt, stoppedAt;
  var requests = [];

  var getColorized = function (message, statusCode) {
    if (200 <= statusCode && statusCode < 300) {
      return message.blue;
    } else if (statusCode < 400) {
      return message.cyan;
    } else if (statusCode < 500) {
      return message.magenta;
    } else {
      return message.red;
    }
  };

  var write = function (x) {
    var s = Array.prototype.slice.call(arguments).join(' ');
    options.stream.write(s + '\n');
  };

  var stat = function (name, value, measurement) {
    value = String(Math.round(value * 1000) / 1000);

    var header = padTo(name + ':', 25);
    var value = padTo(value, 10, true);
    write(header, value, measurement);
  };

  return {
    start: function () {
      startedAt = Date.now();
      write('** SIEGEM 0.1.0');
      write('** Preparing users for battle.');
      write('The server is now under siege...');
    },
    stop: function () {
      stoppedAt = Date.now();
      write('\nLifting the server siege...');
    },
    record: function (item) {
      var failed = item.failure || item.statusCode >= 400;
      requests.push(_.assign({failed: failed}, item));
      if (options.quiet) { return; }

      if (item.failure) {
        write('[' + 'error'.yellow + '] ' + item.failure.message);
      } else {
        var status = 'HTTP/' + item.httpVersion + ' ' + item.statusCode;
        var duration = padTo(item.totalDuration, 7, true) + padTo(' ms:', 10);
        var bytes = item.bytes + ' bytes ==> ';
        var url = item.method + ' ' + (options.longUrl ? item.url : item.path);
        var s = status + duration + bytes + url;
        write(getColorized(s, item.statusCode));
      }
    },
    report: function (concurrencySnapshots) {
      var total = requests.length;
      var successful = _.reject(requests, 'failed').length;
      var failed = total - successful;
      var concurrency = _.sumBy(concurrencySnapshots, 'count') / concurrencySnapshots.length;

      var sortedRequests = _.sortBy(requests, 'totalDuration');
      var elapsedTime = (stoppedAt - startedAt) / 1000;
      var responseTime = _.sumBy(requests, 'totalDuration') / total;

      var durationOf = function (i) { return _.get(sortedRequests, i + '.totalDuration'); }

      write('\n');
      stat('Transactions', total);
      stat('Availability',  (successful / total) * 100, '%');
      stat('Elapsed time', elapsedTime, 's');
      stat('Response time', responseTime, 'ms');
      stat('Transaction rate', total / elapsedTime, 'trans/sec');
      stat('Average Concurrency', concurrency);
      stat('Successful transactions', successful);
      stat('Failed transactions', failed);
      stat('Longest transaction', durationOf(sortedRequests.length - 1), 'ms');
      stat('90th percentile', durationOf(Math.round(sortedRequests.length * 9 / 10) - 1), 'ms');
      stat('50th percentile', durationOf(Math.round(sortedRequests.length / 2) - 1), 'ms');
      stat('Shortest transaction', durationOf(0), 'ms');
    }
  }
};
