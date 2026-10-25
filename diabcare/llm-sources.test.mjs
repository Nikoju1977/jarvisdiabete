import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {LLM_SOURCES,usableSource,verifyDownloadedFile} from "./llm-sources.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
test("sources open source connues et versionnées",()=>{
 assert.ok(LLM_SOURCES.some(x=>x.id==="wllama"&&x.version==="3.6.1"));
 assert.ok(LLM_SOURCES.every(usableSource));
 assert.ok(LLM_SOURCES.find(x=>x.id==="qwen3-06b").sha256.length===64);
 assert.equal(usableSource({source:"https://github.com/x",license:"MIT",archived:true,status:"actif"}),false);
});
test("intégrité cryptographique",async()=>{
 const blob=new Blob(["test"]);
 assert.equal(await verifyDownloadedFile(blob,"0".repeat(64)),false);
});
