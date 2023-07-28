import {main} from './siegem';
import * as _ from 'lodash';
import {createServer, ResponseDeliveryType} from 'asyncronaut/express';

describe(main, () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let outputStream: {write: jest.Mock};

  beforeAll(async () => {
    outputStream = {write: jest.fn()};
    server = await createServer({
      routes: [
        {
          path: '/get',
          method: 'GET',
          response: {deliveryType: ResponseDeliveryType.COMPLETE, body: {}},
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

    const lines = outputStream.write.mock.calls
      .map((args) => args[0])
      .join('')
      .replace(/(:\s+)\d+\.\d+/g, '$1XXX')
      .replace(/\d+ (ms|s|trans\/sec)/g, 'XX $1')
      .replace(/ +/g, ' ')
      .split('\n')
      .map((line) => line.trim());

    const output = _.uniq(lines).join('\n');

    expect(output).toMatch(/Transactions: 100/);
    expect(output).toMatchInlineSnapshot(`
      "** SIEGEM 0.1.0
      ** Preparing users for battle.
      The server is now under siege...
      [34mHTTP/1.1 200 XX ms: 2 bytes ==> GET /get[39m

      Lifting the server siege...
      Transactions: 100
      Availability: 100 %
      Elapsed time: XXX s
      Response time: XXX ms
      Transaction rate: XXX trans/sec
      Average Concurrency: XXX
      Successful transactions: 100
      Failed transactions: 0
      Longest transaction: XX ms
      90th percentile: XX ms
      50th percentile: XX ms
      Shortest transaction: XX ms"
    `);
  });
});
