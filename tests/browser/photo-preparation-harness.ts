import { createPhotoPreparer } from "../../src/modules/media/client/photo-preparer";

export async function prepareFixture(url: string, count = 1) {
  const bytes = await (await fetch(url)).blob();
  // Empty MIME exercises iPhone Files uploads; sniffed contents decide format.
  const file = new File([bytes], "fixture", { type: "" });
  const preparer = createPhotoPreparer();
  const started = performance.now();
  const results = [];
  try {
    for (let index = 0; index < count; index++) {
      const result = await preparer.prepare(file, new AbortController().signal);
      const bitmap = await createImageBitmap(result.file);
      try {
        if (bitmap.width !== result.width || bitmap.height !== result.height)
          throw new Error("Encoded dimensions differ from preparation result");
        results.push({
          sourceBytes: file.size,
          preparedBytes: result.file.size,
          width: result.width,
          height: result.height,
          decoder: result.decoder,
          preparationMs: result.preparationMs,
          type: result.file.type,
        });
      } finally {
        bitmap.close();
      }
    }
    return { count, elapsedMs: performance.now() - started, results };
  } finally {
    preparer.dispose();
  }
}

Object.assign(window, { prepareFixture });
