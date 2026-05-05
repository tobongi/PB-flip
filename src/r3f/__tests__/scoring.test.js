/* eslint-env jest */
// Unit-level guards for the simple-scoring contract:
//   - One landing on a table = +1 score, no exceptions.
//   - No combo state, no per-block stayScore, no on-pad accumulator.
//
// We test the contract at every layer the score touches so a future PR can't
// accidentally re-introduce one of the dropped mechanics:
//   1. blockCatalog cube definitions   — no stayScore field
//   2. Block entity                    — no stayScore field, no hitCenter()
//   3. GameController source           — no combo, scheduleStayScore, addScore
//      (read the file rather than instantiate the controller, since
//      Game depends on a full THREE+CANNON scene that's expensive to mock here)

const fs = require('fs');
const path = require('path');

const { cubes } = require('../../game/entities/blockCatalog');
const Block = require('../../game/entities/Block').default;

describe('simple scoring contract — +1 per landing, no extras', () => {
  describe('blockCatalog', () => {
    it('cube definitions no longer carry stayScore (per-block bonus removed)', () => {
      cubes.forEach(cube => {
        expect(cube).not.toHaveProperty('stayScore');
      });
    });

    it('cubes still carry prob (rarity weight) so random selection stays balanced', () => {
      cubes.forEach(cube => {
        expect(typeof cube.prob).toBe('number');
        expect(cube.prob).toBeGreaterThan(0);
      });
    });
  });

  describe('Block entity', () => {
    it('does not expose stayScore as an instance field', () => {
      const block = new Block(cubes[0]);
      expect(block.stayScore).toBeUndefined();
    });

    it('does not expose hitCenter() (combo trigger removed)', () => {
      const block = new Block(cubes[0]);
      expect(block.hitCenter).toBeUndefined();
    });

    it('still exposes canHold() for the success/fail branch', () => {
      const block = new Block(cubes[0]);
      expect(typeof block.canHold).toBe('function');
    });
  });

  describe('GameController source', () => {
    // Read the controller source directly. We're guarding the simplification
    // contract — any future PR that resurrects combo/stayScore/addScore will
    // fail one of these so the regression is visible at review time.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../game/GameController.js'),
      'utf-8'
    );

    it('does not declare a combo field', () => {
      expect(src).not.toMatch(/^\s*combo\s*=\s*0\s*;/m);
      expect(src).not.toMatch(/this\.combo\s*=/);
      expect(src).not.toMatch(/restored\.combo/);
    });

    it('does not declare scheduleStayScore / clearPendingStayScoreTimeout / pendingStayScoreTimeout', () => {
      expect(src).not.toMatch(/scheduleStayScore/);
      expect(src).not.toMatch(/clearPendingStayScoreTimeout/);
      expect(src).not.toMatch(/pendingStayScoreTimeout/);
    });

    it('does not declare an addScore() method', () => {
      // `score` (substring of addScoreText) is fine; this regex specifically
      // matches the old method definition.
      expect(src).not.toMatch(/^\s*addScore\s*\(/m);
    });

    it('still increments score by exactly 1 in the landing branch', () => {
      // The literal `this.score += 1;` is the entire scoring rule.
      expect(src).toMatch(/this\.score\s*\+=\s*1\s*;/);
    });

    it('does not call hitCenter (combo trigger) or addScore in the landing flow', () => {
      expect(src).not.toMatch(/\.hitCenter\(/);
      expect(src).not.toMatch(/this\.addScore\(/);
    });

    it('does not serialize combo or stayScore into the checkpoint', () => {
      expect(src).not.toMatch(/combo:\s*this\.combo/);
      expect(src).not.toMatch(/stayScore:\s*block\.stayScore/);
    });
  });
});
