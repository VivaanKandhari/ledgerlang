# LedgerLang

A small fintech DSL that makes settlement assumptions executable: currency-checked compilation, exact decimal money, atomic netting, and bounded gross-settlement reachability search. Built 17 October 2026 for a possible Syntax Summit entry. **Not registered or submitted**: the detailed rules say 16+, but the registration requires age of majority. Organizer clarification is pending; no false eligibility declaration has been made.

## Run

Download `index.html` and `ledger.js` into one folder; open `index.html` in a modern browser. BigInt is required. No server, dependencies, credentials, model API or bank connection is needed. `node test.cjs` runs the checks, including an independent exhaustive-permutation oracle on 80 generated networks. `examples.json` provides sample programs for direct use with the compiler.

```javascript
const L = require('./ledger.js');
const fs = require('node:fs');
const example = JSON.parse(fs.readFileSync('examples.json', 'utf8'));
const {program, result, gross} = L.report(example['Gridlock and atomic rescue']);
console.log(result.settled, gross.possible);
```

## Language and semantics

```text
currency HKD decimals 2;
account A HKD 10.00;
account B HKD 10.00;
account C HKD 10.00;
pay ab A -> B 15.00 HKD;
pay bc B -> C 15.00 HKD;
pay ca C -> A 15.00 HKD;
settle ab;
net rescue { ab, bc, ca };
assert total HKD 30.00;
```

The lexer tracks line and column positions and accepts `#` comments. The parser builds an AST. Semantic analysis resolves currency/account/payment symbols, rejects unknown and duplicate identifiers in each namespace, checks currency consistency, and enforces decimal precision. All declarations precede execution operations. There is no JavaScript evaluation of submitted source.

Amounts are converted directly from decimal strings to BigInt minor units, never through floating-point numbers. Currency scale is 0–6. Account balances are nonnegative, payments positive; self-payments and implicit FX are rejected. Amounts have at most 18 integer digits. Programs have at most 50,000 characters and 500 statements.

`settle` attempts one gross payment. If unfunded, it leaves state unchanged and execution continues. It may be retried later. `net` attempts all listed **whole payments** simultaneously on a candidate balance map; any negative resulting balance rejects the whole batch without partial settlement. Already-settled payments cannot be settled again. Mixed-currency batches are permitted only when every individual payment has matching source/destination currency. No currency conversion occurs. `assert total` checks the current total for one currency; failed assertions are visible and do not stop later operations.

After every successful settlement, the runtime independently checks nonnegative balances and per-currency cash conservation. These checks validate this model; they are not a proof that external payment systems behave this way.

## Gross reachability search

The explorer ignores the written execution sequence and netting batches, and starts from declared initial balances. All declared payments are immediately available. It enumerates reachable **settled subsets** by breadth-first search: a transfer is enabled when its sender can fund it. Exact balances depend only on the subset of settled payments, so different orders reaching the same subset have identical balances and can be deduplicated.

For at most 12 payments there are at most 4,096 subsets. A successful search returns an executable full order. If no full order exists, it returns a longest reachable prefix and a terminal state with blocked-payment shortfalls. This is an exhaustive decision in this bounded model. It is not a general-purpose model checker or a scalable real-bank scheduler. Larger programs can still execute explicit actions, but search is clearly skipped.

The default cycle demonstrates an important distinction: all gross orders can be blocked while a simultaneous net batch remains feasible. The program does not claim netting and gross policies have the same settlement capability.

## Audit export and privacy

The browser exports the source, typed intermediate representation, trace, final balances, and gross-search witness. BigInt values are serialized as exact integer strings in currency minor units. The interface uses text nodes for user-derived output. No application network requests occur after loading the project files. Every account and example is fictional. Do not put real financial information into a public submission.

## Scope and originality

This implementation combines a custom small language, located diagnostics, an auditable interpreter, and counterexample-oriented reachability exploration. Parsing, currency types, exact integer accounting, atomic netting and subset search are established techniques. No globally novel algorithm, production safety, banking integration or performance advantage is claimed. Credit, collateral, fees, arrival times, deadlines, legal settlement finality, FX and adversarial distributed systems are outside this model.

The runnable implementation and documentation were prepared for Vivaan Kandhari's solo entry. No team members, user studies, external results or adoption claims are invented. Existing FlowForge source was not copied into this project.
