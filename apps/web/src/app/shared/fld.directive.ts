import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { FieldConfigService } from './field-config.service';

/**
 * *fld — field ko firm ki setting ke hisaab se dikhata/chhupata hai.
 *
 *   <div *fld="'group_master.incentive_pct'">
 *     <label>{{ cfg.label('group_master.incentive_pct') }}</label>
 *     <input [(ngModel)]="gIncentivePct" class="input">
 *   </div>
 *
 * Ek hi shabd jodna padta hai — baaki sab registry aur firm settings sambhal
 * leti hain. Setting badalte hi screen turant badal jati hai (signal se).
 */
@Directive({ selector: '[fld]', standalone: true })
export class FldDirective {
  private cfg = inject(FieldConfigService);
  private tpl = inject(TemplateRef<unknown>);
  private vc = inject(ViewContainerRef);

  private path = '';
  private shown: boolean | null = null;

  @Input() set fld(path: string) {
    this.path = path;
    this.sync();
  }

  constructor() {
    // Settings server se baad me aati hain (ya Settings page se badalti hain) —
    // tab screen apne aap update ho jaye.
    effect(() => {
      this.cfg.revision();
      this.sync();
    });
  }

  private sync() {
    if (!this.path) return;
    const show = this.cfg.show(this.path);
    if (show === this.shown) return;   // pehle jaisa hi hai — dobara render mat karo
    this.shown = show;
    this.vc.clear();
    if (show) this.vc.createEmbeddedView(this.tpl);
  }
}
