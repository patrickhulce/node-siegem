import _ from 'lodash';

interface AttackOptions {
  isChaotic?: boolean;
  strategy?: any;
  targets?: any[];
  reporters?: any[];
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
  concurrencySnapshots: any[];
  interval?: NodeJS.Timeout;
}

export class Attack {
  private _options: AttackOptions;
  private _state: State;
  private _strategy: any;
  private _resolve: any;

  constructor(options: AttackOptions) {
    this._options = _.assign(
      {
        isChaotic: false,
        strategy: undefined,
        targets: [],
        reporters: [],
      },
      options
    );

    if (!this._options.strategy) {
      throw new Error('A strategy is required');
    } else if (!_.isArray(this._options.targets) || this._options.targets.length === 0) {
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

    this._strategy = _.clone(this._options.strategy._options);
  }

  private isDoneRequesting(): boolean {
    let currentNumRequests = this._state.numCompleted + this._state.numOutstanding;
    let repetitionsMet =
      this._strategy.repetitions &&
      this._strategy.repetitions * this._strategy.concurrency <= currentNumRequests;

    let currentElapsed = Date.now() - this._state.startedAt!;
    let timeMet = this._strategy.time && this._strategy.time <= currentElapsed;
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

    this._options.reporters!.forEach((reporter: any) => {
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
    if (this._options.targets!.length === 0) {
      throw new Error('Need at least 1 target!');
    }
    if (this._options.isChaotic) {
      return _.sample(this._options.targets);
    } else {
      let nextIndex = (this._state.lastTarget + 1) % this._options.targets!.length;
      this._state.lastTarget = nextIndex;
      return this._options.targets![nextIndex];
    }
  }

  private periodically(): void {
    this._state.concurrencySnapshots.push({count: this._state.numOutstanding, time: Date.now()});
    if (this.isDoneRequesting() && this._state.numOutstanding === 0) {
      clearInterval(this._state.interval!);
      if (this._state.isRequesting) {
        this._options.reporters!.forEach((r: any) => {
          r.stop();
        });
      }

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
    this._options.reporters!.forEach((r: any) => {
      r.start();
    });

    return new Promise<void>((resolve) => {
      this._resolve = resolve;
    });
  }

  public stop(): void {
    this._state.isRequesting = false;
    this._options.reporters!.forEach((r: any) => {
      r.stop();
    });
  }

  public report(): void {
    this._options.reporters!.forEach((reporter: any) => {
      reporter.report(this._state.concurrencySnapshots);
    });
    this._resolve();
  }
}
