import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainQuote } from '../sponsors.mjs';
const input = { rfq: 'Need 10 stainless sheets 4 x 8 ASAP.' };
const env = { NICRRON_API_KEY: 'test-only', PRISMTRACE_API_KEY: 'test-trace', PRISMTRACE_PROJECT_ID: 'project' };
const response = (body, status=200) => new Response(JSON.stringify(body), {status});
test('missing key makes no outbound call', async()=>{const x=await explainQuote(input,{env:{},fetchImpl:()=>assert.fail()});assert.equal(x.status,'unavailable');});
test('valid explanation emits actual exchange and leaves quote authoritative',async()=>{
 const calls=[]; const x=await explainQuote(input,{env,fetchImpl:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return calls.length===1?response({model:'actual-model',choices:[{message:{content:'Please confirm the dimension units.'}}]}):response({id:'trace-1'});}});
 assert.equal(x.status,'ok');assert.equal(x.trace.status,'recorded');assert.equal(x.quote.total_usd,0);assert.equal(calls[0].redirect,'error');assert.equal(calls[1].body.model,'actual-model');assert.equal(calls[1].body.output_message,x.explanation);assert.deepEqual(calls[1].body.input_messages,calls[0].body.messages);
});
test('network failure is sanitized',async()=>{const x=await explainQuote(input,{env,fetchImpl:async()=>{throw Error('secret-key');}});assert.equal(x.status,'unavailable');assert.ok(!JSON.stringify(x).includes('secret-key'));});
test('malformed model response cannot become advice or trace',async()=>{let calls=0;const x=await explainQuote(input,{env,fetchImpl:async()=>{calls++;return response({choices:[{message:{content:{bad:true}}}]});}});assert.equal(x.status,'unavailable');assert.equal(calls,1);});
test('trace failure keeps explanation but reports unrecorded',async()=>{let calls=0;const x=await explainQuote(input,{env,fetchImpl:async()=>++calls===1?response({choices:[{message:{content:'Check units.'}}]}):response({error:'secret'},500)});assert.equal(x.status,'ok');assert.equal(x.trace.status,'failed');});
test('reject oversized RFQ',async()=>{await assert.rejects(explainQuote({rfq:'x'.repeat(8001)},{env}),/8,000/);});
