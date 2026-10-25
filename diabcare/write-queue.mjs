/* Serialize encrypted vault writes and preserve their encryption keys.
   A lock/restore/delete must flush pending writes before changing storage. */
export function createWriteQueue(write,onError=()=>{}){
 if(typeof write!=="function")throw Error("Write function missing");
 let tail=Promise.resolve(),lastError=null,sequence=0;
 return {
  enqueue(key,data){
   if(!key)throw Error("Coffre verrouillé.");
   const capturedKey=key;
   const capturedData=structuredClone(data);
   const id=++sequence;
   tail=tail.then(()=>write(capturedKey,capturedData))
    .then(()=>{if(sequence===id)lastError=null;},
      error=>{lastError=error instanceof Error?error:Error(String(error));onError(lastError);});
   return tail;
  },
  async flush(){
   await tail;
   if(lastError)throw lastError;
  },
  hasError(){return Boolean(lastError);}
 };
}
