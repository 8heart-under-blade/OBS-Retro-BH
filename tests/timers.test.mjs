import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialTimer, timerAction, timerReading, formatDuration} from '../public/js/timers.mjs';
const countdown = {mode: 'countdown', durationSeconds: 300};
test('countdown follows an absolute wall-clock deadline rather than rendered frame count', () => {
  const timer = timerAction(initialTimer(countdown), 'start', countdown, 1000);
  assert.equal(timerReading(timer, 31000).remaining, 270); assert.equal(timerReading(timer, 61000).remaining, 240);
  assert.equal(timerReading(timer, 400000).remaining, 0); assert.equal(timerReading(timer, 400000).complete, true);
});
test('pausing and resuming preserves remaining countdown and elapsed time', () => {
  let timer = timerAction(initialTimer(countdown), 'start', countdown, 1000);
  timer = timerAction(timer, 'pause', countdown, 11000); assert.equal(timerReading(timer, 500000).remaining, 290);
  timer = timerAction(timer, 'resume', countdown, 500000); assert.equal(timerReading(timer, 510000).remaining, 280); assert.equal(timerReading(timer, 510000).elapsed, 20);
  assert.deepEqual(timerAction(timer, 'reset', countdown), initialTimer(countdown));
});
test('elapsed break timers do not count paused time', () => {
  const settings = {mode: 'elapsed', durationSeconds: 300}; let timer = timerAction(initialTimer(settings), 'start', settings, 1000);
  timer = timerAction(timer, 'pause', settings, 12000); assert.equal(timerReading(timer, 1000000).elapsed, 11);
  timer = timerAction(timer, 'resume', settings, 1000000); assert.equal(timerReading(timer, 1009000).elapsed, 20);
});
test('illegal transitions are conflicts; formatting supports hours and invalid input safely', () => {
  assert.throws(() => timerAction(initialTimer(countdown), 'resume', countdown), {status: 409});
  assert.equal(formatDuration(300), '05:00'); assert.equal(formatDuration(3661), '01:01:01'); assert.equal(formatDuration(.1), '00:01'); assert.equal(formatDuration(-1), '00:00'); assert.equal(formatDuration(NaN), '00:00');
});
