import {Target} from './target';

describe(Target.findTargetIdsInData, () => {
  it('does not find target IDs when there are none', () => {
    expect(Target.findTargetIdsInData('{"foo": "bar"}')).toEqual([]);
  });

  it('finds target IDs in data', () => {
    expect(Target.findTargetIdsInData('foo %%bar/.*%% baz %%qux/123(.*)%%')).toEqual([
      'bar',
      'qux',
    ]);
  });
});

describe('prepareData', () => {
  const target = new Target({
    id: 'target1',
    urlTemplate: 'http://example.com',
  });

  const targets = {
    target1: target,
    target2: new Target({id: 'target2', urlTemplate: ''}),
    target3: new Target({id: 'target3', urlTemplate: ''}),
  };
  // @ts-expect-error - rely on tests passing here
  targets.target2.lastResponse = {
    body: [Buffer.from(JSON.stringify({key: 'value', nested: {x: 1}}), 'utf-8')],
  };

  // @ts-expect-error - rely on tests passing here
  targets.target3.lastResponse = {body: [Buffer.from('this is a sample text', 'utf-8')]};

  it('replaces references with JSON values', () => {
    const data = 'http://example.com/%%target2@key%%';
    expect(Target.prepareData('target1', data, targets)).toBe('http://example.com/value');
  });

  it('replaces references with nested JSON values', () => {
    const data = 'http://example.com/%%target2@nested.x%%';
    expect(Target.prepareData('target1', data, targets)).toBe('http://example.com/1');
  });

  it('replaces references with regex matches', () => {
    const data = 'http://example.com/%%target3/\\b(sample) text\\b%%';
    expect(Target.prepareData('target1', data, targets)).toBe('http://example.com/sample');
  });

  it('throws error when target body not found', () => {
    const data = 'http://example.com/%%target4@key%%';
    expect(() => Target.prepareData('target1', data, targets)).toThrowError(
      'Failed to find target body "target4" for target "target1"'
    );
  });

  it('throws error when regex match not found', () => {
    const data = 'http://example.com/%%target2/\\b(not-found)\\b%%';
    expect(() => Target.prepareData('target1', data, targets)).toThrowError(
      'Failed to find match for "\\b(not-found)\\b" in target body "target2" for target "target1"'
    );
  });
});
