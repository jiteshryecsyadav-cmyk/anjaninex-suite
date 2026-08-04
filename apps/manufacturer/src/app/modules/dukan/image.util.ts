/** Read an image file, resize it (max side ~700px) and return a compressed JPEG data URL.
 *  Keeps localStorage small. */
export function fileToResizedDataUrl(file: File, maxSize = 700, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height >= width && height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(reader.result as string); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject('Image load nahi hui');
      img.src = reader.result as string;
    };
    reader.onerror = () => reject('File read nahi hui');
    reader.readAsDataURL(file);
  });
}
