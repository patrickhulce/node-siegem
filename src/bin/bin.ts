#!/usr/bin/env node

/* eslint-disable no-process-exit */

import {ProcessExitError, main} from './siegem';

main({args: process.argv.slice(2), outputStream: process.stdout}).catch((err) => {
  if (err instanceof ProcessExitError) process.exit(1);

  console.error(err);
  process.exit(1);
});
