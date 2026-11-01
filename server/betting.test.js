import test from 'node:test';
import assert from 'node:assert/strict';
import { BettingBook } from './betting.js';

const runners = [{ id: 'pip' }, { id: 'gary' }];
const join = (book, id) => book.join(`player-${id}`, id);

test('a replacement wager refunds the original without creating beans', () => {
  const book = new BettingBook(runners);
  const player = join(book, 'first');
  assert.equal(book.place(player.id, 'pip', 700, 'betting').ok, true);
  assert.equal(book.place(player.id, 'gary', 950, 'betting').ok, true);
  assert.equal(book.player(player.id).balance, 50);
  assert.equal(book.summary().total, 950);
  assert.deepEqual(book.player(player.id).bet, { runnerId: 'gary', amount: 950 });
});

test('invalid and late wagers cannot alter a balance or an existing bet', () => {
  const book = new BettingBook(runners);
  const player = join(book, 'first');
  book.place(player.id, 'pip', 100, 'betting');
  for (const [runner, amount, phase] of [['gary', 1001, 'betting'], ['unknown', 10, 'betting'], ['pip', 1.5, 'betting'], ['pip', -5, 'betting'], ['pip', 50, 'racing']]) {
    assert.equal(book.place(player.id, runner, amount, phase).ok, false);
  }
  assert.equal(book.player(player.id).balance, 900);
  assert.equal(book.summary().total, 100);
});

test('pari-mutuel settlement conserves the entire integer pool and is idempotent', () => {
  const book = new BettingBook(runners);
  const players = ['first', 'second', 'third'].map((id) => join(book, id));
  book.place(players[0].id, 'pip', 10, 'betting');
  book.place(players[1].id, 'pip', 20, 'betting');
  book.place(players[2].id, 'gary', 71, 'betting');
  const result = book.settle('pip');
  assert.equal(result.reduce((sum, row) => sum + row.payout, 0), 101);
  assert.equal([...book.players.values()].reduce((sum, player) => sum + player.balance, 0), 3000);
  assert.equal(result.find((row) => row.playerId === players[0].id).payout, 34);
  assert.equal(result.find((row) => row.playerId === players[1].id).payout, 67);
  book.settle('pip');
  assert.equal([...book.players.values()].reduce((sum, player) => sum + player.balance, 0), 3000);
});

test('a winner with no backers refunds everyone; reconnect retains balance and bet', () => {
  const book = new BettingBook(runners);
  const player = join(book, 'first');
  book.place(player.id, 'pip', 100, 'betting');
  assert.equal(book.join(player.id, 'renamed').balance, 900);
  assert.equal(book.player(player.id).bet.amount, 100);
  assert.equal(book.settle('gary')[0].refunded, true);
  assert.equal(book.player(player.id).balance, 1000);
});

test('aborting a race returns outstanding stakes, while advancing a settled race does not pay twice', () => {
  const book = new BettingBook(runners);
  const player = join(book, 'first');
  book.place(player.id, 'pip', 800, 'betting');
  book.reset({ refund: true });
  assert.equal(book.player(player.id).balance, 1000);
  assert.equal(book.player(player.id).bet, null);
  book.place(player.id, 'pip', 100, 'betting');
  book.settle('pip');
  book.reset({ refund: true });
  assert.equal(book.player(player.id).balance, 1000);
});
