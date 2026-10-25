// Shared input constraints; the backend remains the authority for financial records.
export const passwordMinLength=12;
export const passwordMaxLength=128;
export function parseINR(value:string) {
  const match=value.trim().match(/^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/);
  if(!match)throw new Error('Enter an INR amount with up to two decimal places.');
  const result=Number(match[2])*100+Number((match[3]||'').padEnd(2,'0'));
  if(!Number.isSafeInteger(result))throw new Error('Amount is too large.');
  return match[1]?-result:result;
}
