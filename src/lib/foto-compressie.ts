// Foto-compressie vóór upload: telefoonfoto's van 8-12 MB worden
// teruggebracht naar ~0,3-0,8 MB (max 1600px breed, JPEG 80%).
// Scheelt 80-90% upload op mobiel internet in het veld.
//
// Privacy (Fase 7 Blok A): elke afbeelding wordt ALTIJD via canvas
// gehercodeerd, ook kleine bestanden en ook als het resultaat groter
// uitvalt. Canvas-hercodering schrijft een kale JPEG zonder
// EXIF-metadata — GPS-locatie, cameramodel en tijdstempel uit de
// telefoonfoto komen dus nooit in PocketBase terecht. Alleen als de
// browser de afbeelding helemaal niet kan decoderen valt het origineel
// door (zeldzaam; gedocumenteerd restrisico in docs/security.md).

const MAX_BREEDTE = 1600;
const JPEG_KWALITEIT = 0.8;

export interface CompressieResultaat {
  file: File;
  origineelKb: number;
  gecomprimeerdKb: number;
}

export async function comprimeerFoto(origineel: File): Promise<CompressieResultaat> {
  const origineelKb = Math.round(origineel.size / 1024);
  if (!origineel.type.startsWith("image/")) {
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
    // Ook een groter-uitgevallen blob gebruiken we: metadata-vrij weegt
    // zwaarder dan de laatste kilobytes (gebeurt alleen bij al-kleine foto's).
    if (!blob) {
      return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
    }
    const naam = origineel.name.replace(/\.\w+$/, "") + ".jpg";
    return {
      file: new File([blob], naam, { type: "image/jpeg" }),
      origineelKb,
      gecomprimeerdKb: Math.round(blob.size / 1024),
    };
  } catch {
    // decodering mislukt — origineel gebruiken (restrisico, zie docs/security.md)
    return { file: origineel, origineelKb, gecomprimeerdKb: origineelKb };
  }
}
