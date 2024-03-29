import http from 'http';
import https from 'https';
import _ from 'lodash';

export interface TargetOptions {
  id: string;
  method: string;
  weight: number;
  headers: {[key: string]: string};
  urlTemplate: string;
  dataTemplate?: string;
}

export interface ResponseData {
  url: URL;
  requestDuration: number;
  firstByteDuration?: number;
  downloadDuration?: number;
  totalDuration: number;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
  body?: Buffer[];
}

const TARGET_REFERENCE_REGEX = /%%([^./]+)(\/|@)([^%]+)%%/;

export class Target {
  public options: TargetOptions;
  public lastResponse: ResponseData | undefined;

  constructor(options: Partial<TargetOptions> & Pick<TargetOptions, 'id' | 'urlTemplate'>) {
    this.options = {
      method: 'GET',
      headers: {},
      weight: 1,
      dataTemplate: undefined,
      ...options,
    };
  }

  public method(x: string): Target {
    this.options.method = x;
    return this;
  }

  public weight(x: number): Target {
    if (!Number.isInteger(x)) throw new Error(`Weight ${x} is not an integer`);
    this.options.weight = x;
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
    this.options.urlTemplate = url;
    return this;
  }

  public data(payload: string): Target {
    this.options.dataTemplate = payload;
    this.options.headers['content-length'] = payload.length.toString();
    return this;
  }

  public static findTargetIdsInData(data: string | undefined): string[] {
    if (!data) return [];

    const matches = Array.from(data.matchAll(new RegExp(TARGET_REFERENCE_REGEX, 'g')));
    return matches.map((match) => match?.[1]);
  }

  public static prepareData(id: string, data: string, targets: Record<string, Target>): string {
    const replacements = data.matchAll(new RegExp(TARGET_REFERENCE_REGEX.source, 'g'));

    for (const replacement of replacements) {
      const match = replacement[0].match(TARGET_REFERENCE_REGEX);
      if (!match) throw new Error(`Impossible, it was just a match`);

      const [, targetId, joiner, subregexOrProperty] = match;
      const targetBody = targets[targetId]?.lastResponse?.body;
      if (!targetBody) {
        throw new Error(`Failed to find target body "${targetId}" for target "${id}"`);
      }

      const bodyAsString = targetBody.map((buffer) => buffer.toString()).join('');

      if (joiner === '@') {
        const keys = subregexOrProperty.split('.');
        const json = JSON.parse(bodyAsString);
        const value = _.get(json, keys);
        data = data.replace(replacement[0], value);
      } else if (joiner === '/') {
        const subregex = new RegExp(subregexOrProperty);

        const submatch = bodyAsString.match(subregex);
        if (!submatch) {
          throw new Error(
            `Failed to find match for "${subregexOrProperty}" in target body "${targetId}" for target "${id}"`
          );
        }

        const value = submatch.length === 2 ? submatch[1] : submatch[0];
        data = data.replace(replacement[0], value);
      }
    }

    return data;
  }

  private _getURL(targetsById: Record<string, Target>): URL {
    const resolved = this.options.urlTemplate.includes('%%')
      ? Target.prepareData(this.options.id, this.options.urlTemplate, targetsById)
      : this.options.urlTemplate;

    try {
      return new URL(resolved);
    } catch (err) {
      throw new Error(`Failed to parse URL "${resolved}" for target "${this.options.id}"`);
    }
  }

  public request(
    targetsById: Record<string, Target>,
    nodeback: (err: Error | null, response: ResponseData) => void
  ): void {
    const url = this._getURL(targetsById);
    let startedAt: number, sentAt: number, firstByteAt: number;

    const httpModule = url.protocol === 'https:' ? https : http;
    let req = httpModule.request(url, {
      method: this.options.method.toUpperCase(),
      headers: this.options.headers,
    });

    let done = (
      err: Error | null,
      response?: Pick<ResponseData, 'body' | 'bytes' | 'statusCode' | 'httpVersion'>
    ) => {
      let now = Date.now();
      const responseData: ResponseData = {
        url,
        requestDuration: sentAt - startedAt,
        firstByteDuration: firstByteAt ? firstByteAt - sentAt : undefined,
        downloadDuration: firstByteAt ? now - firstByteAt : undefined,
        totalDuration: now - startedAt,
        ...response,
      };

      this.lastResponse = responseData;
      nodeback(err, responseData);
    };

    req.on('response', (res) => {
      let byteLength = 0;
      let body: Buffer[] = [];
      firstByteAt = Date.now();
      res.on('data', (chunk: Buffer) => {
        byteLength += chunk.length;
        body.push(chunk);
      });

      res.on('end', () => {
        done(null, {
          statusCode: res.statusCode,
          httpVersion: res.httpVersion,
          bytes: res.headers['content-length'] ?? byteLength,
          body,
        });
      });
    });

    req.on('error', done);

    req.on('finish', () => {
      sentAt = Date.now();
    });

    if (this.options.dataTemplate) {
      req.write(Target.prepareData(this.options.id, this.options.dataTemplate, targetsById));
    }

    startedAt = Date.now();
    req.end();
  }
}
