const CREATION_ID_EXTENSION = /<a:extLst><a:ext uri="\{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236\}"><a16:creationId\b[^>]*\/><\/a:ext><\/a:extLst>/g;

/**
 * ExcelJS writes zero-sized picture transforms for one-cell anchors. Desktop
 * Excel repairs those records on open even though the anchor itself has the
 * correct dimensions. Copying the anchor dimensions into the picture
 * transform keeps the drawing valid. The optional creation id is removed too:
 * ExcelJS repeats it for every picture, while Excel expects unique values.
 *
 * @param {string} xml
 */
export function normalizeExcelDrawingXml(xml) {
  const normalized = xml.replace(/<xdr:oneCellAnchor\b[\s\S]*?<\/xdr:oneCellAnchor>/g, (anchor) => {
    const size = anchor.match(/<xdr:ext cx="([1-9]\d*)" cy="([1-9]\d*)"\/>/);
    if (!size) return anchor;
    const [, width, height] = size;
    return anchor.replace(
      /<a:xfrm>\s*<a:off x="0" y="0"\/>\s*<a:ext cx="0" cy="0"\/>\s*<\/a:xfrm>/,
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm>`,
    );
  });
  return normalized.replace(CREATION_ID_EXTENSION, "");
}

/** @param {ArrayBuffer | Uint8Array} buffer */
export async function makeExcelCompatible(buffer) {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(buffer);
  const drawingPaths = Object.keys(archive.files).filter((path) => /^xl\/drawings\/drawing\d+\.xml$/.test(path));

  for (const path of drawingPaths) {
    const file = archive.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    archive.file(path, normalizeExcelDrawingXml(xml));
  }

  return archive.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
