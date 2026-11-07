import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readPdf } from './pdf.mjs';

test('readPdf reloads a PDF and returns its page count and drawn text', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Tomato Soup', { font });
  pdf.addPage().drawText('Herbed Rice', { font });

  const read = await readPdf(await pdf.save());

  assert.equal(read.pages, 2);
  assert.deepEqual(read.text, ['Tomato Soup', 'Herbed Rice']);
});

test('readPdf rejects bytes that are not a PDF', async () => {
  await assert.rejects(readPdf(Buffer.from('not a pdf')));
});
