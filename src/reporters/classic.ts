import _ from 'lodash';
import colors from 'colors/safe';

interface ClassicReporterOptions {
  quiet: boolean;
  longUrl: boolean;
  stream: Pick<NodeJS.WriteStream, 'write'>;
}

interface Item {
  failure?: Error;
  statusCode?: number;
  httpVersion?: string;
  bytes?: string | number;
  totalDuration: number;
  method: string;
  url: string;
  path: string;
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

  private write(...args: string[]): void {
    this.options.stream.write(args.filter((s) => s).join(' ') + '\n');
  }

  private stat(name: string, value: number, measurement?: string): void {
    value = Math.round(value * 1000) / 1000;

    let header = padTo(name + ':', 25);
    let paddedValue = padTo(value.toString(), 10, true);
    this.write(header, paddedValue, measurement || '');
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
  }

  record(item: Item) {
    this.requests.push(item);
    if (this.options.quiet) {
      return;
    }

    if (item.failure) {
      this.write('[' + colors.yellow('error') + '] ' + item.failure.message);
    } else {
      let status = 'HTTP/' + item.httpVersion + ' ' + item.statusCode;
      let duration = padTo(item.totalDuration.toString(), 7, true) + padTo(' ms:', 10);
      let bytes = item.bytes ? item.bytes.toString() + ' bytes ==> ' : '';
      let url = item.method + ' ' + (this.options.longUrl ? item.url : item.path);
      this.write(this.getColorized(status + duration + bytes + url, item.statusCode));
    }
  }

  report(concurrencySnapshots: ConcurrencySnapshot[]) {
    let total = this.requests.length;
    let failed = this.requests.filter(isFailed).length;
    let successful = total - failed;
    let concurrency = _.sumBy(concurrencySnapshots, 'count') / concurrencySnapshots.length;

    let sortedRequests = _.sortBy(this.requests, 'totalDuration');
    let elapsedTime = (this.stoppedAt - this.startedAt) / 1000;
    let responseTime = _.sumBy(this.requests, 'totalDuration') / total;

    let durationOf = (i: number) => _.get(sortedRequests, i + '.totalDuration');
    let pX = (x: number) => durationOf(Math.round((sortedRequests.length * x) / 100) - 1);

    this.write('\n');
    this.stat('Transactions', total);
    this.stat('Availability', (successful / total) * 100, '%');
    this.stat('Elapsed time', elapsedTime, 's');
    this.stat('Response time', responseTime, 'ms');
    this.stat('Transaction rate', total / elapsedTime, 'trans/sec');
    this.stat('Average Concurrency', concurrency);
    this.stat('Successful transactions', successful);
    this.stat('Failed transactions', failed);
    this.stat('Longest transaction', durationOf(sortedRequests.length - 1), 'ms');
    this.stat('90th percentile', pX(90), 'ms');
    this.stat('50th percentile', pX(50), 'ms');
    this.stat('Shortest transaction', durationOf(0), 'ms');
  }
}
