// Foto-compressie vóór upload: telefoonfoto's van 8-12 MB worden
// teruggebracht naar ~0,3-0,8 MB (max 1600px breed, JPEG 80%).
// Scheelt 80-90% upload op mobiel internet in het veld.

const MAX_BREEDTE = 1600;
const JPEG_KWALITEIT = 0.8;

export interface CompressieResultaat {
  file: File;
  origineelKb: number;
  gecomprimeerdKb: number;
}

export async function comprimeerFoto(origineel: File): Promise<CompressieResultaat> {
  const origineelKb = Math.round(origineel.size / 1024);
  // niet-afbeeldingen en al-kleine bestanden ongemoeid laten
  if (!origineel.type.startsWith("image/") || origineel.size < 300 * 1024) {
    return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
  }

  try {
    const bitmap = await createImageBitmap(origineel);
    const schaal = Math.min(1, MAX_BREEDTE / bitmap.width);
    const breedte = Math.round(bitmap.width * schaal);
    const hoogte = Math.round(bitmap.height * schaal);

    const canvas = document.createElement("canvas");
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
    ctx.drawImage(bitmap, 0, 0, breedte, hoogte);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_KWALITEIT),
    );
    if (!blob || blob.size >= origineel.size) {
      return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
    }
    const naam = origineel.name.replace(/\.\w+$/, "") + ".jpg";
    return {
      file: new File([blob], naam, { type: "image/jpeg" }),
      origineelKb,
      gecomprimeerdKb: Math.round(blob.size / 1024),
    };
  } catch {
    // compressie is een optimalisatie — bij twijfel het origineel gebruiken
    return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
  }
}
