import _ from 'lodash';
import { Strategy, StrategyOptions } from './strategy';
import { Target } from './target';
import { ClassicReporter, ConcurrencySnapshot } from './reporters/classic';

interface SiegeOptions {
  isChaotic: boolean;
  strategy: Strategy;
  targets: Target[];
  reporters: ClassicReporter[];
}

interface ItemOptions {
  failure?: any;
  method?: string;
  url?: string;
  path?: string;
}

interface State {
  isRequesting: boolean;
  startedAt?: number;
  lastTarget: number;
  numOutstanding: number;
  numCompleted: number;
  concurrencySnapshots: ConcurrencySnapshot[];
  interval?: NodeJS.Timeout;
}

export class Siege {
  private _options: SiegeOptions;
  private _state: State;
  private _strategy: StrategyOptions;
  private _resolve: any;

  constructor(options: Partial<SiegeOptions> & Pick<SiegeOptions, 'strategy' | 'targets'>) {
    this._options =
      {
        isChaotic: false,
        reporters: [],
        ...options,
      }

    if (this._options.targets.length === 0) {
      throw new Error('One or more targets are required');
    }

    this._state = {
      isRequesting: false,
      startedAt: undefined,
      lastTarget: -1,
      numOutstanding: 0,
      numCompleted: 0,
      concurrencySnapshots: [],
    };

    this._strategy = this._options.strategy.options;
  }

  private isDoneRequesting(): boolean {
    const startedAt = this._state.startedAt
    if (startedAt === undefined) throw new Error(`Siege hasn't started yet!`);

    let currentNumRequests = this._state.numCompleted + this._state.numOutstanding;
    let repetitionsMet =
      this._strategy.repetitions ?
      this._strategy.repetitions * this._strategy.concurrency <= currentNumRequests : false;

    let currentElapsed = Date.now() - startedAt;
    let timeMet = this._strategy.time ? this._strategy.time <= currentElapsed : false;
    return !this._state.isRequesting || repetitionsMet || timeMet;
  }

  private recordRequest(err: any, response: any, target: any): void {
    let item: ItemOptions = _.assign(
      {
        failure: err,
        method: target._options.method,
        url: target._options.url,
        path: target._options.url.pathname,
      },
      response
    );

    this._options.reporters.forEach((reporter: any) => {
      reporter.record(item);
    });
  }

  private requestAndContinue(): void {
    if (this.isDoneRequesting()) {
      return;
    }

    let target = this.selectNextTarget();
    let delay = _.random(this._strategy.delayMin, this._strategy.delayMax);
    this._state.numOutstanding += 1;

    let go = () => {
      if (!this._state.isRequesting) {
        this._state.numOutstanding -= 1;
        return;
      }

      target.request((err: any, response: any) => {
        this._state.numOutstanding -= 1;
        if (!this._state.isRequesting) {
          return;
        }

        this._state.numCompleted += 1;
        this.recordRequest(err, response, target);
        this.requestAndContinue();
      });
    };

    if (delay) {
      setTimeout(go, delay);
    } else {
      go();
    }
  }

  private selectNextTarget(): any {
    if (this._options.targets.length === 0) {
      throw new Error('Need at least 1 target!');
    }

    if (this._options.isChaotic) {
      return _.sample(this._options.targets);
    } else {
      let nextIndex = (this._state.lastTarget + 1) % this._options.targets.length;
      this._state.lastTarget = nextIndex;
      return this._options.targets[nextIndex];
    }
  }

  private periodically(): void {
    this._state.concurrencySnapshots.push({count: this._state.numOutstanding, time: Date.now()});
    if (this.isDoneRequesting() && this._state.numOutstanding === 0) {
      if (this._state.interval) clearInterval(this._state.interval);
      if (this._state.isRequesting) for (const r of this._options.reporters) r.stop();
      this.report();
    }
  }

  public async start(): Promise<void> {
    if (this._state.startedAt) {
      return;
    }
    this._state.startedAt = Date.now();
    this._state.isRequesting = true;
    this._state.interval = setInterval(() => this.periodically(), 10);
    _.times(this._strategy.concurrency, () => this.requestAndContinue());
    for (const r of this._options.reporters) r.start();

    return new Promise<void>((resolve) => {
      this._resolve = resolve;
    });
  }

  public stop(): void {
    this._state.isRequesting = false;
    for (const r of this._options.reporters) r.stop();
  }

  public report(): void {
    for (const r of this._options.reporters) r.report(this._state.concurrencySnapshots);
    this._resolve();
  }
}
