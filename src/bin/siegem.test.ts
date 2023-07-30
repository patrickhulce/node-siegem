import {main} from './siegem';
import * as _ from 'lodash';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {createServer, ResponseDeliveryType} from 'asyncronaut/express';

jest.setTimeout(10_000);

describe(main, () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let outputStream: {write: jest.Mock};

  function createTemporaryFile(contents: string): {filepath: string} {
    const filepath = path.join(os.tmpdir(), `siegem-test-${Date.now()}`);
    fs.writeFileSync(filepath, contents);
    return {filepath};
  }

  function cleanOutputLines(): string[] {
    return outputStream.write.mock.calls
      .map((args) => args[0])
      .join('')
      .replace(/(:\s+)\d+\.\d+/g, '$1XX')
      .replace(/\d+ (ms|s|trans\/sec)/g, 'XX $1')
      .replace(/ +/g, ' ')
      .split('\n')
      .map((line) => line.trim());
  }

  beforeEach(() => {
    outputStream = {write: jest.fn()};
  });

  beforeAll(async () => {
    server = await createServer({
      routes: [
        {
          path: '/get',
          method: 'GET',
          response: {deliveryType: ResponseDeliveryType.COMPLETE, body: {}},
        },
        {
          path: '/delay',
          method: 'GET',
          response: {deliveryType: ResponseDeliveryType.COMPLETE, body: {id: 123}, delayMs: 100},
        },
        {
          path: '/create/:id',
          method: 'POST',
          response: {
            deliveryType: ResponseDeliveryType.COMPLETE,
            fetchBody: async (req) => (req.params.id == '123' ? {id: 456} : {sub: {id: '789'}}),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('sieges the server', async () => {
    await main({args: [`${server.baseURL}/get`, '-d0', '-r10'], outputStream});

    expect(outputStream.write).toHaveBeenCalled();

    const output = _.uniq(cleanOutputLines()).join('\n');

    expect(output).toMatch(/Transactions: 100/);
    expect(output).toMatchInlineSnapshot(`
      "** SIEGEM 0.1.0
      ** Preparing users for battle.
      The server is now under siege...
      [34mHTTP/1.1 200 XX ms: 2 bytes ==> GET /get[39m

      Lifting the server siege...
      Transactions: 100
      Availability: 100 %
      Elapsed time: XX s
      Response time: XX ms
      Transaction rate: XX trans/sec
      Average Concurrency: XX
      Successful transactions: 100
      Failed transactions: 0
      Longest transaction: XX ms
      90th percentile: XX ms
      50th percentile: XX ms
      Shortest transaction: XX ms"
    `);
  });

  it('sieges with dependencies', async () => {
    const {filepath} = createTemporaryFile(`
      $get ${server.baseURL}/delay
      $post1 -X POST '${server.baseURL}/create/%%get/"id":(\\d+)%%'
      $post2 -X POST '${server.baseURL}/create/%%post1@id%%'
      $post3 -X POST '${server.baseURL}/create/%%post2@sub.id%%'
    `);

    await main({args: [`-f`, filepath, '-d0', '-r10', '-c4'], outputStream});

    const output = cleanOutputLines().join('\n');
    expect(output).toContain('GET /delay');
    expect(output).toContain('POST /create/123');
    expect(output).toContain('POST /create/456');
    expect(output).toContain('POST /create/789');
    expect(output).toContain('Transactions: 40');
    expect(output).toContain('Successful transactions: 40');
  });
});
