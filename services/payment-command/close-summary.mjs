/** Exact display projection of the authoritative close allocation plan; never a new calculation. */
export function closeSummary(calculation){
 const unavailable={principalAmount:null,interestAmount:null};
 const cents=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error();const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
 const text=value=>(value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0');
 try{if(!Array.isArray(calculation.allocations)||!calculation.allocations.length)return unavailable;let principal=0n,interest=0n;for(const row of calculation.allocations){principal+=cents(row.principal);interest+=cents(row.interest)}if(principal+interest!==cents(calculation.amount))return unavailable;return {principalAmount:text(principal),interestAmount:text(interest)}}catch{return unavailable}
}
