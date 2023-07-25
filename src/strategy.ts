import _ from 'lodash';

interface StrategyOptions {
  concurrency: number;
  repetitions?: number;
  time?: number;
  delayMin?: number;
  delayMax?: number;
}

class Strategy {
  private _options: StrategyOptions;

  constructor(options: StrategyOptions) {
    this._options = _.assign({
      concurrency: 10,
      repetitions: undefined,
      time: undefined,
      delayMin: 0,
      delayMax: 1000,
    }, options);
  }

  concurrency(n: number): Strategy {
    this._options.concurrency = n;
    return this;
  }

  repeat(n: number): Strategy {
    this._options.repetitions = n;
    return this;
  }

  timed(s: string): Strategy {
    let match = s.match(/([0-9]+)(H|M|S)/i);
    if (!match) { throw new Error('Unexpected timed format: [0-9]+(H|M|S)'); }
    let duration = Number(match[1]);
    let period = match[2].toUpperCase();

    if (period === 'H') {
      duration *= 60 * 60;
    } else if (period === 'M') {
      duration *= 60;
    }

    this._options.time = duration * 1000;
    return this;
  }

  delay(s: number): Strategy {
    this._options.delayMax = s;
    return this;
  }
}

export default Strategy;
