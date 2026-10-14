import assert from 'node:assert/strict';
import test from 'node:test';

import { bookingTitle, upcomingBookedBookings } from '../.test-dist/src/lib/botBookingFormat.js';

const mk = (o) => ({ id: o.id, tag: null, summary: '', start: o.start, end: o.end ?? o.start, kind: 'booking', ...o });

test('upcomingBookedBookings: только занятые, без прошедших, по времени', () => {
  const now = new Date('2026-10-14T10:00:00Z');
  const list = [
    mk({ id: 'b', start: '2026-10-19T12:00:00Z' }),
    mk({ id: 'open', start: '2026-10-15T09:00:00Z', kind: 'open_slot' }),
    mk({ id: 'block', start: '2026-10-15T09:00:00Z', kind: 'master_block' }),
    mk({ id: 'past', start: '2026-10-13T09:00:00Z' }),
    mk({ id: 'a', start: '2026-10-18T13:00:00+03:00' }),
  ];
  assert.deepEqual(upcomingBookedBookings(list, now).map((b) => b.id), ['a', 'b']);
});

test('upcomingBookedBookings: идущая сейчас бронь остаётся', () => {
  const now = new Date('2026-10-14T10:30:00Z');
  const list = [mk({ id: 'now', start: '2026-10-14T10:00:00Z', end: '2026-10-14T11:00:00Z' })];
  assert.equal(upcomingBookedBookings(list, now).length, 1);
});

test('bookingTitle: срезает тег и ведущие тире', () => {
  assert.equal(bookingTitle(mk({ summary: '— КАМПЕЙН ЗАПИСЬ — Noga' })), 'КАМПЕЙН ЗАПИСЬ — Noga');
  assert.equal(bookingTitle(mk({ tag: '[ВИДЕО]', summary: '[ВИДЕО] 🔴 Анна' })), '🔴 Анна');
  assert.equal(bookingTitle(mk({ summary: '' })), '—');
});
