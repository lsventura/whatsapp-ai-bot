/** Mascara o número para logs (LGPD): 5511999998888 -> 5511*****8888 */
export function maskPhone(phone: string): string {
  if (phone.length <= 8) return "*".repeat(phone.length);
  return `${phone.slice(0, 4)}${"*".repeat(phone.length - 8)}${phone.slice(-4)}`;
}
