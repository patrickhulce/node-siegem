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
    options.headers['content-length'] = x.length;
    return target;
  };

  target.request = function (nodeback) {
    var startedAt, sentAt;
    var req = http.request({
      method: options.method.toUpperCase(),
      protocol: options.urlParts.protocol,
      port: options.urlParts.port,
      host: options.urlParts.hostname,
      path: options.urlParts.path,
      headers: options.headers,
    });

    function done(err, response) {
      var now = Date.now();
      nodeback(err, _.assign({
        requestDuration: sentAt - startedAt,
        responseDuration: now - sentAt,
        totalDuration: now - startedAt,
      }, response));
    }

    req.on('response', function (res) {
      var byteLength = 0;
      res.on('data', function (chunk) {
        byteLength += chunk.length;
      });

      res.on('end', function () {
        done(null, {
          statusCode: res.statusCode,
          httpVersion: res.httpVersion,
          bytes: _.get(res, 'headers.content-length', byteLength),
        });
      });
    });

    req.on('error', done);

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
