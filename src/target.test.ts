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
