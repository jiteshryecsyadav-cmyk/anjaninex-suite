import { Injectable, ApplicationRef, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { concat, interval, firstValueFrom } from 'rxjs';
import { first, filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface VersionInfo {
  version: string;
  minClientVersion: string;
  forceUpdateOnMismatch: boolean;
  serverTime: string;
  poweredBy: string;
  environment: string;
}

export interface ChangelogEntry {
  version: string;
  releaseDate: string;
  newFeatures: string[];
  improvements: string[];
  fixes: string[];
  breakingChanges: string[];
  requiresForceUpdate: boolean;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private sw = inject(SwUpdate);
  private appRef = inject(ApplicationRef);
  private http = inject(HttpClient);

  newVersionAvailable = signal(false);
  forceUpdate = signal(false);
  changelog = signal<ChangelogEntry | null>(null);
  currentVersion = signal<string>((window as any).__APP_VERSION__ ?? '1.0.0');

  init(): void {
    if (!this.sw.isEnabled) {
      console.info('Service worker disabled — update detection skipped');
      return;
    }

    const appIsStable$ = this.appRef.isStable.pipe(first((s) => s === true));
    const everyFiveMinutes$ = interval(5 * 60 * 1000);
    concat(appIsStable$, everyFiveMinutes$).subscribe(async () => {
      try { await this.sw.checkForUpdate(); } catch {}
      await this.checkServerVersion();
    });

    this.sw.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(async () => {
        await this.loadChangelog();
        this.newVersionAvailable.set(true);
      });

    this.sw.unrecoverable.subscribe(() => document.location.reload());
  }

  private async checkServerVersion(): Promise<void> {
    try {
      const v = await firstValueFrom(
        this.http.get<VersionInfo>(`${environment.apiUrl}/api/version`)
      );
      if (this.compareVersions(v.minClientVersion, this.currentVersion()) > 0) {
        this.forceUpdate.set(true);
        this.newVersionAvailable.set(true);
        await this.loadChangelog();
        setTimeout(() => this.applyUpdate(), 5000);
      }
    } catch {}
  }

  private async loadChangelog(): Promise<void> {
    try {
      const cl = await firstValueFrom(
        this.http.get<ChangelogEntry>(`${environment.apiUrl}/api/version/changelog/latest`)
      );
      this.changelog.set(cl);
    } catch {}
  }

  async applyUpdate(): Promise<void> {
    try { await this.sw.activateUpdate(); }
    catch {}
    finally { document.location.reload(); }
  }

  snooze(): void {
    if (this.forceUpdate()) return;
    this.newVersionAvailable.set(false);
    setTimeout(() => this.newVersionAvailable.set(true), 60 * 60 * 1000);
  }

  private compareVersions(a: string, b: string): number {
    const ap = a.split('.').map(Number);
    const bp = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((ap[i] ?? 0) !== (bp[i] ?? 0)) return (ap[i] ?? 0) - (bp[i] ?? 0);
    }
    return 0;
  }
}
