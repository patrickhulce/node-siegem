import http from 'http';

export interface TargetOptions {
  method: string;
  headers: {[key: string]: string};
  url: URL;
  data?: string;
}

export interface ResponseData {
  requestDuration: number;
  responseDuration: number;
  totalDuration: number;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
}

export class Target {
  public options: TargetOptions;

  constructor(options: Partial<TargetOptions> & Pick<TargetOptions, 'url'>) {
    this.options = {
      method: 'GET',
      headers: {},
      data: undefined,
      ...options,
    };
  }

  public method(x: string): Target {
    this.options.method = x;
    return this;
  }

  public header(name: string, value?: string): Target {
    if (typeof value === 'undefined') {
      let parts = name.split(':');
      name = parts[0];
      value = parts.slice(1).join(':').trim();
    }

    this.options.headers[name] = value;
    return this;
  }

  public url(url: string): Target {
    this.options.url = new URL(url);
    return this;
  }

  public data(payload: string): Target {
    this.options.data = payload;
    this.options.headers['content-length'] = payload.length.toString();
    return this;
  }

  public request(nodeback: (err: Error | null, response: ResponseData) => void): void {
    const url = this.options.url;
    if (!url) throw new Error(`Failed to provide a URL for target`);

    let startedAt: number, sentAt: number;

    let req = http.request(url, {
      method: this.options.method.toUpperCase(),
      headers: this.options.headers,
    });

    let done = (
      err: Error | null,
      response?: Pick<ResponseData, 'bytes' | 'statusCode' | 'httpVersion'>
    ) => {
      let now = Date.now();
      nodeback(err, {
        requestDuration: sentAt - startedAt,
        responseDuration: now - sentAt,
        totalDuration: now - startedAt,
        ...response,
      });
    };

    req.on('response', (res) => {
      let byteLength = 0;
      res.on('data', (chunk: Uint8Array | string | Buffer) => {
        byteLength += chunk.length;
      });

      res.on('end', () => {
        done(null, {
          statusCode: res.statusCode,
          httpVersion: res.httpVersion,
          bytes: res.headers['content-length'] ?? byteLength,
        });
      });
    });

    req.on('error', done);

    req.on('finish', () => {
      sentAt = Date.now();
    });

    if (this.options.data) {
      req.write(this.options.data);
    }

    startedAt = Date.now();
    req.end();
  }
}
