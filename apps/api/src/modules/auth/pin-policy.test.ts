import { describe, expect, it } from 'vitest';
import { isGuessablePin } from './pin-policy';

describe('PIN policy (spec 2.10)', () => {
  it.each(['000000', '111111', '999999'])('refuses six identical digits: %s', (pin) => {
    expect(isGuessablePin(pin)).toBe(true);
  });

  it.each(['123456', '234567', '456789', '654321', '987654', '890123', '210987'])(
    'refuses straight sequences, also wrapping: %s',
    (pin) => expect(isGuessablePin(pin)).toBe(true),
  );

  it.each(['121212', '123123', '112233', '147258'])(
    'refuses repeated or common patterns: %s',
    (pin) => {
      expect(isGuessablePin(pin)).toBe(true);
    },
  );

  it('refuses six digits of the member’s own number', () => {
    expect(isGuessablePin('771234', ['+237677123456'])).toBe(true);
    expect(isGuessablePin('258147', ['+237677123456'])).toBe(false);
  });

  it('refuses anything but six digits', () => {
    expect(isGuessablePin('25814')).toBe(true);
    expect(isGuessablePin('25814a')).toBe(true);
  });

  it.each(['258147', '904713', '530826'])('accepts an ordinary PIN: %s', (pin) => {
    expect(isGuessablePin(pin)).toBe(false);
  });
});
