var http = require('http');
var parseUrl = require('url').parse;

var _ = require('lodash');

var Target = function (options) {
  options = _.assign({
    method: 'GET',
    headers: {},
    url: undefined,
    data: undefined,
    urlParts: undefined,
  }, options);

  if (options.url) {
    options.urlParts = parseUrl(options.url);
  }

  var startedAt;

  var target = {_options: options};
  target.method = function (x) {
    options.method = x;
    return target;
  };

  target.header = function (n, v) {
    if (typeof v === 'undefined') {
      var parts = n.split(':');
      n = parts[0];
      v = parts.slice(1).join(':').trim();
    }

    options.headers[n] = v;
    return target;
  };

  target.url = function (x) {
    options.url = x;
    options.urlParts = parseUrl(x);
    return target;
  };

  target.data = function (x) {
    options.data = x;
    return target;
  };

  target.request = function (nodeback) {
    var sentAt;
    var req = http.request({
      method: options.method.toUpperCase(),
      protocol: options.urlParts.protocol,
      port: options.urlParts.port,
      host: options.urlParts.hostname,
      path: options.urlParts.path,
      headers: options.headers,
    });

    req.on('response', function (res) {
      res.on('data', _.noop);
      res.on('end', _.noop);

      var now = Date.now();
      nodeback(null, {
        statusCode: res.statusCode,
        httpVersion: res.httpVersion,
        bytes: _.get(res, 'headers.content-length', 0),
        requestDuration: sentAt - startedAt,
        responseDuration: now - sentAt,
        totalDuration: now - startedAt,
      });
    });

    req.on('error', nodeback);

    req.on('finish', function () {
      sentAt = Date.now();
    });

    if (options.data) {
      req.write(options.data);
    }

    startedAt = Date.now();
    req.end();
  };

  return target;
};

module.exports = Target;
