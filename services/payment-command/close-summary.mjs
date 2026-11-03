/** Exact display projection of the authoritative close allocation plan; never a new calculation. R118: the late-charge part apart. */
export function closeSummary(calculation){
 const unavailable={principalAmount:null,interestAmount:null,lateChargeAmount:null};
 const cents=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error();const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
 const text=value=>(value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0');
 try{if(!Array.isArray(calculation.allocations)||!calculation.allocations.length)return unavailable;let principal=0n,interest=0n,late=0n;for(const row of calculation.allocations){principal+=cents(row.principal);interest+=cents(row.interest);late+=cents(row.lateCharge??'0')}if(principal+interest+late!==cents(calculation.amount))return unavailable;return {principalAmount:text(principal),interestAmount:text(interest),lateChargeAmount:text(late)}}catch{return unavailable}
}
