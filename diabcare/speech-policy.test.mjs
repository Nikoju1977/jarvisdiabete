import test from "node:test";
import assert from "node:assert/strict";
import {speechRoute,transcriptSafe,audioSecondsValid} from "./speech-policy.mjs";
test("Android : sans reconnaissance locale, proposer des solutions dans l'écran vocal",()=>{
 assert.equal(speechRoute({browserRecognition:true,online:true,remoteConsent:false,recordingSupported:true}),"choose");
 assert.equal(speechRoute({browserRecognition:true,online:true,remoteConsent:true,recordingSupported:true}),"browser-online");
 assert.equal(speechRoute({browserRecognition:false,online:true,recordingSupported:true}),"choose");
});
test("Sans réseau : Whisper installé sert même sans SpeechRecognition",()=>{
 assert.equal(speechRoute({whisperReady:true,recordingSupported:true,online:false}),"whisper-local");
 assert.equal(speechRoute({browserRecognition:true,online:false,recordingSupported:false}),"unavailable");
 assert.equal(speechRoute({localNative:true,online:false}),"native-local");
});
test("Dictée non vide et durée courte",()=>{
 assert.equal(transcriptSafe("1 virgule 20"),true);
 assert.equal(transcriptSafe("  "),false);
 assert.equal(transcriptSafe(".".repeat(1300)),false);
 assert.equal(audioSecondsValid(12),true);
 assert.equal(audioSecondsValid(40),false);
});
