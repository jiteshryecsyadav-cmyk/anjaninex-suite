import { Component, inject, signal, output, input, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AiService, ExtractedBill } from '../services/ai.service';

type ScanState = 'idle' | 'camera' | 'preview' | 'analyzing' | 'result' | 'error';

@Component({
  selector: 'app-bill-scan-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
         (click)="close()">
      <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
           (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b text-white" style="background: var(--anjaninex-navy)">
          <h3 class="font-display font-bold text-lg flex items-center gap-2">
            🤖 Bill Scanner
          </h3>
          <button (click)="close()" class="text-2xl hover:opacity-70">×</button>
        </div>

        <!-- IDLE: Upload options -->
        @if (state() === 'idle') {
          <div class="p-8">
            <div class="grid grid-cols-2 gap-4 mb-4">
              <button (click)="openCamera()"
                      class="border-2 border-dashed border-[#5c1a8b] rounded-xl p-8 text-center hover:bg-[#f0e6ff] transition cursor-pointer">
                <div class="text-5xl mb-2">📸</div>
                <div class="font-bold text-[#5c1a8b]">Use Camera</div>
                <div class="text-xs text-gray-500 mt-1">Snap bill directly</div>
              </button>
              <button (click)="filePicker.click()"
                      class="border-2 border-dashed border-[#5c1a8b] rounded-xl p-8 text-center hover:bg-[#f0e6ff] transition cursor-pointer">
                <div class="text-5xl mb-2">📤</div>
                <div class="font-bold text-[#5c1a8b]">Upload File</div>
                <div class="text-xs text-gray-500 mt-1">JPG, PNG, PDF · Max 5 MB</div>
              </button>
              <input #filePicker type="file" hidden accept="image/*,application/pdf"
                     (change)="onFileSelected($event)">
            </div>

            <div class="text-center text-xs text-gray-500 mt-4">
              <strong>💰 Cost:</strong> ₹0.15 per bill scan (debited from wallet)<br>
              <strong>⚡ Speed:</strong> ~2-4 seconds<br>
              <strong>🎯 Accuracy:</strong> ~92% on Indian GST invoices
            </div>
          </div>
        }

        <!-- CAMERA: Live video -->
        @if (state() === 'camera') {
          <div class="p-4">
            <video #videoEl autoplay playsinline class="w-full rounded-lg bg-black aspect-video"></video>
            <div class="flex justify-center gap-3 mt-4">
              <button (click)="state.set('idle'); stopCamera()" class="px-4 py-2 border border-gray-300 rounded text-sm">Cancel</button>
              <button (click)="capturePhoto()" class="btn-primary">📸 Capture</button>
            </div>
          </div>
        }

        <!-- PREVIEW: Image before analyze (with zoom + pan) -->
        @if (state() === 'preview' && previewUrl()) {
          <div class="p-4">
            <!-- Zoom toolbar -->
            <div class="flex items-center justify-center gap-2 mb-2">
              <button (click)="zoomOut()" [disabled]="zoom() <= 1"
                      class="w-9 h-9 rounded-lg border border-gray-300 text-lg font-bold disabled:opacity-40 hover:bg-gray-100">−</button>
              <span class="text-xs font-mono text-gray-600 w-12 text-center">{{ (zoom() * 100).toFixed(0) }}%</span>
              <button (click)="zoomIn()" [disabled]="zoom() >= 4"
                      class="w-9 h-9 rounded-lg border border-gray-300 text-lg font-bold disabled:opacity-40 hover:bg-gray-100">+</button>
              <button (click)="resetZoom()"
                      class="px-3 h-9 rounded-lg border border-gray-300 text-xs hover:bg-gray-100">Reset</button>
              <span class="text-xs text-gray-400 ml-2">Zoom karke bill saaf dekho · drag to pan</span>
            </div>
            <!-- Scrollable / pannable image viewport -->
            <div class="border rounded-lg bg-gray-100 overflow-auto"
                 style="max-height: 60vh; cursor: grab;"
                 (mousedown)="startPan($event)" (mousemove)="onPan($event)"
                 (mouseup)="endPan()" (mouseleave)="endPan()">
              <img [src]="previewUrl()"
                   [style.transform]="'scale(' + zoom() + ')'"
                   style="transform-origin: top left; display: block; max-width: 100%;"
                   class="select-none" draggable="false">
            </div>
            <div class="flex justify-center gap-3 mt-4">
              <button (click)="retake()" class="px-4 py-2 border border-gray-300 rounded text-sm">↺ Retake</button>
              <button (click)="analyze()" class="btn-primary">🤖 Analyze</button>
            </div>
          </div>
        }

        <!-- ANALYZING: Progress -->
        @if (state() === 'analyzing') {
          <div class="p-12 text-center">
            <div class="w-16 h-16 mx-auto mb-4 border-4 border-[#f0e6ff] border-t-[#5c1a8b] rounded-full animate-spin"></div>
            <h4 class="font-display font-bold text-lg text-[#5c1a8b] mb-2">Analyzing Document...</h4>
            <p class="text-sm text-gray-500">{{ progressStep() }}</p>
            <div class="mt-4 text-xs text-gray-400">Bade bill par 30-60 sec lag sakte hain</div>
          </div>
        }

        <!-- RESULT: Extracted data preview -->
        @if (state() === 'result' && extracted(); as data) {
          <div class="p-5">
            <!-- AI FAILURE WARNING — when Gemini call failed, surface the reason -->
            @if (data.modelUsed === 'mock_fallback' || data.failureReason) {
              <div class="mb-4 p-3 rounded-lg border-l-4 border-red-500 bg-red-50">
                <div class="font-bold text-red-700 mb-1">⚠️ AI extraction failed — showing sample data</div>
                @if (data.failureReason) {
                  <div class="text-xs text-red-600 font-mono break-all">{{ data.failureReason }}</div>
                }
                <div class="text-xs text-red-600 mt-2">
                  Common fixes:
                  • Check Gemini API key in appsettings.Development.json
                  • Enable Generative Language API in Google Cloud Console
                  • Verify Google Cloud billing/payment account is active
                </div>
              </div>
            }
            <!-- Confidence badge -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-bold"
                      [class.bg-green-100]="data.confidence > 0.8"
                      [class.text-green-700]="data.confidence > 0.8"
                      [class.bg-yellow-100]="data.confidence > 0.5 && data.confidence <= 0.8"
                      [class.text-yellow-700]="data.confidence > 0.5 && data.confidence <= 0.8"
                      [class.bg-red-100]="data.confidence <= 0.5"
                      [class.text-red-700]="data.confidence <= 0.5">
                  Confidence: {{ (data.confidence * 100).toFixed(0) }}%
                </span>
                <span class="text-xs text-gray-500">
                  via {{ data.modelUsed }}
                  @if (data.fromCache) { · ⚡ cached } @else { · ₹{{ data.cost }} debited }
                </span>
              </div>
              <div class="flex items-center gap-3">
                @if (data.confidence < 0.5 || data.items.length === 0) {
                  <button (click)="analyze()"
                          class="text-xs font-bold px-3 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200"
                          title="Re-extract fresh (skip cache)">
                    🔄 Try again
                  </button>
                }
                <button (click)="reset()" class="text-xs text-gray-500 hover:text-[#5c1a8b]">↺ Scan another</button>
              </div>
            </div>

            <!-- Quick summary -->
            <div class="card bg-[#faf5ff] mb-4">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div class="text-xs text-gray-500 uppercase font-bold">Supplier</div>
                  <div class="font-semibold">{{ data.supplier.name }}</div>
                  <div class="text-xs text-gray-600">{{ data.supplier.gst }}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 uppercase font-bold">Buyer</div>
                  <div class="font-semibold">{{ data.buyer.name }}</div>
                  <div class="text-xs text-gray-600">{{ data.buyer.gst }}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 uppercase font-bold">Invoice</div>
                  <div class="font-mono font-bold">{{ data.invoice.number }} · {{ data.invoice.date }}</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500 uppercase font-bold">Total</div>
                  <div class="font-mono font-bold text-xl text-[#5c1a8b]">
                    ₹{{ data.totals.grandTotal | number:'1.2-2' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Items table -->
            <h4 class="text-xs font-bold text-[#6b3fa0] uppercase mb-2">
              Items ({{ data.items.length }})
            </h4>
            <div class="border border-[#ddc8f5] rounded-lg overflow-hidden mb-4">
              <table class="w-full text-xs">
                <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase">
                  <tr>
                    <th class="px-2 py-1 text-left">Item</th>
                    <th class="px-2 py-1 text-right">Qty</th>
                    <th class="px-2 py-1 text-right">Rate</th>
                    <th class="px-2 py-1 text-right">Tax%</th>
                    <th class="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of data.items; track $index) {
                    <tr class="border-t">
                      <td class="px-2 py-1">
                        <div class="font-semibold">{{ item.name }}</div>
                        @if (item.hsnSac) { <div class="text-gray-400 font-mono">{{ item.hsnSac }}</div> }
                      </td>
                      <td class="px-2 py-1 text-right font-mono">{{ item.qty }} {{ item.unit }}</td>
                      <td class="px-2 py-1 text-right font-mono">₹{{ item.rate | number:'1.2-2' }}</td>
                      <td class="px-2 py-1 text-right">{{ item.taxRate }}%</td>
                      <td class="px-2 py-1 text-right font-mono font-bold">₹{{ item.totalAmount | number:'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot class="bg-gray-50 font-bold">
                  <tr>
                    <td colspan="4" class="px-2 py-1 text-right">Taxable:</td>
                    <td class="px-2 py-1 text-right font-mono">₹{{ data.totals.taxableTotal | number:'1.2-2' }}</td>
                  </tr>
                  @if (data.totals.cgst > 0) {
                    <tr>
                      <td colspan="4" class="px-2 py-1 text-right">CGST + SGST:</td>
                      <td class="px-2 py-1 text-right font-mono">₹{{ (data.totals.cgst + data.totals.sgst) | number:'1.2-2' }}</td>
                    </tr>
                  }
                  <tr class="text-[#5c1a8b]">
                    <td colspan="4" class="px-2 py-1 text-right">Grand Total:</td>
                    <td class="px-2 py-1 text-right font-mono text-base">₹{{ data.totals.grandTotal | number:'1.2-2' }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="flex justify-between items-center border-t pt-4">
              <p class="text-xs text-gray-500">
                💡 Review highlighted fields — ~92% accurate. You can edit anything after import.
              </p>
              <button (click)="useData()" class="btn-primary">
                ✓ Use This Data
              </button>
            </div>
          </div>
        }

        <!-- ERROR -->
        @if (state() === 'error') {
          <div class="p-8 text-center">
            <div class="text-5xl mb-3">⚠️</div>
            <h4 class="font-bold text-red-600 mb-2">Extraction Failed</h4>
            <p class="text-sm text-gray-600 mb-4">{{ errorMsg() }}</p>
            <button (click)="reset()" class="btn-primary">Try Again</button>
          </div>
        }
      </div>
    </div>
  `
})
export class BillScanModalComponent implements OnDestroy {
  private svc = inject(AiService);

  state = signal<ScanState>('idle');
  previewUrl = signal<string | null>(null);
  extracted = signal<ExtractedBill | null>(null);
  progressStep = signal('Uploading image...');
  errorMsg = signal('');

  // ── Preview zoom + pan ──
  zoom = signal(1);
  private panning = false;
  private panStartX = 0;
  private panStartY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;

  zoomIn()    { this.zoom.set(Math.min(4, +(this.zoom() + 0.25).toFixed(2))); }
  zoomOut()   { this.zoom.set(Math.max(1, +(this.zoom() - 0.25).toFixed(2))); }
  resetZoom() { this.zoom.set(1); }

  startPan(e: MouseEvent) {
    const vp = e.currentTarget as HTMLElement;
    this.panning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.scrollStartX = vp.scrollLeft;
    this.scrollStartY = vp.scrollTop;
    vp.style.cursor = 'grabbing';
  }
  onPan(e: MouseEvent) {
    if (!this.panning) return;
    const vp = e.currentTarget as HTMLElement;
    vp.scrollLeft = this.scrollStartX - (e.clientX - this.panStartX);
    vp.scrollTop  = this.scrollStartY - (e.clientY - this.panStartY);
  }
  endPan() { this.panning = false; }

  private file: File | null = null;
  private stream: MediaStream | null = null;

  closed = output<void>();
  dataReady = output<ExtractedBill>();
  source = input<'bill' | 'order'>('bill');   // scan report me Bill vs Order alag dikhane ke liye

  async openCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.state.set('camera');
      setTimeout(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video && this.stream) video.srcObject = this.stream;
      }, 100);
    } catch (e) {
      this.errorMsg.set('Camera access denied. Please use file upload instead.');
      this.state.set('error');
    }
  }

  capturePhoto() {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      this.previewUrl.set(URL.createObjectURL(blob));
      this.stopCamera();
      this.resetZoom();
      this.state.set('preview');
    }, 'image/jpeg', 0.85);
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;

    if (f.size > 5 * 1024 * 1024) {
      this.errorMsg.set('File too large. Max 5 MB allowed.');
      this.state.set('error');
      return;
    }

    this.file = await this.compress(f);
    this.previewUrl.set(URL.createObjectURL(this.file));
    this.resetZoom();
    this.state.set('preview');
  }

  private async compress(file: File): Promise<File> {
    // Balance speed vs readability. GSTIN / HSN are SMALL text — over-compression
    // (1000px @ 0.62) blurred them and Gemini missed the GST. 1600px @ 0.8 keeps
    // small digits sharp while still shrinking large phone photos.
    if (!file.type.startsWith('image/')) return file;  // PDF — skip

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          // Only use the compressed version if it's actually smaller.
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  retake() {
    this.state.set('idle');
    this.previewUrl.set(null);
    this.file = null;
    this.resetZoom();
  }

  async analyze() {
    const f = this.file;
    if (!f) return;
    this.state.set('analyzing');
    this.progressStep.set('Uploading image...');

    setTimeout(() => this.progressStep.set('Processing scan...'), 800);
    setTimeout(() => this.progressStep.set('Extracting fields...'), 1800);

    this.svc.extractBill(f, this.source()).subscribe({
      next: (result) => {
        // AI fail hua? Koi sample/demo data nahi — seedha error screen.
        if (result.failureReason || result.modelUsed === 'failed' || result.modelUsed === 'mock_fallback') {
          this.errorMsg.set(result.failureReason || 'AI extraction fail ho gaya. Manually entry kar lo ya dobara try karo.');
          this.state.set('error');
          return;
        }
        this.extracted.set(result);
        this.state.set('result');
      },
      error: (e) => {
        this.errorMsg.set(e?.error?.error ?? 'Extraction failed. Please enter manually.');
        this.state.set('error');
      }
    });
  }

  useData() {
    if (this.extracted()) {
      this.dataReady.emit(this.extracted()!);
      this.close();
    }
  }

  reset() {
    this.state.set('idle');
    this.previewUrl.set(null);
    this.extracted.set(null);
    this.file = null;
    this.errorMsg.set('');
    this.resetZoom();
  }

  close() {
    this.stopCamera();
    this.closed.emit();
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
