/* LedgerLang: a small, exact, currency-checked settlement DSL. No eval or dependencies. */
(function(root) {
  'use strict';
  class Diagnostic extends Error {
    constructor(message, token) { super(`${token.line}:${token.column}: ${message}`); this.name='Diagnostic'; this.line=token.line; this.column=token.column; }
  }
  function lex(source) {
    if(source.length>50000) throw new Error('Program exceeds 50,000 characters');
    const tokens=[]; let i=0,line=1,column=1;
    while(i<source.length) {
      const c=source[i];
      if(c==='\n'){i++;line++;column=1;continue;}
      if(/\s/.test(c)){i++;column++;continue;}
      if(c==='#'){while(i<source.length&&source[i]!=='\n'){i++;column++;}continue;}
      const match=/^(?:->|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[;{},])/.exec(source.slice(i));
      if(!match) throw new Diagnostic(`Unexpected character ${JSON.stringify(c)}`,{line,column});
      tokens.push({value:match[0],line,column}); i+=match[0].length;column+=match[0].length;
    }
    tokens.push({value:'<end>',line,column});return tokens;
  }
  function parse(source) {
    const tokens=lex(source);let cursor=0;const ast=[];
    const next=()=>tokens[Math.min(cursor++,tokens.length-1)];
    function expect(value){const t=next();if(t.value!==value)throw new Diagnostic(`Expected '${value}', got '${t.value}'`,t);return t;}
    function name(){const t=next();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.value))throw new Diagnostic('Expected an identifier',t);return t;}
    function number(){const t=next();if(!/^\d+(?:\.\d+)?$/.test(t.value))throw new Diagnostic('Expected a nonnegative decimal amount',t);return t;}
    while(tokens[cursor].value!=='<end>') {
      const t=next();let node={kind:t.value,token:t};
      if(t.value==='currency'){node.name=name();expect('decimals');node.scale=number();}
      else if(t.value==='account'){node.name=name();node.currency=name();node.amount=number();}
      else if(t.value==='pay'){node.name=name();node.from=name();expect('->');node.to=name();node.amount=number();node.currency=name();}
      else if(t.value==='settle'){node.payment=name();}
      else if(t.value==='net'){node.name=name();expect('{');node.payments=[name()];while(tokens[cursor].value===','){next();node.payments.push(name());}expect('}');}
      else if(t.value==='assert'){expect('total');node.currency=name();node.amount=number();}
      else throw new Diagnostic(`Unknown statement '${t.value}'`,t);
      expect(';');ast.push(node);
      if(ast.length>500)throw new Diagnostic('Maximum 500 statements',t);
    }
    return ast;
  }
  function compile(source) {
    const ast=parse(source),currencies=new Map(),accounts=new Map(),payments=new Map(),actions=[],batches=new Set();
    function currency(t){if(!currencies.has(t.value))throw new Diagnostic(`Unknown currency '${t.value}'`,t);return currencies.get(t.value);}
    function money(t,code){const scale=currencies.get(code);const [whole,fraction='']=t.value.split('.');if(fraction.length>scale)throw new Diagnostic(`${code} permits ${scale} decimal places`,t);if(whole.length>18)throw new Diagnostic('Amount exceeds 18 integer digits',t);return BigInt(whole)*10n**BigInt(scale)+BigInt((fraction.padEnd(scale,'0'))||'0');}
    function payment(t){if(!payments.has(t.value))throw new Diagnostic(`Unknown payment '${t.value}'`,t);return payments.get(t.value);}
    let started=false;
    for(const n of ast) {
      if(['currency','account','pay'].includes(n.kind)&&started)throw new Diagnostic('Declare currencies, accounts and payments before execution statements',n.token);
      if(n.kind==='currency') {
        if(currencies.has(n.name.value))throw new Diagnostic('Duplicate currency',n.name);
        if(!/^[0-6]$/.test(n.scale.value))throw new Diagnostic('Currency decimals must be an integer from 0 to 6',n.scale);
        currencies.set(n.name.value,Number(n.scale.value));
      } else if(n.kind==='account') {
        currency(n.currency);if(accounts.has(n.name.value))throw new Diagnostic('Duplicate account',n.name);
        accounts.set(n.name.value,{currency:n.currency.value,initial:money(n.amount,n.currency.value)});
      } else if(n.kind==='pay') {
        currency(n.currency);if(payments.has(n.name.value))throw new Diagnostic('Duplicate payment',n.name);
        for(const t of [n.from,n.to]) {if(!accounts.has(t.value))throw new Diagnostic(`Unknown account '${t.value}'`,t);if(accounts.get(t.value).currency!==n.currency.value)throw new Diagnostic('Currency mismatch: implicit FX is forbidden',t);}
        if(n.from.value===n.to.value)throw new Diagnostic('Self-payments are not supported',n.to);
        const amount=money(n.amount,n.currency.value);if(amount===0n)throw new Diagnostic('Payments must be positive',n.amount);
        payments.set(n.name.value,{id:n.name.value,from:n.from.value,to:n.to.value,currency:n.currency.value,amount});
      } else {
        started=true;
        if(n.kind==='settle'){payment(n.payment);actions.push({kind:'settle',ids:[n.payment.value],line:n.token.line});}
        else if(n.kind==='net'){
          if(batches.has(n.name.value))throw new Diagnostic('Duplicate netting batch name',n.name);batches.add(n.name.value);
          const ids=n.payments.map(t=>{payment(t);return t.value;});if(new Set(ids).size!==ids.length)throw new Diagnostic('Duplicate payment in netting batch',n.name);
          actions.push({kind:'net',name:n.name.value,ids,line:n.token.line});
        }else actions.push({kind:'assert',currency:n.currency.value,amount:(currency(n.currency),money(n.amount,n.currency.value)),line:n.token.line});
      }
    }
    if(!accounts.size)throw new Error('Declare at least one account');
    return {ast,currencies,accounts,payments,actions};
  }
  const initialBalances=program=>new Map([...program.accounts].map(([id,a])=>[id,a.initial]));
  function totals(program,balances){const result=new Map([...program.currencies.keys()].map(c=>[c,0n]));for(const [id,a] of program.accounts)result.set(a.currency,result.get(a.currency)+balances.get(id));return result;}
  function format(amount,scale){const negative=amount<0n;const digits=(negative?-amount:amount).toString().padStart(scale+1,'0');return (negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);}
  function execute(program) {
    let balances=initialBalances(program);const originalTotals=totals(program,balances),settled=new Set(),trace=[];
    function invariant(){const current=totals(program,balances);for(const [id,b] of balances)if(b<0n)throw new Error('Internal invariant: negative '+id);for(const [c,total] of originalTotals)if(current.get(c)!==total)throw new Error('Internal invariant: cash conservation '+c);}
    for(const action of program.actions) {
      if(action.kind==='assert'){
        const actual=totals(program,balances).get(action.currency),ok=actual===action.amount;
        trace.push({...action,status:ok?'passed':'failed',reason:ok?'Total matches':'Total assertion differs',actual,balances:Object.fromEntries(balances)});continue;
      }
      const duplicate=action.ids.find(id=>settled.has(id));
      if(duplicate){trace.push({...action,status:'rejected',reason:duplicate+' already settled',balances:Object.fromEntries(balances)});continue;}
      // Compute on a fresh candidate map. Commit all legs only if every balance is feasible.
      const candidate=new Map(balances);
      for(const id of action.ids){const p=program.payments.get(id);candidate.set(p.from,candidate.get(p.from)-p.amount);candidate.set(p.to,candidate.get(p.to)+p.amount);}
      const short=[...candidate].filter(([,b])=>b<0n).map(([id,b])=>({account:id,shortfall:-b}));
      if(short.length){trace.push({...action,status:'blocked',reason:'Insufficient liquidity; no legs applied',shortfalls:short,balances:Object.fromEntries(balances)});continue;}
      balances=candidate;for(const id of action.ids)settled.add(id);invariant();
      trace.push({...action,status:'settled',reason:action.kind==='net'?'Atomic net settlement':'Gross settlement',balances:Object.fromEntries(balances)});
    }
    invariant();return {balances:Object.fromEntries(balances),settled:[...settled],pending:[...program.payments.keys()].filter(id=>!settled.has(id)),trace,conservation:true,assertionsPassed:trace.filter(t=>t.kind==='assert').every(t=>t.status==='passed')};
  }
  function exploreGross(program) {
    const ps=[...program.payments.values()];if(ps.length>12)throw new Error('Gross explorer is limited to 12 payments (at most 4096 subsets)');
    // Balances depend only on the settled subset. Deduplicating subsets is exact here.
    // Search starts from initial balances and ignores declared actions and netting.
    const queue=[{mask:0,balances:initialBalances(program),path:[]}],seen=new Set([0]);let best=queue[0],deadlock=null;
    for(let head=0;head<queue.length;head++){
      const state=queue[head];if(state.path.length>best.path.length)best=state;
      if(state.path.length===ps.length)return {possible:true,order:state.path,visited:seen.size,deadlock:null};
      let feasible=false;
      ps.forEach((p,i)=>{if(state.mask&(1<<i)||state.balances.get(p.from)<p.amount)return;feasible=true;const mask=state.mask|(1<<i);if(seen.has(mask))return;seen.add(mask);const b=new Map(state.balances);b.set(p.from,b.get(p.from)-p.amount);b.set(p.to,b.get(p.to)+p.amount);queue.push({mask,balances:b,path:[...state.path,p.id]});});
      if(!feasible&&(!deadlock||state.path.length>deadlock.path.length))deadlock=state;
    }
    return {possible:false,order:best.path,visited:seen.size,deadlock:deadlock?{order:deadlock.path,balances:Object.fromEntries(deadlock.balances),blocked:ps.filter((p,i)=>!(deadlock.mask&(1<<i))).map(p=>({id:p.id,account:p.from,shortfall:p.amount-deadlock.balances.get(p.from)}))}:null};
  }
  function report(source){const program=compile(source);let gross;try{gross=exploreGross(program);}catch(e){gross={skipped:true,reason:e.message};}return {program,result:execute(program),gross};}
  const api={Diagnostic,lex,parse,compile,execute,exploreGross,format,report};
  if(typeof module!=='undefined')module.exports=api;else root.LedgerLang=api;
})(typeof window==='undefined'?this:window);
