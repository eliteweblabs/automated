import JSZip from 'jszip';

const MIME_TYPES: Record<string, string> = {
  txt: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => XML_ESCAPE[char]);

const toColumnName = (index: number): string => {
  let column = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return column;
};

const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      pushRow();
      continue;
    }

    if (char === '\r') {
      if (csv[i + 1] === '\n') {
        i += 1;
      }
      pushRow();
      continue;
    }

    field += char;
  }

  const hasData = row.length > 0 || field.length > 0;
  if (hasData || rows.length === 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const buildWorksheetXml = (rows: string[][]): string => {
  const rowXml = rows
    .map((cells, rowIndex) => {
      const cellsXml = cells
        .map((cellValue, colIndex) => {
          const cellRef = `${toColumnName(colIndex + 1)}${rowIndex + 1}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cellValue)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowXml}</sheetData>` +
    '</worksheet>'
  );
};

const csvToXlsxBlob = async (csv: string): Promise<Blob> => {
  const rows = parseCsv(csv);
  const worksheetXml = buildWorksheetXml(rows);

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels')?.file('.rels', rootRelsXml);
  zip.folder('xl')?.file('workbook.xml', workbookXml);
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', workbookRelsXml);
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', worksheetXml);

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const blobSafeBytes = new Uint8Array(bytes.byteLength);
  blobSafeBytes.set(bytes);
  return new Blob([blobSafeBytes], { type: MIME_TYPES.xlsx });
};

const getDownloadBlob = async (
  content: string,
  outputExtension?: string | null,
): Promise<{ blob: Blob; extension: string }> => {
  const normalized = (outputExtension || 'txt').toLowerCase();
  if (normalized === 'excel' || normalized === 'xlsx') {
    return {
      blob: await csvToXlsxBlob(content),
      extension: 'xlsx',
    };
  }

  return {
    blob: new Blob([content], {
      type: MIME_TYPES[normalized] || MIME_TYPES.txt,
    }),
    extension: normalized,
  };
};

export const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const downloadWorkflowOutput = async ({
  content,
  outputExtension,
  fileNameBase,
}: {
  content: string;
  outputExtension?: string | null;
  fileNameBase: string;
}) => {
  const { blob, extension } = await getDownloadBlob(content, outputExtension);
  const fileName = `${fileNameBase}.${extension}`;
  const downloadUrl = window.URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.URL.revokeObjectURL(downloadUrl);
  }
};
