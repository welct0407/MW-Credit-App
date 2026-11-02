/** R115: the count line under the Collection and Borrowers headings ("N borrowers" / "ผู้กู้ N ราย"). */
export const borrowerCount=(n:number,thai:boolean)=>thai?'ผู้กู้ '+n+' ราย':n===1?'1 borrower':n+' borrowers';
/** R115: shown instead of a pager when the one 100-row page still has more rows. */
export const moreBorrowers=(thai:boolean)=>thai?'ผู้กู้มากกว่า 100 ราย โปรดใช้การค้นหา':'More than 100 borrowers; use search';
