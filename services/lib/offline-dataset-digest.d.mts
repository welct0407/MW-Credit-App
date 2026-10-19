export function codePointCompare(a:string,b:string):number;
export function applyDatasetPatch(data:any,patch:any):void;
export function deltaMovesRows(data:any,patches:any[]):boolean;
export function deltaScopeMoves(data:any,scope:any):boolean;
export function canonicalDatasetValue(value:unknown):unknown;
export type DatasetDigests={keys:Record<string,string>;digest:string};
export function datasetDigests(data:Record<string,unknown>,sha256:(text:string)=>string|Promise<string>):Promise<DatasetDigests>;
export function digestDifferences(left:DatasetDigests|null|undefined,right:DatasetDigests|null|undefined):string[];
