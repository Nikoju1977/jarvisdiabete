/* Politique vocale : le microphone distant requiert un accord explicite.
 * Toute mesure issue d'une transcription reste soumise à confirmation.
 */
export function speechRoute({localNative=false,whisperReady=false,browserRecognition=false,online=false,remoteConsent=false,recordingSupported=false}={}){
 if(localNative)return "native-local";
 if(whisperReady&&recordingSupported)return "whisper-local";
 if(browserRecognition&&online&&remoteConsent)return "browser-online";
 if(recordingSupported||browserRecognition&&online)return "choose";
 return "unavailable";
}
export function transcriptSafe(text){
 const s=String(text||"").trim();
 return s.length>=2&&s.length<=1200&&!/^[\s\p{P}\p{S}]+$/u.test(s);
}
export function audioSecondsValid(s){return Number.isFinite(s)&&s>=0.4&&s<=22;}
