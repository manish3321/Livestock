import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function downloadTablePdf(
  title: string,
  filename: string,
  columns: string[],
  rows: Array<Array<string | number>>,
): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleString(), 14, 22);
  autoTable(doc, {
    startY: 26,
    head: [columns],
    body: rows.map((r) => r.map(String)),
    styles: { fontSize: 8 },
  });
  doc.save(filename);
}

export function downloadInvoicePdf(invoice: {
  invoiceNumber: string;
  date: string;
  buyerName?: string | null;
  buyerContact?: string | null;
  source: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  paymentStatus: string;
}): void {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Farm Invoice', 14, 18);
  doc.setFontSize(11);
  doc.text(`Invoice: ${invoice.invoiceNumber}`, 14, 30);
  doc.text(`Date: ${invoice.date}`, 14, 38);
  doc.text(`Buyer: ${invoice.buyerName ?? '—'}`, 14, 46);
  doc.text(`Contact: ${invoice.buyerContact ?? '—'}`, 14, 54);
  doc.text(`Payment: ${invoice.paymentStatus}`, 14, 62);
  autoTable(doc, {
    startY: 72,
    head: [['Item', 'Qty', 'Rate', 'Amount']],
    body: [
      [
        invoice.source,
        `${invoice.quantity} ${invoice.unit}`,
        String(invoice.rate),
        String(invoice.amount),
      ],
    ],
  });
  doc.save(`invoice-${invoice.invoiceNumber}.pdf`);
}
