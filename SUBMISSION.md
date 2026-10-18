# LedgerLang — possible Syntax Summit submission

Status: built locally on 17 October 2026; not registered or submitted. Registration age wording still needs organizer clarification, checked again on 18 October. The 135-second demo is prepared at `../LedgerLang-demo.mp4`. Public source publication and demo upload await approval; neither is complete. The source passes all 12 checks, including comparison against an independent permutation oracle on 80 generated networks.

Solo entrant: Vivaan Kandhari.

## Pitch

A currency-checked settlement language that turns payment assumptions into exact execution traces and bounded deadlock witnesses.

## Project story

Payment simulations are easy to misunderstand when currency units, liquidity assumptions and atomicity are hidden in general-purpose code. LedgerLang makes these choices visible in a small domain-specific language.

Its lexer and parser produce a located AST. Semantic analysis resolves symbols and checks currency consistency and decimal precision. A BigInt interpreter executes gross payments and all-or-nothing netting batches with independent cash-conservation checks. A separate bounded search examines reachable settled subsets, producing either an executable gross order or a deadlock witness with participant shortfalls. The browser exposes typed operations, the actual execution trace and an exportable audit file.

The default example is a liquidity-constrained three-way cycle: three accounts hold HKD 10 each and owe HKD 15 around a ring. No gross payment can move, but simultaneous net settlement completes the cycle. A second example finds a feasible order different from the source declaration order. Other examples demonstrate a compile-time currency error, exact 0.10 + 0.20 accounting, and rollback of a blocked batch.

Verification includes exact decimal outcomes, currency errors, atomic rollback, duplicate-payment handling, assertion failures, source diagnostics, and comparison of the subset search against an independent permutation oracle over 80 generated networks. Report actual test output rather than claiming unsupported correctness.

This is an educational prototype using fictional accounts, not a bank integration or a production settlement engine. Existing compiler and graph-search techniques are combined in this implementation; globally novel algorithmic research is not claimed. No customers, user research, banking data or empirical financial benefit is claimed.
