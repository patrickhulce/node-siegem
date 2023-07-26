import http from 'http';
import url from 'url';
import _ from 'lodash';

interface RequestOptions {
  method: string;
  headers: {[key: string]: string};
  url?: string;
  data?: string;
  urlParts?: url.UrlWithStringQuery;
}

interface ResponseOptions {
  requestDuration: number;
  responseDuration: number;
  totalDuration: number;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
}

class Target {
  private _options: RequestOptions;

  constructor(options: RequestOptions) {
    this._options = _.assign(
      {
        method: 'GET',
        headers: {},
        url: undefined,
        data: undefined,
        urlParts: undefined,
      },
      options
    );

    if (this._options.url) {
      this._options.urlParts = url.parse(this._options.url);
    }
  }

  public method(x: string): Target {
    this._options.method = x;
    return this;
  }

  public header(n: string, v?: string): Target {
    if (typeof v === 'undefined') {
      let parts = n.split(':');
      n = parts[0];
      v = parts.slice(1).join(':').trim();
    }

    this._options.headers[n] = v!;
    return this;
  }

  public url(x: string): Target {
    this._options.url = x;
    this._options.urlParts = url.parse(x);
    return this;
  }

  public data(x: string): Target {
    this._options.data = x;
    this._options.headers['content-length'] = x.length.toString();
    return this;
  }

  public request(nodeback: (err: Error | null, response: ResponseOptions) => void): void {
    let startedAt: number, sentAt: number;
    let req = http.request({
      method: this._options.method.toUpperCase(),
      protocol: this._options.urlParts!.protocol,
      port: this._options.urlParts!.port,
      host: this._options.urlParts!.hostname,
      path: this._options.urlParts!.path,
      headers: this._options.headers,
    });

    let done = (err: Error | null, response?: any) => {
      let now = Date.now();
      nodeback(
        err,
        _.assign(
          {
            requestDuration: sentAt - startedAt,
            responseDuration: now - sentAt,
            totalDuration: now - startedAt,
          },
          response
        )
      );
    };

    req.on('response', (res) => {
      let byteLength = 0;
      res.on('data', (chunk: any) => {
        byteLength += chunk.length;
      });

      res.on('end', () => {
        done(null, {
          statusCode: res.statusCode,
          httpVersion: res.httpVersion,
          bytes: _.get(res, 'headers.content-length', byteLength),
        });
      });
    });

    req.on('error', done);

    req.on('finish', () => {
      sentAt = Date.now();
    });

    if (this._options.data) {
      req.write(this._options.data);
    }

    startedAt = Date.now();
    req.end();
  }
}

export default Target;
