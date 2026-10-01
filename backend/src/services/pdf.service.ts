import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { PayrollComponent } from '../entities/PayrollRecord.entity';
import { getUploadPath } from '../utils/uploadPath';

export interface PayslipData {
  companyName: string;
  companyAddress: string;
  companyLogo?: string;
  cinNumber?: string;
  gstNumber?: string;
  additionalCompanyFields?: Array<{ label: string; value: string }>;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  bankAccount: string;
  uan: string;
  pfNo?: string;
  esiNo?: string;
  month: number;
  year: number;
  payDate?: string;
  workingDays: number;
  eligibleWorkingDays: number;
  payableDays: number;
  presentDays: number;
  leaveDays: number;
  lopDays: number;
  weekOffDays?: number;
  holidayDays?: number;
  earnings: PayrollComponent[];
  deductions: PayrollComponent[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  pfEmployerContribution?: number;
}

export interface PayrollRegisterRow {
  employeeCode: string;
  employeeName: string;
  department: string;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const COLORS = {
  navy: '#073568',
  blue: '#0B72E7',
  teal: '#12B89A',
  ink: '#18324D',
  muted: '#687D96',
  border: '#D8E5F2',
  pale: '#F3F8FD',
  green: '#087A53',
  red: '#C5304F',
  white: '#FFFFFF',
};

function money(value: number): string {
  return `Rs. ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function numberToWords(value: number): string {
  const num = Math.max(0, Math.round(value));
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const underThousand = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(`${ones[Math.floor(n / 100)]} Hundred`);
      n %= 100;
    }
    if (n >= 20) {
      parts.push(tens[Math.floor(n / 10)]);
      n %= 10;
    }
    if (n > 0) parts.push(ones[n]);
    return parts.join(' ');
  };
  const groups: Array<[number, string]> = [
    [10_000_000, 'Crore'], [100_000, 'Lakh'], [1_000, 'Thousand'], [1, ''],
  ];
  let remaining = num;
  const words: string[] = [];
  for (const [size, label] of groups) {
    const part = Math.floor(remaining / size);
    if (part > 0) {
      words.push(underThousand(part), label);
      remaining %= size;
    }
  }
  return words.filter(Boolean).join(' ');
}

async function resolveLogo(custom?: string): Promise<string | Buffer | undefined> {
  if (custom?.startsWith('/uploads/company-logos/')) {
    const localPath = getUploadPath('company-logos', path.basename(custom));
    try {
      await fs.promises.access(localPath);
      return localPath;
    } catch { /* fall through to bundled logo */ }
  }
  if (custom && /^https?:\/\//i.test(custom)) {
    try {
      const response = await fetch(custom);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch { /* fall through to bundled logo */ }
  }
  const candidates = [
    custom && !custom.startsWith('/') ? custom : undefined,
    path.resolve(__dirname, '../templates/logobg.png'),
    path.resolve(process.cwd(), 'dist/templates/logobg.png'),
    path.resolve(process.cwd(), 'src/templates/logobg.png'),
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
}

function safe(value: unknown): string {
  const text = String(value || '').trim();
  return text || '-';
}

export async function generatePayslipPdf(
  data: PayslipData,
  fileName: string,
): Promise<{ buffer: Buffer; fileName: string }> {
  const logo = await resolveLogo(data.companyLogo);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: fileName, Author: data.companyName } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), fileName }));

    const left = 32;
    const width = doc.page.width - 64;
    const right = left + width;

    // Formal enterprise letterhead: restrained colour, generous logo area,
    // and company/legal information kept separate from payroll figures.
    doc.rect(left, 24, width, 4).fill(COLORS.navy);
    if (logo) {
      doc.roundedRect(left, 40, 142, 62, 4).lineWidth(0.7).strokeColor(COLORS.border).stroke();
      doc.image(logo, left + 8, 45, {
        fit: [126, 52],
        align: 'center',
        valign: 'center',
      });
    }
    const brandX = logo ? left + 158 : left;
    const companyFontSize = data.companyName.length > 42 ? 14 : data.companyName.length > 30 ? 16 : 20;
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(companyFontSize)
      .text(safe(data.companyName).toUpperCase(), brandX, 41, { width: right - brandX, align: 'right' });
    const legalDetails = [
      data.cinNumber ? `CIN: ${data.cinNumber}` : '',
      data.gstNumber ? `GSTIN: ${data.gstNumber}` : '',
      ...(data.additionalCompanyFields || []).map((field) => `${field.label}: ${field.value}`),
    ].filter(Boolean);
    const companyDetails = [data.companyAddress, legalDetails.join('  |  ')].filter(Boolean).join('\n');
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(companyDetails || ' ', brandX, 68, { width: right - brandX, height: 35, lineGap: 2, align: 'right' });

    const titleY = 118;
    doc.rect(left, titleY, width, 36).fill(COLORS.navy);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(13)
      .text(`PAYSLIP FOR ${MONTH_NAMES[data.month - 1].toUpperCase()} ${data.year}`, left, titleY + 11, { width, align: 'center' });

    const detailY = 170;
    const detailHeight = 124;
    doc.rect(left, detailY, width, detailHeight).lineWidth(0.8).strokeColor(COLORS.border).stroke();
    const info = [
      ['Employee Name', safe(data.employeeName), 'Employee ID', safe(data.employeeCode)],
      ['Designation', safe(data.designation), 'Department', safe(data.department)],
      ['Date of Joining', safe(data.dateOfJoining), 'Bank Account', safe(data.bankAccount)],
      ['UAN / PF No.', safe(data.uan || data.pfNo), 'ESI No.', safe(data.esiNo)],
    ];
    const half = width / 2;
    const labelWidth = 84;
    info.forEach((row, index) => {
      const y = detailY + index * 31;
      if (index % 2 === 0) doc.rect(left, y, width, 31).fill(COLORS.pale);
      if (index > 0) doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.moveTo(left + half, y).lineTo(left + half, y + 31).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.2).text(row[0].toUpperCase(), left + 10, y + 11, { width: labelWidth });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5).text(row[1], left + 98, y + 10, { width: half - 108 });
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.2).text(row[2].toUpperCase(), left + half + 10, y + 11, { width: labelWidth });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5).text(row[3], left + half + 98, y + 10, { width: half - 108 });
    });

    const attendanceY = 310;
    const attendance = [
      ['Working Days', data.workingDays], ['Eligible Days', data.eligibleWorkingDays],
      ['Present Days', data.presentDays], ['Leave Days', data.leaveDays],
      ['LOP Days', data.lopDays], ['Paid Days', data.payableDays],
    ];
    const cellWidth = width / attendance.length;
    attendance.forEach(([label, value], index) => {
      const x = left + index * cellWidth;
      doc.rect(x, attendanceY, cellWidth, 44).fillAndStroke(index % 2 === 0 ? COLORS.pale : COLORS.white, COLORS.border);
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11).text(String(value), x, attendanceY + 8, { width: cellWidth, align: 'center' });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.8).text(String(label).toUpperCase(), x, attendanceY + 26, { width: cellWidth, align: 'center' });
    });

    const tableY = 372;
    const halfTable = width / 2;
    const amountWidth = 88;
    const earnings = data.earnings.length ? data.earnings : [{ name: 'None', amount: 0 }];
    const deductions = data.deductions.length ? data.deductions : [{ name: 'None', amount: 0 }];
    const rows = Math.max(earnings.length, deductions.length);
    // Keep all salary heads on the same A4 page. Larger component lists use
    // progressively tighter rows instead of pushing the footer to page two.
    const rowHeight = Math.min(22, 210 / rows);
    const tableHeight = 30 + rows * rowHeight + 30;
    doc.rect(left, tableY, width, tableHeight).lineWidth(0.8).strokeColor(COLORS.border).stroke();
    doc.rect(left, tableY, width, 30).fill(COLORS.navy);
    doc.moveTo(left + halfTable, tableY).lineTo(left + halfTable, tableY + tableHeight).strokeColor(COLORS.border).lineWidth(0.7).stroke();
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8.5).text('EARNINGS', left + 10, tableY + 10, { width: halfTable - amountWidth - 16 });
    doc.text('AMOUNT (Rs.)', left + halfTable - amountWidth, tableY + 10, { width: amountWidth - 10, align: 'right' });
    doc.text('DEDUCTIONS', left + halfTable + 10, tableY + 10, { width: halfTable - amountWidth - 16 });
    doc.text('AMOUNT (Rs.)', right - amountWidth, tableY + 10, { width: amountWidth - 10, align: 'right' });
    for (let index = 0; index < rows; index += 1) {
      const y = tableY + 30 + index * rowHeight;
      if (index % 2 === 0) doc.rect(left, y, width, rowHeight).fill(COLORS.pale);
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).strokeColor(COLORS.border).lineWidth(0.35).stroke();
      const earning = earnings[index];
      const deduction = deductions[index];
      const textY = y + Math.max(4, (rowHeight - 8) / 2);
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(rowHeight < 7 ? 4.5 : rowHeight < 10 ? 5.5 : rowHeight < 16 ? 6.5 : rowHeight < 19 ? 7 : 8);
      if (earning) {
        doc.text(safe(earning.name), left + 10, textY, { width: halfTable - amountWidth - 16 });
        doc.font('Helvetica-Bold').text(money(earning.amount), left + halfTable - amountWidth, textY, { width: amountWidth - 10, align: 'right' });
      }
      if (deduction) {
        doc.font('Helvetica').text(safe(deduction.name), left + halfTable + 10, textY, { width: halfTable - amountWidth - 16 });
        doc.font('Helvetica-Bold').text(money(deduction.amount), right - amountWidth, textY, { width: amountWidth - 10, align: 'right' });
      }
    }
    const totalY = tableY + 30 + rows * rowHeight;
    doc.rect(left, totalY, width, 30).fill('#E8F0F8');
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8.5)
      .text('TOTAL EARNINGS', left + 10, totalY + 10, { width: halfTable - amountWidth - 16 })
      .text(money(data.grossEarnings), left + halfTable - amountWidth, totalY + 10, { width: amountWidth - 10, align: 'right' })
      .text('TOTAL DEDUCTIONS', left + halfTable + 10, totalY + 10, { width: halfTable - amountWidth - 16 })
      .text(money(data.totalDeductions), right - amountWidth, totalY + 10, { width: amountWidth - 10, align: 'right' });

    const summaryY = totalY + 44;
    doc.roundedRect(left, summaryY, width, 48, 5).fillAndStroke('#EAF7F2', '#A9D8C5');
    doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(10).text('NET PAY', left + 14, summaryY + 18, { width: 100 });
    doc.fontSize(17).text(money(data.netPay), right - 190, summaryY + 14, { width: 176, align: 'right' });
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('NET PAY IN WORDS', left, summaryY + 62, { width });
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5)
      .text(`${numberToWords(data.netPay)} Rupees Only`, left, summaryY + 76, { width });
    if (data.pfEmployerContribution && data.pfEmployerContribution > 0) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
        .text(`Employer PF contribution: ${money(data.pfEmployerContribution)} (informational only)`, left, summaryY + 94);
    }

    // PDFKit respects the document's 36pt bottom margin for text. Keeping the
    // footer baseline above it prevents a footer-only second page.
    const footerY = Math.max(summaryY + 108, doc.page.height - 74);
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(COLORS.border).lineWidth(1).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(`Generated by ${safe(data.companyName)} through Connect HR. This is a computer-generated payslip and does not require a signature.`, left, footerY + 12, { width, align: 'center' });
    doc.end();
  });
}

export function generatePayrollRegisterPdf(
  rows: PayrollRegisterRow[],
  month: number,
  year: number,
  companyName: string,
): Promise<{ buffer: Buffer; fileName: string }> {
  const fileName = `payroll_register_${year}_${String(month).padStart(2, '0')}.pdf`;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 32,
      info: { Title: fileName, Author: companyName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), fileName }));

    const left = 32;
    const tableWidth = doc.page.width - 64;
    const columns = [
      { label: 'Employee ID', width: 92, align: 'left' as const },
      { label: 'Employee Name', width: 150, align: 'left' as const },
      { label: 'Department', width: 130, align: 'left' as const },
      { label: 'Gross Salary', width: 100, align: 'right' as const },
      { label: 'Deductions', width: 95, align: 'right' as const },
      { label: 'Net Salary', width: 105, align: 'right' as const },
      { label: 'Status', width: tableWidth - 672, align: 'left' as const },
    ];
    const rowHeight = 24;

    const drawHeader = () => {
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(17)
        .text(companyName || 'Connect HR', left, 30, { width: tableWidth });
      doc.fillColor(COLORS.ink).fontSize(13)
        .text(`Payroll Register - ${MONTH_NAMES[month - 1]} ${year}`, left, 57, { width: tableWidth });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
        .text(`Generated ${new Date().toLocaleString('en-IN')}`, left, 78, { width: tableWidth });

      let x = left;
      const y = 100;
      for (const column of columns) {
        doc.rect(x, y, column.width, 26).fillAndStroke(COLORS.navy, COLORS.border);
        doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.5)
          .text(column.label.toUpperCase(), x + 6, y + 9, { width: column.width - 12, align: column.align });
        x += column.width;
      }
      return y + 26;
    };

    let y = drawHeader();
    rows.forEach((row, index) => {
      if (y + rowHeight > doc.page.height - 58) {
        doc.addPage();
        y = drawHeader();
      }
      const values = [
        row.employeeCode,
        row.employeeName,
        row.department,
        money(row.grossEarnings),
        money(row.totalDeductions),
        money(row.netPay),
        row.status,
      ];
      let x = left;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        doc.rect(x, y, column.width, rowHeight)
          .fillAndStroke(index % 2 === 0 ? COLORS.pale : COLORS.white, COLORS.border);
        doc.fillColor(columnIndex === 5 ? COLORS.green : COLORS.ink)
          .font(columnIndex === 1 || columnIndex === 5 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .text(safe(values[columnIndex]), x + 6, y + 8, {
            width: column.width - 12,
            align: column.align,
            ellipsis: true,
            lineBreak: false,
          });
        x += column.width;
      }
      y += rowHeight;
    });

    const totalNetPay = rows.reduce((sum, row) => sum + row.netPay, 0);
    if (y + 38 > doc.page.height - 32) {
      doc.addPage();
      y = drawHeader();
    }
    doc.rect(left, y + 8, tableWidth, 30).fillAndStroke('#EAF7F2', '#A9D8C5');
    doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(10)
      .text(`TOTAL EMPLOYEES: ${rows.length}`, left + 10, y + 18, { width: tableWidth / 2 });
    doc.text(`TOTAL NET SALARY: ${money(totalNetPay)}`, left + tableWidth / 2, y + 18, {
      width: tableWidth / 2 - 10,
      align: 'right',
    });
    doc.end();
  });
}
