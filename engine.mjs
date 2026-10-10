const DEMO_CATALOG = [{
  id: 'demo-304-060-48-96', grade: '304', thickness_in: 0.06,
  width_in: 48, length_in: 96, unit: 'sheet', unit_price_usd: 100,
  certificates: [], source: 'Synthetic demo catalog; illustrative USD price, not a market quote.'
}];
const INTEGRATION_STATUS = Object.freeze({ nicrronninoo: 'unavailable', block_convey: 'unavailable' });

const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function splitSource(rfq) {
  // Keep the exact text slice for traceability while accepting common pasted list formats.
  return String(rfq).split(/\r?\n|;\s*(?=\d+\s*(?:sheets?|pcs?|pieces?|units?)\b)/).map(s => s.trim()).filter(Boolean);
}
function parseLine(source, index, answers = {}) {
  const text = source;
  const lower = norm(text);
  const issues = [];
  const answer = answers?.[index] && typeof answers[index] === 'object' ? answers[index] : answers;
  const quantityMatches = [...lower.matchAll(/(?<![\w.])([+-]?\d+(?:\.\d+)?)\s*(?:[a-z]+\s+){0,2}(?:sheets?|pcs?|pieces?|units?)\b/g)];
  const quantities = quantityMatches.map(m => Number(m[1]));
  const badQuantity = quantityMatches.some(m => m[1].startsWith('-') || !Number.isInteger(Number(m[1])));
  const answeredQuantity = Number(answer.quantity);
  const hasAnsweredQuantity = finitePositive(answeredQuantity);
  const quantity = hasAnsweredQuantity ? answeredQuantity : badQuantity ? null : quantities.length ? quantities[0] : null;
  if (badQuantity) issues.push('Sheet quantity must be a positive whole number.');
  else if (quantity === null || !finitePositive(quantity) || !Number.isInteger(quantity)) issues.push('Confirm a positive whole-number sheet quantity.');
  else if (!hasAnsweredQuantity && quantities.some(q => q !== quantity)) issues.push('Conflicting quantities appear in this line.');

  const gradeMatches = [...lower.matchAll(/\b(?:grade\s*)?(304l?|316l?|321|347|430|409|410|2205|2507)\b/g)].map(m => m[1].toUpperCase());
  const grades = [...new Set(gradeMatches)];
  const answeredDimensionUnit = /^(?:in|inch|inches)$/i.test(String(answer.dimension_unit ?? '').trim());
  let grade = grades.length === 1 ? grades[0] : null;
  if (grades.length > 1) issues.push(`Conflicting grades specified: ${grades.join(' and ')}.`);
  if (!grades.length && typeof answer.grade === 'string' && /^[0-9]{3,4}L?$/i.test(answer.grade.trim())) grade = answer.grade.trim().toUpperCase();
  if (!grade && !grades.length) issues.push('Specify the stainless grade.');

  // Read explicit thickness and dimension triplets in either thickness-first or last order.
  const number = '((?:\\d+(?:\\.\\d+)?|\\.\\d+))';
  const unitPattern = '(inches?|inch|in\\.?|mm|millimeters?|\\")';
  const triplet = new RegExp(`${number}\\s*${unitPattern}?\\s*(?:x|×|by)\\s*${number}\\s*${unitPattern}?\\s*(?:x|×|by)\\s*${number}\\s*${unitPattern}?`, 'i').exec(text);
  let thickness = null, width = null, length = null;
  if (triplet) {
    let vals = [Number(triplet[1]), Number(triplet[3]), Number(triplet[5])];
    const units = [triplet[2], triplet[4], triplet[6]];
    const tail = text.slice(triplet.index, triplet.index + triplet[0].length);
    const metric = units.map(u => /^(?:mm|millimeters?)$/i.test(u || ''));
    const imperial = units.map(u => /^(?:inches?|inch|in\.?|")$/i.test(u || ''));
    const hasMetric = metric.some(Boolean), hasImperial = imperial.some(Boolean);
    if (hasMetric && hasImperial) {
      vals = vals.map((v, i) => metric[i] ? v / 25.4 : v);
      issues.push('Mixed units in the dimension triplet; clarify each dimension separately.');
    } else if (hasMetric) {
      const trailingMetric = /^(?:mm|millimeters?)$/i.test(units[2] || '');
      vals = vals.map((v, i) => metric[i] || (!units[i] && trailingMetric) ? v / 25.4 : v);
    }
    const smalls = vals.map((v, i) => ({v, i})).filter(x => x.v < 1);
    if (smalls.length === 1) {
      thickness = smalls[0].v;
      const dims = vals.filter((_, i) => i !== smalls[0].i);
      [width, length] = dims;
    } else {
      issues.push('Identify which dimension is sheet thickness.');
    }
    if (!/\b(?:inches?|inch|in\.?|mm|millimeters?)\b/i.test(tail) && !/"/.test(tail)) issues.push('Confirm the dimension units (inches or millimeters).');
  } else {
    const th = new RegExp(`\\bthickness\\s*(?:of|:|=)?\\s*${number}\\s*(inches?|inch|in\\.?|mm|millimeters?)?`, 'i').exec(text);
    const dims = /\bwidth\b[\s\S]*\blength\b/i.test(text) || /\bwidth\s*(?:x|×|by)\s*length\b/i.test(text);
    if (th) {
      thickness = Number(th[1]);
      if (/^(?:mm|millimeters?)$/i.test(th[2] || '')) thickness /= 25.4;
      if (!th[2] && !answeredDimensionUnit) issues.push('Confirm thickness units.');
    }
    if (dims) {
      const labeledWidth = new RegExp(`\\bwidth\\s*(?:of|:|=)?\\s*${number}\\s*(?:inches?|inch|in\\.?|mm|millimeters?|\\")?`, 'i').exec(text);
      const labeledLength = new RegExp(`\\blength\\s*(?:of|:|=)?\\s*${number}\\s*(?:inches?|inch|in\\.?|mm|millimeters?|\\")?`, 'i').exec(text);
      if (labeledWidth && labeledLength) {
        width = Number(labeledWidth[1]); length = Number(labeledLength[1]);
        if (/\b(?:mm|millimeters?)\b/i.test(labeledWidth[0])) width /= 25.4;
        if (/\b(?:mm|millimeters?)\b/i.test(labeledLength[0])) length /= 25.4;
      }
      const d = new RegExp(`width\\s*(?:x|×|by)?\\s*${number}\\s*(?:inches?|inch|in\\.?|mm|millimeters?|\\")?\\s*(?:x|×|by)?\\s*length\\s*${number}`, 'i').exec(text);
      if (!labeledWidth && d) { width = Number(d[1]); length = Number(d[2]); }
      else if (!labeledWidth) {
        const d2 = new RegExp(`${number}\\s*(?:x|×|by)\\s*${number}\\s*(inches?|inch|in\\.?|mm|millimeters?|\\")?`, 'i').exec(text);
        if (d2) {
          [width, length] = d2.slice(1, 3).map(Number);
          if (/^(?:mm|millimeters?)$/i.test(d2[3] || '')) { width /= 25.4; length /= 25.4; }
        }
      }
      if (width && length && !answeredDimensionUnit && !/\b(?:inches?|inch|in\.?|mm|millimeters?)\b/i.test(text) && !/"/.test(text)) issues.push('Confirm the dimension units (inches or millimeters).');
    }
    // Common mill RFQs give a 2D sheet size and label the gauge/thickness elsewhere.
    if (thickness != null && (width == null || length == null)) {
      const d2 = new RegExp(`${number}\\s*(?:x|×|by)\\s*${number}(?:\\s*(inches?|inch|in\\.?|\\"))?`, 'i').exec(text);
      if (d2) {
        [width, length] = d2.slice(1, 3).map(Number);
        if (!d2[3] && !answeredDimensionUnit) issues.push('Confirm the dimension units (inches or millimeters).');
      }
    }
  }
  if (answer.thickness_in != null && thickness == null && Number(answer.thickness_in) > 0) thickness = Number(answer.thickness_in);
  if (answer.width_in != null && width == null && Number(answer.width_in) > 0) width = Number(answer.width_in);
  if (answer.length_in != null && length == null && Number(answer.length_in) > 0) length = Number(answer.length_in);
  if (thickness == null) issues.push('Specify sheet thickness.');
  if (width == null || length == null) issues.push('Specify sheet width and length.');

  const requestedCertificates = [];
  if (/\bmill\s*(?:test\s*)?reports?\b|\bmtr\b/i.test(text)) requestedCertificates.push('mill test report');
  for (const c of ['ASTM A240', 'ASTM A480']) if (new RegExp(c.replace(' ', '\\s*'), 'i').test(text)) requestedCertificates.push(c);
  const uniqueIssues = [...new Set(issues)];
  return { index, quantity, unit: 'sheet', grade, thickness_in: thickness, width_in: width, length_in: length,
    source_text: source, issues: uniqueIssues, requested_certificates: requestedCertificates };
}

function validCatalog(rows) {
  return Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object' && typeof r.grade === 'string' &&
    finitePositive(Number(r.thickness_in)) && finitePositive(Number(r.width_in)) && finitePositive(Number(r.length_in)) && r.unit === 'sheet') : [];
}
const close = (a,b) => Math.abs(Number(a)-Number(b)) < 0.00051;
function matchCatalog(line, catalog) {
  if (!line.grade || !line.thickness_in || !line.width_in || !line.length_in) return null;
  return catalog.find(r => norm(r.grade) === norm(line.grade) && close(r.thickness_in,line.thickness_in) && close(r.width_in,line.width_in) && close(r.length_in,line.length_in)) || null;
}

/** Build a traceable quote draft. All prices and certificates come only from supplied catalog rows. */
export function buildQuote({ rfq, catalog, answers } = {}) {
  const sourceLines = splitSource(rfq ?? '');
  const rows = Array.isArray(catalog) && catalog.length ? validCatalog(catalog) : DEMO_CATALOG;
  const synthetic = !(Array.isArray(catalog) && catalog.length);
  const lines = sourceLines.map((source, i) => {
    const parsed = parseLine(source, i, answers || {});
    const row = matchCatalog(parsed, rows);
    const lineIssues = [...parsed.issues];
    if (!row && parsed.grade && parsed.thickness_in && parsed.width_in && parsed.length_in) lineIssues.push('No exact matching catalog item was found.');
    if (row) {
      for (const requested of parsed.requested_certificates) {
        const certs = Array.isArray(row.certificates) ? row.certificates : [];
        if (!certs.some(c => norm(c).includes(norm(requested)) || (requested === 'mill test report' && /\bmtr\b/i.test(c))))
          lineIssues.push(`Catalog evidence does not confirm required ${requested}.`);
      }
      if (typeof row.unit_price_usd !== 'number' || !Number.isFinite(row.unit_price_usd) || row.unit_price_usd < 0)
        lineIssues.push('Matching catalog item has no supported price.');
    }
    const blocked = lineIssues.length > 0;
    const price = row && !blocked ? row.unit_price_usd : null;
    const total = price != null && parsed.quantity != null ? price * parsed.quantity : null;
    return { quantity: parsed.quantity, unit: 'sheet', grade: parsed.grade, thickness_in: parsed.thickness_in,
      width_in: parsed.width_in, length_in: parsed.length_in, unit_price_usd: price,
      line_total_usd: Number.isFinite(total) ? total : null, source_text: parsed.source_text,
      issues: [...new Set(lineIssues)], evidence: row ? { catalog_id: row.id ?? null, source: row.source ?? 'Catalog row (source not supplied)', certificates: Array.isArray(row.certificates) ? row.certificates : [], requested_certificates: parsed.requested_certificates } : { requested_certificates: parsed.requested_certificates },
      data_label: row ? (synthetic ? 'Synthetic demo catalog' : 'Supplied catalog') : null };
  });
  const issues = [...new Set(lines.flatMap(l => l.issues))];
  const total = lines.reduce((sum,l) => sum + (l.line_total_usd ?? 0), 0);
  return { status: issues.length ? 'needs_clarification' : 'ready_for_review', lines, total_usd: Number.isFinite(total) && total >= 0 ? total : 0,
    issues, integration_status: { ...INTEGRATION_STATUS }, data_notice: synthetic ? 'Synthetic demo catalog; illustrative price, not a market quote.' : 'Prices and certificates are sourced only from the supplied catalog.' };
}
