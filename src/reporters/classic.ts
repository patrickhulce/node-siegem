import _ from 'lodash';
import * as fs from 'fs';
import colors from 'colors/safe';

interface ClassicReporterOptions {
  quiet: boolean;
  longUrl: boolean;
  stream: Pick<NodeJS.WriteStream, 'write'>;
  requestLogFile?: string;
}

interface Item {
  failure?: Error;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
  firstByteDuration?: number;
  totalDuration: number;
  method: string;
  url: string;
  path: string;
  body?: Buffer[];
}

export interface ConcurrencySnapshot {
  count: number;
  timestamp: number;
}

function padTo(s: string, l: number, prepend?: boolean): string {
  s = String(s);
  if (s.length >= l) {
    return s;
  }
  let padding = _.fill(Array(l - s.length), ' ').join('');
  return prepend ? padding + s : s + padding;
}

function isFailed(item: Item): boolean {
  return item.failure !== undefined || item.statusCode === undefined || item.statusCode >= 400;
}

export class ClassicReporter {
  private startedAt: number;
  private stoppedAt: number;
  private requests: Item[];
  private options: ClassicReporterOptions;

  constructor(options: Partial<ClassicReporterOptions>) {
    this.options = {
      quiet: false,
      longUrl: false,
      stream: process.stdout,
      ...options,
    };

    this.startedAt = 0;
    this.stoppedAt = 0;
    this.requests = [];
  }

  private getColorized(message: string, statusCode?: number): string {
    if (statusCode !== undefined && statusCode >= 200 && statusCode < 300) {
      return colors.blue(message);
    } else if (statusCode !== undefined && statusCode < 400) {
      return colors.cyan(message);
    } else if (statusCode !== undefined && statusCode < 500) {
      return colors.magenta(message);
    } else {
      return colors.red(message);
    }
  }

  start() {
    this.startedAt = Date.now();
    this.write('** SIEGEM 0.1.0');
    this.write('** Preparing users for battle.');
    this.write('The server is now under siege...');
  }

  stop() {
    this.stoppedAt = Date.now();
    this.write('\nLifting the server siege...');
    if (this.options.requestLogFile) {
      const output = this.requests.map((request) => ({
        ...request,
        body: request.body ? Buffer.concat(request.body).toString('utf-8') : undefined,
      }));

      fs.writeFileSync(
        this.options.requestLogFile,
        `[\n${output.map((request) => JSON.stringify(request)).join(',\n')}\n]`
      );
    }
  }

  record(item: Item) {
    item = {...item};
    this.requests.push(item);

    // We only need to keep a reference to the body if it created something.
    if (item.body && item.method !== 'POST') {
      item.body = undefined;
    }

    if (this.options.quiet) {
      return;
    }

    const durationMs = item.firstByteDuration ?? item.totalDuration;
    let duration = padTo(durationMs.toString(), 7, true) + padTo(' ms:', 10);
    if (item.failure) {
      this.write(colors.red(`TCP/IP ERROR ${duration}${item.failure.message}}`));
    } else {
      let status = 'HTTP/' + item.httpVersion + ' ' + item.statusCode;
      let bytes = item.bytes ? item.bytes.toString() + ' bytes ==> ' : '';
      let url = item.method + ' ' + (this.options.longUrl ? item.url : item.path);
      this.write(this.getColorized(status + duration + bytes + url, item.statusCode));
    }
  }

  private write(...args: string[]): void {
    this.options.stream.write(args.filter((s) => s).join(' ') + '\n');
  }

  private stat(name: string, value: number, measurement?: string): void {
    value = Math.round(value * 1000) / 1000;

    let header = padTo(name + ':', 25);
    let paddedValue = padTo(value.toString(), 10, true);
    this.write(header, paddedValue, measurement || '');
  }

  report(concurrencySnapshots: ConcurrencySnapshot[]) {
    let total = this.requests.length;
    let failed = this.requests.filter(isFailed).length;
    let successful = total - failed;
    let concurrency = _.sumBy(concurrencySnapshots, 'count') / concurrencySnapshots.length;

    let requestsSortedByTotal = _.sortBy(this.requests, (r) => r.totalDuration);
    let requestsSortedByFirstByte = _.sortBy(
      this.requests.filter((r) => Number.isFinite(r.firstByteDuration)),
      (r) => r.firstByteDuration
    );
    let elapsedTime = (this.stoppedAt - this.startedAt) / 1000;
    let responseTime =
      _.sumBy(requestsSortedByFirstByte, (r) => r.firstByteDuration ?? Infinity) /
      requestsSortedByFirstByte.length;

    let durationOf = (i: number, arr: Item[] = requestsSortedByTotal) => arr[i].totalDuration;
    let pXFirstByte = (x: number) =>
      durationOf(
        Math.round((requestsSortedByFirstByte.length * x) / 100) - 1,
        requestsSortedByFirstByte
      );

    this.write('\n');
    this.stat('Transactions', total);
    this.stat('Availability', (successful / total) * 100, '%');
    this.stat('Elapsed time', elapsedTime, 's');
    this.stat('Average TTFB', responseTime, 'ms');
    this.stat('90th percentile (TTFB)', pXFirstByte(90), 'ms');
    this.stat('50th percentile (TTFB)', pXFirstByte(50), 'ms');
    this.stat('Transaction rate', total / elapsedTime, 'trans/sec');
    this.stat('Average Concurrency', concurrency);
    this.stat('Successful transactions', successful);
    this.stat('Failed transactions', failed);
    this.stat('Longest transaction', durationOf(requestsSortedByTotal.length - 1), 'ms');
    this.stat('Shortest transaction', durationOf(0), 'ms');
  }
}
