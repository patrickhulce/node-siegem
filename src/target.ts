import http from 'http';
import _ from 'lodash';

interface RequestOptions {
  method: string;
  headers: {[key: string]: string};
  url: URL;
  data?: string;
}

interface ResponseOptions {
  requestDuration: number;
  responseDuration: number;
  totalDuration: number;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
}

export class Target {
  private _options: RequestOptions;

  constructor(options: Partial<RequestOptions> & Pick<RequestOptions, 'url'>) {
    this._options = {
      method: 'GET',
      headers: {},
      data: undefined,
      ...options,
    };
  }

  public method(x: string): Target {
    this._options.method = x;
    return this;
  }

  public header(name: string, value?: string): Target {
    if (typeof value === 'undefined') {
      let parts = name.split(':');
      name = parts[0];
      value = parts.slice(1).join(':').trim();
    }

    this._options.headers[name] = value;
    return this;
  }

  public url(url: string): Target {
    this._options.url = new URL(url);
    return this;
  }

  public data(payload: string): Target {
    this._options.data = payload;
    this._options.headers['content-length'] = payload.length.toString();
    return this;
  }

  public request(nodeback: (err: Error | null, response: ResponseOptions) => void): void {
    const url = this._options.url;
    if (!url) throw new Error(`Failed to provide a URL for target`);

    let startedAt: number, sentAt: number;

    let req = http.request(url, {
      method: this._options.method.toUpperCase(),
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
