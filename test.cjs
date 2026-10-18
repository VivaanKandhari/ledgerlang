'use strict';
const assert=require('node:assert/strict'),L=require('./ledger.js'),examples=require('./examples.json');let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const prefix='currency HKD decimals 2; account A HKD 10.00; account B HKD 0.00; ';
test('Exact decimal accounting avoids floating-point drift',()=>{let r=L.report(examples['Exact decimal accounting']);assert.equal(r.result.balances.A,0n);assert.equal(r.result.balances.B,30n);assert(r.result.assertionsPassed);assert.equal(L.format(30n,2),'0.30');});
test('Gross gridlock witness and atomic cycle rescue',()=>{let r=L.report(examples['Gridlock and atomic rescue']);assert.equal(r.gross.possible,false);assert.equal(r.gross.visited,1);assert.equal(r.gross.deadlock.blocked.length,3);assert.equal(r.result.settled.length,3);assert.deepEqual(r.result.balances,{A:1000n,B:1000n,C:1000n});});
test('Search discovers a non-declaration settlement order',()=>{let r=L.report(examples['Find the feasible order']);assert.equal(r.gross.possible,true);assert.deepEqual(r.gross.order,['ba','ab']);assert.equal(r.result.settled.length,2);});
test('Cross-currency transfers fail at compile time',()=>assert.throws(()=>L.compile(examples['Currency type error']),/Currency mismatch/));
test('Failed batch rolls back every leg',()=>{let r=L.report(examples['Atomic rollback']);assert.deepEqual(r.result.balances,{A:500n,B:0n,C:0n});assert.deepEqual(r.result.settled,[]);assert.equal(r.result.trace[0].status,'blocked');});
test('Compiler catches precision errors with a source location',()=>assert.throws(()=>L.compile(prefix+'pay x A -> B 0.001 HKD;'),e=>e instanceof L.Diagnostic&&/decimal places/.test(e.message)&&e.line===1&&e.column>1));
test('Unknown references and duplicate symbols are rejected',()=>{assert.throws(()=>L.compile(prefix+'pay x A -> X 1.00 HKD;'),/Unknown account/);assert.throws(()=>L.compile(prefix+'account A HKD 1.00;'),/Duplicate account/);assert.throws(()=>L.compile(prefix+'settle missing;'),/Unknown payment/);});
test('Duplicate legs and double settlement cannot create money',()=>{assert.throws(()=>L.compile(prefix+'pay x A -> B 1.00 HKD; net dup {x,x};'),/Duplicate payment/);let r=L.report(prefix+'pay x A -> B 1.00 HKD; settle x; settle x;');assert.equal(r.result.trace[1].status,'rejected');assert.equal(r.result.balances.B,100n);});
test('Assertions report failure rather than claiming success',()=>{let r=L.report(prefix+'assert total HKD 11.00;');assert.equal(r.result.assertionsPassed,false);assert.equal(r.result.trace[0].status,'failed');});
test('Declaration order and arbitrary executable syntax are rejected',()=>{assert.throws(()=>L.compile(prefix+'assert total HKD 10.00; account C HKD 0.00;'),/Declare/);assert.throws(()=>L.compile('console.log(1);'),/Unexpected character/);});
test('Independent brute-force permutations agree with subset search',()=>{
  // Independent oracle enumerates every order for small randomly generated networks.
  let seed=7183;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  function oracle(ps,balances,remaining){if(!remaining.length)return true;for(let k=0;k<remaining.length;k++){let p=ps[remaining[k]];if(balances[p.from]<p.amount)continue;let b=balances.slice();b[p.from]-=p.amount;b[p.to]+=p.amount;if(oracle(ps,b,remaining.filter((_,i)=>i!==k)))return true;}return false;}
  for(let trial=0;trial<80;trial++){
    const b=[random(6),random(6),random(6)],ps=Array.from({length:5},()=>{let from=random(3),to=(from+1+random(2))%3;return {from,to,amount:1+random(8)};});
    let src='currency HKD decimals 0; '+b.map((v,i)=>`account a${i} HKD ${v};`).join(' ')+ps.map((p,i)=>`pay p${i} a${p.from} -> a${p.to} ${p.amount} HKD;`).join(' ');
    let program=L.compile(src),r=L.exploreGross(program);assert.equal(r.possible,oracle(ps,b,[0,1,2,3,4]));
    // Replay the discovered witness independently, checking funding on every transfer.
    let cash=b.slice();for(let id of r.order){let p=ps[Number(id.slice(1))];assert(cash[p.from]>=p.amount);cash[p.from]-=p.amount;cash[p.to]+=p.amount;}
    assert.equal(cash.reduce((a,v)=>a+v,0),b.reduce((a,v)=>a+v,0));
  }
});
test('Explorer bounds combinatorial work explicitly',()=>{let src=prefix+Array.from({length:13},(_,i)=>`pay p${i} A -> B 1.00 HKD;`).join(' ');let r=L.report(src);assert(r.gross.skipped);assert.match(r.gross.reason,/12 payments/);});
console.log(`${count} checks passed; independent search oracle covers 80 generated networks.`);
