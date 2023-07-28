export interface StrategyOptions {
  concurrency: number;
  repetitions?: number;
  time?: number;
  delayMin: number;
  delayMax: number;
}

export class Strategy {
  public options: StrategyOptions;

  constructor(options?: Partial<StrategyOptions>) {
    this.options = {
      concurrency: 10,
      repetitions: undefined,
      time: undefined,
      delayMin: 0,
      delayMax: 1000,
      ...options,
    };
  }

  concurrency(n: number): Strategy {
    this.options.concurrency = n;
    return this;
  }

  repeat(n: number): Strategy {
    this.options.repetitions = n;
    return this;
  }

  timed(s: string): Strategy {
    let match = s.match(/([0-9]+)(H|M|S)/i);
    if (!match) {
      throw new Error('Unexpected timed format: [0-9]+(H|M|S)');
    }
    let duration = Number(match[1]);
    let period = match[2].toUpperCase();

    if (period === 'H') {
      duration *= 60 * 60;
    } else if (period === 'M') {
      duration *= 60;
    }

    this.options.time = duration * 1000;
    return this;
  }

  delay(s: number): Strategy {
    this.options.delayMax = s;
    return this;
  }
}
