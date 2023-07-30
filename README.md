# SIEGE iMproved

A _mostly_ API-compatible node implementation of the fantastic siege command-line utility for benchmarking and stress testing servers. Improvements include enhanced granularity for request timing, simplified POST/PUT/DELETE usage (inspired by curl), and easy-to-use programmatic API.

## Installation

```sh
$ npm install -g siegem
```

## Usage

```sh
$ siegem --help
```

## Examples

### Quick Benchmark

Continuously hit `/ping` with 100 concurrent users 100 times each (will request 10000 times and then stop).

```sh
$ siegem -c 100 -d0 -r 100 http://localhost:3000/ping
```

### Long Benchmark

For 15 minutes, hit `/test` with 50 concurrent users that wait up to 5 seconds before requesting again.

```sh
$ siegem -c 50 -d 5000 -t 15m http://localhost:3000/test
```

### PUT Some Data

```sh
$ siegem -c 5 -X PUT -H 'Content-Type: application/json' --data '{"foo": "bar"}' http://localhost:3000/something
```

### POST A Lot of Data

```sh
$ siegem -c 5 -X POST -H 'Content-Type: application/json' --data @my_file.json http://localhost:3000/something
```

### Hammer Lots of Endpoints

```sh
$ siegem -c 100 --chaotic --file my_urls.txt
```

#### `my_urls.txt`

```
http://google.com/
http://facebook.com/
-X HEAD http://twitter.com/
-X HEAD http://yahoo.com/
-X POST -H 'if-none-match: etag123' http://mysite.com/foo
-X DELETE http://mysite.com/other-stuff
-X PUT -H 'content-type: application/json' --data @/var/stuff/my_stuff/data.json http://mysite.com/lots-of-data
```

### POST Data with Dependencies

```sh
$ siegem --file my_urls.txt
```

#### `my_urls.txt`

1. Label a URL's response by prefixing the line with a variable name beginning with $. (`$msg` in the example below)
2. In a later line, reference a previous response using `%%<name><specifier>%%`.
   1. `@<property>` - Specify a JSON property path.
   2. `/<regex>` - Specify a regex to extract.

```
$msg -X POST --data '{"message": "foo"}' http://localhost:3000/messages
-X GET 'http://localhost:3000/messages/%%msg@id%%'
-X PUT --data '{"message": "%%msg/.*%%"}' 'http://localhost:3000/messages/%%msg@id%%'
```
