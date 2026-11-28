// Between two cycles the Tour has no round, but money still moves: the fund share and the last
// payout can be withdrawn at once (D40), and debts carried over stay payable (R3.4). This decides
// whether the member's money block is worth showing; a member with nothing to withdraw, hold or pay
// sees nothing extra. No calculation: every figure is the server's.
import type { MyMoneyDto } from '@/features/money/schemas';

export function showMoneyBetweenCycles(money: MyMoneyDto | undefined, openDues: number): boolean {
  if (!money) return false;
  return (
    money.available > 0 ||
    money.locked > 0 ||
    money.debtsDue > 0 ||
    money.hold !== null ||
    money.withdrawalInProgress ||
    openDues > 0
  );
}
