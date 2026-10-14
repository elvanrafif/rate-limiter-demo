import * as fixedWindow from './fixedWindow.js';
import * as slidingLog from './slidingLog.js';
import * as tokenBucket from './tokenBucket.js';

export const limiters = {
  'fixed-window': fixedWindow,
  'sliding-log': slidingLog,
  'token-bucket': tokenBucket,
};
