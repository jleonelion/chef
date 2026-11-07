// Reads a PDF back for tier1 file assertions: pdf-lib must re-load it, and `text` lists every
// string drawn with Tj on any page, in order, decoded from the (possibly compressed) content streams.
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';

const STRING_SHOWN = /(?:<([0-9A-Fa-f]*)>|\(((?:\\.|[^\\)])*)\))\s*Tj/g;

function contentStreams(page) {
  const contents = page.node.Contents();
  const items = contents instanceof PDFArray ? contents.asArray() : [contents];
  return items.map((item) => page.doc.context.lookup(item)).filter((stream) => stream instanceof PDFRawStream);
}

function shownStrings(bytes) {
  const source = Buffer.from(bytes).toString('latin1');
  return [...source.matchAll(STRING_SHOWN)].map(([, hex, literal]) =>
    hex === undefined ? literal.replace(/\\(.)/g, '$1') : Buffer.from(hex, 'hex').toString('latin1'));
}

export async function readPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const text = pdf.getPages().flatMap((page) => contentStreams(page).flatMap((stream) => shownStrings(decodePDFRawStream(stream).decode())));
  return { valid: true, pages: pdf.getPageCount(), title: pdf.getTitle(), text };
}
