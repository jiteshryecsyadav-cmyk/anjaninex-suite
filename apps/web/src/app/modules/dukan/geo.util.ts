/** India Post PIN code API (free, no key) — covers all India.
 *  https://api.postalpincode.in */
export interface PostOffice { name: string; district: string; state: string; pin: string; }

export async function lookupPincode(pin: string): Promise<PostOffice[]> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    const rec = Array.isArray(data) ? data[0] : null;
    if (!rec || rec.Status !== 'Success' || !rec.PostOffice) return [];
    return rec.PostOffice.map((p: any) => ({ name: p.Name, district: p.District, state: p.State, pin: p.Pincode }));
  } catch { return []; }
}

export async function searchPostOffice(name: string): Promise<PostOffice[]> {
  try {
    const res = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(name)}`);
    const data = await res.json();
    const rec = Array.isArray(data) ? data[0] : null;
    if (!rec || rec.Status !== 'Success' || !rec.PostOffice) return [];
    return rec.PostOffice.slice(0, 40).map((p: any) => ({ name: p.Name, district: p.District, state: p.State, pin: p.Pincode }));
  } catch { return []; }
}

/** Contact Picker API — buyer apne phone contacts se ek contact chun sake.
 *  Sirf Android Chrome (HTTPS) pe available. Returns {name, tel} or null. */
export async function pickContact(): Promise<{ name: string; tel: string } | null> {
  const nav = navigator as any;
  if (!nav.contacts || typeof nav.contacts.select !== 'function') {
    throw 'Contact picker sirf Android Chrome pe chalta hai (desktop pe nahi)';
  }
  const list = await nav.contacts.select(['name', 'tel'], { multiple: false });
  if (!list || !list.length) return null;
  const c = list[0];
  const name = (c.name && c.name[0]) || '';
  const tel = ((c.tel && c.tel[0]) || '').replace(/\D/g, '').slice(-10);
  return { name, tel };
}

/** Browser geolocation -> address via OpenStreetMap reverse geocoding (free, no key).
 *  Works only on HTTPS / localhost (secure context). */
export interface GeoAddress {
  line: string; city: string; state: string; pin: string; lat: number; lng: number;
}

export function getCurrentLocationAddress(): Promise<GeoAddress> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject('Geolocation supported nahi hai is browser mein'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept': 'application/json' } }
          );
          const d = await res.json();
          const a = d.address || {};
          resolve({
            line: [a.road, a.neighbourhood, a.suburb, a.quarter].filter(Boolean).join(', ') || d.display_name || '',
            city: a.city || a.town || a.village || a.county || '',
            state: a.state || '',
            pin: a.postcode || '',
            lat: latitude, lng: longitude,
          });
        } catch {
          resolve({ line: `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`, city: '', state: '', pin: '', lat: latitude, lng: longitude });
        }
      },
      (err) => reject(err.code === 1 ? 'Location permission denied — allow karein' : 'Location nahi mili'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
