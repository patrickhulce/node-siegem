import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import _ from 'lodash';
import yargs_ from 'yargs';

import {Strategy} from '../strategy';
import {Target} from '../target';
import {Siege} from '../siege';
import {ClassicReporter} from '../reporters/classic';

// yargs typings are incomplete
const yargs = yargs_ as any;

export class ProcessExitError extends Error {}

interface YargsParsedOutput {
  _: string[];
  concurrent: number;
  reps?: number;
  time?: string;
  delay: number;
  quiet?: boolean;
  file?: string;
  chaotic?: boolean;
  method: string;
  headers?: string[] | string;
  weight?: number;
  data?: string;
}

export interface SiegemContext {
  args: string[];
  outputStream: Pick<NodeJS.WriteStream, 'write'>;
}

export async function createSiege(context: SiegemContext): Promise<Siege> {
  let parser = yargs(context.args)
    .usage('Usage: $0 [options] URL')
    .example('siegem -c 50 -d0 -r 10 http://localhost:3000/ping')
    .example('siegem -c 5 -t 5m -X POST http://localhost:3000/refresh')
    .example('siegem -X PUT --data "foo=bar" http://localhost:3000/a')
    .example('siegem -X PUT --data @my_file.json http://localhost:3000/b')
    .help('h')
    .alias('h', 'help')
    .wrap(yargs.terminalWidth())
    .group(['method', 'headers', 'data'], 'Request Options:')
    .options({
      concurrent: {
        alias: 'c',
        describe: 'Number of concurrent users',
        default: 10,
        requiresArg: true,
        type: 'number',
      },
      reps: {
        alias: 'r',
        describe: 'Number of times to run the test',
        requiresArg: true,
        type: 'number',
      },
      time: {
        alias: 't',
        describe: 'Duration to run the test, format: 1H, 2M, 45S',
        requiresArg: true,
        type: 'string',
      },
      delay: {
        alias: 'd',
        describe: 'Maximum time to delay each request in miliseconds',
        default: 1000,
        requiresArg: true,
        type: 'number',
      },
      quiet: {
        alias: 'q',
        describe: 'Supresses logging of each request',
        type: 'boolean',
      },
      file: {
        alias: 'f',
        describe: 'File where each line is a set of request options',
      },
      requestLogFile: {
        describe: 'File where responses from the siege are logged',
      },
      chaotic: {
        describe: 'Process lines in file in random order',
        type: 'boolean',
      },
      weight: {
        describe: 'The weight of this target in the siege',
        requiresArg: true,
        type: 'number',
      },
      method: {
        alias: 'X',
        describe: 'Method to use for the request',
        default: 'GET',
        type: 'string',
        requiresArg: true,
        choices: ['HEAD', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      headers: {
        alias: 'H',
        describe: 'Headers to set on the request',
        type: 'string',
        requiresArg: true,
      },
      data: {
        describe: 'Data for body of request',
        type: 'string',
      },
    });

  let headersToArray = (headers: string | string[] | undefined) => {
    if (!headers) return [];
    if (_.isArray(headers)) return headers;
    return [headers];
  };

  const globalHeaders = headersToArray(parser.argv.headers);
  let constructTarget = (options: YargsParsedOutput, id: string) => {
    let url = options._[0];
    if (!url) {
      throw new Error(`Malformed request options on target "${id}": url required`);
    }

    const headers = _.uniq([...headersToArray(options.headers), ...globalHeaders]).filter(Boolean);

    let target = new Target({id, urlTemplate: options._[0]});
    if (options.method) target.method(options.method);
    if (options.weight) target.weight(options.weight);
    if (headers) headers.forEach((header) => target.header(header));
    if (options.data) {
      if (options.data.charAt(0) === '@') {
        let filePath = path.resolve(process.cwd(), options.data.slice(1));
        target.data(fs.readFileSync(filePath, 'utf-8'));
      } else {
        target.data(options.data);
      }
    }

    return target;
  };

  let options = parser.argv;
  let strategy = new Strategy({concurrency: options.concurrent});
  if (options.reps) strategy.repeat(options.reps);
  if (options.time) strategy.timed(options.time);
  if (typeof options.delay === 'number') strategy.delay(options.delay);

  let reporter = new ClassicReporter({
    quiet: options.quiet,
    stream: context.outputStream,
    requestLogFile: options.requestLogFile,
  });

  let targets: Target[] = [];
  if (options.file) {
    let file = fs.readFileSync(path.resolve(process.cwd(), options.file), 'utf8');
    let lines = file
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    targets = lines.map((line, i) => {
      const parts = line.split(/^\$([^ .]+) /).filter(Boolean);
      const identifier = parts.length === 2 ? parts[0] : `#${i}`;
      const lineOpts = parts.length === 2 ? parts[1] : line;
      return constructTarget(parser.parse(lineOpts), identifier);
    });
  } else if (options._.length > 0) {
    targets = [constructTarget(options, '#0')];
  } else {
    parser.showHelp();
    throw new ProcessExitError();
  }

  let siege = new Siege({
    isChaotic: options.chaotic,
    strategy: strategy,
    targets: targets,
    reporters: [reporter],
  });

  http.globalAgent.maxSockets = options.concurrent;
  https.globalAgent.maxSockets = options.concurrent;

  return siege;
}

export async function main(context: SiegemContext) {
  process.title = process.title.replace(/^node(.*)/, 'siegem$1');

  const siege = await createSiege(context);

  process.on('SIGINT', function () {
    siege.stop();
  });
  await siege.start();
}
