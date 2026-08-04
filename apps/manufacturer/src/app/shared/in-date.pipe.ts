import { Pipe, PipeTransform } from '@angular/core';

/**
 * Indian date format pipe — 'YYYY-MM-DD' (ya ISO) ko 'dd/mm/yy' me dikhata hai.
 * Usage: {{ b.billDate | inDate }}
 * Invalid/khali value par '—' deta hai.
 */
@Pipe({ name: 'inDate', standalone: true })
export class InDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '—';
    let y: number, m: number, d: number;
    if (value instanceof Date) {
      y = value.getFullYear(); m = value.getMonth() + 1; d = value.getDate();
    } else {
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return String(value);   // pehchana nahi — jaisa hai waisa dikhao
      y = +match[1]; m = +match[2]; d = +match[3];
    }
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const yy = String(y % 100).padStart(2, '0');
    return `${dd}/${mm}/${yy}`;
  }
}
