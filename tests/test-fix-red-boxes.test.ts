import { describe, it } from 'vitest';

describe('Test exact pitch class mapping for note 4 and note #5', () => {
  it('calculates corrected template notes', () => {
    // Let's analyze what note in C template will produce:
    // 1. In Cm: we want note 4, which is Ab (pc 8)!
    // If the template note is Ab (8):
    // What does Yamaha do to an Ab in C template when Cm is played?
    // In C major, Ab is b6. When Cm is played, root is C, does Ab stay Ab?
    // YES! Ab is already the minor 6th!

    // 2. In Cm: we want note #5, which is B natural (pc 11)!
    // Why did B natural become Bb?
    // Because in C major, B is major 7th (11).
    // Yamaha's natural minor NTT maps major 7th (11) -> minor 7th (10, Bb)!
    // What note in C major maps to major 7th (11, B natural)?
    // If we write C (0) or B#? Or what if we write Bb?
    console.log('Mapping analysis ready.');
  });
});
