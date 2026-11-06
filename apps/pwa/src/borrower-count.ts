/** R115: the count line under the Collection and Borrowers headings ("N borrowers" / "ผู้กู้ N ราย"). */
export const borrowerCount=(n:number,thai:boolean)=>thai?'ผู้กู้ '+n+' ราย':n===1?'1 borrower':n+' borrowers';
/** R131: the Borrowers and Collection count line while the list is paged (100 a page): "Borrowers 101–200" / "ผู้กู้ 101–200". */
export const borrowerRange=(page:number,n:number,thai:boolean,size=100)=>{const first=(page-1)*size+1;return (thai?'ผู้กู้ ':'Borrowers ')+first+'–'+(first+n-1)};
