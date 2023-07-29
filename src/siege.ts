import _ from 'lodash';
import {Strategy, StrategyOptions} from './strategy';
import {ResponseData, Target} from './target';
import {ClassicReporter, ConcurrencySnapshot} from './reporters/classic';

interface SiegeOptions {
  isChaotic: boolean;
  strategy: Strategy;
  targets: Target[];
  reporters: ClassicReporter[];
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
  private _resolve: () => void;
  private _targetsById: Record<string, Target>;

  constructor(options: Partial<SiegeOptions> & Pick<SiegeOptions, 'strategy' | 'targets'>) {
    this._options = {
      isChaotic: false,
      reporters: [],
      ...options,
    };

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
    this._targetsById = _.keyBy(this._options.targets, (target) => target.options.id);
    this._resolve = () => {};
  }

  private _isDone(): boolean {
    const startedAt = this._state.startedAt;
    if (startedAt === undefined) throw new Error(`Siege hasn't started yet!`);

    let currentNumRequests = this._state.numCompleted + this._state.numOutstanding;
    let repetitionsMet = this._strategy.repetitions
      ? this._strategy.repetitions * this._strategy.concurrency <= currentNumRequests
      : false;

    let currentElapsed = Date.now() - startedAt;
    let timeMet = this._strategy.time ? this._strategy.time <= currentElapsed : false;
    return !this._state.isRequesting || repetitionsMet || timeMet;
  }

  private _recordRequest(
    err: Error | null | undefined,
    response: ResponseData,
    target: Target
  ): void {
    for (const r of this._options.reporters) {
      r.record({
        failure: err || undefined,
        method: target.options.method,
        ...response,
        url: response.url.href,
        path: response.url.pathname,
      });
    }
  }

  private _sendRequest(): void {
    if (this._isDone()) {
      return;
    }

    let target = this._getNextTarget();
    let delay = _.random(this._strategy.delayMin, this._strategy.delayMax);
    this._state.numOutstanding += 1;

    let send = () => {
      if (!this._state.isRequesting) {
        this._state.numOutstanding -= 1;
        return;
      }

      target.request(this._targetsById, (err, response) => {
        this._state.numOutstanding -= 1;
        if (!this._state.isRequesting) {
          return;
        }

        this._state.numCompleted += 1;
        this._recordRequest(err, response, target);
        this._sendRequest();
      });
    };

    if (delay) {
      setTimeout(send, delay);
    } else {
      send();
    }
  }

  private _getNextTarget(): Target {
    if (this._options.targets.length === 0) {
      throw new Error('Need at least 1 target!');
    }

    const targetIdsWithResponse = this._options.targets
      .filter((target) => target.lastResponse?.body)
      .map((target) => target.options.id);

    const availableTargets = this._options.targets.filter((target) => {
      const urlDependencies = Target.findTargetIdsInData(target.options.urlTemplate);
      const dataDependencies = Target.findTargetIdsInData(target.options.dataTemplate);
      const dependencies = _.uniq([...urlDependencies, ...dataDependencies]);
      return dependencies.every((dependency) => targetIdsWithResponse.includes(dependency));
    });

    if (this._options.isChaotic) {
      const target = _.sample(availableTargets);
      if (!target) throw new Error('No target found!');
      return target;
    } else {
      let nextIndex = (this._state.lastTarget + 1) % availableTargets.length;
      this._state.lastTarget = nextIndex;
      return availableTargets[nextIndex];
    }
  }

  private _periodically(): void {
    this._state.concurrencySnapshots.push({
      count: this._state.numOutstanding,
      timestamp: Date.now(),
    });

    if (this._isDone() && this._state.numOutstanding === 0) {
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
    this._state.interval = setInterval(() => this._periodically(), 10);
    _.times(this._strategy.concurrency, () => this._sendRequest());
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
