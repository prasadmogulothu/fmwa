// Run: node src/data/schedule.check.mjs
// The only automated test in this project. Everything it covers is pure.
import assert from 'node:assert/strict';
import { today, span, currentEvent, clock, dayLabel } from './schedule.js';

const ev = (slug, ...dates) => ({ slug, days: dates.map((date) => ({ date })) });

// --- today ------------------------------------------------------------
assert.equal(today(new Date(2026, 8, 14)), '2026-09-14');
assert.equal(today(new Date(2026, 0, 5)), '2026-01-05', 'pads month and day');

// --- span -------------------------------------------------------------
assert.equal(span(ev('x')), null, 'an event with no days has no span');
assert.deepEqual(span(ev('x', '2026-09-17', '2026-09-15', '2026-09-16')), {
  first: '2026-09-15',
  last: '2026-09-17'
});

// --- currentEvent -----------------------------------------------------
assert.equal(currentEvent([], '2026-09-14'), null);
assert.equal(currentEvent([ev('x')], '2026-09-14'), null, 'no days, no answer');

const past = ev('past', '2026-08-14', '2026-08-15');
const running = ev('running', '2026-09-13', '2026-09-15');
const soon = ev('soon', '2026-09-20');
const later = ev('later', '2026-10-02');

assert.equal(currentEvent([past, running, soon], '2026-09-14').slug, 'running');
assert.equal(currentEvent([past, running, soon], '2026-09-13').slug, 'running', 'first day counts');
assert.equal(currentEvent([past, running, soon], '2026-09-15').slug, 'running', 'last day counts');
assert.equal(currentEvent([past, soon, later], '2026-09-16').slug, 'soon', 'nearest upcoming');
assert.equal(currentEvent([later, soon], '2026-09-16').slug, 'soon', 'order does not matter');

const older = ev('older', '2026-07-01');
assert.equal(currentEvent([older, past], '2026-12-01').slug, 'past', 'most recent past');

// Two festivals overlapping: show the one that started most recently.
const a = ev('a', '2026-09-10', '2026-09-18');
const b = ev('b', '2026-09-13', '2026-09-16');
assert.equal(currentEvent([a, b], '2026-09-14').slug, 'b');

// --- clock ------------------------------------------------------------
assert.equal(clock('06:30:00'), '6:30 AM');
assert.equal(clock('18:05:00'), '6:05 PM');
assert.equal(clock('00:15:00'), '12:15 AM', 'midnight is 12, not 0');
assert.equal(clock('12:00:00'), '12:00 PM', 'noon is PM');
assert.equal(clock('09:00'), '9:00 AM', 'seconds are optional');

// --- dayLabel ---------------------------------------------------------
// Parsed as a local date, never as UTC — '2026-09-15' must not become the 14th.
assert.match(dayLabel('2026-09-15'), /15/);
assert.match(dayLabel('2026-09-15'), /Sep/);

console.log('schedule.js OK');
